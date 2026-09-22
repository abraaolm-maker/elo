import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

/**
 * Rate limiting persistido no banco.
 *
 * Por que banco e não memória: a Vercel roda múltiplas instâncias serverless e
 * cada uma teria seu próprio contador. Um atacante distribuiria as tentativas
 * entre instâncias e o limite nunca seria atingido. O banco é a única fonte
 * compartilhada disponível aqui.
 */

export interface RateLimitRule {
  /** Máximo de tentativas dentro da janela */
  max: number
  /** Duração da janela em segundos */
  windowSec: number
  /** Quanto tempo bloquear depois de estourar, em segundos */
  blockSec: number
}

export const RULES = {
  /** Login de gestor — protege contra brute force de senha */
  login:      { max: 5,   windowSec: 300,  blockSec: 900  },
  /** Autenticação do worker por CPF — protege contra enumeração de CPF */
  workerCpf:  { max: 5,   windowSec: 600,  blockSec: 1800 },
  /** Chat de criação de investigação — protege a cota da Anthropic */
  aiChat:     { max: 60,  windowSec: 3600, blockSec: 600  },
  /** Recuperação de senha — evita spam de tokens */
  passwordReset: { max: 3, windowSec: 900, blockSec: 900 },
} as const satisfies Record<string, RateLimitRule>

export interface RateLimitResult {
  allowed: boolean
  /** Tentativas restantes na janela atual */
  remaining: number
  /** Segundos até poder tentar de novo (só quando allowed = false) */
  retryAfterSec: number
}

const ALLOW_ON_ERROR: RateLimitResult = { allowed: true, remaining: 0, retryAfterSec: 0 }

/**
 * Consome uma tentativa para `key`. Retorna se a ação pode prosseguir.
 *
 * Em caso de falha do banco, libera a passagem (fail-open) — é preferível
 * aceitar a requisição a derrubar o login de todos os clientes por causa de
 * uma indisponibilidade do rate limiter.
 */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const agora = new Date()

  try {
    const row = await db.select().from(schema.rate_limits).where(eq(schema.rate_limits.key, key)).get()

    // Bloqueio ativo
    if (row?.blocked_until) {
      const ate = new Date(row.blocked_until)
      if (ate > agora) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.ceil((ate.getTime() - agora.getTime()) / 1000),
        }
      }
    }

    const janelaExpirou =
      !row || (agora.getTime() - new Date(row.window_start).getTime()) / 1000 >= rule.windowSec

    // Janela nova (ou primeira tentativa): zera o contador
    if (janelaExpirou) {
      await db
        .insert(schema.rate_limits)
        .values({ key, count: 1, window_start: agora.toISOString(), blocked_until: null })
        .onConflictDoUpdate({
          target: schema.rate_limits.key,
          set: { count: 1, window_start: agora.toISOString(), blocked_until: null },
        })
      return { allowed: true, remaining: rule.max - 1, retryAfterSec: 0 }
    }

    const novoCount = row.count + 1

    // Estourou o limite → bloqueia
    if (novoCount > rule.max) {
      const ate = new Date(agora.getTime() + rule.blockSec * 1000)
      await db
        .update(schema.rate_limits)
        .set({ count: novoCount, blocked_until: ate.toISOString() })
        .where(eq(schema.rate_limits.key, key))
      return { allowed: false, remaining: 0, retryAfterSec: rule.blockSec }
    }

    await db.update(schema.rate_limits).set({ count: novoCount }).where(eq(schema.rate_limits.key, key))
    return { allowed: true, remaining: rule.max - novoCount, retryAfterSec: 0 }
  } catch {
    return ALLOW_ON_ERROR
  }
}

/** Zera o contador — chamar após uma tentativa bem-sucedida (ex: login correto). */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await db.delete(schema.rate_limits).where(eq(schema.rate_limits.key, key))
  } catch { /* não crítico */ }
}

/** Resposta padrão 429 com Retry-After. */
export function rateLimitResponse(result: RateLimitResult, mensagem?: string): Response {
  const minutos = Math.ceil(result.retryAfterSec / 60)
  return Response.json(
    {
      error:
        mensagem ??
        `Muitas tentativas. Tente novamente em ${minutos} minuto${minutos !== 1 ? 's' : ''}.`,
    },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } }
  )
}

/**
 * Identifica o cliente para chaves de rate limit.
 * Usa o IP encaminhado pela Vercel; cai para 'desconhecido' quando ausente.
 */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') ?? 'desconhecido'
}
