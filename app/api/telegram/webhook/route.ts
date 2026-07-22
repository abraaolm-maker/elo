import { NextRequest } from 'next/server'
import { parseTelegramUpdate } from '@/lib/telegram/parser'
import { getTelegramFileUrl } from '@/lib/telegram/sender'
import { processInboundMessage } from '@/lib/whatsapp/process-webhook'
import { downloadAudio } from '@/lib/audio/transcriber'

export async function POST(request: NextRequest): Promise<Response> {
  // Validar secret token (Telegram passa no header x-telegram-bot-api-secret-token)
  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  // Processar de forma assíncrona — retornar 200 imediatamente
  processTelegramUpdate(body).catch(err => {
    console.error('[telegram-webhook] unhandled error', err)
  })

  return new Response('OK', { status: 200 })
}

async function processTelegramUpdate(body: unknown): Promise<void> {
  const parsed = parseTelegramUpdate(body)
  if (!parsed) return

  // Telegram usa chatId como identificador — mapeamos para whatsapp_number no banco
  // Workers cadastrados via Telegram têm whatsapp_number = "tg_<chatId>"
  const phoneNumber = `tg_${parsed.chatId}`

  let content = parsed.content

  // Se for áudio, resolver file_id para URL de download
  if (parsed.type === 'audio') {
    try {
      content = await getTelegramFileUrl(parsed.content)
    } catch (err) {
      console.error('[telegram-webhook] failed to resolve audio URL', err)
      return
    }
  }

  await processInboundMessage({
    phoneNumber,
    messageId: parsed.messageId,
    type: parsed.type,
    content,
  })
}

// Necessário para que o Telegram possa alcançar esta rota (sem cache)
export const dynamic = 'force-dynamic'
