import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

async function verificarAdmin(managerId: string): Promise<boolean> {
  const manager = await db
    .select({ is_admin: schema.managers.is_admin })
    .from(schema.managers)
    .where(eq(schema.managers.id, managerId))
    .get()
  return manager?.is_admin === true
}

interface RouteParams {
  params: Promise<{ id: string }>
}

// PATCH /api/admin/companies/[id] — editar nome e plano da empresa
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)
    if (!(await verificarAdmin(session.managerId))) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await request.json() as { name?: string; plan?: string }
    const updates: Record<string, string> = {}
    if (body.name?.trim()) updates.name = body.name.trim()
    if (body.plan) updates.plan = body.plan

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'Nada a atualizar' }, { status: 400 })
    }

    await db.update(schema.companies).set(updates).where(eq(schema.companies.id, id))
    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[PATCH /api/admin/companies/:id]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
