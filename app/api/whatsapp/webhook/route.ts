import { processWebhookPayload } from '@/lib/whatsapp/process-webhook'

export async function POST(request: Request): Promise<Response> {
  // Validar secret
  const secret = request.headers.get('x-webhook-secret')
  if (!secret || secret !== process.env.WHATSAPP_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Retornar 200 imediatamente — WhatsApp reenvia se não receber em 5s
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: true }, { status: 200 })
  }

  // Processar de forma assíncrona (fire and forget)
  processWebhookPayload(body).catch(error => {
    console.error('[webhook] unhandled async error', error)
  })

  return Response.json({ ok: true }, { status: 200 })
}
