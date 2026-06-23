interface SendMessageParams {
  number: string
  text: string
}

interface SendMessageResult {
  success: boolean
  error?: string
}

export async function sendWhatsAppMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const apiUrl = process.env.WHATSAPP_API_URL
  const apiKey = process.env.WHATSAPP_API_KEY
  const instanceName = process.env.WHATSAPP_INSTANCE_NAME

  if (!apiUrl || !apiKey || !instanceName) {
    return { success: false, error: 'WhatsApp env vars not configured' }
  }

  try {
    const response = await fetch(
      `${apiUrl}/message/sendText/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({ number: params.number, text: params.text }),
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
