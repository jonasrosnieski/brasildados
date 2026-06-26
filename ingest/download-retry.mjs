/**
 * Retry de downloads com erros — URLs corrigidas
 * Roda após download-all.mjs para buscar o que falhou com URLs atualizadas.
 */

import fs from 'fs/promises'
import { createWriteStream, existsSync, statSync } from 'fs'
import path from 'path'
import { initSession, logDownloadStart, logDownloadDone, logDownloadError, logSkipped, logSessionEnd } from './audit.mjs'

const BASE_DIR = 'D:\\brasildados'

// URLs corrigidas para os arquivos que falharam
const RETRY_DOWNLOADS = [

  // ── TSE: prestação de contas (URL correta) ───────────────────────────────
  ...[2002, 2006, 2010, 2014, 2018, 2022].map(year => ({
    group:  'tse',
    source: 'TSE',
    name:   `tse_contas_${year}`,
    // URL alternativa com outro padrão de nome
    url:    `https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_contas_eleitorais_candidatos_${year}.zip`,
    dest:   path.join(BASE_DIR, 'tse', `prestacao_contas_${year}.zip`),
    estimatedMB: 50,
    description: `TSE — Prestação de contas eleitorais candidatos (${year})`,
  })),

  // ── INEP: ENEM por escola — URL correta por ano ──────────────────────────
  // A INEP muda o padrão do nome conforme o ano
  { group:'inep', source:'INEP', name:'inep_enem_escola_2022', estimatedMB:5,
    url:  'https://download.inep.gov.br/microdados/microdados_enem_escola_2022.zip',
    dest: path.join(BASE_DIR, 'inep', 'enem_escola_2022.zip') },
  { group:'inep', source:'INEP', name:'inep_enem_escola_2021', estimatedMB:5,
    url:  'https://download.inep.gov.br/microdados/microdados_enem_escola_2021.zip',
    dest: path.join(BASE_DIR, 'inep', 'enem_escola_2021.zip') },
  { group:'inep', source:'INEP', name:'inep_enem_escola_2020', estimatedMB:5,
    url:  'https://download.inep.gov.br/microdados/microdados_enem_escola_2020.zip',
    dest: path.join(BASE_DIR, 'inep', 'enem_escola_2020.zip') },
  { group:'inep', source:'INEP', name:'inep_enem_escola_2019', estimatedMB:5,
    url:  'https://download.inep.gov.br/microdados/microdados_enem_escola_2019.zip',
    dest: path.join(BASE_DIR, 'inep', 'enem_escola_2019.zip') },
  { group:'inep', source:'INEP', name:'inep_enem_escola_2018', estimatedMB:5,
    url:  'https://download.inep.gov.br/microdados/microdados_enem_escola_2018.zip',
    dest: path.join(BASE_DIR, 'inep', 'enem_escola_2018.zip') },
  { group:'inep', source:'INEP', name:'inep_enem_escola_2017', estimatedMB:5,
    url:  'https://download.inep.gov.br/microdados/microdados_enem_escola_2017.zip',
    dest: path.join(BASE_DIR, 'inep', 'enem_escola_2017.zip') },
  { group:'inep', source:'INEP', name:'inep_enem_escola_2016', estimatedMB:5,
    url:  'https://download.inep.gov.br/microdados/microdados_enem_escola_2016.zip',
    dest: path.join(BASE_DIR, 'inep', 'enem_escola_2016.zip') },
  { group:'inep', source:'INEP', name:'inep_enem_escola_2015', estimatedMB:5,
    url:  'https://download.inep.gov.br/microdados/microdados_enem_escola_2015.zip',
    dest: path.join(BASE_DIR, 'inep', 'enem_escola_2015.zip') },

  // ── INEP: Censo Escolar — URL correta ────────────────────────────────────
  ...[2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013].map(year => ({
    group:  'inep',
    source: 'INEP',
    name:   `inep_censo_escolar_${year}`,
    url:    `https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_${year}.zip`,
    dest:   path.join(BASE_DIR, 'inep', `censo_escolar_${year}.zip`),
    estimatedMB: year >= 2015 ? 300 : 100,
    description: `INEP — Microdados Censo Escolar (${year})`,
  })),

  // ── INEP: IDEB planilha resumo ────────────────────────────────────────────
  { group:'inep', source:'INEP', name:'inep_ideb_resumo', estimatedMB:2,
    url:  'https://download.inep.gov.br/educacao_basica/ideb/planilhas_para_download/publicacao_por_edicao/dados_editados_site_IDEB_2023_06_23.xlsx',
    dest: path.join(BASE_DIR, 'inep', 'ideb_series_historicas.xlsx') },
]

async function downloadFile(item) {
  const { name, url, dest, source, estimatedMB } = item

  if (existsSync(dest)) {
    const sz = statSync(dest).size / 1024 / 1024
    if (sz > 0.5) {
      logSkipped({ name, dest, reason: `Já existe (${sz.toFixed(1)} MB)` })
      return { skipped: true }
    }
  }

  logDownloadStart({ source, name, url, dest, estimatedMB })
  const t0 = Date.now()

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20 * 60 * 1000),
      headers: { 'User-Agent': 'BrasilDados/1.0' },
    })

    if (!res.ok) {
      logDownloadError({ source, name, url, dest, error: `HTTP ${res.status}` })
      return { error: true }
    }

    const fw = createWriteStream(dest)
    const reader = res.body.getReader()
    let bytes = 0, lastLog = Date.now()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fw.write(value)
      bytes += value.length
      if (Date.now() - lastLog > 5000) {
        process.stdout.write(`\r  [${name}] ${(bytes/1e6).toFixed(1)} MB @ ${(bytes/1e6/((Date.now()-t0)/1000)).toFixed(2)} MB/s   `)
        lastLog = Date.now()
      }
    }

    fw.end()
    process.stdout.write('\n')

    const sizeMB = bytes / 1e6
    const durationSec = (Date.now() - t0) / 1000
    logDownloadDone({ source, name, url, dest, sizeMB, durationSec })
    return { sizeMB }
  } catch (err) {
    logDownloadError({ source, name, url, dest, error: err.message })
    try { await fs.unlink(dest) } catch {}
    return { error: true }
  }
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║           BrasilDados — Retry de Downloads               ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  initSession('BrasilDados Retry Downloads')

  let ok = 0, errors = 0, skipped = 0, totalMB = 0

  for (const item of RETRY_DOWNLOADS) {
    const r = await downloadFile(item)
    if (r.skipped) skipped++
    else if (r.error) errors++
    else { ok++; totalMB += r.sizeMB ?? 0 }
  }

  logSessionEnd({ ok, errors, skipped, totalMB: parseFloat(totalMB.toFixed(1)) })

  console.log(`\nOK: ${ok} | Erros: ${errors} | Existiam: ${skipped} | Total: ${totalMB.toFixed(1)} MB`)
  console.log('Relatório atualizado em D:\\brasildados\\logs\\relatorio.md')
}

run().catch(e => { console.error(e); process.exit(1) })
