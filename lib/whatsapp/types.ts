export interface EvolutionApiTextPayload {
  event: 'messages.upsert'
  data: {
    key: {
      remoteJid: string
      id: string
      fromMe?: boolean
    }
    message: {
      conversation: string
    }
    messageType: 'conversation'
  }
}

export interface EvolutionApiAudioPayload {
  event: 'messages.upsert'
  data: {
    key: {
      remoteJid: string
      id: string
      fromMe?: boolean
    }
    message: {
      audioMessage: {
        url: string
        mimetype: string
      }
    }
    messageType: 'audioMessage'
  }
}

export type EvolutionApiPayload = EvolutionApiTextPayload | EvolutionApiAudioPayload

export interface ParsedWhatsAppMessage {
  phoneNumber: string
  messageId: string
  type: 'text' | 'audio'
  content: string
  isFromMe: boolean
}
