/**
 * Hydrates worker/data-bundle.json into the same shape as loadAll() from data.mjs
 */
import { computeAllRankings } from './rankings.mjs'

export function hydrateBundle(bundle) {
  const presidents = bundle.presidents.map(p => ({
    ...p,
    term_start: new Date(p.term_start),
    term_end:   p.term_end ? new Date(p.term_end) : null,
  }))

  const series = {}
  for (const [name, raw] of Object.entries(bundle.series ?? {})) {
    series[name] = {
      ...raw,
      data: raw.data.map(d => ({
        date:   new Date(d.date),
        value:  d.value,
        source: d.source,
      })),
    }
  }

  const DB = {
    presidents,
    series,
    social:   bundle.social ?? {},
    empresas: bundle.empresas ?? null,
  }
  DB.rankings = computeAllRankings(DB.series, DB.presidents)
  return DB
}
