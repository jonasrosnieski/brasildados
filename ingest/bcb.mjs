/**
 * Ingestão de séries do Banco Central do Brasil (SGS - Sistema Gerenciador de Séries)
 * API pública: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados
 *
 * Séries coletadas:
 *   433   - IPCA (inflação mensal %)
 *   13522 - IPCA acumulado 12 meses
 *   4380  - PIB real (variação % trimestral)
 *   4391  - PIB nominal acumulado (R$ bilhões)
 *   24369 - Taxa de desemprego (PNAD-C, % trimestral)
 *   11    - Taxa SELIC (% ao ano)
 *   3    - Taxa de câmbio USD/BRL (média mensal)
 *   7326  - Taxa de desemprego (PME, mensal — série mais antiga)
 */

import fs from 'fs/promises'
import path from 'path'

const SERIES = [
  { code: 433,   name: 'ipca_mensal',           unit: '%',      category: 'economia', subcategory: 'inflacao',    description: 'IPCA variação mensal (%)' },
  { code: 13522, name: 'ipca_12meses',           unit: '%',      category: 'economia', subcategory: 'inflacao',    description: 'IPCA acumulado 12 meses (%)' },
  { code: 4380,  name: 'pib_variacao_trimestral',unit: '%',      category: 'economia', subcategory: 'pib',         description: 'PIB real variação trimestral (%)' },
  { code: 4391,  name: 'pib_nominal_bi_brl',     unit: 'R$_bi',  category: 'economia', subcategory: 'pib',         description: 'PIB nominal acumulado (R$ bilhões)' },
  { code: 4189,  name: 'selic_meta_anual',         unit: '%_aa',   category: 'economia', subcategory: 'juros',       description: 'Meta taxa SELIC (% ao ano)' },
  { code: 3698,  name: 'cambio_usd_brl',          unit: 'BRL',    category: 'economia', subcategory: 'cambio',      description: 'Câmbio USD/BRL PTAX venda (média mensal)' },
  { code: 7326,  name: 'desemprego_pme',          unit: '%',      category: 'economia', subcategory: 'desemprego',  description: 'Taxa de desemprego PME (%, mensal)' },
  { code: 24369, name: 'desemprego_pnadc',        unit: '%',      category: 'economia', subcategory: 'desemprego',  description: 'Taxa de desocupação PNAD-C (%, trimestral)' },
]

const DATA_DIR = path.join(import.meta.dirname, '..', 'data', 'bcb')
const BASE_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs'

async function fetchSeries(serie) {
  const url = `${BASE_URL}.${serie.code}/dados?formato=json`
  console.log(`  Buscando série ${serie.code} — ${serie.description}`)

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} para série ${serie.code}`)
  }

  const data = await res.json()

  // Normaliza para { date: 'YYYY-MM-DD', value: number }
  const normalized = data
    .filter(row => row.valor !== null && row.valor !== '')
    .map(row => {
      // BCB retorna datas em DD/MM/AAAA
      const [d, m, y] = row.data.split('/')
      return {
        date:  `${y}-${m}-${d}`,
        value: parseFloat(row.valor.replace(',', '.')),
      }
    })

  return normalized
}

async function run() {
  await fs.mkdir(DATA_DIR, { recursive: true })

  const manifest = {
    fetched_at: new Date().toISOString(),
    source: 'BCB/SGS',
    source_url: 'https://api.bcb.gov.br',
    series: [],
  }

  for (const serie of SERIES) {
    try {
      const data = await fetchSeries(serie)
      const filename = `${serie.name}.json`
      const filepath = path.join(DATA_DIR, filename)

      const output = {
        code:        serie.code,
        name:        serie.name,
        description: serie.description,
        unit:        serie.unit,
        category:    serie.category,
        subcategory: serie.subcategory,
        source:      'BCB',
        source_code: String(serie.code),
        source_url:  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie.code}/dados`,
        fetched_at:  new Date().toISOString(),
        count:       data.length,
        data,
      }

      await fs.writeFile(filepath, JSON.stringify(output, null, 2))
      manifest.series.push({ name: serie.name, file: filename, count: data.length, range: data.length > 0 ? `${data[0].date} → ${data[data.length-1].date}` : 'vazio' })
      console.log(`  ✓ ${serie.name}: ${data.length} registros (${output.count > 0 ? data[0].date : '?'} → ${output.count > 0 ? data[data.length-1].date : '?'})`)
    } catch (err) {
      console.error(`  ✗ Erro na série ${serie.code}: ${err.message}`)
      manifest.series.push({ name: serie.name, error: err.message })
    }

    // Pequena pausa entre requisições para não sobrecarregar a API
    await new Promise(r => setTimeout(r, 500))
  }

  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nManifest salvo em data/bcb/manifest.json`)
}

console.log('=== BCB/SGS — Ingestão de séries econômicas ===\n')
run().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
