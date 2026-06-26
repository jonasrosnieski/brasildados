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

async function buildIncomeDistribution() {
  console.log('  Distribuição por faixa de renda (7533 + 7521)...')
  const latestYear = '2023'
  const [incomeBySeg, popBySeg] = await Promise.all([
    fetchAgregadoSingle(7533, 10816, latestYear),
    fetchAgregadoSingle(7521, 606, latestYear),
  ])

  const BRACKETS = [
    { key: 'ate_2k',           label: 'Até R$ 2.000/mês',              max: 2000 },
    { key: 'de_2k_5k',         label: 'R$ 2.001 – 5.000',              min: 2001, max: 5000 },
    { key: 'de_5k_10k',        label: 'R$ 5.001 – 10.000',             min: 5001, max: 10000 },
    { key: 'de_10k_30k',       label: 'R$ 10.001 – 30.000',            min: 10001, max: 30000 },
    { key: 'de_30k_100k',      label: 'R$ 30.001 – 100.000',           min: 30001, max: 100000 },
    { key: 'super_ricos',      label: 'Super-ricos (> R$ 100 mil)',    min: 100001, max: 999999 },
    { key: 'milionarios_renda', label: 'Milionários de renda (> R$ 1 mi/mês)', min: 1000001 },
  ]

  const SEGMENTS = [
    { ibge: 'Até o P5', share_pct: 5 },
    { ibge: 'Maior que o P5 até o P10', share_pct: 5 },
    { ibge: 'Maior que o P10 até o P20', share_pct: 10 },
    { ibge: 'Maior que o P20 até o P30', share_pct: 10 },
    { ibge: 'Maior que o P30 até o P40', share_pct: 10 },
    { ibge: 'Maior que o P40 até o P50', share_pct: 10 },
    { ibge: 'Maior que o P50 até o P60', share_pct: 10 },
    { ibge: 'Maior que o P60 até o P70', share_pct: 10 },
    { ibge: 'Maior que o P70 até o P80', share_pct: 10 },
    { ibge: 'Maior que o P80 até o P90', share_pct: 10 },
    { ibge: 'Maior que o P90 até o P95', share_pct: 5 },
    { ibge: 'Maior que o P95 até o P99', share_pct: 4 },
    { ibge: 'Maior que o P99', share_pct: 1 },
  ]

  function bracketForIncome(income) {
    for (const b of BRACKETS) {
      const aboveMin = b.min == null || income >= b.min
      const belowMax = b.max == null || income <= b.max
      if (aboveMin && belowMax) return b.key
    }
    return BRACKETS[BRACKETS.length - 1].key
  }

  const bracketPop = Object.fromEntries(BRACKETS.map(b => [b.key, 0]))
  const bracketIncome = Object.fromEntries(BRACKETS.map(b => [b.key, 0]))
  let totalPopThousands = 0

  for (const seg of SEGMENTS) {
    const popThousands = popBySeg[seg.ibge]
    const income = incomeBySeg[seg.ibge]
    if (popThousands == null || income == null) continue
    totalPopThousands += popThousands
    const key = bracketForIncome(income)
    bracketPop[key] += popThousands
    bracketIncome[key] += income * popThousands
  }

  // Bilionários (patrimônio) — referência pública Forbes/Valor, não capturada na PNAD
  const BILLIONAIRES_ESTIMATE = {
    count: 265,
    population_share_pct: 0.0012,
    source: 'Forbes Brasil / ranking público bilionários (estimativa 2024, patrimônio — não renda mensal)',
  }

  const brackets = BRACKETS.map(b => {
    const popThousands = bracketPop[b.key] ?? 0
    const popPct = totalPopThousands > 0 ? (popThousands / totalPopThousands) * 100 : 0
    const avgIncome = popThousands > 0 ? Math.round(bracketIncome[b.key] / popThousands) : null
    return {
      key: b.key,
      label: b.label,
      population_millions: Math.round((popThousands / 1000) * 100) / 100,
      population_pct: Math.round(popPct * 100) / 100,
      avg_income_brl: avgIncome,
    }
  })

  const ate5k = brackets
    .filter(b => ['ate_2k', 'de_2k_5k'].includes(b.key))
    .reduce((s, b) => s + b.population_pct, 0)

  const topElite = brackets
    .filter(b => ['super_ricos', 'milionarios_renda'].includes(b.key))
    .reduce((s, b) => s + b.population_pct, 0)

  return {
    name: 'renda_distribuicao_faixas',
    description: 'Distribuição da população brasileira por faixas de renda domiciliar per capita mensal real',
    unit: 'R$/mês',
    category: 'social',
    subcategory: 'desigualdade',
    source: 'IBGE/PNAD Contínua',
    source_url: 'https://sidra.ibge.gov.br/tabela/7533',
    reference_year: latestYear,
    note: 'Faixas alternativas (não oficiais): cada segmento percentual PNAD é alocado à faixa onde cai sua renda média. Renda domiciliar per capita — proxy de renda por pessoa no domicílio. Bilionários = patrimônio (Forbes), não renda.',
    bracket_labels: Object.fromEntries(BRACKETS.map(b => [b.key, b.label])),
    highlights: {
      majority_under_5k_pct: Math.round(ate5k * 10) / 10,
      elite_over_100k_pct: Math.round(topElite * 1000) / 1000,
      billionaires: BILLIONAIRES_ESTIMATE,
    },
    fetched_at: new Date().toISOString(),
    data: [{ date: `${latestYear}-01-01`, brackets }],
  }
}

async function fetchAgregadoSingle(agregado, variavel, year) {
  const url = `${BASE}/${agregado}/periodos/${year}/variaveis/${variavel}?classificacao=1019[all]&localidades=N1[all]`
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} agregado ${agregado}`)
  const json = await res.json()
  const byClass = {}
  for (const block of json[0]?.resultados ?? []) {
    const catName = Object.values(block.classificacoes[0].categoria)[0]
    if (!catName || catName === 'Total' || catName.startsWith('Até o P10')) continue
    const val = parseFloat(String(block.series[0]?.serie?.[year]).replace(',', '.'))
    if (!isNaN(val)) byClass[catName] = val
  }
  return byClass
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
    const dist = await buildIncomeDistribution()
    await fs.writeFile(path.join(DATA_DIR, 'renda_distribuicao_faixas.json'), JSON.stringify(dist, null, 2))
    manifest.series.push({ name: dist.name, count: 1, file: 'renda_distribuicao_faixas.json' })
    console.log(`  ✓ renda_distribuicao_faixas: ${dist.reference_year} (maioria <5k: ${dist.highlights.majority_under_5k_pct}%)`)
  } catch (err) {
    console.error(`  ✗ distribuição: ${err.message}`)
    manifest.series.push({ name: 'renda_distribuicao_faixas', error: err.message })
  }

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
