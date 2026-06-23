import { NextRequest } from 'next/server'
import { processWebhookPayload } from '@/lib/whatsapp/process-webhook'

// ─── GET — verificação do webhook pelo Meta ───────────────────────────────────
// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/manage-and-debug
export function GET(request: NextRequest): Response {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[webhook] Meta verification successful')
    return new Response(challenge ?? '', { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

// ─── POST — receber mensagens do Meta ─────────────────────────────────────────
export async function POST(request: NextRequest): Promise<Response> {
  // Meta não usa header de secret — valida via verify_token no GET de setup.
  // Para segurança adicional em produção, considere validar a assinatura X-Hub-Signature-256.
  // Por ora: aceitar todos os POSTs e retornar 200 imediatamente.

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  // Processar de forma assíncrona (fire and forget)
  processWebhookPayload(body).catch(error => {
    console.error('[webhook] unhandled async error', error)
  })

  return new Response('OK', { status: 200 })
}
