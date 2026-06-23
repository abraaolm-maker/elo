import type { MetaWebhookPayload, ParsedWhatsAppMessage } from './types'

function isMetaPayload(payload: unknown): payload is MetaWebhookPayload {
  if (typeof payload !== 'object' || payload === null) return false
  const p = payload as Record<string, unknown>
  return (
    p.object === 'whatsapp_business_account' &&
    Array.isArray(p.entry)
  )
}

/**
 * Parseia o payload do Meta WhatsApp Business Cloud API.
 * Retorna null para status updates, mensagens do próprio sistema, ou payloads inválidos.
 * Retorna APENAS a primeira mensagem do primeiro entry/change.
 */
export function parseWhatsAppPayload(payload: unknown): ParsedWhatsAppMessage | null {
  if (!isMetaPayload(payload)) return null

  const firstEntry = payload.entry[0]
  if (!firstEntry) return null

  const firstChange = firstEntry.changes[0]
  if (!firstChange) return null

  const { value } = firstChange
  const messages = value.messages
  if (!messages || messages.length === 0) return null

  const msg = messages[0]
  const phoneNumber = msg.from

  if (msg.type === 'text') {
    return {
      phoneNumber,
      messageId: msg.id,
      type: 'text',
      content: msg.text.body,
      isFromMe: false,
    }
  }

  if (msg.type === 'audio') {
    // content = Media ID do Meta (será usado para baixar o arquivo)
    return {
      phoneNumber,
      messageId: msg.id,
      type: 'audio',
      content: msg.audio.id,
      isFromMe: false,
    }
  }

  return null
}

/**
 * Resolve um Meta Media ID para uma URL temporária de download.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
export async function resolveMetaMediaUrl(mediaId: string): Promise<string> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN not configured')

  const res = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to get media URL: HTTP ${res.status}`)
  }

  const data = await res.json() as { url?: string }
  if (!data.url) throw new Error('No URL in media response')
  return data.url
}
