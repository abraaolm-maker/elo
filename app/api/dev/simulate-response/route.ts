// Rota exclusiva de desenvolvimento — retorna 404 em produção
import { processInboundMessage } from '@/lib/whatsapp/process-webhook'

interface SimulateBody {
  workerPhone: string
  message: string
}

function isSimulateBody(body: unknown): body is SimulateBody {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return typeof b.workerPhone === 'string' && typeof b.message === 'string'
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!isSimulateBody(body)) {
    return Response.json(
      { error: 'Body deve ter: { workerPhone: string, message: string }' },
      { status: 400 }
    )
  }

  const { workerPhone, message } = body

  // ID único para evitar deduplicação entre simulações
  const simulatedMessageId = `sim_${Date.now()}_${Math.random().toString(36).slice(2)}`

  try {
    await processInboundMessage({
      phoneNumber: workerPhone,
      messageId: simulatedMessageId,
      type: 'text',
      content: message,
    })

    return Response.json({
      ok: true,
      simulatedMessageId,
      workerPhone,
      message,
    })
  } catch (error) {
    console.error('[simulate-response]', error)
    return Response.json({ error: 'Erro ao processar simulação' }, { status: 500 })
  }
}
