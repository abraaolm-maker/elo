import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { checkRateLimit, rateLimitResponse, RULES, clientIp } from '@/lib/security/rate-limit'
import { logError } from '@/lib/monitoring/logger'

/** Redefine a senha a partir de um token válido de recuperação. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { token?: unknown; password?: unknown }
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!token) return Response.json({ error: 'Token inválido.' }, { status: 400 })
    if (password.length < 8) {
      return Response.json({ error: 'A nova senha deve ter ao menos 8 caracteres.' }, { status: 400 })
    }

    const rl = await checkRateLimit(`pwresetUse:${clientIp(request)}`, RULES.passwordReset)
    if (!rl.allowed) return rateLimitResponse(rl)

    const tokenHash = createHash('sha256').update(token).digest('hex')

    const reset = await db
      .select()
      .from(schema.password_resets)
      .where(eq(schema.password_resets.token, tokenHash))
      .get()

    if (!reset) {
      return Response.json({ error: 'Link inválido ou já utilizado.' }, { status: 400 })
    }
    if (reset.used_at) {
      return Response.json({ error: 'Este link já foi utilizado. Solicite um novo.' }, { status: 400 })
    }
    if (new Date(reset.expires_at) < new Date()) {
      return Response.json({ error: 'Este link expirou. Solicite um novo.' }, { status: 400 })
    }

    const hash = await bcrypt.hash(password, 12)

    await db
      .update(schema.managers)
      .set({ password_hash: hash })
      .where(eq(schema.managers.id, reset.manager_id))

    // Marca como usado — token de uso único
    await db
      .update(schema.password_resets)
      .set({ used_at: new Date().toISOString() })
      .where(eq(schema.password_resets.token, tokenHash))

    return Response.json({ ok: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' })
  } catch (error) {
    await logError('api/auth/redefinir-senha', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
