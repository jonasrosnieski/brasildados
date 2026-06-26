/**
 * Rankings pré-calculados — gera comparações prontas para exibição
 * Cobre todos os indicadores coletados, organizados por categoria.
 */

import { aggregateByPresident, rankByMetric } from './presidents.mjs'

// Definição dos rankings disponíveis
// metric: qual estatística usar para o ranking
// order:  'asc' = menor é melhor (ex: inflação), 'desc' = maior é melhor (ex: PIB)
// label_asc: rótulo para o melhor (top do ranking)
const RANKING_DEFS = [
  // ── Economia ──────────────────────────────────────────────────────────────
  {
    id:           'inflacao_media',
    serie:        'ipca_mensal',
    metric:       'mean',
    order:        'asc',
    category:     'economia',
    subcategory:  'inflacao',
    title:        'Inflação média no mandato (IPCA mensal %)',
    description:  'Média do IPCA mensal durante o mandato. Menor = melhor controle inflacionário.',
    unit:         '% ao mês',
    better:       'menor',
    note:         'Presidentes da era do cruzeiro/cruzado têm inflação incomparável com era do Real (1994+)',
  },
  {
    id:           'inflacao_acumulada',
    serie:        'ipca_mensal',
    metric:       'sum',
    order:        'asc',
    category:     'economia',
    subcategory:  'inflacao',
    title:        'Inflação acumulada no mandato (IPCA %)',
    description:  'Soma do IPCA mensal — proxy da inflação total durante o mandato.',
    unit:         '% acumulado',
    better:       'menor',
  },
  {
    id:           'pib_variacao_media',
    serie:        'pib_variacao_trimestral',
    metric:       'mean',
    order:        'desc',
    category:     'economia',
    subcategory:  'pib',
    title:        'Crescimento médio do PIB (variação trimestral %)',
    description:  'Média da variação trimestral do PIB real durante o mandato.',
    unit:         '% trimestral',
    better:       'maior',
  },
  {
    id:           'selic_media',
    serie:        'selic_meta_anual',
    metric:       'mean',
    order:        'asc',
    category:     'economia',
    subcategory:  'juros',
    title:        'Taxa SELIC média no mandato (% a.a.)',
    description:  'Média da taxa SELIC durante o mandato. Reflete custo do crédito e aperto monetário.',
    unit:         '% ao ano',
    better:       'menor',
  },
  {
    id:           'cambio_variacao',
    serie:        'cambio_usd_brl',
    metric:       'change_pct',
    order:        'asc',
    category:     'economia',
    subcategory:  'cambio',
    title:        'Variação do câmbio USD/BRL no mandato (%)',
    description:  'Variação percentual do Real frente ao dólar durante o mandato. Negativo = Real valorizou.',
    unit:         '%',
    better:       'menor (negativo = Real valorizou)',
  },
  {
    id:           'desemprego_medio',
    serie:        'desemprego_pnadc',
    metric:       'mean',
    order:        'asc',
    category:     'economia',
    subcategory:  'desemprego',
    title:        'Taxa de desemprego média no mandato (PNAD-C %)',
    description:  'Média da taxa de desocupação PNAD-C. Disponível apenas a partir de 2012.',
    unit:         '%',
    better:       'menor',
  },

  // ── Social ────────────────────────────────────────────────────────────────
  {
    id:           'salario_minimo_variacao',
    serie:        'salario_minimo_real',
    metric:       'change_pct',
    order:        'desc',
    category:     'social',
    subcategory:  'salario',
    title:        'Ganho real do salário mínimo no mandato (%)',
    description:  'Variação percentual do salário mínimo real (corrigido pela inflação) durante o mandato.',
    unit:         '%',
    better:       'maior',
  },
  {
    id:           'salario_minimo_medio',
    serie:        'salario_minimo_real',
    metric:       'mean',
    order:        'desc',
    category:     'social',
    subcategory:  'salario',
    title:        'Salário mínimo real médio no mandato (R$ de hoje)',
    description:  'Média do salário mínimo real durante o mandato, em reais de hoje.',
    unit:         'R$',
    better:       'maior',
  },
  {
    id:           'gini_medio',
    serie:        'gini',
    metric:       'mean',
    order:        'asc',
    category:     'social',
    subcategory:  'desigualdade',
    title:        'Coeficiente de Gini médio no mandato',
    description:  'Média do Gini (0 = igualdade total, 1 = desigualdade total).',
    unit:         'índice (0–1)',
    better:       'menor',
  },
  {
    id:           'gini_variacao',
    serie:        'gini',
    metric:       'change',
    order:        'asc',
    category:     'social',
    subcategory:  'desigualdade',
    title:        'Variação do Gini no mandato (queda = menos desigual)',
    description:  'Variação absoluta do Gini. Negativo = desigualdade reduziu.',
    unit:         'pontos',
    better:       'menor (negativo = desigualdade caiu)',
  },
  {
    id:           'pobreza_variacao',
    serie:        'pobreza_extrema_pct',
    metric:       'change',
    order:        'asc',
    category:     'social',
    subcategory:  'pobreza',
    title:        'Variação da extrema pobreza no mandato (pp)',
    description:  'Variação em pontos percentuais da população em extrema pobreza. Negativo = queda da pobreza.',
    unit:         'p.p.',
    better:       'menor (negativo = pobreza caiu)',
  },

  // ── Educação ──────────────────────────────────────────────────────────────
  {
    id:           'analfabetismo_variacao',
    serie:        'analfabetismo_pct',
    metric:       'change',
    order:        'asc',
    category:     'educacao',
    subcategory:  'analfabetismo',
    title:        'Variação do analfabetismo no mandato (p.p.)',
    description:  'Variação em pontos percentuais da taxa de analfabetismo. Negativo = analfabetismo caiu.',
    unit:         'p.p.',
    better:       'menor (negativo = queda no analfabetismo)',
  },
  {
    id:           'analfabetismo_medio',
    serie:        'analfabetismo_pct',
    metric:       'mean',
    order:        'asc',
    category:     'educacao',
    subcategory:  'analfabetismo',
    title:        'Taxa média de analfabetismo no mandato (%)',
    description:  'Média da taxa de analfabetismo (pop ≥15 anos) durante o mandato.',
    unit:         '%',
    better:       'menor',
  },

  // ── Saúde ─────────────────────────────────────────────────────────────────
  {
    id:           'mortalidade_infantil_media',
    serie:        'mortalidade_infantil_por_1k',
    metric:       'mean',
    order:        'asc',
    category:     'saude',
    subcategory:  'mortalidade',
    title:        'Mortalidade infantil média no mandato (por 1.000 nascidos)',
    description:  'Média da taxa de mortalidade infantil durante o mandato.',
    unit:         'por 1.000 nascidos vivos',
    better:       'menor',
  },
  {
    id:           'mortalidade_infantil_variacao',
    serie:        'mortalidade_infantil_por_1k',
    metric:       'change',
    order:        'asc',
    category:     'saude',
    subcategory:  'mortalidade',
    title:        'Variação da mortalidade infantil no mandato',
    description:  'Queda absoluta na mortalidade infantil durante o mandato. Negativo = melhorou.',
    unit:         'por 1.000 nascidos vivos',
    better:       'menor (negativo = mortalidade caiu)',
  },

  // ── Ciência & Tecnologia ───────────────────────────────────────────────────
  {
    id:           'gasto_pd_pib_medio',
    serie:        'gasto_pd_pib_pct',
    metric:       'mean',
    order:        'desc',
    category:     'ciencia_tecnologia',
    subcategory:  'investimento',
    title:        'Gasto em P&D médio no mandato (% do PIB)',
    description:  'Média do gasto em pesquisa e desenvolvimento em relação ao PIB (World Bank).',
    unit:         '% do PIB',
    better:       'maior',
    note:         'Dados anuais; cobertura a partir dos anos 2000 para a maioria dos mandatos recentes.',
  },
  {
    id:           'gasto_pd_pib_variacao',
    serie:        'gasto_pd_pib_pct',
    metric:       'change',
    order:        'desc',
    category:     'ciencia_tecnologia',
    subcategory:  'investimento',
    title:        'Variação do gasto em P&D no mandato (p.p.)',
    description:  'Variação em pontos percentuais do gasto em P&D sobre o PIB durante o mandato.',
    unit:         'p.p.',
    better:       'maior (positivo = mais investimento)',
  },
  {
    id:           'pesquisadores_milhao_medio',
    serie:        'pesquisadores_por_milhao',
    metric:       'mean',
    order:        'desc',
    category:     'ciencia_tecnologia',
    subcategory:  'recursos_humanos',
    title:        'Pesquisadores por milhão — média no mandato',
    description:  'Média de pesquisadores em P&D por milhão de habitantes (World Bank).',
    unit:         'por milhão',
    better:       'maior',
  },
  {
    id:           'patentes_residentes_media',
    serie:        'patentes_residentes',
    metric:       'mean',
    order:        'desc',
    category:     'ciencia_tecnologia',
    subcategory:  'inovacao',
    title:        'Patentes de residentes — média anual no mandato',
    description:  'Média anual de pedidos de patentes de residentes brasileiros (World Bank).',
    unit:         'número',
    better:       'maior',
  },
]

/**
 * Calcula todos os rankings disponíveis.
 * Retorna Map<id, { def, ranking: [] }>
 */
export function computeAllRankings(series, presidents) {
  const result = {}

  for (const def of RANKING_DEFS) {
    const serie = series[def.serie]
    if (!serie) {
      result[def.id] = { def, ranking: [], error: `Série "${def.serie}" não carregada` }
      continue
    }

    const aggregated = aggregateByPresident(serie, presidents)
    const ranking    = rankByMetric(aggregated, def.metric, def.order)

    result[def.id] = { def, ranking }
  }

  return result
}

/**
 * Retorna o "cartão" completo de um presidente: todos os rankings com sua posição.
 */
export function presidentCard(slug, allRankings, presidentsList) {
  const pres = presidentsList.find(p => p.slug === slug)
  if (!pres) return null

  const scorecard = []

  for (const [id, { def, ranking, error }] of Object.entries(allRankings)) {
    if (error) continue
    const entry = ranking.find(r => r.slug === slug)
    if (!entry) continue

    scorecard.push({
      ranking_id:  id,
      category:    def.category,
      subcategory: def.subcategory,
      title:       def.title,
      unit:        def.unit,
      better:      def.better,
      rank:        entry.rank,
      total:       ranking.length,
      value:       entry.value,
      percentile:  Math.round(((ranking.length - entry.rank) / ranking.length) * 100),
    })
  }

  return {
    president: {
      slug:           pres.slug,
      name:           pres.name,
      full_name:      pres.full_name,
      party:          pres.party,
      ideology:       pres.ideology,
      born:           pres.born,
      birth_state:    pres.birth_state,
      term_start:     pres.term_start.toISOString().slice(0, 10),
      term_end:       pres.term_end?.toISOString().slice(0, 10) ?? null,
      term_number:    pres.term_number,
      era:            pres.era,
      regime:         pres.regime,
      highlights:     pres.highlights ?? [],
      economic_context: pres.economic_context,
    },
    scorecard,
  }
}

export { RANKING_DEFS }
