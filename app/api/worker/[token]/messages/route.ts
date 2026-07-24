export const maxDuration = 60

import { db, schema } from '@/lib/db'
import { eq, and, ne } from 'drizzle-orm'
import { runInvestigationEngine } from '@/lib/ai/investigation-engine'
import crypto from 'crypto'

interface RouteParams { params: Promise<{ token: string }> }

// POST — worker envia mensagem de texto
export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const { token } = await params
  const body = await req.json() as { cpf?: string; content?: string }

  const cpf = typeof body.cpf === 'string' ? body.cpf.replace(/\D/g, '') : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''

  if (!cpf || !content) return Response.json({ error: 'CPF e conteúdo obrigatórios.' }, { status: 400 })

  const iw = await db
    .select({
      iw_id: schema.investigation_workers.id,
      worker_id: schema.investigation_workers.worker_id,
      investigation_id: schema.investigation_workers.investigation_id,
      status: schema.investigation_workers.status,
      saturation_score: schema.investigation_workers.saturation_score,
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
  if (iw.status === 'saturated') return Response.json({ error: 'Você já concluiu sua participação. Obrigado!' }, { status: 400 })

  // Salvar mensagem inbound do worker
  await db.insert(schema.messages).values({
    id: crypto.randomUUID(),
    investigation_id: iw.investigation_id,
    worker_id: iw.worker_id,
    direction: 'inbound',
    content_type: 'text',
    content,
    transcription_status: 'not_applicable',
    retry_count: 0,
  })

  // Buscar histórico completo para o engine
  const allMessages = await db
    .select({ direction: schema.messages.direction, content: schema.messages.content })
    .from(schema.messages)
    .where(and(
      eq(schema.messages.investigation_id, iw.investigation_id),
      eq(schema.messages.worker_id, iw.worker_id),
    ))
    .orderBy(schema.messages.created_at)
    .all()

  // Cross-validation: key_points apenas de OUTROS workers (não do atual)
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
    .flatMap(m => {
      try { return JSON.parse(m.key_points_extracted ?? '[]') as string[] } catch { return [] }
    })
    .join('; ')

  // Rodar engine
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

  // Salvar key_points na última mensagem inbound
  const lastInbound = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(and(
      eq(schema.messages.investigation_id, iw.investigation_id),
      eq(schema.messages.worker_id, iw.worker_id),
      eq(schema.messages.direction, 'inbound'),
    ))
    .orderBy(schema.messages.created_at)
    .all()
  const lastId = lastInbound.at(-1)?.id
  if (lastId && engineOutput.key_points_extracted.length > 0) {
    await db.update(schema.messages)
      .set({ key_points_extracted: JSON.stringify(engineOutput.key_points_extracted) })
      .where(eq(schema.messages.id, lastId))
  }

  // Atualizar saturation_score
  await db.update(schema.investigation_workers)
    .set({ saturation_score: engineOutput.saturation_score })
    .where(eq(schema.investigation_workers.id, iw.iw_id))

  let outboundContent: string | null = null

  if (engineOutput.action === 'mark_saturated') {
    await db.update(schema.investigation_workers)
      .set({ status: 'saturated' })
      .where(eq(schema.investigation_workers.id, iw.iw_id))

    outboundContent = 'Obrigado pela sua participação! Suas respostas foram registradas com sucesso. Você pode fechar esta página.'

    // Verificar se todos saturaram → gerar relatório (aguardar para não ser cortado pelo Vercel)
    await checkAndGenerateReport(iw.investigation_id).catch(err => console.error('[worker-portal] report gen error', err))
  } else {
    outboundContent = engineOutput.next_question ?? null
  }

  // Salvar outbound
  let outboundMessage = null
  if (outboundContent) {
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
    outboundMessage = { id: outId, direction: 'outbound', content: outboundContent, content_type: 'text' }
  }

  const updatedIw = await db
    .select({ status: schema.investigation_workers.status, saturation_score: schema.investigation_workers.saturation_score })
    .from(schema.investigation_workers)
    .where(eq(schema.investigation_workers.id, iw.iw_id))
    .get()

  return Response.json({
    data: {
      outbound_message: outboundMessage,
      saturation_score: updatedIw?.saturation_score ?? engineOutput.saturation_score,
      status: updatedIw?.status ?? iw.status,
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
    console.error('[worker-portal] report gen error', err)
    // Mesmo com falha no relatório, marca como completed para não travar em saturated
    // O relatório pode ser regenerado via /api/reports/[id]
  }

  await db.update(schema.investigations)
    .set({ status: 'completed', completed_at: new Date().toISOString() })
    .where(eq(schema.investigations.id, investigationId))
}
