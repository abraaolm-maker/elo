import { db, schema } from "@/lib/db"
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from "@/lib/auth/middleware"
import { eq, sum, and, gte, lte, inArray } from "drizzle-orm"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const url = new URL(request.url)
    const statusFilter    = url.searchParams.get("status") ?? ''
    const companyFilter   = url.searchParams.get("company_id") ?? ''
    const dateFrom        = url.searchParams.get("date_from") ?? ''
    const dateTo          = url.searchParams.get("date_to") ?? ''

    const conditions = []
    if (statusFilter)  conditions.push(eq(schema.investigations.status, statusFilter))
    if (companyFilter) conditions.push(eq(schema.investigations.company_id, companyFilter))
    if (dateFrom)      conditions.push(gte(schema.investigations.created_at, dateFrom))
    if (dateTo)        conditions.push(lte(schema.investigations.created_at, dateTo + 'T23:59:59'))

    const allInvs = conditions.length > 0
      ? await db.select().from(schema.investigations).where(and(...conditions)).orderBy(schema.investigations.created_at)
      : await db.select().from(schema.investigations).orderBy(schema.investigations.created_at)

    const result = await Promise.all(allInvs.map(async (inv) => {
      const company = await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, inv.company_id)).get()
      const [costRow] = await db.select({ brl: sum(schema.api_usage_logs.cost_brl) }).from(schema.api_usage_logs).where(eq(schema.api_usage_logs.investigation_id, inv.id))
      return { ...inv, company_name: company?.name ?? "", cost_brl: Number(costRow?.brl ?? 0) }
    }))
    return Response.json({ data: result })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error("[admin/investigations GET]", error)
    return Response.json({ error: "Erro interno" }, { status: 500 })
  }
}
