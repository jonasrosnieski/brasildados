/**
 * Mapeador de presidentes — associa cada ponto de série ao presidente em exercício
 * e calcula agregados por mandato.
 */

/**
 * Retorna o presidente em exercício numa data específica.
 */
export function presidentAt(date, presidents) {
  const d = date instanceof Date ? date : new Date(date)
  // Ordena do mais recente ao mais antigo para pegar o mandato correto
  return presidents.find(p => {
    const start = p.term_start
    const end   = p.term_end ?? new Date('2099-01-01')
    return d >= start && d < end
  }) ?? null
}

/**
 * Anota uma série temporal com o slug do presidente de cada ponto.
 */
export function annotate(serie, presidents) {
  return serie.data.map(point => ({
    ...point,
    president_slug: presidentAt(point.date, presidents)?.slug ?? null,
    president_name: presidentAt(point.date, presidents)?.name ?? null,
  }))
}

/**
 * Agrega os pontos de uma série por presidente.
 * Retorna um objeto { [slug]: { president, stats } }
 */
export function aggregateByPresident(serie, presidents) {
  const bySlug = {}

  for (const point of serie.data) {
    const pres = presidentAt(point.date, presidents)
    if (!pres) continue

    if (!bySlug[pres.slug]) {
      bySlug[pres.slug] = {
        president: {
          slug:         pres.slug,
          name:         pres.name,
          party:        pres.party,
          term_start:   pres.term_start.toISOString().slice(0, 10),
          term_end:     pres.term_end?.toISOString().slice(0, 10) ?? null,
          term_number:  pres.term_number,
          era:          pres.era,
          regime:       pres.regime,
        },
        points: [],
      }
    }
    bySlug[pres.slug].points.push(point.value)
  }

  // Calcula estatísticas por mandato
  const result = {}
  for (const [slug, { president, points }] of Object.entries(bySlug)) {
    if (points.length === 0) continue
    const sorted = [...points].sort((a, b) => a - b)
    const n      = points.length
    const sum    = points.reduce((s, v) => s + v, 0)

    result[slug] = {
      president,
      stats: {
        count:   n,
        mean:    round(sum / n),
        median:  round(sorted[Math.floor(n / 2)]),
        min:     round(sorted[0]),
        max:     round(sorted[n - 1]),
        p25:     round(sorted[Math.floor(n * 0.25)]),
        p75:     round(sorted[Math.floor(n * 0.75)]),
        first:   round(points[0]),
        last:    round(points[n - 1]),
        change:  round(points[n - 1] - points[0]),       // variação absoluta
        change_pct: points[0] !== 0
          ? round(((points[n - 1] - points[0]) / Math.abs(points[0])) * 100)
          : null,
        sum:     round(sum),
      },
    }
  }

  return result
}

/**
 * Compara todos os presidentes em uma métrica específica.
 * metric: 'mean' | 'median' | 'change' | 'change_pct' | 'min' | 'max' | 'last'
 * order:  'asc' | 'desc'
 */
export function rankByMetric(aggregated, metric = 'mean', order = 'asc') {
  const entries = Object.values(aggregated)
    .filter(e => e.stats[metric] !== null && e.stats[metric] !== undefined)
    .map(e => ({
      rank:      0,
      slug:      e.president.slug,
      name:      e.president.name,
      party:     e.president.party,
      term:      `${e.president.term_start.slice(0,4)}–${e.president.term_end?.slice(0,4) ?? '...'}`,
      era:       e.president.era,
      regime:    e.president.regime,
      value:     e.stats[metric],
      count:     e.stats.count,
    }))

  entries.sort((a, b) => order === 'asc' ? a.value - b.value : b.value - a.value)
  entries.forEach((e, i) => { e.rank = i + 1 })

  return entries
}

function round(n, decimals = 4) {
  if (n === null || n === undefined) return null
  return Math.round(n * 10 ** decimals) / 10 ** decimals
}
