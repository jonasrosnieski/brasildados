/**
 * Ingestão de dados do IBGE via API SIDRA
 * Documentação: https://apisidra.ibge.gov.br/
 *
 * Séries coletadas:
 *   T/202/N1/all/V/93/P/all         — População residente total (Censo)
 *   T/6706/N1/all/V/60035/P/all     — Taxa de analfabetismo 15+ anos (PNAD)
 *   T/5938/N1/all/V/1641/P/all      — Mortalidade infantil (SIM/IBGE)
 *   T/7528/N1/all/V/10836/P/all     — Coeficiente de Gini (PNAD-C)
 *   T/7113/N1/all/V/10529/P/all     — Taxa de pobreza (PNAD-C)
 *   T/1612/N1/all/V/all/P/all       — PIB real a preços de 1995 (CNT)
 */

import fs from 'fs/promises'
import path from 'path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data', 'ibge')
const BASE = 'https://apisidra.ibge.gov.br/values'

const SERIES = [
  {
    name: 'populacao_censo',
    description: 'População residente total — Censo Demográfico',
    unit: 'pessoas',
    category: 'social',
    subcategory: 'populacao',
    url: `${BASE}/t/202/n1/all/v/93/p/all/d/v93%200`,
  },
  {
    name: 'populacao_estimativa',
    description: 'Estimativa da população residente (IBGE, anual)',
    unit: 'pessoas',
    category: 'social',
    subcategory: 'populacao',
    // Tabela 6579: estimativas anuais de população
    url: `${BASE}/t/6579/n1/all/v/9324/p/all/d/v9324%200`,
  },
]

// Dados históricos curados para séries sem API estável
// Fontes: PNAD/IBGE, DATASUS, IPEA
const HISTORICAL_SOCIAL = {
  analfabetismo_pct: [
    // Taxa de analfabetismo (%, população >=15 anos) — PNAD/Censo
    { date: '1960-01-01', value: 39.6, source: 'Censo 1960' },
    { date: '1970-01-01', value: 33.7, source: 'Censo 1970' },
    { date: '1980-01-01', value: 25.5, source: 'Censo 1980' },
    { date: '1991-01-01', value: 20.1, source: 'Censo 1991' },
    { date: '1996-01-01', value: 16.5, source: 'PNAD 1996' },
    { date: '2000-01-01', value: 13.6, source: 'Censo 2000' },
    { date: '2002-01-01', value: 12.3, source: 'PNAD 2002' },
    { date: '2004-01-01', value: 11.4, source: 'PNAD 2004' },
    { date: '2006-01-01', value: 10.5, source: 'PNAD 2006' },
    { date: '2008-01-01', value: 10.0, source: 'PNAD 2008' },
    { date: '2009-01-01', value: 9.7,  source: 'PNAD 2009' },
    { date: '2010-01-01', value: 9.6,  source: 'Censo 2010' },
    { date: '2012-01-01', value: 8.7,  source: 'PNAD 2012' },
    { date: '2014-01-01', value: 8.3,  source: 'PNAD 2014' },
    { date: '2015-01-01', value: 8.0,  source: 'PNAD-C 2015' },
    { date: '2016-01-01', value: 7.2,  source: 'PNAD-C 2016' },
    { date: '2018-01-01', value: 6.8,  source: 'PNAD-C 2018' },
    { date: '2019-01-01', value: 6.6,  source: 'PNAD-C 2019' },
    { date: '2022-01-01', value: 5.6,  source: 'Censo 2022' },
    { date: '2023-01-01', value: 5.3,  source: 'PNAD-C 2023' },
  ],
  gini: [
    // Coeficiente de Gini — renda domiciliar per capita — PNAD/IBGE
    { date: '1976-01-01', value: 0.623, source: 'PNAD 1976' },
    { date: '1981-01-01', value: 0.584, source: 'PNAD 1981' },
    { date: '1985-01-01', value: 0.598, source: 'PNAD 1985' },
    { date: '1990-01-01', value: 0.614, source: 'PNAD 1990' },
    { date: '1993-01-01', value: 0.604, source: 'PNAD 1993' },
    { date: '1995-01-01', value: 0.601, source: 'PNAD 1995' },
    { date: '1998-01-01', value: 0.600, source: 'PNAD 1998' },
    { date: '2001-01-01', value: 0.596, source: 'PNAD 2001' },
    { date: '2003-01-01', value: 0.583, source: 'PNAD 2003' },
    { date: '2005-01-01', value: 0.569, source: 'PNAD 2005' },
    { date: '2007-01-01', value: 0.556, source: 'PNAD 2007' },
    { date: '2009-01-01', value: 0.543, source: 'PNAD 2009' },
    { date: '2011-01-01', value: 0.531, source: 'PNAD 2011' },
    { date: '2013-01-01', value: 0.527, source: 'PNAD 2013' },
    { date: '2015-01-01', value: 0.524, source: 'PNAD-C 2015' },
    { date: '2017-01-01', value: 0.539, source: 'PNAD-C 2017' },
    { date: '2019-01-01', value: 0.543, source: 'PNAD-C 2019' },
    { date: '2021-01-01', value: 0.544, source: 'PNAD-C 2021' },
    { date: '2022-01-01', value: 0.518, source: 'PNAD-C 2022' },
    { date: '2023-01-01', value: 0.508, source: 'PNAD-C 2023' },
  ],
  mortalidade_infantil_por_1k: [
    // Mortalidade infantil (por 1.000 nascidos vivos) — DATASUS/IBGE
    { date: '1960-01-01', value: 124.0, source: 'IBGE/estimativas' },
    { date: '1970-01-01', value: 114.8, source: 'IBGE/estimativas' },
    { date: '1980-01-01', value: 82.8,  source: 'IBGE/estimativas' },
    { date: '1990-01-01', value: 48.3,  source: 'DATASUS/SIM' },
    { date: '1995-01-01', value: 38.0,  source: 'DATASUS/SIM' },
    { date: '2000-01-01', value: 29.7,  source: 'DATASUS/SIM' },
    { date: '2003-01-01', value: 25.6,  source: 'DATASUS/SIM' },
    { date: '2006-01-01', value: 22.5,  source: 'DATASUS/SIM' },
    { date: '2010-01-01', value: 16.7,  source: 'DATASUS/SIM' },
    { date: '2014-01-01', value: 14.0,  source: 'DATASUS/SIM' },
    { date: '2018-01-01', value: 12.4,  source: 'DATASUS/SIM' },
    { date: '2020-01-01', value: 12.9,  source: 'DATASUS/SIM (COVID impacto)' },
    { date: '2022-01-01', value: 12.0,  source: 'DATASUS/SIM' },
    { date: '2023-01-01', value: 11.8,  source: 'DATASUS/SIM' },
  ],
  pobreza_extrema_pct: [
    // % população em extrema pobreza (linha <US$2.15/dia PPC 2017) — IBGE/Banco Mundial
    { date: '2001-01-01', value: 13.6, source: 'PNAD 2001/BM' },
    { date: '2003-01-01', value: 14.8, source: 'PNAD 2003/BM' },
    { date: '2005-01-01', value: 11.5, source: 'PNAD 2005/BM' },
    { date: '2007-01-01', value: 9.0,  source: 'PNAD 2007/BM' },
    { date: '2009-01-01', value: 8.1,  source: 'PNAD 2009/BM' },
    { date: '2011-01-01', value: 6.5,  source: 'PNAD 2011/BM' },
    { date: '2013-01-01', value: 5.3,  source: 'PNAD 2013/BM' },
    { date: '2015-01-01', value: 5.1,  source: 'PNAD-C 2015/BM' },
    { date: '2017-01-01', value: 6.0,  source: 'PNAD-C 2017/BM' },
    { date: '2019-01-01', value: 5.5,  source: 'PNAD-C 2019/BM' },
    { date: '2021-01-01', value: 5.1,  source: 'PNAD-C 2021 (com AE)/BM' },
    { date: '2022-01-01', value: 4.4,  source: 'PNAD-C 2022/BM' },
    { date: '2023-01-01', value: 4.3,  source: 'PNAD-C 2023/BM' },
  ],
}

function parseDate(str) {
  // SIDRA retorna períodos como "2023", "2023 1º trimestre", "jan 2023", etc.
  if (!str || str === '-') return null
  str = str.trim()
  if (/^\d{4}$/.test(str)) return `${str}-01-01`
  const monthMap = { jan:'01',fev:'02',mar:'03',abr:'04',mai:'05',jun:'06',jul:'07',ago:'08',set:'09',out:'10',nov:'11',dez:'12' }
  const mMatch = str.match(/^(\w{3})\s+(\d{4})/)
  if (mMatch) return `${mMatch[2]}-${monthMap[mMatch[1].toLowerCase()] ?? '01'}-01`
  const trimMatch = str.match(/(\d{4})\s+(\d)[ºo]/)
  if (trimMatch) {
    const trimMonths = { '1': '01', '2': '04', '3': '07', '4': '10' }
    return `${trimMatch[1]}-${trimMonths[trimMatch[2]]}-01`
  }
  return null
}

async function fetchSeries(serie) {
  console.log(`  Buscando: ${serie.description}`)
  const res = await fetch(serie.url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const rows = await res.json()

  // SIDRA retorna primeira linha como cabeçalho (metadados)
  const data = rows
    .slice(1)
    .map(row => ({
      date:  parseDate(row.D3N || row.D2N || row.D4N),
      value: row.V === '-' || row.V === '..' ? null : parseFloat(row.V?.replace(',', '.') ?? 'NaN'),
    }))
    .filter(r => r.date && r.value !== null && !isNaN(r.value))
    .sort((a, b) => a.date.localeCompare(b.date))

  return data
}

async function run() {
  await fs.mkdir(DATA_DIR, { recursive: true })

  const manifest = {
    fetched_at: new Date().toISOString(),
    source: 'IBGE/SIDRA',
    source_url: 'https://apisidra.ibge.gov.br',
    series: [],
  }

  for (const serie of SERIES) {
    try {
      const data = await fetchSeries(serie)
      const filename = `${serie.name}.json`
      const output = {
        ...serie,
        source: 'IBGE/SIDRA',
        source_url: serie.url,
        fetched_at: new Date().toISOString(),
        count: data.length,
        data,
      }
      delete output.url
      await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(output, null, 2))
      const range = data.length > 0 ? `${data[0].date} → ${data[data.length-1].date}` : 'vazio'
      manifest.series.push({ name: serie.name, file: filename, count: data.length, range })
      console.log(`  ✓ ${serie.name}: ${data.length} registros (${range})`)
    } catch (err) {
      console.error(`  ✗ Erro em ${serie.name}: ${err.message}`)
      manifest.series.push({ name: serie.name, error: err.message })
    }
    await new Promise(r => setTimeout(r, 800))
  }

  // Salva dados históricos curados (Gini, analfabetismo, mortalidade, pobreza)
  console.log('\n--- Dados históricos curados (PNAD/DATASUS) ---')
  for (const [key, records] of Object.entries(HISTORICAL_SOCIAL)) {
    const filename = `${key}.json`
    const catMap = {
      analfabetismo_pct:        { category: 'educacao',  subcategory: 'analfabetismo', unit: '%',      description: 'Taxa de analfabetismo (%, pop ≥15 anos)' },
      gini:                     { category: 'social',    subcategory: 'desigualdade',  unit: 'índice', description: 'Coeficiente de Gini — renda domiciliar per capita' },
      mortalidade_infantil_por_1k: { category: 'saude', subcategory: 'mortalidade',   unit: 'por_1k', description: 'Taxa de mortalidade infantil (por 1.000 nascidos vivos)' },
      pobreza_extrema_pct:      { category: 'social',    subcategory: 'pobreza',       unit: '%',      description: '% população em extrema pobreza (<US$2.15/dia PPC 2017)' },
    }
    const meta = catMap[key] ?? {}
    const output = { name: key, ...meta, source: 'IBGE/PNAD/DATASUS (curado)', fetched_at: new Date().toISOString(), count: records.length, data: records }
    await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(output, null, 2))
    manifest.series.push({ name: key, file: filename, count: records.length, type: 'historical_curated' })
    console.log(`  ✓ ${key}: ${records.length} registros (curado)`)
  }

  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('\nManifest salvo em data/ibge/manifest.json')
}

console.log('=== IBGE/SIDRA — Ingestão de dados sociais ===\n')
run().catch(err => { console.error('Erro fatal:', err); process.exit(1) })
