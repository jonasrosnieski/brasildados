/**
 * Shared BrasilDados API router — used by Node server and Cloudflare Worker.
 */
import { annotate, aggregateByPresident, presidentAt } from './presidents.mjs'
import { computeAllRankings, presidentCard } from './rankings.mjs'

const DEFAULT_UI = 'http://localhost:3000/apps/brasildados'

export function createApp(options = {}) {
  const dashboardUrl = options.dashboardUrl ?? process.env.BRASILDADOS_UI_URL ?? DEFAULT_UI
  const loadData = options.loadData

  let DB = null

  async function boot() {
    if (DB) return DB
    if (!loadData) throw new Error('createApp requires loadData')
    DB = await loadData()
    if (!DB.rankings) {
      DB.rankings = computeAllRankings(DB.series, DB.presidents)
    }
    return DB
  }

  async function handle(url, accept = '') {
    await boot()
    const parts = url.pathname.split('/').filter(Boolean)
    const [r0, r1] = parts

    try {
      if (!r0) {
        if (accept.includes('text/html')) {
          return { type: 'html', body: dashboardHtml(), status: 200 }
        }
        return { type: 'json', data: rootInfo(), status: 200 }
      }
      if (r0 === 'health') return { type: 'json', data: health(), status: 200 }

      if (r0 === 'presidents' && !r1) return { type: 'json', data: listPresidents(), status: 200 }
      if (r0 === 'presidents' && r1)  return jsonResult(getPresident(r1))

      if (r0 === 'series' && !r1)  return { type: 'json', data: listSeries(), status: 200 }
      if (r0 === 'series' && r1)   return jsonResult(getSerie(r1, url.searchParams))

      if (r0 === 'rankings' && !r1) return { type: 'json', data: listRankings(), status: 200 }
      if (r0 === 'rankings' && r1)  return jsonResult(getRanking(r1))

      if (r0 === 'compare') return { type: 'json', data: compare(url.searchParams), status: 200 }
      if (r0 === 'summary') return { type: 'json', data: summary(), status: 200 }

      if (r0 === 'social' && r1 === 'renda-classes')      return jsonResult(socialRendaClasses())
      if (r0 === 'social' && r1 === 'renda-mandatos')     return { type: 'json', data: socialRendaMandatos(), status: 200 }
      if (r0 === 'social' && r1 === 'renda-distribuicao') return jsonResult(socialRendaDistribuicao())
      if (r0 === 'social' && r1 === 'profissoes')        return jsonResult(socialProfissoes())

      if (r0 === 'empresas') return jsonResult(getEmpresas())

      return { type: 'json', data: { error: 'Not found' }, status: 404 }
    } catch (err) {
      return { type: 'json', data: { error: err.message, stack: err.stack }, status: 500 }
    }
  }

  function jsonResult(data) {
    const status = data?.not_found ? 404 : 200
    return { type: 'json', data, status }
  }

  function rootInfo() {
    return {
      name: 'BrasilDados API',
      version: '1.0.0',
      description: 'Análise comparativa de governos brasileiros (1889–2026)',
      dashboard_url: dashboardUrl,
      note: 'API JSON pública. Dashboard visual no Aether (Next.js).',
      endpoints: [
        { method: 'GET', path: '/health', description: 'Status e dados carregados' },
        { method: 'GET', path: '/presidents', description: 'Lista todos os presidentes' },
        { method: 'GET', path: '/presidents/:slug', description: 'Cartão completo de um presidente' },
        { method: 'GET', path: '/series', description: 'Lista todas as séries disponíveis' },
        { method: 'GET', path: '/rankings/:id', description: 'Ranking por indicador' },
        { method: 'GET', path: '/summary', description: 'Tabela resumo presidentes × indicadores' },
        { method: 'GET', path: '/social/renda-classes', description: 'Renda média por classe social' },
        { method: 'GET', path: '/social/renda-distribuicao', description: 'Distribuição por faixas de renda' },
        { method: 'GET', path: '/social/profissoes', description: 'Profissões — salários e ocupação' },
        { method: 'GET', path: '/empresas', description: 'Companhias abertas CVM' },
      ],
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
      social:     DB.social?.renda_classes ? 'loaded' : 'missing',
      empresas:   DB.empresas ? 'loaded' : 'missing',
    }
  }

  function socialRendaClasses() {
    const r = DB.social?.renda_classes
    if (!r) return notFound('Dados de renda por classe não carregados')
    return r
  }

  function socialProfissoes() {
    const p = DB.social?.profissoes
    if (!p) return notFound('Dados de profissões não carregados')
    return p
  }

  function socialRendaDistribuicao() {
    const d = DB.social?.renda_distribuicao
    if (!d) return notFound('Distribuição por faixas não carregada')
    return d
  }

  function getEmpresas() {
    const e = DB.empresas
    if (!e) return notFound('Dados de empresas não carregados')
    return e
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
    if (!r) return notFound(`Indicador "${indicator}" não encontrado`)

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
          term:       `${entry.president.term_start.slice(0, 4)}–${entry.president.term_end?.slice(0, 4) ?? '...'}`,
          regime:     entry.president.regime,
          ...entry.stats,
        }
      }),
    }
  }

  function summary() {
    const rankings = Object.values(DB.rankings).filter(r => r.ranking?.length > 0)
    const allSlugs = DB.presidents.map(p => p.slug)

    const table = allSlugs.map(slug => {
      const pres = DB.presidents.find(p => p.slug === slug)
      const row  = {
        slug,
        name:      pres?.name,
        party:     pres?.party,
        term:      `${pres?.term_start.toISOString().slice(0, 4)}–${pres?.term_end?.toISOString().slice(0, 4) ?? '...'}`,
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

  function notFound(msg) { return { error: msg, not_found: true } }

  function dashboardHtml() {
    const social = `${dashboardUrl}/social`
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>BrasilDados API</title>
<meta http-equiv="refresh" content="0;url=${social}">
<style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:2rem}
.box{max-width:32rem;text-align:center} a{color:#60a5fa}</style></head><body><div class="box">
<h1>BrasilDados API</h1><p>Backend JSON público — dashboard em <a href="${dashboardUrl}">${dashboardUrl}</a></p>
<p><small>Redirecionando…</small></p></div></body></html>`
  }

  return { handle, boot }
}

export function toResponse(result) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  }
  if (result.type === 'html') {
    return new Response(result.body, {
      status: result.status,
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  return new Response(JSON.stringify(result.data, null, 2), {
    status: result.status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  })
}
