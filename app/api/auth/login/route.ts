import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { createSession, sessionCookieOptions } from '@/lib/auth/session'
import { cookies } from 'next/headers'
import { checkRateLimit, resetRateLimit, rateLimitResponse, RULES, clientIp } from '@/lib/security/rate-limit'
import { logError } from '@/lib/monitoring/logger'

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

    const emailNorm = email.toLowerCase().trim()

    // Rate limit por email e por IP. O limite por email impede atacar uma conta
    // específica de vários IPs; o limite por IP impede varrer várias contas.
    const porEmail = await checkRateLimit(`login:email:${emailNorm}`, RULES.login)
    if (!porEmail.allowed) return rateLimitResponse(porEmail)

    const porIp = await checkRateLimit(`login:ip:${clientIp(request)}`, RULES.login)
    if (!porIp.allowed) return rateLimitResponse(porIp)

    const manager = await db
      .select()
      .from(schema.managers)
      .where(eq(schema.managers.email, emailNorm))
      .get()

    if (!manager) {
      return Response.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const passwordMatch = await bcrypt.compare(password, manager.password_hash)
    if (!passwordMatch) {
      return Response.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    // Conta desativada não pode entrar — antes esta checagem não existia e um
    // gestor removido do cliente continuava com acesso
    if (manager.is_active === false) {
      return Response.json({ error: 'Esta conta está desativada. Fale com o administrador.' }, { status: 403 })
    }

    // Sucesso: zera os contadores para não punir o usuário legítimo
    await resetRateLimit(`login:email:${emailNorm}`)
    await resetRateLimit(`login:ip:${clientIp(request)}`)

    const token = await createSession({
      managerId: manager.id,
      companyId: manager.company_id,
      isAdmin: manager.is_admin ?? false,
    })

    const cookieStore = await cookies()
    cookieStore.set(sessionCookieOptions(token))

    return Response.json({ ok: true, isAdmin: manager.is_admin ?? false })
  } catch (error) {
    await logError('api/auth/login', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
