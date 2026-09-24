import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { randomBytes, createHash } from 'crypto'
import { checkRateLimit, rateLimitResponse, RULES, clientIp } from '@/lib/security/rate-limit'
import { logError, logWarn } from '@/lib/monitoring/logger'
import { enviarEmailRecuperacao } from '@/lib/email/sender'
import { env } from '@/lib/utils/env'

const VALIDADE_MIN = 60

/**
 * Solicita recuperação de senha.
 *
 * Responde sempre 200 com a mesma mensagem, exista ou não a conta — informar
 * que um email não está cadastrado permitiria enumerar clientes.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { email?: unknown }
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''

    if (!email) return Response.json({ error: 'Email é obrigatório.' }, { status: 400 })

    const rl = await checkRateLimit(`pwreset:${clientIp(request)}`, RULES.passwordReset)
    if (!rl.allowed) return rateLimitResponse(rl)

    const resposta = Response.json({
      ok: true,
      message: 'Se este email estiver cadastrado, você receberá as instruções de recuperação em instantes.',
    })

    const manager = await db
      .select({ id: schema.managers.id, name: schema.managers.name, is_active: schema.managers.is_active })
      .from(schema.managers)
      .where(eq(schema.managers.email, email))
      .get()

    if (!manager || manager.is_active === false) return resposta

    // O token cru vai no link; no banco guardamos só o hash, para que um
    // vazamento da tabela não permita redefinir senhas
    const tokenCru = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(tokenCru).digest('hex')
    const expiraEm = new Date(Date.now() + VALIDADE_MIN * 60 * 1000).toISOString()

    await db.insert(schema.password_resets).values({
      token: tokenHash,
      manager_id: manager.id,
      expires_at: expiraEm,
    })

    // env() remove o BOM que a Vercel grava no início da variável — sem isso o
    // link de recuperação sai com caractere invisível e não funciona
    const base = env('NEXT_PUBLIC_APP_URL').replace(/\/$/, '')
    const link = `${base}/redefinir-senha?token=${tokenCru}`

    const enviado = await enviarEmailRecuperacao(email, manager.name, link, VALIDADE_MIN)

    if (!enviado) {
      // Sem provedor de email configurado: o link fica no log para o
      // administrador repassar manualmente. Nunca vai na resposta HTTP —
      // isso permitiria que qualquer pessoa redefinisse a senha de outra.
      await logWarn('api/auth/esqueci-senha', `Link de recuperação gerado para ${email}: ${link}`, {
        extra: { managerId: manager.id, motivo: 'provedor_email_nao_configurado' },
      })
    }

    return resposta
  } catch (error) {
    await logError('api/auth/esqueci-senha', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
