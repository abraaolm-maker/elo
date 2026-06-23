import { requireAuth } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { runInvestigationEngine } from '@/lib/ai/investigation-engine'
import { sendWhatsAppMessage } from '@/lib/whatsapp/sender'
import crypto from 'crypto'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth()

    // Buscar investigação e validar que pertence à company
    const investigation = await db
      .select()
      .from(schema.investigations)
      .where(
        and(
          eq(schema.investigations.id, id),
          eq(schema.investigations.company_id, session.companyId)
        )
      )
      .get()

    if (!investigation) {
      return Response.json({ error: 'Investigação não encontrada.' }, { status: 404 })
    }

    if (investigation.status !== 'pending') {
      return Response.json({ error: 'Apenas investigações com status pending podem ser iniciadas.' }, { status: 400 })
    }

    // Atualizar investigação para 'active'
    await db
      .update(schema.investigations)
      .set({ status: 'active' })
      .where(eq(schema.investigations.id, id))

    // Buscar workers participantes
    const iwRows = await db
      .select({
        iw_id: schema.investigation_workers.id,
        worker_id: schema.investigation_workers.worker_id,
        role: schema.workers.role,
        role_description: schema.workers.role_description,
        whatsapp_number: schema.workers.whatsapp_number,
      })
      .from(schema.investigation_workers)
      .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
      .where(eq(schema.investigation_workers.investigation_id, id))

    // Atualizar todos os investigation_workers para 'active'
    await db
      .update(schema.investigation_workers)
      .set({ status: 'active' })
      .where(eq(schema.investigation_workers.investigation_id, id))

    // Para cada worker: gerar primeira pergunta via IA e enviar via WhatsApp
    const sendFirstQuestion = async (iw: typeof iwRows[number]): Promise<void> => {
      let engineOutput
      try {
        engineOutput = await runInvestigationEngine({
          problemDescription: investigation.problem_description,
          workerRole: iw.role,
          workerRoleDescription: iw.role_description ?? '',
          messageHistory: [],
          crossValidationContext: '',
        })
      } catch (error) {
        console.error('[investigations start] engine error for worker', iw.worker_id, error)
        return
      }

      if (engineOutput.action !== 'ask_question') return

      // Salvar outbound message
      await db.insert(schema.messages).values({
        id: crypto.randomUUID(),
        investigation_id: id,
        worker_id: iw.worker_id,
        direction: 'outbound',
        content_type: 'text',
        content: engineOutput.next_question,
        transcription_status: 'not_applicable',
        retry_count: 0,
      })

      // Enviar via WhatsApp (falha não bloqueia)
      sendWhatsAppMessage({
        number: iw.whatsapp_number,
        text: engineOutput.next_question,
      }).catch(err => {
        console.error('[investigations start] whatsapp send failed (non-fatal)', err)
      })
    }

    // Enviar em paralelo
    await Promise.allSettled(iwRows.map(sendFirstQuestion))

    // Retornar investigação atualizada
    const updated = await db
      .select({ id: schema.investigations.id, title: schema.investigations.title, status: schema.investigations.status, created_at: schema.investigations.created_at })
      .from(schema.investigations)
      .where(eq(schema.investigations.id, id))
      .get()

    return Response.json({ data: updated }, { status: 200 })
  } catch (error) {
    console.error('[investigations start]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
