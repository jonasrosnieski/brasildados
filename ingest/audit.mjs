/**
 * Sistema de auditoria — loga todas as operações de download e ingestão
 * Gera: D:\brasildados\logs\audit.jsonl  (linha por evento, machine-readable)
 *       D:\brasildados\logs\relatorio.md  (relatório humano, atualizado em tempo real)
 */

import fs from 'fs/promises'
import { appendFileSync, existsSync } from 'fs'
import path from 'path'
import os from 'os'

const LOGS_DIR  = 'D:\\brasildados\\logs'
const AUDIT_FILE = path.join(LOGS_DIR, 'audit.jsonl')
const REPORT_FILE = path.join(LOGS_DIR, 'relatorio.md')

let sessionId = null
let sessionStart = null

export function initSession(label) {
  sessionId   = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`
  sessionStart = new Date()

  const header = {
    type: 'SESSION_START',
    session_id: sessionId,
    label,
    ts: sessionStart.toISOString(),
    host: os.hostname(),
    platform: process.platform,
    node: process.version,
  }
  _append(header)

  _updateReport()
  console.log(`[AUDIT] Sessão iniciada: ${sessionId}`)
  console.log(`[AUDIT] Logs em: ${AUDIT_FILE}`)
  console.log(`[AUDIT] Relatório em: ${REPORT_FILE}`)
  return sessionId
}

export function logDownloadStart(opts) {
  // opts: { source, name, url, dest, estimatedMB }
  const ev = { type: 'DOWNLOAD_START', session_id: sessionId, ts: new Date().toISOString(), ...opts }
  _append(ev)
  console.log(`[↓] Iniciando download: ${opts.name}`)
}

export function logDownloadProgress(opts) {
  // opts: { name, downloadedMB, totalMB, speedMBs }
  const ev = { type: 'DOWNLOAD_PROGRESS', session_id: sessionId, ts: new Date().toISOString(), ...opts }
  _append(ev)
}

export function logDownloadDone(opts) {
  // opts: { source, name, url, dest, sizeMB, durationSec, sha256 }
  const ev = { type: 'DOWNLOAD_DONE', session_id: sessionId, ts: new Date().toISOString(), ...opts }
  _append(ev)
  _updateReport()
  console.log(`[✓] Download completo: ${opts.name} — ${opts.sizeMB?.toFixed(1)} MB em ${opts.durationSec?.toFixed(0)}s`)
}

export function logDownloadError(opts) {
  // opts: { source, name, url, dest, error }
  const ev = { type: 'DOWNLOAD_ERROR', session_id: sessionId, ts: new Date().toISOString(), ...opts }
  _append(ev)
  _updateReport()
  console.error(`[✗] Erro no download: ${opts.name} — ${opts.error}`)
}

export function logIngest(opts) {
  // opts: { source, name, file, records, range, category }
  const ev = { type: 'INGEST_DONE', session_id: sessionId, ts: new Date().toISOString(), ...opts }
  _append(ev)
  _updateReport()
}

export function logSkipped(opts) {
  // opts: { name, dest, reason }
  const ev = { type: 'SKIPPED', session_id: sessionId, ts: new Date().toISOString(), ...opts }
  _append(ev)
  console.log(`[~] Pulando: ${opts.name} — ${opts.reason}`)
}

export function logSessionEnd(summary) {
  const durationMin = ((Date.now() - sessionStart.getTime()) / 60000).toFixed(1)
  const ev = {
    type: 'SESSION_END',
    session_id: sessionId,
    ts: new Date().toISOString(),
    duration_min: parseFloat(durationMin),
    ...summary,
  }
  _append(ev)
  _updateReport()
  console.log(`[AUDIT] Sessão encerrada após ${durationMin} minutos`)
}

function _append(obj) {
  try {
    appendFileSync(AUDIT_FILE, JSON.stringify(obj) + '\n', 'utf8')
  } catch (e) {
    // silencioso — não travar o processo por log
  }
}

async function _updateReport() {
  try {
    const raw = await fs.readFile(AUDIT_FILE, 'utf8').catch(() => '')
    const lines = raw.trim().split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l) } catch { return null }
    }).filter(Boolean)

    const sessions = {}
    for (const ev of lines) {
      if (!sessions[ev.session_id]) sessions[ev.session_id] = { events: [] }
      sessions[ev.session_id].events.push(ev)
    }

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    let md = `# BrasilDados — Relatório de Auditoria\n\n`
    md += `**Atualizado em:** ${now} (BRT)  \n`
    md += `**Arquivo de log:** \`${AUDIT_FILE}\`\n\n`
    md += `---\n\n`

    for (const [sid, { events }] of Object.entries(sessions)) {
      const start   = events.find(e => e.type === 'SESSION_START')
      const end     = events.find(e => e.type === 'SESSION_END')
      const dls     = events.filter(e => e.type === 'DOWNLOAD_DONE')
      const errs    = events.filter(e => e.type === 'DOWNLOAD_ERROR')
      const ingests = events.filter(e => e.type === 'INGEST_DONE')
      const skipped = events.filter(e => e.type === 'SKIPPED')
      const totalMB = dls.reduce((s, e) => s + (e.sizeMB ?? 0), 0)

      md += `## Sessão: ${start?.label ?? sid}\n\n`
      md += `| Campo | Valor |\n|---|---|\n`
      md += `| ID | \`${sid}\` |\n`
      md += `| Início | ${start?.ts ?? '?'} |\n`
      md += `| Fim | ${end?.ts ?? '_(em andamento)_'} |\n`
      md += `| Duração | ${end?.duration_min ?? '?'} min |\n`
      md += `| Downloads OK | ${dls.length} |\n`
      md += `| Downloads com erro | ${errs.length} |\n`
      md += `| Ignorados | ${skipped.length} |\n`
      md += `| Séries ingeridas | ${ingests.length} |\n`
      md += `| Total baixado | ${totalMB.toFixed(1)} MB |\n\n`

      if (dls.length > 0) {
        md += `### Downloads concluídos\n\n`
        md += `| Arquivo | Fonte | Tamanho | Tempo | Destino |\n|---|---|---|---|---|\n`
        for (const d of dls) {
          md += `| ${d.name} | ${d.source} | ${d.sizeMB?.toFixed(1)} MB | ${d.durationSec?.toFixed(0)}s | \`${d.dest}\` |\n`
        }
        md += '\n'
      }

      if (errs.length > 0) {
        md += `### ⚠ Erros de download\n\n`
        md += `| Arquivo | Fonte | URL | Erro |\n|---|---|---|---|\n`
        for (const e of errs) {
          md += `| ${e.name} | ${e.source} | ${e.url} | ${e.error} |\n`
        }
        md += '\n'
      }

      if (ingests.length > 0) {
        md += `### Séries ingeridas\n\n`
        md += `| Nome | Categoria | Registros | Cobertura | Fonte |\n|---|---|---|---|---|\n`
        for (const i of ingests) {
          md += `| ${i.name} | ${i.category ?? '-'} | ${i.records ?? '-'} | ${i.range ?? '-'} | ${i.source} |\n`
        }
        md += '\n'
      }

      if (skipped.length > 0) {
        md += `### Ignorados\n\n`
        for (const s of skipped) md += `- **${s.name}**: ${s.reason}\n`
        md += '\n'
      }

      md += `---\n\n`
    }

    // BOM UTF-8 para compatibilidade com Windows/PowerShell/Excel
    await fs.writeFile(REPORT_FILE, '﻿' + md, 'utf8')
  } catch (e) {
    // silencioso
  }
}
