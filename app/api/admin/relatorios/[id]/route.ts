import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { eq, sum } from 'drizzle-orm'
import { logError, logWarn } from '@/lib/monitoring/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id: investigationId } = await params

    const investigation = await db
      .select({
        id: schema.investigations.id,
        company_id: schema.investigations.company_id,
        manager_id: schema.investigations.manager_id,
        title: schema.investigations.title,
        problem_description: schema.investigations.problem_description,
        status: schema.investigations.status,
        created_at: schema.investigations.created_at,
        completed_at: schema.investigations.completed_at,
      })
      .from(schema.investigations)
      .where(eq(schema.investigations.id, investigationId))
      .get()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    const report = await db
      .select({
        id: schema.reports.id,
        investigation_id: schema.reports.investigation_id,
        root_cause: schema.reports.root_cause,
        confidence_score: schema.reports.confidence_score,
        confidence_justification: schema.reports.confidence_justification,
        ishikawa_breakdown: schema.reports.ishikawa_breakdown,
        sources_summary: schema.reports.sources_summary,
        recommendations: schema.reports.recommendations,
        generated_at: schema.reports.generated_at,
      })
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

    const company = await db
      .select({ name: schema.companies.name })
      .from(schema.companies)
      .where(eq(schema.companies.id, investigation.company_id))
      .get()

    let cost_brl = 0
    let cost_usd = 0
    try {
      const [costRow] = await db
        .select({ brl: sum(schema.api_usage_logs.cost_brl), usd: sum(schema.api_usage_logs.cost_usd) })
        .from(schema.api_usage_logs)
        .where(eq(schema.api_usage_logs.investigation_id, investigationId))
      cost_brl = Number(costRow?.brl ?? 0)
      cost_usd = Number(costRow?.usd ?? 0)
    } catch { /* api_usage_logs may not exist yet */ }

    return Response.json({
      data: {
        investigation,
        report,
        company_name: company?.name ?? '',
        cost_brl,
        cost_usd,
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    await logError('api/admin/relatorios GET', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * DELETE — apaga apenas o relatório, preservando a investigação e as conversas.
 *
 * Útil quando o relatório saiu ruim: o admin apaga e reprocessa em
 * Saúde do sistema, sem perder as respostas dos trabalhadores.
 * O `id` da rota é o investigation_id (mesma convenção do GET).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id: investigationId } = await params

    const report = await db
      .select({ id: schema.reports.id })
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

    if (!report) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 })

    // action_items depende de reports — apagar primeiro
    const acoes = await db
      .select({ id: schema.action_items.id })
      .from(schema.action_items)
      .where(eq(schema.action_items.report_id, report.id))

    await db.delete(schema.action_items).where(eq(schema.action_items.report_id, report.id))
    await db.delete(schema.reports).where(eq(schema.reports.investigation_id, investigationId))

    // Volta para 'saturated' para aparecer em Saúde do sistema e poder reprocessar
    await db
      .update(schema.investigations)
      .set({ status: 'saturated', completed_at: null })
      .where(eq(schema.investigations.id, investigationId))

    await logWarn('api/admin/relatorios DELETE', 'Relatório apagado', {
      investigationId,
      extra: { acoesApagadas: acoes.length },
    })

    return Response.json({
      data: {
        apagado: true,
        acoes_apagadas: acoes.length,
        novo_status: 'saturated',
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    await logError('api/admin/relatorios DELETE', error)
    return Response.json({ error: 'Erro interno ao apagar relatório' }, { status: 500 })
  }
}
