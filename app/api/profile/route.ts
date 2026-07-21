import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

// ─── PATCH — atualizar nome ou senha ─────────────────────────────────────────

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)

    const body = await request.json() as {
      name?: unknown
      current_password?: unknown
      new_password?: unknown
    }

    // ── Atualizar nome ─────────────────────────────────────────────────────────
    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (name.length < 2) {
        return Response.json({ error: 'Nome deve ter ao menos 2 caracteres' }, { status: 400 })
      }

      await db
        .update(schema.managers)
        .set({ name })
        .where(eq(schema.managers.id, session.managerId))

      return Response.json({ data: { updated: 'name' } }, { status: 200 })
    }

    // ── Atualizar senha ────────────────────────────────────────────────────────
    if (typeof body.new_password === 'string') {
      if (typeof body.current_password !== 'string') {
        return Response.json({ error: 'Senha atual é obrigatória' }, { status: 400 })
      }

      const newPassword = body.new_password
      if (newPassword.length < 8) {
        return Response.json({ error: 'A nova senha deve ter ao menos 8 caracteres' }, { status: 400 })
      }

      const manager = await db
        .select({ password_hash: schema.managers.password_hash })
        .from(schema.managers)
        .where(eq(schema.managers.id, session.managerId))
        .get()

      if (!manager) {
        return Response.json({ error: 'Gestor não encontrado' }, { status: 404 })
      }

      const valid = await bcrypt.compare(body.current_password, manager.password_hash)
      if (!valid) {
        return Response.json({ error: 'Senha atual incorreta' }, { status: 400 })
      }

      const hash = await bcrypt.hash(newPassword, 12)
      await db
        .update(schema.managers)
        .set({ password_hash: hash })
        .where(eq(schema.managers.id, session.managerId))

      return Response.json({ data: { updated: 'password' } }, { status: 200 })
    }

    return Response.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[PATCH /api/profile]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ─── GET — dados do perfil atual ──────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)

    const manager = await db
      .select({
        id:         schema.managers.id,
        name:       schema.managers.name,
        email:      schema.managers.email,
        created_at: schema.managers.created_at,
      })
      .from(schema.managers)
      .where(eq(schema.managers.id, session.managerId))
      .get()

    if (!manager) return Response.json({ error: 'Gestor não encontrado' }, { status: 404 })

    return Response.json({ data: manager }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[GET /api/profile]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
