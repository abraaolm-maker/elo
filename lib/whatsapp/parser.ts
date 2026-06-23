import type { ParsedWhatsAppMessage } from './types'

function extractPhoneNumber(remoteJid: string): string {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
}

function isEvolutionPayload(payload: unknown): payload is {
  event: string
  data: {
    key: { remoteJid: string; id: string; fromMe?: boolean }
    message: Record<string, unknown>
    messageType: string
  }
} {
  if (typeof payload !== 'object' || payload === null) return false
  const p = payload as Record<string, unknown>
  if (p.event !== 'messages.upsert') return false
  if (typeof p.data !== 'object' || p.data === null) return false
  const data = p.data as Record<string, unknown>
  if (typeof data.key !== 'object' || data.key === null) return false
  const key = data.key as Record<string, unknown>
  if (typeof key.remoteJid !== 'string' || typeof key.id !== 'string') return false
  if (typeof data.messageType !== 'string') return false
  return true
}

export function parseWhatsAppPayload(payload: unknown): ParsedWhatsAppMessage | null {
  if (!isEvolutionPayload(payload)) return null

  const { data } = payload
  const phoneNumber = extractPhoneNumber(data.key.remoteJid)
  const messageId = data.key.id
  const isFromMe = data.key.fromMe === true

  if (data.messageType === 'conversation') {
    const message = data.message as Record<string, unknown>
    if (typeof message.conversation !== 'string') return null
    return {
      phoneNumber,
      messageId,
      type: 'text',
      content: message.conversation,
      isFromMe,
    }
  }

  if (data.messageType === 'audioMessage') {
    const message = data.message as Record<string, unknown>
    if (typeof message.audioMessage !== 'object' || message.audioMessage === null) return null
    const audio = message.audioMessage as Record<string, unknown>
    if (typeof audio.url !== 'string') return null
    return {
      phoneNumber,
      messageId,
      type: 'audio',
      content: audio.url,
      isFromMe,
    }
  }

  return null
}
