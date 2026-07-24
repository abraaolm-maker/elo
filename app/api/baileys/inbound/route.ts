import { NextRequest } from 'next/server'
import { processInboundMessage } from '@/lib/whatsapp/process-webhook'

export const dynamic = 'force-dynamic'

const BAILEYS_SECRET = process.env.BAILEYS_WEBHOOK_SECRET ?? 'elo-baileys-secret-2025'

export async function POST(request: NextRequest): Promise<Response> {
  const secret = request.headers.get('x-baileys-secret')
  if (secret !== BAILEYS_SECRET) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { phoneNumber: string; messageId: string; type: 'text' | 'audio'; content: string }
  try {
    body = await request.json() as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { phoneNumber, messageId, type, content } = body
  if (!phoneNumber || !messageId || !type || content === undefined) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Processar de forma assíncrona — retornar 200 imediatamente
  processInboundMessage({ phoneNumber, messageId, type, content })
    .catch(err => console.error('[baileys-inbound]', err))

  return Response.json({ ok: true })
}
