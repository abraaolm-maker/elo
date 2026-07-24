import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { count, sum, eq, gte, sql } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)

    const [companiesRow] = await db.select({ total: count() }).from(schema.companies)
    const [managersRow]  = await db.select({ total: count() }).from(schema.managers)
    const [workersRow]   = await db.select({ total: count() }).from(schema.workers)

    const [invTotal]     = await db.select({ total: count() }).from(schema.investigations)
    const [invActive]    = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.status, 'active'))
    const [invCompleted] = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.status, 'completed'))
    const [invPending]   = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.status, 'pending'))
    const [invCancelled] = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.status, 'cancelled'))
    const [invSaturated] = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.status, 'saturated'))

    // Taxa de conclusão
    const completionRate = (invTotal?.total ?? 0) > 0
      ? Math.round(((invCompleted?.total ?? 0) / (invTotal?.total ?? 1)) * 100)
      : 0

    // Tempo médio das investigações concluídas (em horas)
    const completedInvs = await db
      .select({ created_at: schema.investigations.created_at, completed_at: schema.investigations.completed_at })
      .from(schema.investigations)
      .where(eq(schema.investigations.status, 'completed'))
      .all()

    let avgHours: number | null = null
    if (completedInvs.length > 0) {
      const totalMs = completedInvs.reduce((acc, inv) => {
        if (!inv.completed_at) return acc
        const diff = new Date(inv.completed_at).getTime() - new Date(inv.created_at).getTime()
        return acc + Math.max(0, diff)
      }, 0)
      avgHours = Math.round((totalMs / completedInvs.length) / (1000 * 60 * 60) * 10) / 10
    }

    // Workers: saturados vs sem resposta
    const [workersSaturated]    = await db.select({ total: count() }).from(schema.investigation_workers).where(eq(schema.investigation_workers.status, 'saturated'))
    const [workersUnresponsive] = await db.select({ total: count() }).from(schema.investigation_workers).where(eq(schema.investigation_workers.status, 'unresponsive'))

    const [costTotal]    = await db.select({ usd: sum(schema.api_usage_logs.cost_usd), brl: sum(schema.api_usage_logs.cost_brl) }).from(schema.api_usage_logs)

    const firstOfMonth = new Date()
    firstOfMonth.setDate(1)
    firstOfMonth.setHours(0, 0, 0, 0)
    const firstOfMonthStr = firstOfMonth.toISOString().slice(0, 10)

    const [costMonth] = await db
      .select({ brl: sum(schema.api_usage_logs.cost_brl) })
      .from(schema.api_usage_logs)
      .where(gte(schema.api_usage_logs.created_at, firstOfMonthStr))

    return Response.json({
      data: {
        companies_count:      companiesRow?.total ?? 0,
        managers_count:       managersRow?.total ?? 0,
        workers_count:        workersRow?.total ?? 0,
        investigations: {
          total:     invTotal?.total ?? 0,
          active:    invActive?.total ?? 0,
          completed: invCompleted?.total ?? 0,
          pending:   invPending?.total ?? 0,
          cancelled: invCancelled?.total ?? 0,
          saturated: invSaturated?.total ?? 0,
        },
        completion_rate:      completionRate,
        avg_completion_hours: avgHours,
        workers_saturated:    workersSaturated?.total ?? 0,
        workers_unresponsive: workersUnresponsive?.total ?? 0,
        total_cost_usd:      Number(costTotal?.usd ?? 0),
        total_cost_brl:      Number(costTotal?.brl ?? 0),
        this_month_cost_brl: Number(costMonth?.brl ?? 0),
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error('[admin/stats]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
