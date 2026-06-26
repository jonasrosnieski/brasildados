/**
 * BrasilDados — Download Master
 * Baixa TODOS os dados disponíveis para D:\brasildados\
 * Gera relatório de auditoria em tempo real.
 *
 * Uso:
 *   node ingest/download-all.mjs
 *   node ingest/download-all.mjs --skip-tse      (pula os ZIPs grandes do TSE)
 *   node ingest/download-all.mjs --only=tse       (só TSE)
 *   node ingest/download-all.mjs --only=inep      (só INEP)
 */

import fs from 'fs/promises'
import { createWriteStream, existsSync, statSync } from 'fs'
import path from 'path'
import { initSession, logDownloadStart, logDownloadDone, logDownloadError, logSkipped, logIngest, logSessionEnd } from './audit.mjs'

const BASE_DIR   = 'D:\\brasildados'
const ARGS       = process.argv.slice(2)
const SKIP_TSE   = ARGS.includes('--skip-tse')
const ONLY       = ARGS.find(a => a.startsWith('--only='))?.split('=')[1]

// ============================================================
// CATÁLOGO DE DOWNLOADS
// ============================================================

const TSE_YEARS = [1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022]

const DOWNLOADS = [

  // ── TSE: resultados eleitorais por município/zona (1994–2022) ────────────
  ...TSE_YEARS.map(year => ({
    group:   'tse',
    source:  'TSE',
    name:    `tse_votacao_${year}`,
    url:     `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${year}.zip`,
    dest:    path.join(BASE_DIR, 'tse', `votacao_candidato_munzona_${year}.zip`),
    estimatedMB: year >= 2018 ? 800 : year >= 2010 ? 500 : 200,
    description: `TSE — Resultados eleitorais por candidato/município/zona (${year})`,
  })),

  // ── TSE: candidatos e perfil (1994–2022) ────────────────────────────────
  ...TSE_YEARS.map(year => ({
    group:   'tse',
    source:  'TSE',
    name:    `tse_candidatos_${year}`,
    url:     `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${year}.zip`,
    dest:    path.join(BASE_DIR, 'tse', `consulta_cand_${year}.zip`),
    estimatedMB: 10,
    description: `TSE — Perfil de candidatos (${year})`,
  })),

  // ── TSE: prestação de contas de campanha ─────────────────────────────────
  ...[1998, 2002, 2006, 2010, 2014, 2018, 2022].map(year => ({
    group:   'tse',
    source:  'TSE',
    name:    `tse_contas_${year}`,
    url:     `https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_contas_final_${year}.zip`,
    dest:    path.join(BASE_DIR, 'tse', `prestacao_contas_${year}.zip`),
    estimatedMB: 50,
    description: `TSE — Prestação de contas eleitorais (${year})`,
  })),

  // ── INEP: ENEM por escola (2005–2023) ───────────────────────────────────
  ...[2005,2006,2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023].map(year => ({
    group:   'inep',
    source:  'INEP',
    name:    `inep_enem_escola_${year}`,
    url:     `https://download.inep.gov.br/educacao_basica/enem/escola/resultado/${year}/resultado_${year}_escola.zip`,
    dest:    path.join(BASE_DIR, 'inep', `enem_escola_${year}.zip`),
    estimatedMB: 5,
    description: `INEP — ENEM resultados por escola (${year})`,
  })),

  // ── INEP: Censo Escolar — matrículas (2007–2023) ────────────────────────
  ...[2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023].map(year => ({
    group:   'inep',
    source:  'INEP',
    name:    `inep_censo_escolar_${year}`,
    url:     `https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_${year}.zip`,
    dest:    path.join(BASE_DIR, 'inep', `censo_escolar_${year}.zip`),
    estimatedMB: year >= 2015 ? 300 : 100,
    description: `INEP — Microdados Censo Escolar (${year})`,
  })),

  // ── INEP: IDEB — séries históricas ──────────────────────────────────────
  {
    group:   'inep',
    source:  'INEP',
    name:    'inep_ideb_series',
    url:     'https://download.inep.gov.br/educacao_basica/ideb/planilhas_para_download/publicacao_por_edicao/dados_editados_site_IDEB_2023_06_23.xlsx',
    dest:    path.join(BASE_DIR, 'inep', 'ideb_series_historicas.xlsx'),
    estimatedMB: 5,
    description: 'INEP — IDEB séries históricas (2005–2023)',
  },

  // ── IBGE: PNAD Contínua — microdados (2012–2023) ────────────────────────
  ...[2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023].map(year => ({
    group:   'ibge',
    source:  'IBGE',
    name:    `ibge_pnadc_${year}`,
    url:     `https://ftp.ibge.gov.br/Trabalho_e_Rendimento/Pesquisa_Nacional_por_Amostra_de_Domicilios_continua/Microdados/Visita/Ano_${year}/Arquivos_Py/PNADC_${year}_visita1_20221031.zip`,
    dest:    path.join(BASE_DIR, 'ibge', `pnadc_${year}.zip`),
    estimatedMB: 200,
    description: `IBGE — PNAD Contínua microdados (${year})`,
    fallbackUrl: `https://ftp.ibge.gov.br/Trabalho_e_Rendimento/Pesquisa_Nacional_por_Amostra_de_Domicilios_continua/Microdados/Visita/Ano_${year}/`,
  })),

]

// ============================================================
// FUNÇÕES DE DOWNLOAD
// ============================================================

async function downloadFile(item) {
  const { name, url, dest, source, estimatedMB } = item

  // Pula se já existe e tem tamanho razoável
  if (existsSync(dest)) {
    const existing = statSync(dest)
    const existingMB = existing.size / 1024 / 1024
    if (existingMB > 1) {
      logSkipped({ name, dest, reason: `Já existe (${existingMB.toFixed(1)} MB)` })
      return { skipped: true }
    }
  }

  logDownloadStart({ source, name, url, dest, estimatedMB })
  const startTime = Date.now()

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30 * 60 * 1000), // 30 min timeout
      headers: { 'User-Agent': 'BrasilDados/1.0 (dados publicos brasileiros)' },
    })

    if (!res.ok) {
      // Tenta fallback se disponível
      if (item.fallbackUrl) {
        logDownloadError({ source, name, url, dest, error: `HTTP ${res.status} — URL pode ter variado. Verifique manualmente: ${item.fallbackUrl}` })
      } else {
        logDownloadError({ source, name, url, dest, error: `HTTP ${res.status}` })
      }
      return { error: true }
    }

    const totalBytes = parseInt(res.headers.get('content-length') ?? '0')
    const fileStream = createWriteStream(dest)
    const reader = res.body.getReader()
    let downloaded = 0
    let lastLog = Date.now()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fileStream.write(value)
      downloaded += value.length

      // Progresso no terminal a cada 5 segundos
      if (Date.now() - lastLog > 5000) {
        const pct    = totalBytes > 0 ? ((downloaded / totalBytes) * 100).toFixed(1) : '?'
        const dlMB   = (downloaded / 1024 / 1024).toFixed(1)
        const elapsed = (Date.now() - startTime) / 1000
        const speed  = (downloaded / 1024 / 1024 / elapsed).toFixed(2)
        process.stdout.write(`\r  [${name}] ${dlMB} MB (${pct}%) @ ${speed} MB/s          `)
        lastLog = Date.now()
      }
    }

    fileStream.end()
    process.stdout.write('\n')

    const durationSec = (Date.now() - startTime) / 1000
    const sizeMB = downloaded / 1024 / 1024

    logDownloadDone({ source, name, url, dest, sizeMB, durationSec })
    return { sizeMB, durationSec }

  } catch (err) {
    logDownloadError({ source, name, url, dest, error: err.message })
    // Remove arquivo parcial
    try { await fs.unlink(dest) } catch {}
    return { error: true }
  }
}

// ============================================================
// MAIN
// ============================================================

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║   BrasilDados — Download de Dados Públicos Brasileiros   ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  initSession('BrasilDados Full Download')

  // Filtra por grupo se --only foi passado
  let queue = DOWNLOADS
  if (ONLY) {
    queue = queue.filter(d => d.group === ONLY)
    console.log(`Modo: apenas grupo "${ONLY}" (${queue.length} itens)\n`)
  }
  if (SKIP_TSE) {
    const before = queue.length
    queue = queue.filter(d => d.group !== 'tse')
    console.log(`Pulando TSE (${before - queue.length} arquivos removidos)\n`)
  }

  const totalEstimadoGB = queue.reduce((s, d) => s + (d.estimatedMB ?? 0), 0) / 1024
  console.log(`Total de itens na fila: ${queue.length}`)
  console.log(`Espaço estimado necessário: ~${totalEstimadoGB.toFixed(1)} GB`)
  console.log(`Destino: ${BASE_DIR}`)
  console.log(`Logs: D:\\brasildados\\logs\\`)
  console.log('\n─────────────────────────────────────────────────────────\n')

  let ok = 0, errors = 0, skipped = 0, totalMB = 0

  // Agrupa por grupo para exibição mais clara
  const groups = {}
  for (const item of queue) {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push(item)
  }

  for (const [group, items] of Object.entries(groups)) {
    console.log(`\n═══ ${group.toUpperCase()} (${items.length} arquivos) ═══\n`)
    for (const item of items) {
      const result = await downloadFile(item)
      if (result.skipped) { skipped++ }
      else if (result.error) { errors++ }
      else { ok++; totalMB += result.sizeMB ?? 0 }
    }
  }

  const summary = { total: queue.length, ok, errors, skipped, totalMB: parseFloat(totalMB.toFixed(1)) }
  logSessionEnd(summary)

  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║                     RESUMO FINAL                        ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log(`  Total de itens:   ${queue.length}`)
  console.log(`  Downloads OK:     ${ok}`)
  console.log(`  Com erro:         ${errors}`)
  console.log(`  Já existiam:      ${skipped}`)
  console.log(`  Total baixado:    ${totalMB.toFixed(1)} MB (${(totalMB/1024).toFixed(2)} GB)`)
  console.log(`\n  Relatório: D:\\brasildados\\logs\\relatorio.md`)
  console.log(`  Log raw:   D:\\brasildados\\logs\\audit.jsonl\n`)
}

run().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
