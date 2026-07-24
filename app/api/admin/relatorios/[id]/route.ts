import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { eq, sum } from 'drizzle-orm'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id: investigationId } = await params

    const investigation = await db
      .select()
      .from(schema.investigations)
      .where(eq(schema.investigations.id, investigationId))
      .get()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    const report = await db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

    const company = await db
      .select({ name: schema.companies.name })
      .from(schema.companies)
      .where(eq(schema.companies.id, investigation.company_id))
      .get()

    const [costRow] = await db
      .select({ brl: sum(schema.api_usage_logs.cost_brl), usd: sum(schema.api_usage_logs.cost_usd) })
      .from(schema.api_usage_logs)
      .where(eq(schema.api_usage_logs.investigation_id, investigationId))

    return Response.json({
      data: {
        investigation,
        report,
        company_name: company?.name ?? '',
        cost_brl: Number(costRow?.brl ?? 0),
        cost_usd: Number(costRow?.usd ?? 0),
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error('[admin/relatorios]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
