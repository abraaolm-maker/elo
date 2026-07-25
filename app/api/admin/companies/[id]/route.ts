import { db, schema } from "@/lib/db"
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from "@/lib/auth/middleware"
import { eq, sum } from "drizzle-orm"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params
    const company = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).get()
    if (!company) return Response.json({ error: "Empresa nao encontrada" }, { status: 404 })
    const managers = await db.select({
      id: schema.managers.id,
      company_id: schema.managers.company_id,
      name: schema.managers.name,
      email: schema.managers.email,
      is_admin: schema.managers.is_admin,
      is_active: schema.managers.is_active,
      created_at: schema.managers.created_at,
    }).from(schema.managers).where(eq(schema.managers.company_id, id))
    const investigations = await db.select({
      id: schema.investigations.id,
      title: schema.investigations.title,
      status: schema.investigations.status,
      created_at: schema.investigations.created_at,
    }).from(schema.investigations).where(eq(schema.investigations.company_id, id))
    const managersWithCost = await Promise.all(managers.map(async (m) => {
      let total_cost_brl = 0
      try {
        const [costRow] = await db.select({ brl: sum(schema.api_usage_logs.cost_brl) }).from(schema.api_usage_logs).where(eq(schema.api_usage_logs.manager_id, m.id))
        total_cost_brl = Number(costRow?.brl ?? 0)
      } catch { /* api_usage_logs may not exist yet */ }
      return { id: m.id, name: m.name, email: m.email, is_admin: m.is_admin, is_active: m.is_active, created_at: m.created_at, total_cost_brl }
    }))
    let total_cost_brl = 0
    let recentLogs: { id: string; operation: string; input_tokens: number; output_tokens: number; cost_brl: number; created_at: string }[] = []
    try {
      const [totalCost] = await db.select({ brl: sum(schema.api_usage_logs.cost_brl) }).from(schema.api_usage_logs).where(eq(schema.api_usage_logs.company_id, id))
      total_cost_brl = Number(totalCost?.brl ?? 0)
      recentLogs = await db.select({
        id: schema.api_usage_logs.id,
        operation: schema.api_usage_logs.operation,
        input_tokens: schema.api_usage_logs.input_tokens,
        output_tokens: schema.api_usage_logs.output_tokens,
        cost_brl: schema.api_usage_logs.cost_brl,
        created_at: schema.api_usage_logs.created_at,
      }).from(schema.api_usage_logs).where(eq(schema.api_usage_logs.company_id, id)).orderBy(schema.api_usage_logs.created_at).limit(50)
    } catch { /* api_usage_logs may not exist yet */ }
    return Response.json({ data: { company, managers: managersWithCost, investigations, total_cost_brl, recent_logs: recentLogs } })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error("[admin/companies/[id] GET]", error)
    return Response.json({ error: "Erro interno" }, { status: 500 })
  }
}