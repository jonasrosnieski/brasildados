/**
 * Carregador de dados — lê todos os JSONs coletados e mantém cache em memória
 * Fontes: brasildados/data/ (séries brutas) + D:\brasildados\ (bulk downloads)
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT      = path.join(fileURLToPath(import.meta.url), '..', '..', 'data')
const BULK_ROOT = 'D:\\brasildados'

let _cache = null

export async function loadAll() {
  if (_cache) return _cache

  const [presidents, series, social] = await Promise.all([
    loadPresidents(),
    loadAllSeries(),
    loadSocial(),
  ])

  _cache = { presidents, series, social }
  return _cache
}

export function invalidateCache() { _cache = null }

// ── Presidentes ───────────────────────────────────────────────────────────────

async function loadPresidents() {
  const file = path.join(ROOT, 'presidents.json')
  const raw  = JSON.parse(await fs.readFile(file, 'utf8'))
  return raw.presidents.map(p => ({
    ...p,
    term_start: new Date(p.term_start),
    term_end:   p.term_end ? new Date(p.term_end) : null,
  }))
}

// ── Séries temporais ──────────────────────────────────────────────────────────

async function loadAllSeries() {
  const sources = [
    { dir: path.join(ROOT, 'bcb'),  tag: 'BCB'  },
    { dir: path.join(ROOT, 'ipea'), tag: 'IPEA' },
    { dir: path.join(ROOT, 'ibge'), tag: 'IBGE' },
    { dir: path.join(ROOT, 'cti'),  tag: 'CTI'  },
    { dir: path.join(ROOT, 'social'), tag: 'SOCIAL' },
    { dir: path.join(ROOT, 'tse'),  tag: 'TSE'  },
  ]

  const series = {}

  for (const { dir, tag } of sources) {
    let files
    try { files = await fs.readdir(dir) } catch { continue }

    for (const file of files) {
      if (!file.endsWith('.json') || file === 'manifest.json' || file === 'urls_download.json') continue
      try {
        const raw = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'))
        if (!raw.name || !Array.isArray(raw.data)) continue
        series[raw.name] = {
          ...raw,
          source_tag: tag,
          data: raw.data
            .filter(d => d.date && d.value !== null && d.value !== undefined)
            .map(d => ({ date: new Date(d.date), value: d.value, source: d.source }))
            .sort((a, b) => a.date - b.date),
        }
      } catch { /* arquivo malformado, pula */ }
    }
  }

  return series
}

// ── Dados sociais (estruturas especiais) ──────────────────────────────────────

async function loadSocial() {
  const dir = path.join(ROOT, 'social')
  const result = { renda_classes: null, profissoes: null }

  try {
    const renda = JSON.parse(await fs.readFile(path.join(dir, 'renda_media_por_classe.json'), 'utf8'))
    result.renda_classes = renda
  } catch { /* opcional */ }

  try {
    const prof = JSON.parse(await fs.readFile(path.join(dir, 'profissoes.json'), 'utf8'))
    result.profissoes = prof
  } catch { /* opcional */ }

  return result
}
