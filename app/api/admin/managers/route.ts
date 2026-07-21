import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

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

// POST /api/admin/managers — adicionar gestor a empresa existente
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)
    if (!(await verificarAdmin(session.managerId))) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await request.json() as { company_id?: string; name?: string; email?: string }

    if (!body.company_id?.trim()) return Response.json({ error: 'Empresa é obrigatória' }, { status: 400 })
    if (!body.name?.trim()) return Response.json({ error: 'Nome é obrigatório' }, { status: 400 })
    if (!body.email?.trim()) return Response.json({ error: 'Email é obrigatório' }, { status: 400 })

    const existing = await db
      .select({ id: schema.managers.id })
      .from(schema.managers)
      .where(eq(schema.managers.email, body.email.toLowerCase()))
      .get()

    if (existing) return Response.json({ error: 'Email já cadastrado' }, { status: 409 })

    const senha = gerarSenha()
    const senhaHash = await bcrypt.hash(senha, 12)
    const managerId = crypto.randomUUID()

    await db.insert(schema.managers).values({
      id: managerId,
      company_id: body.company_id.trim(),
      name: body.name.trim(),
      email: body.email.toLowerCase(),
      password_hash: senhaHash,
      is_admin: false,
    })

    return Response.json({
      data: { manager_id: managerId, email: body.email.toLowerCase(), senha_temporaria: senha },
    }, { status: 201 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[POST /api/admin/managers]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
