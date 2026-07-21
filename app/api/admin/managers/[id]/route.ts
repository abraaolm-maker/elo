import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

function gerarSenha(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

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

// PATCH /api/admin/managers/[id] — editar nome e/ou email
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)
    if (!(await verificarAdmin(session.managerId))) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await request.json() as { name?: string; email?: string }
    const updates: Record<string, string> = {}
    if (body.name?.trim()) updates.name = body.name.trim()
    if (body.email?.trim()) updates.email = body.email.toLowerCase()

    if (Object.keys(updates).length === 0) return Response.json({ error: 'Nada a atualizar' }, { status: 400 })

    await db.update(schema.managers).set(updates).where(eq(schema.managers.id, id))
    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[PATCH /api/admin/managers/:id]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// DELETE /api/admin/managers/[id] — remover gestor
export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)
    if (!(await verificarAdmin(session.managerId))) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 })
    }

    await db.delete(schema.managers).where(eq(schema.managers.id, id))
    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[DELETE /api/admin/managers/:id]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
