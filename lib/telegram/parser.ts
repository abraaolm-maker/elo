import type { TelegramUpdate } from './types'

export interface ParsedTelegramMessage {
  chatId: number
  messageId: string
  type: 'text' | 'audio'
  content: string // texto ou file_id do áudio
}

export function parseTelegramUpdate(payload: unknown): ParsedTelegramMessage | null {
  const update = payload as TelegramUpdate
  const msg = update?.message
  if (!msg) return null

  const chatId = msg.chat.id
  const messageId = `tg_${update.update_id}`

  if (msg.text) {
    return { chatId, messageId, type: 'text', content: msg.text }
  }

  const audioFileId = msg.voice?.file_id ?? msg.audio?.file_id
  if (audioFileId) {
    return { chatId, messageId, type: 'audio', content: audioFileId }
  }

  return null
}
