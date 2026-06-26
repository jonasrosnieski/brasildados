/**
 * Gera president-photos.ts a partir da Wikipedia REST API (domínio público).
 * Uso: node tools/fetch-president-photos.mjs
 */

import fs from 'fs/promises'
import path from 'path'

const WIKI_TITLE = {
  deodoro: 'Deodoro da Fonseca',
  floriano: 'Floriano Peixoto',
  prudente: 'Prudente de Morais',
  'campos-sales': 'Manuel Ferraz de Campos Sales',
  'rodrigues-alves': 'Rodrigues Alves',
  'afonso-pena': 'Afonso Pena',
  'nilo-pecanha': 'Nilo Peçanha',
  hermes: 'Hermes da Fonseca',
  venceslau: 'Venceslau Brás',
  delfim: 'Delfim Moreira',
  epitacio: 'Epitácio Pessoa',
  'artur-bernardes': 'Artur Bernardes',
  'washington-luis': 'Washington Luís',
  'vargas-1': 'Getúlio Vargas',
  'vargas-2': 'Getúlio Vargas',
  dutra: 'Eurico Gaspar Dutra',
  'cafe-filho': 'João Café Filho',
  'carlos-luz': 'Carlos Luz',
  'nereu-ramos': 'Nereu Ramos',
  jk: 'Juscelino Kubitschek',
  janio: 'Jânio Quadros',
  jango: 'João Goulart',
  'castelo-branco': 'Humberto de Alencar Castelo Branco',
  'costa-e-silva': 'Artur da Costa e Silva',
  medici: 'Emílio Garrastazu Médici',
  geisel: 'Ernesto Geisel',
  figueiredo: 'João Figueiredo',
  sarney: 'José Sarney',
  collor: 'Fernando Collor de Melo',
  itamar: 'Itamar Franco',
  'fhc-1': 'Fernando Henrique Cardoso',
  'fhc-2': 'Fernando Henrique Cardoso',
  'lula-1': 'Luiz Inácio Lula da Silva',
  'lula-2': 'Luiz Inácio Lula da Silva',
  'dilma-1': 'Dilma Rousseff',
  'dilma-2': 'Dilma Rousseff',
  temer: 'Michel Temer',
  bolsonaro: 'Jair Bolsonaro',
  'lula-3': 'Luiz Inácio Lula da Silva',
}

const UA = 'BrasilDados/1.0 (public data project; contact: github.com/jonasrosnieski/brasildados)'

async function fetchThumb(title) {
  const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.thumbnail?.source) throw new Error('sem thumbnail')
  return json.thumbnail.source.replace(/\/\d+px-/, '/200px-')
}

async function main() {
  const photos = {}
  const errors = []

  for (const [slug, title] of Object.entries(WIKI_TITLE)) {
    try {
      photos[slug] = await fetchThumb(title)
      console.log(`✓ ${slug}`)
    } catch (err) {
      errors.push({ slug, title, error: err.message })
      console.error(`✗ ${slug}: ${err.message}`)
    }
    await new Promise(r => setTimeout(r, 400))
  }

  const lines = [
    '// Fotos públicas — gerado por brasildados/tools/fetch-president-photos.mjs',
    '// Fonte: Wikipedia REST API (Wikimedia Commons, domínio público / CC)',
    '',
    'export const PRESIDENT_PHOTOS: Record<string, string> = {',
  ]

  for (const [slug, url] of Object.entries(photos)) {
    lines.push(`  '${slug}': '${url}',`)
  }
  lines.push('}', '')

  const out = path.join(import.meta.dirname, '..', '..', 'src', 'components', 'brasildados', 'president-photos.ts')
  await fs.writeFile(out, lines.join('\n'))
  console.log(`\nEscrito: ${out}`)
  if (errors.length) {
    console.log(`\n${errors.length} falhas — verifique títulos Wikipedia`)
    process.exit(1)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
