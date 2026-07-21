import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

function gerarSenha(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/admin/managers/[id]/reset-senha — gerar nova senha
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)

    const caller = await db
      .select({ is_admin: schema.managers.is_admin })
      .from(schema.managers)
      .where(eq(schema.managers.id, session.managerId))
      .get()

    if (!caller?.is_admin) return Response.json({ error: 'Acesso negado' }, { status: 403 })

    const novaSenha = gerarSenha()
    const hash = await bcrypt.hash(novaSenha, 12)

    await db.update(schema.managers).set({ password_hash: hash }).where(eq(schema.managers.id, id))

    return Response.json({ data: { nova_senha: novaSenha } }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[POST /api/admin/managers/:id/reset-senha]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
