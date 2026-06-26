/**
 * Ingestão social — renda por classe e profissões (IBGE PNAD Contínua)
 * API Agregados v3: https://servicodados.ibge.gov.br/api/v3/
 */

import fs from 'fs/promises'
import path from 'path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data', 'social')
const BASE = 'https://servicodados.ibge.gov.br/api/v3/agregados'

const YEARS = Array.from({ length: 2025 - 2012 + 1 }, (_, i) => String(2012 + i))
const PERIODS = YEARS.join('|')

// Mapeamento IBGE (percentis PNAD) → classes sociais do dashboard
const CLASS_MAP = {
  miseraveis:   ['Até o P5', 'Maior que o P5 até o P10'],
  pobres:       ['Maior que o P10 até o P20', 'Maior que o P20 até o P30'],
  classe_media: ['Maior que o P30 até o P40', 'Maior que o P40 até o P50', 'Maior que o P50 até o P60'],
  alta:         ['Maior que o P60 até o P70', 'Maior que o P70 até o P80'],
  ricos:        ['Maior que o P80 até o P90', 'Maior que o P90 até o P95', 'Maior que o P95 até o P99'],
  super_ricos:  ['Maior que o P99'],
}

const CLASS_LABELS = {
  miseraveis:   'Miseráveis (até P10)',
  pobres:       'Pobres (P10–P30)',
  classe_media: 'Classe média (P30–P60)',
  alta:         'Classe alta (P60–P80)',
  ricos:        'Ricos (P80–P99)',
  super_ricos:  'Super ricos (P99+)',
}

async function fetchAgregado(agregado, variavel, classificacao = '1019[all]') {
  const url = `${BASE}/${agregado}/periodos/${PERIODS}/variaveis/${variavel}?classificacao=${classificacao}&localidades=N1[all]`
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} agregado ${agregado}`)
  const json = await res.json()
  const byClassYear = {}

  for (const block of json[0]?.resultados ?? []) {
    const catName = Object.values(block.classificacoes[0].categoria)[0]
    if (!catName || catName === 'Total') continue
    const serie = block.series[0]?.serie ?? {}
    for (const [year, raw] of Object.entries(serie)) {
      const val = parseFloat(String(raw).replace(',', '.'))
      if (isNaN(val)) continue
      if (!byClassYear[year]) byClassYear[year] = {}
      byClassYear[year][catName] = val
    }
  }
  return byClassYear
}

function weightedAvg(segments, massByClass, popByClass) {
  let totalMass = 0
  let totalPop = 0
  for (const seg of segments) {
    const m = massByClass[seg]
    const p = popByClass[seg]
    if (m == null || p == null || p === 0) continue
    totalMass += m
    totalPop += p
  }
  if (totalPop === 0) return null
  // massa em milhões R$, pop em milhares → renda média R$/mês per capita domiciliar
  return (totalMass * 1_000_000) / (totalPop * 1000)
}

async function buildIncomeClasses() {
  console.log('  Massa de renda (7428) + população por classe (7521)...')
  const [mass, pop] = await Promise.all([
    fetchAgregado(7428, 10490),
    fetchAgregado(7521, 606),
  ])

  const data = []
  for (const year of YEARS) {
    const massY = mass[year]
    const popY = pop[year]
    if (!massY || !popY) continue

    const point = { date: `${year}-01-01`, classes: {} }
    for (const [key, segments] of Object.entries(CLASS_MAP)) {
      const avg = weightedAvg(segments, massY, popY)
      if (avg != null) point.classes[key] = Math.round(avg)
    }
    if (Object.keys(point.classes).length > 0) data.push(point)
  }

  return {
    name: 'renda_media_por_classe',
    description: 'Renda domiciliar per capita média mensal real (R$) por classe social — PNAD Contínua anual',
    unit: 'R$/mês',
    category: 'social',
    subcategory: 'renda_classes',
    source: 'IBGE/PNAD Contínua',
    source_url: 'https://sidra.ibge.gov.br/tabela/7428',
    class_labels: CLASS_LABELS,
    note: 'Classes agrupadas a partir dos percentis oficiais do IBGE (massa/população por faixa). Cobertura: 2012–2023.',
    fetched_at: new Date().toISOString(),
    count: data.length,
    data,
  }
}

async function fetchProfessions() {
  console.log('  Profissões — rendimento (5444) e ocupação (5435)...')
  const period = '202304'
  const incomeUrl = `${BASE}/5444/periodos/${period}/variaveis/5932?classificacao=694[all]&localidades=N1[all]`
  const popUrl = `${BASE}/5435/periodos/${period}/variaveis/4090?classificacao=694[all]&localidades=N1[all]`

  const [incRes, popRes] = await Promise.all([
    fetch(incomeUrl, { signal: AbortSignal.timeout(60_000) }),
    fetch(popUrl, { signal: AbortSignal.timeout(60_000) }),
  ])

  if (!incRes.ok) throw new Error(`Rendimento profissões HTTP ${incRes.status}`)
  if (!popRes.ok) throw new Error(`População profissões HTTP ${popRes.status}`)

  const incJson = await incRes.json()
  const popJson = await popRes.json()

  const income = {}
  const population = {}

  for (const block of incJson[0]?.resultados ?? []) {
    const name = Object.values(block.classificacoes[0].categoria)[0]
    if (!name || name === 'Total') continue
    const val = parseFloat(block.series[0]?.serie?.[period])
    if (!isNaN(val)) income[name] = val
  }

  for (const block of popJson[0]?.resultados ?? []) {
    const name = Object.values(block.classificacoes[0].categoria)[0]
    if (!name || name === 'Total') continue
    const val = parseFloat(block.series[0]?.serie?.[period])
    if (!isNaN(val)) population[name] = val
  }

  const professions = Object.keys(income)
    .filter(n => population[n] != null)
    .map(name => ({
      name,
      income_monthly_brl: income[name],
      employed_thousands: population[name],
    }))

  const byIncome = [...professions].sort((a, b) => b.income_monthly_brl - a.income_monthly_brl)
  const byPopularity = [...professions].sort((a, b) => b.employed_thousands - a.employed_thousands)

  return {
    name: 'profissoes_pnad',
    description: 'Grupamentos ocupacionais PNAD — rendimento médio e pessoas ocupadas',
    unit: 'R$/mês',
    category: 'social',
    subcategory: 'profissoes',
    source: 'IBGE/PNAD Contínua',
    source_url: 'https://sidra.ibge.gov.br/tabela/5444',
    reference_year: period,
    fetched_at: new Date().toISOString(),
    top_by_income: byIncome.slice(0, 12),
    top_by_popularity: byPopularity.slice(0, 12),
    all: professions,
    count: professions.length,
  }
}

async function run() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const manifest = { fetched_at: new Date().toISOString(), source: 'IBGE PNAD Contínua', series: [] }

  try {
    const income = await buildIncomeClasses()
    await fs.writeFile(path.join(DATA_DIR, 'renda_media_por_classe.json'), JSON.stringify(income, null, 2))
    manifest.series.push({ name: income.name, count: income.count, file: 'renda_media_por_classe.json' })
    console.log(`  ✓ renda_media_por_classe: ${income.count} anos`)
  } catch (err) {
    console.error(`  ✗ renda: ${err.message}`)
    manifest.series.push({ name: 'renda_media_por_classe', error: err.message })
  }

  try {
    const prof = await fetchProfessions()
    await fs.writeFile(path.join(DATA_DIR, 'profissoes.json'), JSON.stringify(prof, null, 2))
    manifest.series.push({ name: prof.name, count: prof.count, file: 'profissoes.json' })
    console.log(`  ✓ profissoes: ${prof.count} grupamentos (${prof.reference_year})`)
  } catch (err) {
    console.error(`  ✗ profissoes: ${err.message}`)
    manifest.series.push({ name: 'profissoes', error: err.message })
  }

  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

console.log('=== Social — Renda por classe e profissões ===\n')
run().catch(err => { console.error(err); process.exit(1) })
