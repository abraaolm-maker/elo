import { db, schema } from "@/lib/db"
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from "@/lib/auth/middleware"
import { eq, count } from "drizzle-orm"
import bcrypt from "bcryptjs"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params
    const body = await request.json() as unknown
    if (typeof body !== "object" || body === null) return Response.json({ error: "Corpo invalido" }, { status: 400 })
    const patch = body as Record<string, unknown>
    if (typeof patch.password === "string") {
      const passwordHash = await bcrypt.hash(patch.password, 10)
      await db.update(schema.managers).set({ password_hash: passwordHash }).where(eq(schema.managers.id, id))
    }
    if (typeof patch.is_admin === "boolean") {
      await db.update(schema.managers).set({ is_admin: patch.is_admin }).where(eq(schema.managers.id, id))
    }
    if (typeof patch.is_active === "boolean") {
      await db.update(schema.managers).set({ is_active: patch.is_active }).where(eq(schema.managers.id, id))
    }
    const manager = await db.select({ id: schema.managers.id, name: schema.managers.name, email: schema.managers.email, is_admin: schema.managers.is_admin, is_active: schema.managers.is_active, created_at: schema.managers.created_at }).from(schema.managers).where(eq(schema.managers.id, id)).get()
    if (!manager) return Response.json({ error: "Manager nao encontrado" }, { status: 404 })
    return Response.json({ data: manager })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error("[admin/managers/[id] PATCH]", error)
    return Response.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params

    const manager = await db.select().from(schema.managers).where(eq(schema.managers.id, id)).get()
    if (!manager) return Response.json({ error: "Gestor não encontrado" }, { status: 404 })

    // Verificar se tem investigações
    const [invCount] = await db.select({ total: count() }).from(schema.investigations).where(eq(schema.investigations.manager_id, id))
    const hasInvestigations = (invCount?.total ?? 0) > 0

    if (hasInvestigations) {
      // Soft delete: desativar apenas — investigações e relatórios permanecem
      await db.update(schema.managers).set({ is_active: false }).where(eq(schema.managers.id, id))
      return Response.json({ data: { deleted: false, deactivated: true, reason: "Gestor possui investigações vinculadas. Foi desativado para preservar o histórico." } })
    }

    // Excluir fisicamente se não tem investigações
    await db.delete(schema.managers).where(eq(schema.managers.id, id))
    return Response.json({ data: { deleted: true, deactivated: false } })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error("[admin/managers/[id] DELETE]", error)
    return Response.json({ error: "Erro interno" }, { status: 500 })
  }
}
