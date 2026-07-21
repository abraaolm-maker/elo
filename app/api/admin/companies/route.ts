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

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)
    if (!(await verificarAdmin(session.managerId))) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const empresas = await db
      .select()
      .from(schema.companies)
      .orderBy(schema.companies.created_at)

    const gestores = await db
      .select({
        id: schema.managers.id,
        company_id: schema.managers.company_id,
        name: schema.managers.name,
        email: schema.managers.email,
        is_admin: schema.managers.is_admin,
        created_at: schema.managers.created_at,
      })
      .from(schema.managers)

    const investigacoes = await db
      .select({ company_id: schema.investigations.company_id })
      .from(schema.investigations)

    const data = empresas.map(e => ({
      ...e,
      gestores: gestores.filter(g => g.company_id === e.id),
      total_investigacoes: investigacoes.filter(i => i.company_id === e.id).length,
    }))

    return Response.json({ data }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[GET /api/admin/companies]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)
    if (!(await verificarAdmin(session.managerId))) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await request.json() as {
      company_name?: string
      plan?: string
      manager_name?: string
      manager_email?: string
    }

    const { company_name, plan, manager_name, manager_email } = body

    if (!company_name?.trim()) return Response.json({ error: 'Nome da empresa é obrigatório' }, { status: 400 })
    if (!manager_name?.trim()) return Response.json({ error: 'Nome do gestor é obrigatório' }, { status: 400 })
    if (!manager_email?.trim()) return Response.json({ error: 'Email do gestor é obrigatório' }, { status: 400 })

    const existing = await db
      .select({ id: schema.managers.id })
      .from(schema.managers)
      .where(eq(schema.managers.email, manager_email.toLowerCase()))
      .get()

    if (existing) {
      return Response.json({ error: 'Já existe um gestor com esse email' }, { status: 409 })
    }

    const senha = gerarSenha()
    const senhaHash = await bcrypt.hash(senha, 12)

    const companyId = crypto.randomUUID()
    const managerId = crypto.randomUUID()

    await db.insert(schema.companies).values({
      id: companyId,
      name: company_name.trim(),
      plan: plan ?? 'starter',
    })

    await db.insert(schema.managers).values({
      id: managerId,
      company_id: companyId,
      name: manager_name.trim(),
      email: manager_email.toLowerCase(),
      password_hash: senhaHash,
      is_admin: false,
    })

    return Response.json({
      data: {
        company_id: companyId,
        manager_id: managerId,
        email: manager_email.toLowerCase(),
        senha_temporaria: senha,
      },
    }, { status: 201 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[POST /api/admin/companies]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
