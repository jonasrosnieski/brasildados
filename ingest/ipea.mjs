/**
 * Ingestão de séries do IPEADATA
 * API OData: http://www.ipeadata.gov.br/api/odata4/
 *
 * Séries coletadas:
 *   PNADC12_TDESOC12      - Taxa de desocupação PNAD-C
 *   SALMINRE              - Salário mínimo real (R$ de hoje)
 *   MTE12_SALMIN12        - Salário mínimo nominal (R$)
 *   GINI                  - Coeficiente de Gini (desigualdade de renda)
 *   POPH                  - População total (em milhares)
 *   BM12_PIB12            - PIB nominal (R$ milhões)
 *   ANDA12_ANABET12       - Analfabetismo (% da população >15 anos)
 *   MS_MORTINF            - Taxa de mortalidade infantil (por 1000 nascidos)
 */

import fs from 'fs/promises'
import path from 'path'

const SERIES = [
  { code: 'MTE12_SALMIN12',   name: 'salario_minimo_nominal',  unit: 'BRL',    category: 'social',    subcategory: 'salario',      description: 'Salário mínimo nominal (R$)' },
  { code: 'GAC12_SALMINRE12', name: 'salario_minimo_real',     unit: 'BRL',    category: 'social',    subcategory: 'salario',      description: 'Salário mínimo real (R$ de hoje)' },
  { code: 'BM12_PIB12',       name: 'pib_nominal_ipea',        unit: 'R$_mi',  category: 'economia',  subcategory: 'pib',          description: 'PIB nominal (R$ milhões) — IPEA' },
  // Nota: Gini, população, analfabetismo, mortalidade e pobreza são coletados via ingest/ibge.mjs (SIDRA/PNAD)
]

const DATA_DIR = path.join(import.meta.dirname, '..', 'data', 'ipea')
const BASE_URL = 'http://www.ipeadata.gov.br/api/odata4'

async function fetchSeries(serie) {
  const url = `${BASE_URL}/ValoresSerie(SERCODIGO='${serie.code}')`
  console.log(`  Buscando ${serie.code} — ${serie.description}`)

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} para série ${serie.code}`)
  }

  const json = await res.json()
  const rows  = json.value ?? []

  const normalized = rows
    .filter(r => r.VALVALOR !== null)
    .map(r => {
      // IPEA retorna VALDATA como "/Date(timestamp)/" ou "AAAA-MM-DDT00:00:00"
      let date = r.VALDATA
      const match = date.match(/Date\((\d+)\)/)
      if (match) {
        date = new Date(parseInt(match[1])).toISOString().slice(0, 10)
      } else {
        date = date.slice(0, 10)
      }
      return { date, value: r.VALVALOR }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  return normalized
}

async function run() {
  await fs.mkdir(DATA_DIR, { recursive: true })

  const manifest = {
    fetched_at: new Date().toISOString(),
    source: 'IPEADATA',
    source_url: 'http://www.ipeadata.gov.br',
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
        source:      'IPEA',
        source_code: serie.code,
        source_url:  `http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='${serie.code}')`,
        fetched_at:  new Date().toISOString(),
        count:       data.length,
        data,
      }

      await fs.writeFile(filepath, JSON.stringify(output, null, 2))
      const range = data.length > 0 ? `${data[0].date} → ${data[data.length-1].date}` : 'vazio'
      manifest.series.push({ name: serie.name, file: filename, count: data.length, range })
      console.log(`  ✓ ${serie.name}: ${data.length} registros (${range})`)
    } catch (err) {
      console.error(`  ✗ Erro na série ${serie.code}: ${err.message}`)
      manifest.series.push({ name: serie.name, error: err.message })
    }

    await new Promise(r => setTimeout(r, 800))
  }

  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nManifest salvo em data/ipea/manifest.json`)
}

console.log('=== IPEADATA — Ingestão de séries sociais e econômicas ===\n')
run().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
