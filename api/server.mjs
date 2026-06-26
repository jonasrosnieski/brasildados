/**
 * BrasilDados API — Servidor HTTP local
 * Porta padrão: 3737
 *
 * Endpoints:
 *   GET /                          Info da API + lista de endpoints
 *   GET /health                    Status e dados carregados
 *   GET /presidents                Lista todos os presidentes
 *   GET /presidents/:slug          Cartão completo de um presidente
 *   GET /series                    Lista todas as séries disponíveis
 *   GET /series/:name              Série completa anotada com presidente
 *   GET /rankings                  Todos os rankings (resumo)
 *   GET /rankings/:id              Ranking específico completo
 *   GET /compare?slugs=a,b,c&indicator=inflacao_media   Compara presidentes
 *   GET /summary                   Tabela-resumo todos presidentes x todos rankings
 */

import http from 'http'
import { loadAll } from './data.mjs'
import { annotate, aggregateByPresident, presidentAt } from './presidents.mjs'
import { computeAllRankings, presidentCard, RANKING_DEFS } from './rankings.mjs'

const PORT = process.env.PORT ?? 3737

// ── Bootstrap ─────────────────────────────────────────────────────────────────

let DB = null

async function boot() {
  console.log('BrasilDados API — carregando dados...')
  DB = await loadAll()
  DB.rankings = computeAllRankings(DB.series, DB.presidents)
  const nSeries = Object.keys(DB.series).length
  const nRankings = Object.keys(DB.rankings).length
  console.log(`✓ ${DB.presidents.length} presidentes, ${nSeries} séries, ${nRankings} rankings`)
  console.log(`✓ API pronta em http://localhost:${PORT}`)
}

// ── Roteador ──────────────────────────────────────────────────────────────────

function route(req, res) {
  const url    = new URL(req.url, `http://localhost:${PORT}`)
  const parts  = url.pathname.split('/').filter(Boolean)
  const [r0, r1, r2] = parts

  try {
    if (!r0)              return send(res, rootInfo())
    if (r0 === 'health')  return send(res, health())

    if (r0 === 'presidents' && !r1) return send(res, listPresidents())
    if (r0 === 'presidents' && r1)  return send(res, getPresident(r1))

    if (r0 === 'series' && !r1)  return send(res, listSeries())
    if (r0 === 'series' && r1)   return send(res, getSerie(r1, url.searchParams))

    if (r0 === 'rankings' && !r1) return send(res, listRankings())
    if (r0 === 'rankings' && r1)  return send(res, getRanking(r1))

    if (r0 === 'compare')  return send(res, compare(url.searchParams))
    if (r0 === 'summary')  return send(res, summary())

    if (r0 === 'social' && r1 === 'renda-classes') return send(res, socialRendaClasses())
    if (r0 === 'social' && r1 === 'renda-mandatos') return send(res, socialRendaMandatos())
    if (r0 === 'social' && r1 === 'profissoes')    return send(res, socialProfissoes())

    return send(res, { error: 'Not found' }, 404)
  } catch (err) {
    return send(res, { error: err.message, stack: err.stack }, 500)
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function rootInfo() {
  return {
    name: 'BrasilDados API',
    version: '1.0.0',
    description: 'Análise comparativa de governos brasileiros (1889–2026)',
    endpoints: [
      { method: 'GET', path: '/',                          description: 'Esta página' },
      { method: 'GET', path: '/health',                    description: 'Status e dados carregados' },
      { method: 'GET', path: '/presidents',                description: 'Lista todos os presidentes' },
      { method: 'GET', path: '/presidents/:slug',          description: 'Cartão completo de um presidente' },
      { method: 'GET', path: '/series',                    description: 'Lista todas as séries disponíveis' },
      { method: 'GET', path: '/series/:name',              description: 'Série temporal completa anotada com presidente. ?from=YYYY&to=YYYY' },
      { method: 'GET', path: '/rankings',                  description: 'Lista todos os rankings disponíveis' },
      { method: 'GET', path: '/rankings/:id',              description: 'Ranking completo. Ex: /rankings/inflacao_media' },
      { method: 'GET', path: '/compare?slugs=a,b&indicator=inflacao_media', description: 'Compara presidentes num indicador' },
      { method: 'GET', path: '/summary',                   description: 'Tabela resumo: todos presidentes × todos indicadores' },
      { method: 'GET', path: '/social/renda-classes',      description: 'Renda média por classe social (série anual)' },
      { method: 'GET', path: '/social/renda-mandatos',     description: 'Renda média por classe, agregada por mandato presidencial' },
      { method: 'GET', path: '/social/profissoes',         description: 'Profissões — mais populares e maiores salários' },
    ],
    examples: [
      '/presidents/lula-1',
      '/rankings/inflacao_media',
      '/series/ipca_mensal?from=2003&to=2010',
      '/compare?slugs=lula-1,lula-2,fhc-1,fhc-2&indicator=inflacao_media',
      '/summary',
    ],
    data_sources: ['BCB/SGS', 'IPEADATA', 'IBGE/SIDRA', 'World Bank CT&I', 'TSE', 'PNAD/DATASUS (curado)'],
    loaded_at: DB ? new Date().toISOString() : null,
  }
}

function health() {
  if (!DB) return { status: 'loading' }
  return {
    status:     'ok',
    presidents: DB.presidents.length,
    series:     Object.keys(DB.series).length,
    rankings:   Object.keys(DB.rankings).length,
    series_list: Object.keys(DB.series),
    social:      DB.social?.renda_classes ? 'loaded' : 'missing',
  }
}

function socialRendaClasses() {
  const r = DB.social?.renda_classes
  if (!r) return notFound('Dados de renda por classe não carregados. Execute: npm run ingest:social')
  return r
}

function socialProfissoes() {
  const p = DB.social?.profissoes
  if (!p) return notFound('Dados de profissões não carregados. Execute: npm run ingest:social')
  return p
}

function socialRendaMandatos() {
  const r = DB.social?.renda_classes
  if (!r) return notFound('Dados de renda por classe não carregados')

  const classKeys = Object.keys(r.class_labels ?? {})
  const byPresident = {}

  for (const point of r.data) {
    const date = new Date(point.date)
    const pres = presidentAt(date, DB.presidents)
    if (!pres) continue

    if (!byPresident[pres.slug]) {
      byPresident[pres.slug] = {
        slug: pres.slug,
        name: pres.name,
        party: pres.party,
        term_start: pres.term_start.toISOString().slice(0, 10),
        term_end: pres.term_end?.toISOString().slice(0, 10) ?? null,
        era: pres.era,
        regime: pres.regime,
        years: [],
        classes: Object.fromEntries(classKeys.map(k => [k, []])),
      }
    }

    const entry = byPresident[pres.slug]
    entry.years.push(point.date.slice(0, 4))
    for (const key of classKeys) {
      if (point.classes[key] != null) entry.classes[key].push(point.classes[key])
    }
  }

  const mandatos = Object.values(byPresident).map(m => {
    const averages = {}
    for (const key of classKeys) {
      const vals = m.classes[key]
      averages[key] = vals.length > 0
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        : null
    }
    return {
      slug: m.slug,
      name: m.name,
      party: m.party,
      term: `${m.term_start.slice(0, 4)}–${m.term_end?.slice(0, 4) ?? '...'}`,
      term_start: m.term_start,
      term_end: m.term_end,
      era: m.era,
      regime: m.regime,
      years_covered: m.years,
      averages,
    }
  }).sort((a, b) => a.term_start.localeCompare(b.term_start))

  return {
    unit: r.unit,
    class_labels: r.class_labels,
    description: r.description,
    source: r.source,
    mandatos,
  }
}

function listPresidents() {
  return DB.presidents.map(p => ({
    slug:       p.slug,
    name:       p.name,
    party:      p.party,
    term_start: p.term_start.toISOString().slice(0, 10),
    term_end:   p.term_end?.toISOString().slice(0, 10) ?? null,
    era:        p.era,
    regime:     p.regime,
  }))
}

function getPresident(slug) {
  const card = presidentCard(slug, DB.rankings, DB.presidents)
  if (!card) return notFound(`Presidente "${slug}" não encontrado`)

  // Ordena scorecard por categoria
  card.scorecard.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))
  return card
}

function listSeries() {
  return Object.values(DB.series).map(s => ({
    name:        s.name,
    description: s.description,
    unit:        s.unit,
    category:    s.category,
    subcategory: s.subcategory,
    source:      s.source ?? s.source_tag,
    count:       s.data.length,
    from:        s.data[0]?.date.toISOString().slice(0, 10),
    to:          s.data[s.data.length - 1]?.date.toISOString().slice(0, 10),
  }))
}

function getSerie(name, params) {
  const serie = DB.series[name]
  if (!serie) return notFound(`Série "${name}" não encontrada`)

  const from = params.get('from') ? new Date(params.get('from')) : null
  const to   = params.get('to')   ? new Date(params.get('to'))   : null

  const annotated = annotate(serie, DB.presidents)
    .filter(p => (!from || p.date >= from) && (!to || p.date <= to))
    .map(p => ({ ...p, date: p.date.toISOString().slice(0, 10) }))

  return {
    name:        serie.name,
    description: serie.description,
    unit:        serie.unit,
    category:    serie.category,
    subcategory: serie.subcategory,
    source:      serie.source ?? serie.source_tag,
    count:       annotated.length,
    data:        annotated,
  }
}

function listRankings() {
  return Object.entries(DB.rankings).map(([id, { def, ranking, error }]) => ({
    id,
    category:    def.category,
    subcategory: def.subcategory,
    title:       def.title,
    metric:      def.metric,
    order:       def.order,
    better:      def.better,
    unit:        def.unit,
    count:       ranking?.length ?? 0,
    error:       error ?? null,
  }))
}

function getRanking(id) {
  const r = DB.rankings[id]
  if (!r) return notFound(`Ranking "${id}" não encontrado`)
  return {
    id,
    ...r.def,
    count:   r.ranking.length,
    ranking: r.ranking,
    error:   r.error ?? null,
  }
}

function compare(params) {
  const slugs     = (params.get('slugs') ?? '').split(',').filter(Boolean)
  const indicator = params.get('indicator')

  if (slugs.length === 0) return { error: 'Informe ?slugs=slug1,slug2,...' }
  if (!indicator)          return { error: 'Informe ?indicator=ranking_id' }

  const r = DB.rankings[indicator]
  if (!r) return notFound(`Indicador "${indicator}" não encontrado. Use /rankings para ver a lista.`)

  const serie = DB.series[r.def.serie]
  if (!serie) return { error: `Série "${r.def.serie}" não disponível` }

  const aggregated = aggregateByPresident(serie, DB.presidents)

  return {
    indicator,
    title:   r.def.title,
    unit:    r.def.unit,
    better:  r.def.better,
    metric:  r.def.metric,
    comparison: slugs.map(slug => {
      const entry = aggregated[slug]
      const pres  = DB.presidents.find(p => p.slug === slug)
      if (!entry) return { slug, name: pres?.name ?? slug, error: 'Sem dados para este indicador' }
      return {
        slug,
        name:       entry.president.name,
        party:      entry.president.party,
        term:       `${entry.president.term_start.slice(0,4)}–${entry.president.term_end?.slice(0,4) ?? '...'}`,
        regime:     entry.president.regime,
        ...entry.stats,
      }
    }),
  }
}

function summary() {
  const rankings = Object.values(DB.rankings).filter(r => r.ranking?.length > 0)
  const allSlugs = DB.presidents.map(p => p.slug)

  // Para cada presidente, agrega todos os rankings
  const table = allSlugs.map(slug => {
    const pres = DB.presidents.find(p => p.slug === slug)
    const row  = {
      slug,
      name:      pres?.name,
      party:     pres?.party,
      term:      `${pres?.term_start.toISOString().slice(0,4)}–${pres?.term_end?.toISOString().slice(0,4) ?? '...'}`,
      era:       pres?.era,
      regime:    pres?.regime,
      indicators: {},
    }

    for (const r of rankings) {
      const entry = r.ranking.find(e => e.slug === slug)
      if (entry) {
        row.indicators[r.def.id] = {
          rank:  entry.rank,
          total: r.ranking.length,
          value: entry.value,
        }
      }
    }

    return row
  }).filter(row => Object.keys(row.indicators).length > 0)

  return {
    total_presidents: table.length,
    total_indicators: rankings.length,
    indicator_defs:   rankings.map(r => ({ id: r.def.id, title: r.def.title, unit: r.def.unit, better: r.def.better })),
    table,
  }
}

// ── Utilitários ───────────────────────────────────────────────────────────────

function notFound(msg) { return { error: msg, not_found: true } }

function send(res, data, status = 200) {
  const notFound = data?.not_found
  const body = JSON.stringify(data, null, 2)
  res.writeHead(notFound ? 404 : status, {
    'Content-Type':                'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
}

// ── Inicialização ─────────────────────────────────────────────────────────────

boot().then(() => {
  http.createServer(route).listen(PORT, () => {
    console.log(`\nEndpoints disponíveis:`)
    console.log(`  http://localhost:${PORT}/`)
    console.log(`  http://localhost:${PORT}/health`)
    console.log(`  http://localhost:${PORT}/presidents`)
    console.log(`  http://localhost:${PORT}/rankings`)
    console.log(`  http://localhost:${PORT}/summary`)
    console.log(`\nExemplos:`)
    console.log(`  http://localhost:${PORT}/presidents/lula-1`)
    console.log(`  http://localhost:${PORT}/rankings/inflacao_media`)
    console.log(`  http://localhost:${PORT}/compare?slugs=lula-1,fhc-1,bolsonaro&indicator=inflacao_media`)
  })
}).catch(err => { console.error('Erro ao iniciar:', err); process.exit(1) })
