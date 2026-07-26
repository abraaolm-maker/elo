import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { eq, sum } from 'drizzle-orm'

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
    console.error('[admin/relatorios]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
