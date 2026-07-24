import { db, schema } from '@/lib/db'
import { eq, and, ne } from 'drizzle-orm'
import { runInvestigationEngine } from '@/lib/ai/investigation-engine'
import crypto from 'crypto'
import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import { env } from '@/lib/utils/env'

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
      company_id: schema.investigations.company_id,
      manager_id: schema.investigations.manager_id,
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
  const openai = new OpenAI({ apiKey: env('OPENAI_API_KEY') })
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
      ne(schema.messages.worker_id, iw.worker_id),
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
    companyId: iw.company_id,
    managerId: iw.manager_id,
    investigationId: iw.investigation_id,
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

    // Verificar se todos saturaram → gerar relatório (aguardar para não ser cortado pelo Vercel)
    await checkAndGenerateReport(iw.investigation_id).catch(err => console.error('[worker-audio] report gen error', err))
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

async function checkAndGenerateReport(investigationId: string) {
  const workers = await db
    .select({ status: schema.investigation_workers.status })
    .from(schema.investigation_workers)
    .where(eq(schema.investigation_workers.investigation_id, investigationId))
    .all()

  const allDone = workers.every(w => w.status === 'saturated' || w.status === 'unresponsive')
  if (!allDone) return

  await db.update(schema.investigations)
    .set({ status: 'saturated' })
    .where(eq(schema.investigations.id, investigationId))

  const investigation = await db
    .select({ title: schema.investigations.title, problem_description: schema.investigations.problem_description })
    .from(schema.investigations)
    .where(eq(schema.investigations.id, investigationId))
    .get()

  if (!investigation) return

  const iwRows = await db
    .select({
      worker_id: schema.investigation_workers.worker_id,
      alias: schema.workers.anonymous_alias,
      role: schema.workers.role,
    })
    .from(schema.investigation_workers)
    .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
    .where(eq(schema.investigation_workers.investigation_id, investigationId))
    .all()

  const workerMap = new Map(iwRows.map(w => [w.worker_id, { alias: w.alias, role: w.role }]))

  const rawMessages = await db
    .select({
      worker_id: schema.messages.worker_id,
      direction: schema.messages.direction,
      content: schema.messages.content,
      key_points_extracted: schema.messages.key_points_extracted,
    })
    .from(schema.messages)
    .where(eq(schema.messages.investigation_id, investigationId))
    .orderBy(schema.messages.created_at)
    .all()

  const allMessages = rawMessages
    .filter(m => m.content !== null)
    .map(m => {
      const wInfo = workerMap.get(m.worker_id) ?? { alias: 'Desconhecido', role: '' }
      return {
        alias: wInfo.alias,
        role: wInfo.role,
        direction: m.direction as 'outbound' | 'inbound',
        content: m.content!,
        key_points_extracted: Array.isArray(m.key_points_extracted) ? (m.key_points_extracted as string[]) : undefined,
      }
    })

  const workerAliases = Array.from(workerMap.values())

  try {
    const { generateReport } = await import('@/lib/ai/report-generator')
    const reportOutput = await generateReport({ investigation, allMessages, workerAliases })

    const reportValues = {
      investigation_id: investigationId,
      root_cause: reportOutput.root_cause,
      confidence_score: reportOutput.confidence_score,
      confidence_justification: reportOutput.confidence_justification ?? null,
      ishikawa_breakdown: JSON.stringify(reportOutput.ishikawa_breakdown),
      sources_summary: JSON.stringify(reportOutput.sources_summary),
      recommendations: JSON.stringify(reportOutput.recommendations),
      generated_at: new Date().toISOString(),
    }

    const existingReport = await db
      .select({ id: schema.reports.id })
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

    if (existingReport) {
      await db.update(schema.reports).set(reportValues).where(eq(schema.reports.investigation_id, investigationId))
    } else {
      await db.insert(schema.reports).values({ id: crypto.randomUUID(), ...reportValues })
    }
  } catch (err) {
    console.error('[worker-audio] report gen error', err)
  }

  await db.update(schema.investigations)
    .set({ status: 'completed', completed_at: new Date().toISOString() })
    .where(eq(schema.investigations.id, investigationId))
}
