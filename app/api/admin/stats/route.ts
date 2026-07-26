import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { count, sum, eq, gte, sql } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)

    // ── contadores base ──────────────────────────────────────────────────────
    const [companiesRow] = await db.select({ total: count() }).from(schema.companies)
    const [managersRow]  = await db.select({ total: count() }).from(schema.managers)
    const [workersRow]   = await db.select({ total: count() }).from(schema.workers)

    const [invTotal]     = await db.select({ total: count() }).from(schema.investigations)
    const [invActive]    = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.status, 'active'))
    const [invCompleted] = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.status, 'completed'))
    const [invPending]   = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.status, 'pending'))
    const [invCancelled] = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.status, 'cancelled'))
    const [invSaturated] = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.status, 'saturated'))

    const completionRate = (invTotal?.total ?? 0) > 0
      ? Math.round(((invCompleted?.total ?? 0) / (invTotal?.total ?? 1)) * 100)
      : 0

    const completedInvs = await db
      .select({ created_at: schema.investigations.created_at, completed_at: schema.investigations.completed_at })
      .from(schema.investigations)
      .where(eq(schema.investigations.status, 'completed'))
      .all()

    let avgHours: number | null = null
    if (completedInvs.length > 0) {
      const totalMs = completedInvs.reduce((acc, inv) => {
        if (!inv.completed_at) return acc
        return acc + Math.max(0, new Date(inv.completed_at).getTime() - new Date(inv.created_at).getTime())
      }, 0)
      avgHours = Math.round((totalMs / completedInvs.length) / (1000 * 60 * 60) * 10) / 10
    }

    const [workersSaturated]    = await db.select({ total: count() }).from(schema.investigation_workers).where(eq(schema.investigation_workers.status, 'saturated'))
    const [workersUnresponsive] = await db.select({ total: count() }).from(schema.investigation_workers).where(eq(schema.investigation_workers.status, 'unresponsive'))

    let totalCostBrl = 0, totalCostUsd = 0, thisMonthCostBrl = 0
    try {
      const [costTotal] = await db.select({ usd: sum(schema.api_usage_logs.cost_usd), brl: sum(schema.api_usage_logs.cost_brl) }).from(schema.api_usage_logs)
      totalCostBrl = Number(costTotal?.brl ?? 0)
      totalCostUsd = Number(costTotal?.usd ?? 0)

      const firstOfMonth = new Date()
      firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0)
      const [costMonth] = await db.select({ brl: sum(schema.api_usage_logs.cost_brl) }).from(schema.api_usage_logs).where(gte(schema.api_usage_logs.created_at, firstOfMonth.toISOString().slice(0, 10)))
      thisMonthCostBrl = Number(costMonth?.brl ?? 0)
    } catch { /* api_usage_logs may not exist yet */ }

    // ── séries temporais ─────────────────────────────────────────────────────
    type SeriesRow = { year: string; month: string; count: number }
    let seriesByMonth: SeriesRow[] = []
    let messagesByMonth: SeriesRow[] = []

    try {
      const rawInvSeries = await db.all(sql`
        SELECT strftime('%Y', created_at) as year,
               strftime('%m', created_at) as month,
               count(*) as count
        FROM investigations
        GROUP BY year, month
        ORDER BY year, month
      `) as unknown[]
      seriesByMonth = (rawInvSeries as SeriesRow[]).map(r => ({ year: String(r.year), month: String(r.month), count: Number(r.count) }))
    } catch { /* ignore */ }

    try {
      const rawMsgSeries = await db.all(sql`
        SELECT strftime('%Y', created_at) as year,
               strftime('%m', created_at) as month,
               count(*) as count
        FROM messages
        GROUP BY year, month
        ORDER BY year, month
      `) as unknown[]
      messagesByMonth = (rawMsgSeries as SeriesRow[]).map(r => ({ year: String(r.year), month: String(r.month), count: Number(r.count) }))
    } catch { /* ignore */ }

    // ── total mensagens ──────────────────────────────────────────────────────
    let totalMessages = 0
    try {
      const [msgRow] = await db.select({ total: count() }).from(schema.messages)
      totalMessages = msgRow?.total ?? 0
    } catch { /* ignore */ }

    // ── por empresa ──────────────────────────────────────────────────────────
    type CompanyRow = { id: string; name: string; plan: string; inv_count: number; pending: number; active: number; completed: number; cancelled: number }
    let byCompany: CompanyRow[] = []
    try {
      const raw = await db.all(sql`
        SELECT c.id, c.name, c.plan,
          COUNT(i.id) as inv_count,
          COALESCE(SUM(CASE WHEN i.status='pending'   THEN 1 ELSE 0 END), 0) as pending,
          COALESCE(SUM(CASE WHEN i.status='active'    THEN 1 ELSE 0 END), 0) as active,
          COALESCE(SUM(CASE WHEN i.status='completed' THEN 1 ELSE 0 END), 0) as completed,
          COALESCE(SUM(CASE WHEN i.status='cancelled' THEN 1 ELSE 0 END), 0) as cancelled
        FROM companies c
        LEFT JOIN investigations i ON i.company_id = c.id
        GROUP BY c.id
        ORDER BY inv_count DESC
      `) as unknown[]
      byCompany = (raw as CompanyRow[]).map(r => ({
        id: String(r.id), name: String(r.name), plan: String(r.plan),
        inv_count: Number(r.inv_count), pending: Number(r.pending),
        active: Number(r.active), completed: Number(r.completed), cancelled: Number(r.cancelled),
      }))
    } catch { /* ignore */ }

    // ── custo por empresa ────────────────────────────────────────────────────
    type CostCompRow = { company_id: string; total: number }
    let costByCompany: CostCompRow[] = []
    try {
      const raw = await db.all(sql`
        SELECT company_id, SUM(cost_brl) as total
        FROM api_usage_logs
        GROUP BY company_id
      `) as unknown[]
      costByCompany = (raw as CostCompRow[]).map(r => ({ company_id: String(r.company_id), total: Number(r.total) }))
    } catch { /* ignore */ }

    const byCompanyWithCost = byCompany.map(c => ({
      ...c,
      cost_brl: costByCompany.find(x => x.company_id === c.id)?.total ?? 0,
    }))

    // ── série de custo mensal por empresa ────────────────────────────────────
    type CostSeriesRow = { month: string; company_id: string; cost_brl: number }
    let costSeries: CostSeriesRow[] = []
    try {
      const raw = await db.all(sql`
        SELECT strftime('%Y-%m', created_at) as month,
               company_id,
               SUM(cost_brl) as cost_brl
        FROM api_usage_logs
        GROUP BY month, company_id
        ORDER BY month
      `) as unknown[]
      costSeries = (raw as CostSeriesRow[]).map(r => ({ month: String(r.month), company_id: String(r.company_id), cost_brl: Number(r.cost_brl) }))
    } catch { /* ignore */ }

    // ── qualidade dos relatórios ─────────────────────────────────────────────
    let avgConfidenceScore: number | null = null
    let confidenceDistribution: { range: string; count: number }[] = []
    try {
      const [confRow] = await db.all(sql`SELECT AVG(confidence_score) as avg_score FROM reports`) as unknown[]
      avgConfidenceScore = (confRow as { avg_score: number | null })?.avg_score ?? null
      if (avgConfidenceScore !== null) avgConfidenceScore = Math.round(avgConfidenceScore * 10) / 10

      const distRaw = await db.all(sql`
        SELECT
          CASE WHEN confidence_score <= 50 THEN '0–50'
               WHEN confidence_score <= 75 THEN '51–75'
               ELSE '76–100' END as range,
          COUNT(*) as count
        FROM reports
        GROUP BY range
        ORDER BY range
      `) as unknown[]
      confidenceDistribution = (distRaw as { range: string; count: number }[]).map(r => ({ range: String(r.range), count: Number(r.count) }))
    } catch { /* ignore */ }

    // ── investigações recentes ───────────────────────────────────────────────
    type RecentInvRow = { id: string; title: string; status: string; created_at: string; company_name: string }
    let recentInvestigations: RecentInvRow[] = []
    try {
      const raw = await db.all(sql`
        SELECT i.id, i.title, i.status, i.created_at, c.name as company_name
        FROM investigations i
        JOIN companies c ON c.id = i.company_id
        ORDER BY i.created_at DESC
        LIMIT 30
      `) as unknown[]
      recentInvestigations = (raw as RecentInvRow[]).map(r => ({
        id: String(r.id), title: String(r.title), status: String(r.status),
        created_at: String(r.created_at), company_name: String(r.company_name),
      }))
    } catch { /* ignore */ }

    // ── uso vs limites por plano ─────────────────────────────────────────────
    type PlanUsageRow = { company_id: string; company_name: string; plan: string; plan_label: string; inv_count: number; cost_brl: number; max_investigations: number; max_cost_brl: number }
    let planUsage: PlanUsageRow[] = []
    try {
      const planConfigs = await db.select().from(schema.plan_configs).all()
      planUsage = byCompanyWithCost.map(c => {
        const cfg = planConfigs.find(p => p.plan === c.plan)
        return {
          company_id:        c.id,
          company_name:      c.name,
          plan:              c.plan,
          plan_label:        cfg?.label ?? c.plan,
          inv_count:         c.inv_count,
          cost_brl:          c.cost_brl,
          max_investigations: cfg?.max_investigations ?? -1,
          max_cost_brl:       cfg?.max_cost_brl ?? -1,
        }
      })
    } catch { /* ignore */ }

    return Response.json({
      data: {
        companies_count:         companiesRow?.total ?? 0,
        managers_count:          managersRow?.total ?? 0,
        workers_count:           workersRow?.total ?? 0,
        total_messages:          totalMessages,
        investigations: {
          total:     invTotal?.total ?? 0,
          active:    invActive?.total ?? 0,
          completed: invCompleted?.total ?? 0,
          pending:   invPending?.total ?? 0,
          cancelled: invCancelled?.total ?? 0,
          saturated: invSaturated?.total ?? 0,
        },
        completion_rate:         completionRate,
        avg_completion_hours:    avgHours,
        workers_saturated:       workersSaturated?.total ?? 0,
        workers_unresponsive:    workersUnresponsive?.total ?? 0,
        total_cost_brl:          totalCostBrl,
        total_cost_usd:          totalCostUsd,
        this_month_cost_brl:     thisMonthCostBrl,
        series_by_month:         seriesByMonth,
        messages_by_month:       messagesByMonth,
        by_company:              byCompanyWithCost,
        cost_series:             costSeries,
        avg_confidence_score:    avgConfidenceScore,
        confidence_distribution: confidenceDistribution,
        recent_investigations:   recentInvestigations,
        plan_usage:              planUsage,
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error('[admin/stats]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
