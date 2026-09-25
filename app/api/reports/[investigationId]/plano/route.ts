export const maxDuration = 60

import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'
import { generateActionPlan } from '@/lib/ai/action-plan-generator'
import { montarEntradaRelatorio } from '@/lib/ai/report-input'
import { assignPriorityRanks } from '@/lib/ai/utils/prioritization'
import { canSpendOnAi } from '@/lib/billing/plan-limits'
import { logError } from '@/lib/monitoring/logger'

export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ investigationId: string }> }

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

/**
 * Segunda fase do relatório: o plano de ação.
 *
 * Em chamada própria porque o tempo limite da função é 60s e o gargalo é a
 * geração de tokens. Numa investigação com 6 fontes, gerar análise e plano na
 * mesma requisição ultrapassava o limite — e a função morria levando junto o
 * relatório inteiro, mesmo a parte que já estava pronta.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { investigationId } = await params
    const session = await requireAuth(request)

    const investigation = await db
      .select({
        id: schema.investigations.id,
        title: schema.investigations.title,
        problem_description: schema.investigations.problem_description,
        company_id: schema.investigations.company_id,
      })
      .from(schema.investigations)
      .where(and(
        eq(schema.investigations.id, investigationId),
        eq(schema.investigations.company_id, session.companyId),
      ))
      .get()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    const relatorio = await db
      .select({
        id: schema.reports.id,
        root_cause: schema.reports.root_cause,
        recommendations: schema.reports.recommendations,
      })
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

    if (!relatorio) {
      return Response.json({ error: 'Gere primeiro o relatório principal.' }, { status: 400 })
    }

    const orcamento = await canSpendOnAi(investigation.company_id)
    if (!orcamento.ok) return Response.json({ error: orcamento.reason }, { status: 403 })

    const { allMessages, workerAliases } = await montarEntradaRelatorio(investigationId)

    const itens = await generateActionPlan({
      investigation: { title: investigation.title, problem_description: investigation.problem_description },
      rootCause: relatorio.root_cause,
      recommendations: parseJson<string[]>(relatorio.recommendations, []),
      allMessages,
      workerAliases,
      companyId: investigation.company_id,
      managerId: session.managerId,
      investigationId,
    })

    // Substitui o plano anterior — esta rota pode ser chamada de novo para
    // regerar, e manter itens antigos duplicaria o plano
    await db.delete(schema.action_items).where(eq(schema.action_items.report_id, relatorio.id))

    if (itens.length > 0) {
      const priorizados = assignPriorityRanks(itens)
      await db.insert(schema.action_items).values(
        priorizados.map(item => ({
          id:                   crypto.randomUUID(),
          report_id:            relatorio.id,
          what:                 item.what,
          why:                  item.why,
          where_scope:          item.where_scope,
          who_role:             item.who_role,
          how_to:               item.how_to,
          how_much_estimate:    item.how_much_estimate,
          impact_score:         item.impact_score,
          effort_score:         item.effort_score,
          timeframe:            item.timeframe,
          priority_rank:        item.priority_rank,
          is_recurring_pattern: item.is_recurring_pattern,
          related_pattern_note: item.related_pattern_note,
        }))
      )
    }

    return Response.json({ data: { acoes: itens.length } })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    await logError('api/reports/plano', error)
    return Response.json({ error: 'Não foi possível gerar o plano de ação.' }, { status: 500 })
  }
}
