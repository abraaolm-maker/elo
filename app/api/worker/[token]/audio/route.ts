import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { runInvestigationEngine } from '@/lib/ai/investigation-engine'
import crypto from 'crypto'
import OpenAI from 'openai'
import { toFile } from 'openai/uploads'

interface RouteParams { params: Promise<{ token: string }> }

export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const { token } = await params

  const formData = await req.formData()
  const cpf = ((formData.get('cpf') as string) ?? '').replace(/\D/g, '')
  const audioFile = formData.get('audio') as File | null

  if (!cpf || !audioFile) return Response.json({ error: 'CPF e áudio obrigatórios.' }, { status: 400 })

  const iw = await db
    .select({
      iw_id: schema.investigation_workers.id,
      worker_id: schema.investigation_workers.worker_id,
      investigation_id: schema.investigation_workers.investigation_id,
      status: schema.investigation_workers.status,
      manager_notes: schema.investigation_workers.manager_notes,
      investigation_status: schema.investigations.status,
      problem_description: schema.investigations.problem_description,
      worker_cpf: schema.workers.cpf,
      worker_role: schema.workers.role,
      worker_role_description: schema.workers.role_description,
    })
    .from(schema.investigation_workers)
    .innerJoin(schema.investigations, eq(schema.investigation_workers.investigation_id, schema.investigations.id))
    .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
    .where(eq(schema.investigation_workers.access_token, token))
    .get()

  if (!iw) return Response.json({ error: 'Link inválido.' }, { status: 404 })
  if ((iw.worker_cpf ?? '').replace(/\D/g, '') !== cpf) return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  if (iw.investigation_status !== 'active') return Response.json({ error: 'Investigação não está ativa.' }, { status: 400 })
  if (iw.status === 'saturated') return Response.json({ error: 'Você já concluiu sua participação.' }, { status: 400 })

  // Transcrever áudio via Whisper
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const arrayBuffer = await audioFile.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let transcript = ''
  try {
    const result = await openai.audio.transcriptions.create({
      file: await toFile(buffer, 'audio.webm', { type: audioFile.type || 'audio/webm' }),
      model: 'whisper-1',
      language: 'pt',
    })
    transcript = result.text.trim()
  } catch (err) {
    console.error('[worker-audio] Whisper error:', err)
    return Response.json({ error: 'Não consegui transcrever o áudio. Tente responder por texto.' }, { status: 422 })
  }

  if (!transcript) return Response.json({ error: 'Áudio sem conteúdo reconhecível. Tente novamente ou responda por texto.' }, { status: 422 })

  // Salvar mensagem inbound com transcrição
  await db.insert(schema.messages).values({
    id: crypto.randomUUID(),
    investigation_id: iw.investigation_id,
    worker_id: iw.worker_id,
    direction: 'inbound',
    content_type: 'audio',
    content: transcript,
    transcription_status: 'success',
    retry_count: 0,
  })

  // Buscar histórico e rodar engine (mesmo fluxo da rota de texto)
  const allMessages = await db
    .select({ direction: schema.messages.direction, content: schema.messages.content })
    .from(schema.messages)
    .where(and(
      eq(schema.messages.investigation_id, iw.investigation_id),
      eq(schema.messages.worker_id, iw.worker_id),
    ))
    .orderBy(schema.messages.created_at)
    .all()

  const otherPoints = await db
    .select({ key_points_extracted: schema.messages.key_points_extracted })
    .from(schema.messages)
    .where(and(
      eq(schema.messages.investigation_id, iw.investigation_id),
      eq(schema.messages.direction, 'inbound'),
    ))
    .all()

  const crossValidationContext = otherPoints
    .flatMap(m => { try { return JSON.parse(m.key_points_extracted ?? '[]') as string[] } catch { return [] } })
    .join('; ')

  const engineOutput = await runInvestigationEngine({
    problemDescription: iw.problem_description,
    workerRole: iw.worker_role,
    workerRoleDescription: iw.worker_role_description ?? '',
    messageHistory: allMessages.filter(m => m.content !== null) as { direction: 'outbound' | 'inbound'; content: string }[],
    crossValidationContext,
    managerNotes: iw.manager_notes ?? '',
  })

  await db.update(schema.investigation_workers)
    .set({ saturation_score: engineOutput.saturation_score })
    .where(eq(schema.investigation_workers.id, iw.iw_id))

  let outboundContent: string
  if (engineOutput.action === 'mark_saturated') {
    await db.update(schema.investigation_workers)
      .set({ status: 'saturated' })
      .where(eq(schema.investigation_workers.id, iw.iw_id))
    outboundContent = 'Obrigado pela sua participação! Suas respostas foram registradas com sucesso. Você pode fechar esta página.'
  } else {
    outboundContent = engineOutput.next_question ?? ''
  }

  const outId = crypto.randomUUID()
  await db.insert(schema.messages).values({
    id: outId,
    investigation_id: iw.investigation_id,
    worker_id: iw.worker_id,
    direction: 'outbound',
    content_type: 'text',
    content: outboundContent,
    transcription_status: 'not_applicable',
    retry_count: 0,
  })

  return Response.json({
    data: {
      transcript,
      outbound_message: { id: outId, direction: 'outbound', content: outboundContent, content_type: 'text' },
      saturation_score: engineOutput.saturation_score,
      status: engineOutput.action === 'mark_saturated' ? 'saturated' : iw.status,
    }
  }, { status: 200 })
}
