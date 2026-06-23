// ─── Meta WhatsApp Business Cloud API webhook types ────────────────────────────
// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

export interface MetaTextMessage {
  from: string
  id: string
  timestamp: string
  type: 'text'
  text: { body: string }
}

export interface MetaAudioMessage {
  from: string
  id: string
  timestamp: string
  type: 'audio'
  audio: { id: string; mime_type: string }
}

export type MetaMessage = MetaTextMessage | MetaAudioMessage

export interface MetaWebhookPayload {
  object: 'whatsapp_business_account'
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: { display_phone_number: string; phone_number_id: string }
        contacts?: Array<{ profile: { name: string }; wa_id: string }>
        messages?: MetaMessage[]
        statuses?: unknown[]
      }
      field: string
    }>
  }>
}

export interface ParsedWhatsAppMessage {
  phoneNumber: string
  messageId: string
  type: 'text' | 'audio'
  /** For text: the message body. For audio: the Meta media ID (to be resolved). */
  content: string
  isFromMe: boolean
}
