import { db, schema } from "@/lib/db"
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from "@/lib/auth/middleware"
import { count, sum, eq } from "drizzle-orm"
import crypto from "crypto"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const companies = await db.select().from(schema.companies).orderBy(schema.companies.created_at)
    const result = await Promise.all(companies.map(async (company) => {
      const [mgrsRow] = await db.select({ total: count() }).from(schema.managers).where(eq(schema.managers.company_id, company.id))
      const [invsRow] = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.company_id, company.id))
      const [costRow] = await db.select({ brl: sum(schema.api_usage_logs.cost_brl) }).from(schema.api_usage_logs).where(eq(schema.api_usage_logs.company_id, company.id))
      return { ...company, managers_count: mgrsRow?.total ?? 0, investigations_count: invsRow?.total ?? 0, total_cost_brl: Number(costRow?.brl ?? 0) }
    }))
    return Response.json({ data: result })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error("[admin/companies GET]", error)
    return Response.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const body = await request.json() as unknown
    if (typeof body !== "object" || body === null) return Response.json({ error: "Corpo invalido" }, { status: 400 })
    const { name, plan } = body as Record<string, unknown>
    if (typeof name !== "string" || name.trim() === "") return Response.json({ error: "name e obrigatorio" }, { status: 400 })
    const id = crypto.randomUUID()
    await db.insert(schema.companies).values({ id, name: name.trim(), plan: typeof plan === "string" ? plan : "starter" })
    const company = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).get()
    return Response.json({ data: company }, { status: 201 })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error("[admin/companies POST]", error)
    return Response.json({ error: "Erro interno" }, { status: 500 })
  }
}
