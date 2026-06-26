/**
 * Empresas — demonstrações financeiras de companhias abertas (CVM DFP)
 * Fonte pública: https://dados.cvm.gov.br/dataset/cia_aberta-doc-dfp
 */

import fs from 'fs/promises'
import path from 'path'
import AdmZip from 'adm-zip'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data', 'empresas')
const CVM_CAD = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv'

/** CNPJ raiz ou nome → classificação de controle (dados públicos / cadastro CVM) */
const ESTATAL_HINTS = [
  { match: /PETROLEO BRASILEIRO|PETROBRAS/i, ownership: 'estatal_federal', sector: 'Petróleo e gás' },
  { match: /BCO BRASIL|BANCO DO BRASIL/i, ownership: 'estatal_federal', sector: 'Bancos' },
  { match: /CAIXA ECONOMICA/i, ownership: 'estatal_federal', sector: 'Bancos' },
  { match: /ELETROBRAS/i, ownership: 'estatal_federal', sector: 'Energia elétrica' },
  { match: /BNDES/i, ownership: 'estatal_federal', sector: 'Desenvolvimento' },
  { match: /BANCO NACIONAL DE DESENVOLVIMENTO/i, ownership: 'estatal_federal', sector: 'Desenvolvimento' },
  { match: /EMBRATEC|EMBRAPA/i, ownership: 'estatal_federal', sector: 'Pesquisa / agro' },
  { match: /FURNAS|CHESF|ELETRONUCLEAR|ITAIPU/i, ownership: 'estatal_federal', sector: 'Energia elétrica' },
  { match: /COMPANHIA SIDERURGICA NACIONAL|CSN/i, ownership: 'privada', sector: 'Siderurgia' },
]

const NET_INCOME_LABELS = [
  'Lucro ou Prejuízo Líquido Consolidado do Período',
  'Lucro/Prejuízo Consolidado do Período',
  'Lucro ou Prejuízo Líquido do Período',
]

function parseLine(line) {
  return line.split(';').map(s => s.replace(/\r$/, '').trim())
}

function toBrl(value, scale) {
  const n = parseFloat(value)
  if (isNaN(n)) return null
  if (scale === 'MIL') return Math.round(n * 1000)
  if (scale === 'MILHAO') return Math.round(n * 1_000_000)
  return Math.round(n)
}

function classifyCompany(name) {
  for (const h of ESTATAL_HINTS) {
    if (h.match.test(name)) return { ownership: h.ownership, sector: h.sector }
  }
  return { ownership: 'privada', sector: null }
}

async function downloadDfpZip(year) {
  const url = `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year}.zip`
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!res.ok) throw new Error(`DFP ${year} HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return new AdmZip(buf)
}

async function resolveDfpYear() {
  for (const year of [2024, 2023, 2022]) {
    try {
      const res = await fetch(
        `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year}.zip`,
        { method: 'HEAD', signal: AbortSignal.timeout(15_000) },
      )
      if (res.ok) return year
    } catch { /* next */ }
  }
  throw new Error('Nenhum DFP CVM disponível')
}

function parseDre(zip, year) {
  const entry = zip.getEntry(`dfp_cia_aberta_DRE_con_${year}.csv`)
  if (!entry) throw new Error(`DRE consolidado ${year} não encontrado no ZIP`)
  const lines = zip.readAsText(entry, 'latin1').split('\n')
  const byCnpj = {}

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const p = parseLine(line)
    const [cnpj, , , name, , , , scale, order, , , account, label, value, fixed] = p
    if (order !== 'ÚLTIMO' || fixed !== 'S') continue

    if (!byCnpj[cnpj]) {
      byCnpj[cnpj] = { cnpj, name, revenue_brl: null, net_income_brl: null, scale }
    }

    if (account === '3.01' && byCnpj[cnpj].revenue_brl == null) {
      byCnpj[cnpj].revenue_brl = toBrl(value, scale)
    }
    if (account === '3.11' && NET_INCOME_LABELS.some(l => label.includes(l.split(' ').slice(0, 3).join(' ')) || label === l)) {
      byCnpj[cnpj].net_income_brl = toBrl(value, scale)
    }
    if (account === '3.11' && byCnpj[cnpj].net_income_brl == null && label.toLowerCase().includes('líquido')) {
      byCnpj[cnpj].net_income_brl = toBrl(value, scale)
    }
  }

  return byCnpj
}

function parseDva(zip, year) {
  const entry = zip.getEntry(`dfp_cia_aberta_DVA_con_${year}.csv`)
  if (!entry) return {}
  const lines = zip.readAsText(entry, 'latin1').split('\n')
  const byCnpj = {}

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const p = parseLine(line)
    const [cnpj, , , name, , , , scale, order, , , account, , value, fixed] = p
    if (order !== 'ÚLTIMO' || fixed !== 'S') continue
    if (!byCnpj[cnpj]) byCnpj[cnpj] = { personnel_brl: null, taxes_brl: null, value_added_brl: null }

    if (account === '7.08.01') byCnpj[cnpj].personnel_brl = toBrl(value, scale)
    if (account === '7.08.02') byCnpj[cnpj].taxes_brl = toBrl(value, scale)
    if (account === '7.07') byCnpj[cnpj].value_added_brl = toBrl(value, scale)
  }

  return byCnpj
}

async function loadCadastro() {
  const res = await fetch(CVM_CAD, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`cad_cia_aberta HTTP ${res.status}`)
  const text = await res.text()
  const byCnpj = {}
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue
    const p = parseLine(line)
    const cnpj = p[0]
    const trade = p[1] || p[2]
    const sector = p[10] || p[9]
    if (cnpj) byCnpj[cnpj] = { trade_name: trade, cvm_sector: sector }
  }
  return byCnpj
}

function socialImpactScore(personnel, taxes, valueAdded) {
  if (!personnel && !taxes) return null
  const distributed = (personnel ?? 0) + (taxes ?? 0)
  const va = valueAdded ?? 0
  const ratio = va > 0 ? distributed / va : null
  return {
    distributed_brl: distributed,
    ratio_to_value_added: ratio != null ? Math.round(ratio * 1000) / 1000 : null,
    score: distributed, // ranking key = valor absoluto distribuído à sociedade (pessoal + impostos)
  }
}

function buildRankings(companies) {
  const withRevenue = companies.filter(c => c.revenue_brl != null && c.revenue_brl > 0)
  const withProfit = companies.filter(c => c.net_income_brl != null)
  const withImpact = companies.filter(c => c.social_impact?.score != null && c.social_impact.score > 0)

  const rank = (list, key) =>
    [...list]
      .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
      .slice(0, 25)
      .map((c, i) => ({ rank: i + 1, ...pickPublic(c) }))

  return {
    by_revenue: rank(withRevenue, 'revenue_brl'),
    by_net_income: rank(withProfit, 'net_income_brl'),
    by_social_impact: rank(withImpact, 'social_impact_score'),
  }
}

function pickPublic(c) {
  return {
    cnpj: c.cnpj,
    name: c.name,
    trade_name: c.trade_name,
    ownership: c.ownership,
    sector: c.sector,
    revenue_brl: c.revenue_brl,
    net_income_brl: c.net_income_brl,
    personnel_brl: c.personnel_brl,
    taxes_brl: c.taxes_brl,
    social_impact_score: c.social_impact_score,
    social_impact_ratio: c.social_impact_ratio,
  }
}

function compareOwnership(companies) {
  const groups = { estatal_federal: [], privada: [], mista: [], estatal_estadual: [] }
  for (const c of companies) {
    const g = groups[c.ownership] ?? groups.privada
    if (c.ownership in groups) groups[c.ownership].push(c)
    else groups.privada.push(c)
  }

  const summarize = (list) => {
    const n = list.length
    if (n === 0) return null
    const sum = (k) => list.reduce((s, c) => s + (c[k] ?? 0), 0)
    return {
      count: n,
      total_revenue_brl: sum('revenue_brl'),
      total_net_income_brl: sum('net_income_brl'),
      total_social_impact_brl: sum('social_impact_score'),
      avg_revenue_brl: Math.round(sum('revenue_brl') / n),
      avg_net_income_brl: Math.round(sum('net_income_brl') / n),
    }
  }

  return {
    estatal_federal: summarize(groups.estatal_federal),
    privada: summarize(groups.privada.filter(c => c.ownership === 'privada')),
    all_listed: summarize(companies),
  }
}

async function run() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  console.log('  Resolvendo ano DFP CVM...')
  const year = await resolveDfpYear()
  console.log(`  Baixando DFP ${year}...`)
  const zip = await downloadDfpZip(year)
  console.log('  Cadastro CVM...')
  const cad = await loadCadastro()
  const dre = parseDre(zip, year)
  const dva = parseDva(zip, year)

  const companies = []
  for (const [cnpj, d] of Object.entries(dre)) {
    if (!d.revenue_brl && !d.net_income_brl) continue
    const { ownership, sector } = classifyCompany(d.name)
    const dvaRow = dva[cnpj] ?? {}
    const impact = socialImpactScore(dvaRow.personnel_brl, dvaRow.taxes_brl, dvaRow.value_added_brl)
    const cadRow = cad[cnpj] ?? {}

    companies.push({
      cnpj,
      name: d.name,
      trade_name: cadRow.trade_name ?? null,
      ownership,
      sector: sector ?? cadRow.cvm_sector ?? null,
      reference_year: year,
      revenue_brl: d.revenue_brl,
      net_income_brl: d.net_income_brl,
      personnel_brl: dvaRow.personnel_brl,
      taxes_brl: dvaRow.taxes_brl,
      value_added_brl: dvaRow.value_added_brl,
      social_impact: impact,
      social_impact_score: impact?.score ?? null,
      social_impact_ratio: impact?.ratio_to_value_added ?? null,
      source: 'CVM/DFP',
    })
  }

  companies.sort((a, b) => (b.revenue_brl ?? 0) - (a.revenue_brl ?? 0))

  const output = {
    name: 'empresas_cvm',
    description: 'Companhias abertas brasileiras — receita, lucro e impacto distributivo (DVA)',
    reference_year: year,
    source: 'CVM — Demonstrações Financeiras Padronizadas (DFP)',
    source_url: 'https://dados.cvm.gov.br/dataset/cia_aberta-doc-dfp',
    note: 'Impacto social = pessoal + impostos declarados na DVA (proxy de valor distribuído à sociedade). Estatais identificadas por cadastro público. Apenas emissoras com ações na B3/CVM.',
    fetched_at: new Date().toISOString(),
    count: companies.length,
    rankings: buildRankings(companies),
    ownership_comparison: compareOwnership(companies),
    companies: companies.map(pickPublic),
  }

  await fs.writeFile(path.join(DATA_DIR, 'empresas.json'), JSON.stringify(output, null, 2))
  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify({
    fetched_at: output.fetched_at,
    reference_year: year,
    count: output.count,
    file: 'empresas.json',
  }, null, 2))

  console.log(`  ✓ ${companies.length} companhias abertas (DFP ${year})`)
  console.log(`  ✓ Top receita: ${output.rankings.by_revenue[0]?.name ?? '—'}`)
}

console.log('=== Empresas — CVM DFP ===\n')
run().catch(err => { console.error(err); process.exit(1) })
