import type { ActionPlanTimeframe, ActionPlanItemOutput } from '../types'

/**
 * Deriva o timeframe a partir da Matriz Impacto x Esforço (Addendum §2).
 */
export function calculateTimeframe(impactScore: number, effortScore: number): ActionPlanTimeframe {
  if (impactScore >= 60 && effortScore <= 40) return 'curto_prazo'
  if (impactScore >= 60 && effortScore <= 70) return 'medio_prazo'
  if (impactScore >= 60)                       return 'longo_prazo'
  if (impactScore >= 31 && effortScore <= 40)  return 'curto_prazo'
  if (impactScore >= 31)                        return 'medio_prazo'
  return 'longo_prazo'
}

/**
 * Ordena as ações por timeframe + impact_score e atribui priority_rank global.
 * Ordem dos timeframes: curto_prazo → medio_prazo → longo_prazo
 */
export function assignPriorityRanks(
  items: ActionPlanItemOutput[]
): (ActionPlanItemOutput & { timeframe: ActionPlanTimeframe; priority_rank: number })[] {
  const ORDER: Record<ActionPlanTimeframe, number> = {
    curto_prazo:  0,
    medio_prazo:  1,
    longo_prazo:  2,
  }

  const withTimeframe = items.map(item => ({
    ...item,
    timeframe: calculateTimeframe(item.impact_score, item.effort_score),
  }))

  withTimeframe.sort((a, b) => {
    const tf = ORDER[a.timeframe] - ORDER[b.timeframe]
    if (tf !== 0) return tf
    return b.impact_score - a.impact_score // maior impacto primeiro dentro do mesmo prazo
  })

  return withTimeframe.map((item, i) => ({ ...item, priority_rank: i + 1 }))
}
