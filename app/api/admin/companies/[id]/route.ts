import { db, schema } from "@/lib/db"
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from "@/lib/auth/middleware"
import { eq, sum } from "drizzle-orm"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params
    const company = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).get()
    if (!company) return Response.json({ error: "Empresa nao encontrada" }, { status: 404 })
    const managers = await db.select().from(schema.managers).where(eq(schema.managers.company_id, id))
    const investigations = await db.select().from(schema.investigations).where(eq(schema.investigations.company_id, id))
    const managersWithCost = await Promise.all(managers.map(async (m) => {
      const [costRow] = await db.select({ brl: sum(schema.api_usage_logs.cost_brl) }).from(schema.api_usage_logs).where(eq(schema.api_usage_logs.manager_id, m.id))
      return { id: m.id, name: m.name, email: m.email, is_admin: m.is_admin, is_active: m.is_active, created_at: m.created_at, total_cost_brl: Number(costRow?.brl ?? 0) }
    }))
    const [totalCost] = await db.select({ brl: sum(schema.api_usage_logs.cost_brl) }).from(schema.api_usage_logs).where(eq(schema.api_usage_logs.company_id, id))
    const recentLogs = await db.select().from(schema.api_usage_logs).where(eq(schema.api_usage_logs.company_id, id)).orderBy(schema.api_usage_logs.created_at).limit(50)
    return Response.json({ data: { company, managers: managersWithCost, investigations, total_cost_brl: Number(totalCost?.brl ?? 0), recent_logs: recentLogs } })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error("[admin/companies/[id] GET]", error)
    return Response.json({ error: "Erro interno" }, { status: 500 })
  }
}