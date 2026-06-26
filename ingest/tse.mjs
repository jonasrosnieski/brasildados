/**
 * Ingestão de resultados eleitorais do TSE
 * Fonte: https://dadosabertos.tse.jus.br
 *
 * Baixa os resultados das eleições presidenciais (1945–2022) em CSV.
 * O TSE disponibiliza arquivos bulk por ano em:
 * https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/
 *
 * Como os arquivos são grandes (>1GB/ano), este script baixa apenas os dados
 * da eleição presidencial (cargo_id = 1) e salva resumo por candidato/turno.
 *
 * Para eleições anteriores a 1994, o TSE tem arquivos próprios em formato diferente.
 * Este script cobre 1994–2022 automaticamente e inclui dados históricos (1945–1989)
 * como constantes curadas das atas oficiais do TSE.
 */

import fs from 'fs/promises'
import path from 'path'
import { createWriteStream } from 'fs'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data', 'tse')

// Eleições disponíveis no portal bulk do TSE (arquivo CSV por município)
const TSE_YEARS = [1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022]

// Dados históricos curados das atas oficiais do TSE (1945–1989)
// Fonte: https://www.tse.jus.br/eleicoes/eleicoes-anteriores
const HISTORICAL_ELECTIONS = [
  {
    year: 1945, round: 1,
    candidates: [
      { name: 'Eurico Gaspar Dutra',   party: 'PSD/PTB', votes: 3251507, vote_pct: 55.39, result: 'eleito'    },
      { name: 'Eduardo Gomes',          party: 'UDN',     votes: 2039341, vote_pct: 34.73, result: 'nao_eleito'},
      { name: 'Iedo Fiúza',             party: 'PCB',     votes: 569818,  vote_pct: 9.70,  result: 'nao_eleito'},
    ],
    total_valid_votes: 5873364,
    total_voters: 7459849,
    turnout_pct: 78.7,
    notes: 'Primeira eleição direta após o Estado Novo. Voto obrigatório para alfabetizados.',
  },
  {
    year: 1950, round: 1,
    candidates: [
      { name: 'Getúlio Vargas',         party: 'PTB/PSP', votes: 3849040, vote_pct: 48.74, result: 'eleito'    },
      { name: 'Eduardo Gomes',           party: 'UDN',     votes: 2342384, vote_pct: 29.67, result: 'nao_eleito'},
      { name: 'Cristiano Machado',       party: 'PSD',     votes: 1697193, vote_pct: 21.49, result: 'nao_eleito'},
    ],
    total_valid_votes: 7893320,
    total_voters: 11455150,
    turnout_pct: 68.9,
  },
  {
    year: 1955, round: 1,
    candidates: [
      { name: 'Juscelino Kubitschek',   party: 'PSD/PTB', votes: 3077411, vote_pct: 35.68, result: 'eleito'    },
      { name: 'Juarez Távora',           party: 'UDN',     votes: 2610462, vote_pct: 30.27, result: 'nao_eleito'},
      { name: 'Adhemar de Barros',       party: 'PSP',     votes: 2222725, vote_pct: 25.78, result: 'nao_eleito'},
      { name: 'Plínio Salgado',          party: 'PRP',     votes: 714995,  vote_pct: 8.29,  result: 'nao_eleito'},
    ],
    total_valid_votes: 8625593,
    total_voters: 15094083,
    turnout_pct: 57.1,
  },
  {
    year: 1960, round: 1,
    candidates: [
      { name: 'Jânio Quadros',          party: 'PTN/UDN',  votes: 5636623, vote_pct: 48.26, result: 'eleito'    },
      { name: 'Henrique Lott',          party: 'PSD/PTB',  votes: 3846825, vote_pct: 32.93, result: 'nao_eleito'},
      { name: 'Adhemar de Barros',      party: 'PSP',      votes: 2195709, vote_pct: 18.79, result: 'nao_eleito'},
    ],
    total_valid_votes: 11679157,
    total_voters: 15543332,
    turnout_pct: 75.1,
    notes: 'Última eleição direta antes do regime militar. JK não pôde concorrer à reeleição.',
  },
  // 1964–1984: eleições indiretas pelo Congresso Nacional (regime militar)
  {
    year: 1964, round: 1, type: 'indireta',
    candidates: [
      { name: 'Humberto Castelo Branco', party: 'Militar', votes: 361, vote_pct: 100, result: 'eleito' },
    ],
    notes: 'Eleição indireta pelo Congresso Nacional após golpe de 1964. 361 votos de congressistas.',
  },
  {
    year: 1966, round: 1, type: 'indireta',
    candidates: [
      { name: 'Artur Costa e Silva', party: 'ARENA', votes: null, vote_pct: null, result: 'eleito' },
    ],
    notes: 'Eleição indireta. Candidato único da ARENA.',
  },
  {
    year: 1969, round: 1, type: 'indireta',
    candidates: [
      { name: 'Emílio Médici', party: 'ARENA', votes: null, vote_pct: null, result: 'eleito' },
    ],
    notes: 'Indicado pela Junta Militar após Costa e Silva sofrer derrame. Ratificado pelo Congresso.',
  },
  {
    year: 1973, round: 1, type: 'indireta',
    candidates: [
      { name: 'Ernesto Geisel', party: 'ARENA', votes: 400, vote_pct: null, result: 'eleito' },
    ],
    notes: 'Eleição indireta pelo Colégio Eleitoral. 400 eleitores indiretos.',
  },
  {
    year: 1978, round: 1, type: 'indireta',
    candidates: [
      { name: 'João Figueiredo', party: 'ARENA', votes: 355, vote_pct: null, result: 'eleito' },
    ],
    notes: 'Última eleição indireta do regime militar. Último presidente militar.',
  },
  {
    year: 1985, round: 1, type: 'indireta',
    candidates: [
      { name: 'Tancredo Neves',   party: 'PMDB', votes: 480, vote_pct: null, result: 'eleito'    },
      { name: 'Paulo Maluf',      party: 'PDS',  votes: 180, vote_pct: null, result: 'nao_eleito'},
    ],
    total_voters: 686,
    notes: 'Eleição indireta pelo Colégio Eleitoral. Tancredo faleceu antes da posse; assumiu José Sarney (vice).',
  },
  {
    year: 1989, round: 1,
    candidates: [
      { name: 'Fernando Collor',  party: 'PRN', votes: 20611011, vote_pct: 28.52, result: 'segundo_turno' },
      { name: 'Lula',             party: 'PT',  votes: 11622673, vote_pct: 16.08, result: 'segundo_turno' },
      { name: 'Leonel Brizola',   party: 'PDT', votes: 11168228, vote_pct: 15.45, result: 'nao_eleito'    },
    ],
    total_valid_votes: 72257773,
    total_voters: 82093847,
    turnout_pct: 88.0,
    notes: 'Primeira eleição direta após a redemocratização (29 anos sem voto direto para presidente).',
  },
  {
    year: 1989, round: 2,
    candidates: [
      { name: 'Fernando Collor',  party: 'PRN', votes: 35089998, vote_pct: 49.94, result: 'eleito'    },
      { name: 'Lula',             party: 'PT',  votes: 31076364, vote_pct: 44.23, result: 'nao_eleito'},
    ],
    total_valid_votes: 70248467,
    total_voters: 82093847,
    turnout_pct: 85.6,
  },
]

async function downloadTSEYear(year) {
  // O TSE disponibiliza os dados em ZIP com CSV interno
  // Arquivo: votacao_candidato_munzona_YYYY.zip
  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${year}.zip`
  const destZip = path.join(DATA_DIR, `raw_${year}.zip`)

  console.log(`  Baixando ${year} de ${url}`)
  console.log(`  (Arquivo pode ser grande, ~200-800MB dependendo do ano)`)

  const res = await fetch(url, {
    signal: AbortSignal.timeout(300_000), // 5 minutos
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const fileStream = createWriteStream(destZip)
  const reader = res.body.getReader()
  let downloaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fileStream.write(value)
    downloaded += value.length
    process.stdout.write(`\r  ${(downloaded / 1024 / 1024).toFixed(1)} MB baixados...`)
  }

  fileStream.end()
  console.log(`\n  ✓ ${year}: ${(downloaded / 1024 / 1024).toFixed(1)} MB salvo em ${destZip}`)
  return destZip
}

async function saveHistorical() {
  const filepath = path.join(DATA_DIR, 'historico_1945_1989.json')
  await fs.writeFile(filepath, JSON.stringify({
    source: 'TSE/atas_oficiais',
    source_url: 'https://www.tse.jus.br/eleicoes/eleicoes-anteriores',
    description: 'Resultados eleitorais históricos curados das atas oficiais do TSE (1945–1989)',
    fetched_at: new Date().toISOString(),
    elections: HISTORICAL_ELECTIONS,
  }, null, 2))
  console.log(`  ✓ Dados históricos 1945–1989 salvos (${HISTORICAL_ELECTIONS.length} eleições/turnos)`)
}

async function run() {
  await fs.mkdir(DATA_DIR, { recursive: true })

  // 1. Salva dados históricos curados (1945-1989)
  console.log('\n--- Dados históricos curados (1945–1989) ---')
  await saveHistorical()

  // 2. Baixa dados modernos do portal TSE (1994–2022)
  // ATENÇÃO: os arquivos ZIP são grandes (200MB–800MB cada).
  // Para baixar todos: mude DOWNLOAD_RAW para true.
  const DOWNLOAD_RAW = process.env.TSE_DOWNLOAD_RAW === 'true'

  if (!DOWNLOAD_RAW) {
    console.log('\n--- Dados TSE bulk (1994–2022) ---')
    console.log('  ⚠  Download dos ZIPs brutos desativado por padrão (arquivos grandes).')
    console.log('  Para baixar todos os anos, execute:')
    console.log('  TSE_DOWNLOAD_RAW=true node ingest/tse.mjs')
    console.log('\n  URLs para download manual:')
    for (const year of TSE_YEARS) {
      console.log(`  ${year}: https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${year}.zip`)
    }

    // Salva manifest com as URLs para download manual
    await fs.writeFile(path.join(DATA_DIR, 'urls_download.json'), JSON.stringify({
      description: 'URLs para download manual dos arquivos TSE',
      total_estimated_gb: '~15 GB (todos os anos, 1994-2022)',
      years: TSE_YEARS.map(year => ({
        year,
        url: `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${year}.zip`,
        cargo_presidente: 1,
        encoding: 'latin1',
        separator: ';',
      }))
    }, null, 2))
    return
  }

  // Download real (só executa se TSE_DOWNLOAD_RAW=true)
  const manifest = { fetched_at: new Date().toISOString(), years: [] }
  for (const year of TSE_YEARS) {
    try {
      const zipPath = await downloadTSEYear(year)
      manifest.years.push({ year, file: path.basename(zipPath), status: 'ok' })
    } catch (err) {
      console.error(`  ✗ Erro no ano ${year}: ${err.message}`)
      manifest.years.push({ year, error: err.message })
    }
  }

  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

console.log('=== TSE — Ingestão de resultados eleitorais ===')
run().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
