interface SendMessageParams {
  number: string
  text: string
}

interface SendMessageResult {
  success: boolean
  error?: string
}

// Meta WhatsApp Business Cloud API
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
export async function sendWhatsAppMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    console.error('[whatsapp-sender] WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurados')
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
      console.error('[whatsapp-sender] HTTP error', response.status, body)
      return { success: false, error: `HTTP ${response.status}` }
    }

    return { success: true }
  } catch (error) {
    console.error('[whatsapp-sender]', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
