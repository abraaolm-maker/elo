import { db, schema } from "@/lib/db"
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from "@/lib/auth/middleware"
import { count, sum, eq } from "drizzle-orm"
import crypto from "crypto"
import bcrypt from "bcryptjs"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const managers = await db.select().from(schema.managers).orderBy(schema.managers.created_at)
    const result = await Promise.all(managers.map(async (m) => {
      const company = await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, m.company_id)).get()
      const [invRow] = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.manager_id, m.id))
      const [costRow] = await db.select({ brl: sum(schema.api_usage_logs.cost_brl) }).from(schema.api_usage_logs).where(eq(schema.api_usage_logs.manager_id, m.id))
      return { id: m.id, name: m.name, email: m.email, is_admin: m.is_admin, created_at: m.created_at, company_id: m.company_id, company_name: company?.name ?? "", investigations_count: invRow?.total ?? 0, total_cost_brl: Number(costRow?.brl ?? 0) }
    }))
    return Response.json({ data: result })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error("[admin/managers GET]", error)
    return Response.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const body = await request.json() as unknown
    if (typeof body !== "object" || body === null) return Response.json({ error: "Corpo invalido" }, { status: 400 })
    const { name, email, password, company_id, is_admin } = body as Record<string, unknown>
    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" || typeof company_id !== "string") {
      return Response.json({ error: "name, email, password e company_id sao obrigatorios" }, { status: 400 })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const id = crypto.randomUUID()
    await db.insert(schema.managers).values({ id, company_id, name: name.trim(), email: email.toLowerCase().trim(), password_hash: passwordHash, is_admin: is_admin === true })
    const manager = await db.select({ id: schema.managers.id, name: schema.managers.name, email: schema.managers.email, is_admin: schema.managers.is_admin, created_at: schema.managers.created_at }).from(schema.managers).where(eq(schema.managers.id, id)).get()
    return Response.json({ data: manager }, { status: 201 })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error("[admin/managers POST]", error)
    return Response.json({ error: "Erro interno" }, { status: 500 })
  }
}