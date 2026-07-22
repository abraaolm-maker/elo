import { NextRequest } from 'next/server'
import { parseTelegramUpdate } from '@/lib/telegram/parser'
import { getTelegramFileUrl, sendTelegramMessage } from '@/lib/telegram/sender'
import { processInboundMessage } from '@/lib/whatsapp/process-webhook'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest): Promise<Response> {
  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch { return new Response('OK', { status: 200 }) }

  handleUpdate(body).catch(err => console.error('[telegram-webhook]', err))

  return new Response('OK', { status: 200 })
}

async function handleUpdate(body: unknown): Promise<void> {
  const parsed = parseTelegramUpdate(body)
  if (!parsed) return

  const { chatId, messageId, type, content } = parsed
  const tgId = `tg_${chatId}`

  // ── /start <invCode> — worker abre o bot pelo link de convite ────────────────
  if (type === 'text' && content.startsWith('/start')) {
    const parts = content.split(' ')
    const invCode = parts[1] ?? ''  // ex: "inv_<investigation_id>_<worker_id>"

    if (invCode.startsWith('inv_')) {
      const [, investigationId, workerId] = invCode.split('_') as [string, string, string]

      // Registrar chatId no worker (atualiza whatsapp_number para tg_<chatId>)
      await db
        .update(schema.workers)
        .set({ whatsapp_number: tgId })
        .where(eq(schema.workers.id, workerId))

      // Buscar primeira pergunta já salva para este worker nesta investigação
      const firstQuestion = await db
        .select({ content: schema.messages.content })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.investigation_id, investigationId),
            eq(schema.messages.worker_id, workerId),
            eq(schema.messages.direction, 'outbound')
          )
        )
        .get()

      if (firstQuestion?.content) {
        await sendTelegramMessage({ chatId, text: firstQuestion.content })
      } else {
        await sendTelegramMessage({
          chatId,
          text: 'Olá! Você foi convidado para participar de uma investigação operacional.\n\nEm instantes você receberá a primeira pergunta.',
        })
      }
      return
    }

    // /start sem código — mensagem de boas-vindas genérica
    await sendTelegramMessage({
      chatId,
      text: 'Olá! Este bot é usado pela sua empresa para investigações operacionais.\n\nAguarde o convite da sua empresa para participar.',
    })
    return
  }

  // ── Mensagem normal — processar como resposta de investigação ────────────────
  let resolvedContent = content
  if (type === 'audio') {
    try {
      resolvedContent = await getTelegramFileUrl(content)
    } catch (err) {
      console.error('[telegram-webhook] failed to resolve audio URL', err)
      return
    }
  }

  await processInboundMessage({
    phoneNumber: tgId,
    messageId,
    type,
    content: resolvedContent,
  })
}
