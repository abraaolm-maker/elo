import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { createSession, sessionCookieOptions } from '@/lib/auth/session'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as unknown
    if (typeof body !== 'object' || body === null) {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }
    const { email, password } = body as Record<string, unknown>

    if (typeof email !== 'string' || typeof password !== 'string') {
      return Response.json({ error: 'email e password são obrigatórios' }, { status: 400 })
    }

    const manager = await db
      .select()
      .from(schema.managers)
      .where(eq(schema.managers.email, email.toLowerCase().trim()))
      .get()

    if (!manager) {
      return Response.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const passwordMatch = await bcrypt.compare(password, manager.password_hash)
    if (!passwordMatch) {
      return Response.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const token = await createSession({
      managerId: manager.id,
      companyId: manager.company_id,
      isAdmin: manager.is_admin ?? false,
    })

    const cookieStore = await cookies()
    cookieStore.set(sessionCookieOptions(token))

    return Response.json({ ok: true, isAdmin: manager.is_admin ?? false })
  } catch (error) {
    console.error('[auth/login]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
