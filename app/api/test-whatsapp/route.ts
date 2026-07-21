import { NextRequest } from 'next/server'

// Rota temporária de teste — REMOVER antes do deploy em produção
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { number, text } = await request.json() as { number: string; text: string }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: number,
      type: 'text',
      text: { body: text },
    }

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      }
    )

    const responseBody = await response.json()

    return Response.json({
      status: response.status,
      ok: response.ok,
      phoneNumberId,
      payload,
      responseBody,
    })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
