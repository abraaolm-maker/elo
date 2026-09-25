import { db, schema } from '@/lib/db'
import { eq, and, ne, isNotNull } from 'drizzle-orm'
import { parseWhatsAppPayload, resolveMetaMediaUrl } from './parser'
import { sendWhatsAppMessage } from './sender'
import { sendTelegramMessage } from '@/lib/telegram/sender'
import { downloadAudio, uploadAudioToStorage, transcribeAudio } from '@/lib/audio/transcriber'
import { runInvestigationEngine } from '@/lib/ai/investigation-engine'
import { marcarSaturadaSeTodosTerminaram } from '@/lib/investigations/saturation'
import type { MessageHistoryEntry, ReportMessageEntry, WorkerAlias, InvestigationContext } from '@/lib/ai/types'
import crypto from 'crypto'
import { canSpendOnAi } from '@/lib/billing/plan-limits'
import { logWarn } from '@/lib/monitoring/logger'

// â”€â”€â”€ LÃ³gica central â€” aceita payload bruto do Meta WhatsApp â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function processWebhookPayload(body: unknown): Promise<void> {
  const parsed = parseWhatsAppPayload(body)
  if (!parsed || parsed.isFromMe) return

  const { phoneNumber, messageId, type, content } = parsed
  await processInboundMessage({ phoneNumber, messageId, type, content })
}

// â”€â”€â”€ LÃ³gica central â€” aceita parÃ¢metros jÃ¡ extraÃ­dos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Usada tanto pelo webhook real quanto pela rota de simulaÃ§Ã£o de dev.

export async function processInboundMessage({
  phoneNumber,
  messageId,
  type,
  content,
}: {
  phoneNumber: string
  messageId: string
  type: 'text' | 'audio'
  content: string
}): Promise<void> {
  // DeduplicaÃ§Ã£o â€” raw_whatsapp_id tem constraint UNIQUE
  const existing = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.raw_whatsapp_id, messageId))
    .get()
  if (existing) return

  // Buscar worker pelo phoneNumber
  const worker = await db
    .select()
    .from(schema.workers)
    .where(
      and(
        eq(schema.workers.whatsapp_number, phoneNumber),
        eq(schema.workers.is_active, true)
      )
    )
    .get()
  if (!worker) return

  // Buscar investigation_worker ativo para este worker
  const iw = await db
    .select()
    .from(schema.investigation_workers)
    .where(
      and(
        eq(schema.investigation_workers.worker_id, worker.id),
        eq(schema.investigation_workers.status, 'active')
      )
    )
    .get()
  if (!iw) return

  // Confirmar que a investigaÃ§Ã£o estÃ¡ ativa
  const investigation = await db
    .select()
    .from(schema.investigations)
    .where(
      and(
        eq(schema.investigations.id, iw.investigation_id),
        eq(schema.investigations.status, 'active')
      )
    )
    .get()
  if (!investigation) return

  // â”€â”€ Processar mensagem â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let messageContent: string | null = null
  let audioUrl: string | null = null
  let transcriptionStatus = 'not_applicable'
  let savedMessageId: string | null = null

  if (type === 'audio') {
    // Verificar retry count de falhas anteriores deste worker nesta investigaÃ§Ã£o
    const lastFailed = await db
      .select({ retry_count: schema.messages.retry_count })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.worker_id, worker.id),
          eq(schema.messages.investigation_id, iw.investigation_id),
          eq(schema.messages.transcription_status, 'failed')
        )
      )
      .orderBy(schema.messages.created_at)
      .get()

    const currentRetryCount = lastFailed?.retry_count ?? 0

    try {
      // Para Meta API: content Ã© o Media ID â€” resolver para URL de download
      // Para Telegram: content jÃ¡ Ã© a URL direta (resolvida no webhook)
      const isTelegram = phoneNumber.startsWith('tg_')
      const audioDownloadUrl = isTelegram ? content : await resolveMetaMediaUrl(content)
      const accessToken = isTelegram ? undefined : process.env.WHATSAPP_ACCESS_TOKEN

      const audioBuffer = await downloadAudio(audioDownloadUrl, accessToken)
      const fileName = `${iw.investigation_id}/${worker.id}/${messageId}.ogg`
      audioUrl = await uploadAudioToStorage(audioBuffer, fileName)

      const { text, reliable } = await transcribeAudio(audioBuffer)

      if (!reliable) {
        if (currentRetryCount < 2) {
          const newMsgId = crypto.randomUUID()
          await db.insert(schema.messages).values({
            id: newMsgId,
            investigation_id: iw.investigation_id,
            worker_id: worker.id,
            direction: 'inbound',
            content_type: 'audio',
            content: null,
            audio_url: audioUrl,
            raw_whatsapp_id: messageId,
            transcription_status: 'failed',
            retry_count: currentRetryCount + 1,
          })
          savedMessageId = newMsgId

          const retryText = 'NÃ£o consegui entender bem o Ã¡udio ðŸŽ™ï¸\n\nPode repetir sua resposta? Tente falar um pouco mais devagar e em um local mais silencioso.\n\nSe preferir, pode responder por escrito tambÃ©m.'
          if (worker.whatsapp_number.startsWith('tg_')) {
            await sendTelegramMessage({ chatId: worker.whatsapp_number.replace('tg_', ''), text: retryText })
          } else {
            await sendWhatsAppMessage({ number: worker.whatsapp_number, text: retryText })
          }
          return
        } else {
          transcriptionStatus = 'permanently_failed'
          messageContent = null
        }
      } else {
        transcriptionStatus = 'success'
        messageContent = text
      }
    } catch (error) {
      console.error('[process-webhook] audio processing error', error)
      transcriptionStatus = 'permanently_failed'
    }
  } else {
    messageContent = content
    transcriptionStatus = 'not_applicable'
  }

  // Salvar mensagem inbound
  if (!savedMessageId) {
    const newMsgId = crypto.randomUUID()
    await db.insert(schema.messages).values({
      id: newMsgId,
      investigation_id: iw.investigation_id,
      worker_id: worker.id,
      direction: 'inbound',
      content_type: type,
      content: messageContent,
      audio_url: audioUrl,
      raw_whatsapp_id: messageId,
      transcription_status: transcriptionStatus,
      retry_count: 0,
    })
    savedMessageId = newMsgId
  }

  if (!messageContent) return

  // â”€â”€ Construir reportedFacts (key_points de outros workers) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const otherMessages = await db
    .select({ key_points_extracted: schema.messages.key_points_extracted })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.investigation_id, iw.investigation_id),
        eq(schema.messages.direction, 'inbound'),
        ne(schema.messages.worker_id, worker.id),
        isNotNull(schema.messages.key_points_extracted)
      )
    )

  const reportedFacts = otherMessages
    .flatMap(m => {
      try { return (JSON.parse(m.key_points_extracted ?? '[]') as string[]) } catch { return [] }
    })

  // â”€â”€ Construir pendingValidations (hints de outros workers) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const otherIwRows = await db
    .select({ pending_hints: schema.investigation_workers.pending_hints })
    .from(schema.investigation_workers)
    .where(
      and(
        eq(schema.investigation_workers.investigation_id, iw.investigation_id),
        ne(schema.investigation_workers.worker_id, worker.id),
      )
    )

  const pendingValidations = otherIwRows
    .flatMap(w => { try { return JSON.parse(w.pending_hints ?? '[]') as string[] } catch { return [] } })

  // â”€â”€ Buscar histÃ³rico de mensagens deste worker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rawHistory = await db
    .select({ direction: schema.messages.direction, content: schema.messages.content })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.investigation_id, iw.investigation_id),
        eq(schema.messages.worker_id, worker.id)
      )
    )
    .orderBy(schema.messages.created_at)

  const messageHistory: MessageHistoryEntry[] = rawHistory
    .filter(m => m.content !== null)
    .map(m => ({
      direction: m.direction as 'outbound' | 'inbound',
      content: m.content as string,
    }))

  // â”€â”€ Parsear investigation_context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let investigationContext: InvestigationContext | null = null
  if (investigation.investigation_context) {
    try { investigationContext = JSON.parse(investigation.investigation_context) as InvestigationContext } catch { /* usa null */ }
  }

  const managerNotes = iw.manager_notes ?? ''

  // Buscar limite de perguntas do plano da empresa
  const planCfgWh = await db
    .select({ max_questions_per_worker: schema.plan_configs.max_questions_per_worker })
    .from(schema.companies)
    .innerJoin(schema.plan_configs, eq(schema.companies.plan, schema.plan_configs.plan))
    .where(eq(schema.companies.id, investigation.company_id))
    .get()
  const maxQuestionsPerWorker = planCfgWh?.max_questions_per_worker ?? -1

  // Teto de custo de IA â€” encerra o worker em vez de seguir gastando
  const orcamentoWh = await canSpendOnAi(investigation.company_id)
  if (!orcamentoWh.ok) {
    await db
      .update(schema.investigation_workers)
      .set({ status: 'saturated' })
      .where(eq(schema.investigation_workers.id, iw.id))
    await logWarn('whatsapp/process-webhook', 'Teto de custo do plano atingido â€” worker encerrado', {
      companyId: investigation.company_id,
      investigationId: iw.investigation_id,
    })
    return
  }

  let engineOutput
  try {
    engineOutput = await runInvestigationEngine({
      problemDescription: investigation.problem_description,
      workerRole: worker.role,
      workerRoleDescription: worker.role_description ?? '',
      messageHistory,
      reportedFacts,
      pendingValidations,
      managerNotes,
      investigationContext,
      maxQuestionsPerWorker,
    })
  } catch (error) {
    console.error('[process-webhook] investigation engine error', error)
    return
  }

  if (engineOutput.action === 'ask_question') {
    // Atualizar key_points_extracted na mensagem inbound salva
    await db
      .update(schema.messages)
      .set({ key_points_extracted: JSON.stringify(engineOutput.key_points_extracted) })
      .where(eq(schema.messages.id, savedMessageId))

    // Salvar pending_hints para que outros workers recebam como pendingValidations
    const hints = engineOutput.cross_validation_hints
    await db
      .update(schema.investigation_workers)
      .set({
        saturation_score: engineOutput.saturation_score,
        ...(hints.length > 0 ? { pending_hints: JSON.stringify(hints) } : {}),
      })
      .where(eq(schema.investigation_workers.id, iw.id))

    // Salvar pergunta de saÃ­da no banco
    await db.insert(schema.messages).values({
      id: crypto.randomUUID(),
      investigation_id: iw.investigation_id,
      worker_id: worker.id,
      direction: 'outbound',
      content_type: 'text',
      content: engineOutput.next_question,
      transcription_status: 'not_applicable',
      retry_count: 0,
    })

    // Enviar pelo canal correto â€” falha aqui NÃƒO aborta o fluxo
    const sendMessage = worker.whatsapp_number.startsWith('tg_')
      ? sendTelegramMessage({ chatId: worker.whatsapp_number.replace('tg_', ''), text: engineOutput.next_question })
      : sendWhatsAppMessage({ number: worker.whatsapp_number, text: engineOutput.next_question })

    sendMessage.catch(err => {
      console.error('[process-webhook] send failed (non-fatal)', err)
    })

    return
  }

  if (engineOutput.action === 'mark_saturated') {
    await db
      .update(schema.messages)
      .set({ key_points_extracted: JSON.stringify(engineOutput.key_points_extracted) })
      .where(eq(schema.messages.id, savedMessageId))

    const hintsSat = engineOutput.cross_validation_hints
    await db
      .update(schema.investigation_workers)
      .set({
        status: 'saturated',
        saturation_score: engineOutput.saturation_score,
        ...(hintsSat.length > 0 ? { pending_hints: JSON.stringify(hintsSat) } : {}),
      })
      .where(eq(schema.investigation_workers.id, iw.id))

    // Encerra a coleta quando todos terminaram. O relatório NÃO sai daqui —
    // quem decide encerrar e gerar é o gestor, pelo botão no painel.
    await marcarSaturadaSeTodosTerminaram(iw.investigation_id)
  }
}
