interface SendMessageParams {
  number: string
  text: string
}

interface SendMessageResult {
  success: boolean
  error?: string
}

// WhatsApp via Meta Cloud API oficial.
// Baileys e WPPConnect foram removidos — causavam banimento.
// Para ativar: configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env.local
export async function sendWhatsAppMessage(params: SendMessageParams): Promise<SendMessageResult> {
  return sendViaMeta(params)
}

async function sendViaMeta(params: SendMessageParams): Promise<SendMessageResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    console.error('[whatsapp-sender/meta] WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurados')
    return { success: false, error: 'WhatsApp env vars not configured' }
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: params.number,
          type: 'text',
          text: { body: params.text },
        }),
      }
    )

    if (!response.ok) {
      const body = await response.text()
      console.error('[whatsapp-sender/meta] HTTP error', response.status, body)
      return { success: false, error: `HTTP ${response.status}` }
    }

    return { success: true }
  } catch (error) {
    console.error('[whatsapp-sender/meta]', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
