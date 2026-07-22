interface SendMessageParams {
  chatId: string | number
  text: string
}

interface SendMessageResult {
  success: boolean
  error?: string
}

export async function sendTelegramMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('[telegram-sender] TELEGRAM_BOT_TOKEN não configurado')
    return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured' }
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: params.chatId,
          text: params.text,
          parse_mode: 'HTML',
        }),
      }
    )

    if (!response.ok) {
      const body = await response.text()
      console.error('[telegram-sender] HTTP error', response.status, body)
      return { success: false, error: `HTTP ${response.status}` }
    }

    return { success: true }
  } catch (error) {
    console.error('[telegram-sender]', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function getTelegramFileUrl(fileId: string): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured')

  const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)
  if (!res.ok) throw new Error(`getFile failed: HTTP ${res.status}`)

  const data = await res.json() as { ok: boolean; result: { file_path: string } }
  if (!data.ok) throw new Error('getFile returned ok=false')

  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`
}
