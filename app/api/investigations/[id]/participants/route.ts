import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'
import { runInvestigationEngine } from '@/lib/ai/investigation-engine'
import { sendWhatsAppMessage } from '@/lib/whatsapp/sender'
import { canSpendOnAi } from '@/lib/billing/plan-limits'
import { logError, logWarn } from '@/lib/monitoring/logger'
import type { InvestigationContext } from '@/lib/ai/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST — adicionar participante à investigação.
 *
 * Permitido enquanto a investigação não estiver concluída ou cancelada. Se ela
 * já estiver em andamento, o participante entra pronto para responder: recebe
 * token de acesso e a primeira pergunta na hora, sem esperar nada.
 *
 * Se a coleta já havia se encerrado ('saturated'), ela volta para 'active' —
 * caso contrário as rotas do trabalhador recusariam as respostas do recém-
 * chegado e ele ficaria com um link que não funciona.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)

    const investigation = await db
      .select({
        status: schema.investigations.status,
        company_id: schema.investigations.company_id,
        manager_id: schema.investigations.manager_id,
        problem_description: schema.investigations.problem_description,
        investigation_context: schema.investigations.investigation_context,
      })
      .from(schema.investigations)
      .where(and(eq(schema.investigations.id, id), eq(schema.investigations.company_id, session.companyId)))
      .get()

    if (!investigation) return Response.json({ error: 'Não encontrada.' }, { status: 404 })

    if (investigation.status === 'completed') {
      return Response.json({ error: 'Esta investigação já foi concluída. Não é possível adicionar participantes.' }, { status: 400 })
    }
    if (investigation.status === 'cancelled') {
      return Response.json({ error: 'Esta investigação foi cancelada.' }, { status: 400 })
    }

    const body = await request.json() as Record<string, unknown>
    const worker_id = typeof body.worker_id === 'string' ? body.worker_id : ''
    const manager_notes = typeof body.manager_notes === 'string' ? body.manager_notes.trim() : ''
    if (!worker_id) return Response.json({ error: 'worker_id obrigatório.' }, { status: 400 })

    const worker = await db
      .select({
        id: schema.workers.id,
        role: schema.workers.role,
        role_description: schema.workers.role_description,
        whatsapp_number: schema.workers.whatsapp_number,
      })
      .from(schema.workers)
      .where(and(eq(schema.workers.id, worker_id), eq(schema.workers.company_id, session.companyId)))
      .get()

    if (!worker) return Response.json({ error: 'Worker não encontrado.' }, { status: 404 })

    const existing = await db
      .select({ id: schema.investigation_workers.id })
      .from(schema.investigation_workers)
      .where(and(
        eq(schema.investigation_workers.investigation_id, id),
        eq(schema.investigation_workers.worker_id, worker_id)
      ))
      .get()

    if (existing) return Response.json({ error: 'Este colaborador já participa desta investigação.' }, { status: 409 })

    // Com a investigação apenas pendente, basta vincular — o disparo acontece
    // quando o gestor iniciar a investigação
    const jaEmAndamento = investigation.status === 'active' || investigation.status === 'saturated'

    if (!jaEmAndamento) {
      await db.insert(schema.investigation_workers).values({
        id: crypto.randomUUID(),
        investigation_id: id,
        worker_id,
        status: 'pending',
        saturation_score: 0,
        ...(manager_notes ? { manager_notes } : {}),
      })
      return Response.json({ data: { entrou_em_andamento: false, pergunta_enviada: false } }, { status: 201 })
    }

    // ── Entrando numa investigação em andamento ──────────────────────────────

    const orcamento = await canSpendOnAi(investigation.company_id)
    if (!orcamento.ok) {
      return Response.json({ error: orcamento.reason }, { status: 403 })
    }

    const iwId = crypto.randomUUID()
    const accessToken = crypto.randomUUID()

    await db.insert(schema.investigation_workers).values({
      id: iwId,
      investigation_id: id,
      worker_id,
      status: 'active',
      saturation_score: 0,
      access_token: accessToken,
      ...(manager_notes ? { manager_notes } : {}),
    })

    // Reabre a coleta se ela já havia se encerrado
    if (investigation.status === 'saturated') {
      await db
        .update(schema.investigations)
        .set({ status: 'active' })
        .where(eq(schema.investigations.id, id))
    }

    // Primeira pergunta — o novo participante já chega com algo para responder
    let perguntaEnviada = false
    try {
      let investigationContext: InvestigationContext | null = null
      if (investigation.investigation_context) {
        try { investigationContext = JSON.parse(investigation.investigation_context) as InvestigationContext } catch { /* usa null */ }
      }

      const planCfg = await db
        .select({ max_questions_per_worker: schema.plan_configs.max_questions_per_worker })
        .from(schema.companies)
        .innerJoin(schema.plan_configs, eq(schema.companies.plan, schema.plan_configs.plan))
        .where(eq(schema.companies.id, investigation.company_id))
        .get()

      // Quem entra depois se beneficia do que já foi levantado: os pontos-chave
      // das outras fontes viram contexto de validação cruzada, sem identificar
      // quem disse o quê (Delphi).
      const deOutros = await db
        .select({ key_points_extracted: schema.messages.key_points_extracted })
        .from(schema.messages)
        .where(and(
          eq(schema.messages.investigation_id, id),
          eq(schema.messages.direction, 'inbound'),
        ))

      const reportedFacts = deOutros
        .flatMap(m => Array.isArray(m.key_points_extracted) ? (m.key_points_extracted as string[]) : [])
        .slice(0, 40)

      const engineOutput = await runInvestigationEngine({
        problemDescription: investigation.problem_description,
        workerRole: worker.role,
        workerRoleDescription: worker.role_description ?? '',
        messageHistory: [],
        reportedFacts,
        pendingValidations: [],
        managerNotes: manager_notes,
        investigationContext,
        maxQuestionsPerWorker: planCfg?.max_questions_per_worker ?? -1,
        companyId: investigation.company_id,
        managerId: investigation.manager_id,
        investigationId: id,
      })

      if (engineOutput.action === 'ask_question' && engineOutput.next_question) {
        await db.insert(schema.messages).values({
          id: crypto.randomUUID(),
          investigation_id: id,
          worker_id,
          direction: 'outbound',
          content_type: 'text',
          content: engineOutput.next_question,
          transcription_status: 'not_applicable',
          retry_count: 0,
        })
        perguntaEnviada = true

        if (!worker.whatsapp_number.startsWith('portal:')) {
          sendWhatsAppMessage({ number: worker.whatsapp_number, text: engineOutput.next_question })
            .catch(err => logWarn('api/investigations/participants', `Envio WhatsApp falhou: ${String(err)}`, { investigationId: id }))
        }
      }
    } catch (err) {
      // O participante já está vinculado e com link válido; a pergunta pode ser
      // gerada depois. Não desfazemos a inclusão por causa disso.
      await logError('api/investigations/participants', err, {
        companyId: investigation.company_id,
        investigationId: id,
        extra: { etapa: 'primeira_pergunta' },
      })
    }

    return Response.json({
      data: {
        entrou_em_andamento: true,
        pergunta_enviada: perguntaEnviada,
        coleta_reaberta: investigation.status === 'saturated',
      },
    }, { status: 201 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    await logError('api/investigations/participants POST', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// DELETE — remover worker da investigação (apenas quando pending)
export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)

    const investigation = await db
      .select({ status: schema.investigations.status })
      .from(schema.investigations)
      .where(and(eq(schema.investigations.id, id), eq(schema.investigations.company_id, session.companyId)))
      .get()

    if (!investigation) return Response.json({ error: 'Não encontrada.' }, { status: 404 })
    if (investigation.status !== 'pending') {
      // Depois de iniciada, remover apagaria respostas já dadas e distorceria o
      // relatório. Quem não deve mais responder é encerrado, não excluído.
      return Response.json(
        { error: 'A investigação já foi iniciada. Para encerrar a participação de alguém sem apagar o que já respondeu, use "Encerrar coleta".' },
        { status: 400 }
      )
    }

    const body = await request.json() as Record<string, unknown>
    const iw_id = typeof body.iw_id === 'string' ? body.iw_id : ''
    if (!iw_id) return Response.json({ error: 'iw_id obrigatório.' }, { status: 400 })

    await db
      .delete(schema.investigation_workers)
      .where(and(
        eq(schema.investigation_workers.id, iw_id),
        eq(schema.investigation_workers.investigation_id, id)
      ))

    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[investigations/:id/participants DELETE]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
