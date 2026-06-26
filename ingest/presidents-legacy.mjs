/**
 * Curadoria histórica por mandato — polêmicas, escândalos, críticas e conquistas.
 * Fontes: historiografia consensual (CPDOC/FGV, IBGE, imprensa, tribunais).
 * Conteúdo editorial; indicadores numéricos do projeto permanecem sem viés.
 */

import fs from 'fs/promises'
import path from 'path'
import { LEGACY_BY_SLUG } from './presidents-legacy-data.mjs'

async function run() {
  const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
  await fs.mkdir(DATA_DIR, { recursive: true })

  const output = {
    generated_at: new Date().toISOString(),
    source: 'Curadoria histórica — CPDOC/FGV, Biblioteca da Presidência, imprensa e tribunais',
    disclaimer:
      'Registro editorial baseado em consenso historiográfico. Não substitui fontes primárias nem julgamentos judiciais.',
    total: Object.keys(LEGACY_BY_SLUG).length,
    by_slug: LEGACY_BY_SLUG,
  }

  const filepath = path.join(DATA_DIR, 'presidents-legacy.json')
  await fs.writeFile(filepath, JSON.stringify(output, null, 2))
  console.log(`✓ Legado histórico de ${output.total} presidentes → data/presidents-legacy.json`)
}

run().catch(err => { console.error(err); process.exit(1) })
