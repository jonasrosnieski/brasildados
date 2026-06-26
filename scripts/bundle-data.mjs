#!/usr/bin/env node
/**
 * Bundles all curated JSON into worker/data-bundle.json for Cloudflare Worker deploy.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(fileURLToPath(import.meta.url), '..', '..', 'data')
const OUT  = path.join(fileURLToPath(import.meta.url), '..', '..', 'worker', 'data-bundle.json')

async function loadPresidents() {
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, 'presidents.json'), 'utf8'))
  const emptyLegacy = { conquistas: [], polemicas: [], escandalos: [], criticas: [] }
  let bySlug = {}
  try {
    const leg = JSON.parse(await fs.readFile(path.join(ROOT, 'presidents-legacy.json'), 'utf8'))
    bySlug = leg.by_slug ?? {}
  } catch { /* optional */ }

  return raw.presidents.map(p => {
    const legacy = bySlug[p.slug] ?? emptyLegacy
    return {
      ...p,
      conquistas: legacy.conquistas ?? [],
      polemicas:  legacy.polemicas ?? [],
      escandalos: legacy.escandalos ?? [],
      criticas:   legacy.criticas ?? [],
    }
  })
}

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
            .sort((a, b) => String(a.date).localeCompare(String(b.date))),
        }
      } catch { /* skip */ }
    }
  }
  return series
}

async function loadSocial() {
  const dir = path.join(ROOT, 'social')
  const result = { renda_classes: null, profissoes: null, renda_distribuicao: null }
  try {
    result.renda_classes = JSON.parse(await fs.readFile(path.join(dir, 'renda_media_por_classe.json'), 'utf8'))
  } catch { /* optional */ }
  try {
    result.profissoes = JSON.parse(await fs.readFile(path.join(dir, 'profissoes.json'), 'utf8'))
  } catch { /* optional */ }
  try {
    result.renda_distribuicao = JSON.parse(await fs.readFile(path.join(dir, 'renda_distribuicao_faixas.json'), 'utf8'))
  } catch { /* optional */ }
  return result
}

async function loadEmpresas() {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, 'empresas', 'empresas.json'), 'utf8'))
  } catch {
    return null
  }
}

const bundle = {
  bundled_at: new Date().toISOString(),
  presidents: await loadPresidents(),
  series:     await loadAllSeries(),
  social:     await loadSocial(),
  empresas:   await loadEmpresas(),
}

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, JSON.stringify(bundle), 'utf8')
process.stdout.write(`✓ Bundled ${bundle.presidents.length} presidents, ${Object.keys(bundle.series).length} series → worker/data-bundle.json\n`)
