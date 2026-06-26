/**
 * Ingestão de dados de Ciência, Tecnologia e Inovação (CT&I)
 *
 * Fontes públicas:
 *   - World Bank Open Data — gasto em P&D (% PIB), pesquisadores/milhão
 *   - IPEADATA — gasto federal em CT&I, patentes (quando disponível)
 *   - OECD MSTI via World Bank proxy indicators
 */

import fs from 'fs/promises'
import path from 'path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data', 'cti')
const IPEA_URL = 'http://www.ipeadata.gov.br/api/odata4'

const WB_INDICATORS = [
  {
    code: 'GB.XPD.RSDV.GD.ZS',
    name: 'gasto_pd_pib_pct',
    description: 'Gasto em P&D (% do PIB)',
    unit: '% do PIB',
    category: 'ciencia_tecnologia',
    subcategory: 'investimento',
  },
  {
    code: 'SP.POP.SCIE.RD.P6',
    name: 'pesquisadores_por_milhao',
    description: 'Pesquisadores em P&D (por milhão de habitantes)',
    unit: 'por milhão',
    category: 'ciencia_tecnologia',
    subcategory: 'recursos_humanos',
  },
  {
    code: 'IP.PAT.RESD',
    name: 'patentes_residentes',
    description: 'Pedidos de patentes de residentes',
    unit: 'número',
    category: 'ciencia_tecnologia',
    subcategory: 'inovacao',
  },
  {
    code: 'GB.XPD.RSDV.GD.ZS?mrv=1',
    name: '_skip',
  },
]

// Séries IPEA — gasto federal CT&I (Observatório de CT&I / MCTI via IPEA)
const IPEA_SERIES = [
  {
    code: 'GAC12_GASTFDCTI12',
    name: 'gasto_federal_cti_direto',
    description: 'Gasto federal direto em CT&I (R$ milhões, preços correntes)',
    unit: 'R$_mi',
    category: 'ciencia_tecnologia',
    subcategory: 'investimento_publico',
  },
  {
    code: 'GAC12_GASTFECTI12',
    name: 'gasto_federal_cti_total',
    description: 'Gasto federal total em CT&I incluindo indireto (R$ milhões)',
    unit: 'R$_mi',
    category: 'ciencia_tecnologia',
    subcategory: 'investimento_publico',
  },
  {
    code: 'MS12_PESQ12',
    name: 'pesquisadores_total',
    description: 'Total de pesquisadores em CT&I no Brasil',
    unit: 'pessoas',
    category: 'ciencia_tecnologia',
    subcategory: 'recursos_humanos',
  },
  {
    code: 'PAN4_PIBPMCTI',
    name: 'cti_pib_pct_ipea',
    description: 'Gasto interno em CT&I (% do PIB) — IPEA/MCTI',
    unit: '% do PIB',
    category: 'ciencia_tecnologia',
    subcategory: 'investimento',
  },
]

async function fetchWorldBank(indicator) {
  const url = `https://api.worldbank.org/v2/country/BRA/indicator/${indicator.code}?format=json&per_page=100`
  console.log(`  WB ${indicator.code} — ${indicator.description}`)

  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const json = await res.json()
  const rows = (json[1] ?? [])
    .filter(r => r.value !== null && r.date)
    .map(r => ({ date: `${r.date}-01-01`, value: r.value, source: 'World Bank' }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return rows
}

async function fetchIpeaSeries(serie) {
  const url = `${IPEA_URL}/ValoresSerie(SERCODIGO='${serie.code}')`
  console.log(`  IPEA ${serie.code} — ${serie.description}`)

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const json = await res.json()
  const rows = json.value ?? []

  const normalized = rows
    .filter(r => r.VALVALOR !== null)
    .map(r => {
      let date = r.VALDATA
      const match = date.match(/Date\((\d+)\)/)
      if (match) {
        date = new Date(parseInt(match[1])).toISOString().slice(0, 10)
      } else {
        date = date.slice(0, 10)
      }
      return { date, value: r.VALVALOR, source: 'IPEA' }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  return normalized
}

async function searchIpeaCti() {
  // Busca séries com "CTI" ou "ciência" no nome
  const queries = ['CTI', 'PESQ', 'PATENT', 'ciência']
  const found = []

  for (const q of queries) {
    const filter = encodeURIComponent(`contains(SERNOME,'${q}')`)
    const url = `${IPEA_URL}/Metadados?$filter=${filter}&$top=15`
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) continue
      const json = await res.json()
      for (const row of json.value ?? []) {
        if (!found.some(f => f.SERCODIGO === row.SERCODIGO)) {
          found.push(row)
        }
      }
    } catch { /* IPEA instável */ }
    await new Promise(r => setTimeout(r, 1000))
  }

  return found
}

async function writeSeries(serie, data, source) {
  const filename = `${serie.name}.json`
  const filepath = path.join(DATA_DIR, filename)

  const output = {
    code:        serie.code ?? serie.name,
    name:        serie.name,
    description: serie.description,
    unit:        serie.unit,
    category:    serie.category,
    subcategory: serie.subcategory,
    source,
    fetched_at:  new Date().toISOString(),
    count:       data.length,
    data,
  }

  await fs.writeFile(filepath, JSON.stringify(output, null, 2))
  const range = data.length > 0 ? `${data[0].date} → ${data[data.length - 1].date}` : 'vazio'
  console.log(`  ✓ ${serie.name}: ${data.length} registros (${range})`)
  return { name: serie.name, file: filename, count: data.length, range }
}

async function run() {
  await fs.mkdir(DATA_DIR, { recursive: true })

  const manifest = {
    fetched_at: new Date().toISOString(),
    sources: ['World Bank Open Data', 'IPEADATA'],
    series: [],
    ipea_search: [],
  }

  console.log('=== World Bank — indicadores CT&I ===\n')
  for (const ind of WB_INDICATORS) {
    if (ind.name === '_skip') continue
    try {
      const data = await fetchWorldBank(ind)
      const entry = await writeSeries(ind, data, 'World Bank')
      manifest.series.push(entry)
    } catch (err) {
      console.error(`  ✗ ${ind.name}: ${err.message}`)
      manifest.series.push({ name: ind.name, error: err.message })
    }
    await new Promise(r => setTimeout(r, 500))
  }

  console.log('\n=== IPEADATA — gasto público CT&I ===\n')
  for (const serie of IPEA_SERIES) {
    try {
      const data = await fetchIpeaSeries(serie)
      if (data.length === 0) {
        console.log(`  ⚠ ${serie.name}: série vazia (código pode ter mudado)`)
        manifest.series.push({ name: serie.name, error: 'série vazia' })
        continue
      }
      const entry = await writeSeries(serie, data, 'IPEA')
      manifest.series.push(entry)
    } catch (err) {
      console.error(`  ✗ ${serie.name}: ${err.message}`)
      manifest.series.push({ name: serie.name, error: err.message })
    }
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('\n=== IPEADATA — busca de séries CT&I ===\n')
  const discovered = await searchIpeaCti()
  manifest.ipea_search = discovered.slice(0, 30).map(d => ({
    code: d.SERCODIGO,
    name: d.SERNOME,
    unit: d.UNINOME,
  }))
  console.log(`  Encontradas ${discovered.length} séries candidatas`)

  // Tenta ingerir até 3 séries descobertas com dados
  let ingested = 0
  for (const row of discovered) {
    if (ingested >= 3) break
    if (IPEA_SERIES.some(s => s.code === row.SERCODIGO)) continue
    if (!row.SERNUMERICA) continue

    const slug = row.SERCODIGO.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)
    const serie = {
      code: row.SERCODIGO,
      name: `ipea_${slug}`,
      description: row.SERNOME ?? row.SERCODIGO,
      unit: row.UNINOME ?? 'n/a',
      category: 'ciencia_tecnologia',
      subcategory: 'ipea_descoberta',
    }

    try {
      const data = await fetchIpeaSeries(serie)
      if (data.length < 5) continue
      const entry = await writeSeries(serie, data, 'IPEA')
      manifest.series.push(entry)
      ingested++
    } catch { /* skip */ }
    await new Promise(r => setTimeout(r, 1000))
  }

  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nManifest salvo em data/cti/manifest.json`)
}

console.log('=== CT&I — Ciência, Tecnologia e Inovação ===\n')
run().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
