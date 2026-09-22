import { db, schema } from '@/lib/db'
import { randomUUID } from 'crypto'

/**
 * Registro de erros de produção.
 *
 * Grava no banco (tabela error_logs) para que as falhas fiquem visíveis no
 * painel "Saúde do sistema" sem depender de serviço externo. Se SENTRY_DSN
 * estiver configurado, também envia para o Sentry via HTTP — sem adicionar
 * dependência ao bundle.
 *
 * Nunca registre dados sensíveis no `context`: CPF, telefone de worker, senha
 * ou conteúdo de mensagem. Use ids.
 */

export interface LogContext {
  companyId?: string
  investigationId?: string
  /** Dados auxiliares — apenas ids e metadados, nunca PII */
  extra?: Record<string, unknown>
}

function serializeError(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null }
  }
  return { message: String(error), stack: null }
}

async function enviarSentry(source: string, message: string, stack: string | null): Promise<void> {
  const dsn = (process.env.SENTRY_DSN ?? '').trim()
  if (!dsn) return

  // DSN: https://<key>@<host>/<projectId>
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/)
  if (!m) return
  const [, key, host, projectId] = m

  try {
    await fetch(`https://${host}/api/${projectId}/store/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}, sentry_client=elo/1.0`,
      },
      body: JSON.stringify({
        message: `[${source}] ${message}`,
        level: 'error',
        platform: 'node',
        timestamp: new Date().toISOString(),
        extra: stack ? { stack } : undefined,
      }),
    })
  } catch { /* monitoramento nunca pode derrubar a requisição */ }
}

/**
 * Registra um erro. Nunca lança — falha de logging não pode quebrar o fluxo.
 *
 * @param source identificador curto da origem, ex: 'api/worker/messages'
 */
export async function logError(source: string, error: unknown, ctx: LogContext = {}): Promise<void> {
  const { message, stack } = serializeError(error)

  // Sempre no console — visível nos logs da Vercel
  console.error(`[${source}]`, error)

  try {
    await db.insert(schema.error_logs).values({
      id:               randomUUID(),
      level:            'error',
      source,
      message:          message.slice(0, 2000),
      stack:            stack?.slice(0, 8000) ?? null,
      context:          ctx.extra ? JSON.stringify(ctx.extra).slice(0, 2000) : null,
      company_id:       ctx.companyId ?? null,
      investigation_id: ctx.investigationId ?? null,
    })
  } catch { /* tabela pode não existir ainda — console já cobriu */ }

  await enviarSentry(source, message, stack)
}

/** Registra um aviso — situação anormal que não impediu a operação. */
export async function logWarn(source: string, message: string, ctx: LogContext = {}): Promise<void> {
  console.warn(`[${source}]`, message)
  try {
    await db.insert(schema.error_logs).values({
      id:               randomUUID(),
      level:            'warn',
      source,
      message:          message.slice(0, 2000),
      stack:            null,
      context:          ctx.extra ? JSON.stringify(ctx.extra).slice(0, 2000) : null,
      company_id:       ctx.companyId ?? null,
      investigation_id: ctx.investigationId ?? null,
    })
  } catch { /* não crítico */ }
}
