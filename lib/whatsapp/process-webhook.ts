import { db, schema } from '@/lib/db'
import { eq, and, ne, isNotNull } from 'drizzle-orm'
import { parseWhatsAppPayload, resolveMetaMediaUrl } from './parser'
import { sendWhatsAppMessage } from './sender'
import { sendTelegramMessage } from '@/lib/telegram/sender'
import { downloadAudio, uploadAudioToStorage, transcribeAudio } from '@/lib/audio/transcriber'
import { runInvestigationEngine } from '@/lib/ai/investigation-engine'
import { generateReport } from '@/lib/ai/report-generator'
import type { MessageHistoryEntry, ReportMessageEntry, WorkerAlias } from '@/lib/ai/types'
import crypto from 'crypto'

// ─── Lógica central — aceita payload bruto do Meta WhatsApp ──────────────────

export async function processWebhookPayload(body: unknown): Promise<void> {
  const parsed = parseWhatsAppPayload(body)
  if (!parsed || parsed.isFromMe) return

  const { phoneNumber, messageId, type, content } = parsed
  await processInboundMessage({ phoneNumber, messageId, type, content })
}

// ─── Lógica central — aceita parâmetros já extraídos ─────────────────────────
// Usada tanto pelo webhook real quanto pela rota de simulação de dev.

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
  // Deduplicação — raw_whatsapp_id tem constraint UNIQUE
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

  // Confirmar que a investigação está ativa
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

  // ── Processar mensagem ──────────────────────────────────────────────────────

  let messageContent: string | null = null
  let audioUrl: string | null = null
  let transcriptionStatus = 'not_applicable'
  let savedMessageId: string | null = null

  if (type === 'audio') {
    // Verificar retry count de falhas anteriores deste worker nesta investigação
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
      // Para Meta API: content é o Media ID — resolver para URL de download
      // Para Telegram: content já é a URL direta (resolvida no webhook)
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

          const retryText = 'Não consegui entender bem o áudio 🎙️\n\nPode repetir sua resposta? Tente falar um pouco mais devagar e em um local mais silencioso.\n\nSe preferir, pode responder por escrito também.'
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

  // ── Construir crossValidationContext ────────────────────────────────────────
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

  const crossValidationContext = otherMessages
    .flatMap(m => {
      try {
        return (JSON.parse(m.key_points_extracted ?? '[]') as string[])
      } catch {
        return []
      }
    })
    .join('; ')

  // ── Buscar histórico de mensagens deste worker ───────────────────────────────
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

  // ── Chamar o engine de investigação ─────────────────────────────────────────
  // manager_notes: observações do gestor para este participante nesta investigação
  // A IA incorpora nas próximas perguntas sem atribuir ao gestor
  const managerNotes = iw.manager_notes ?? ''

  let engineOutput
  try {
    engineOutput = await runInvestigationEngine({
      problemDescription: investigation.problem_description,
      workerRole: worker.role,
      workerRoleDescription: worker.role_description ?? '',
      messageHistory,
      crossValidationContext,
      managerNotes,
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

    // Atualizar saturation_score
    await db
      .update(schema.investigation_workers)
      .set({ saturation_score: engineOutput.saturation_score })
      .where(eq(schema.investigation_workers.id, iw.id))

    // Salvar pergunta de saída no banco
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

    // Enviar pelo canal correto — falha aqui NÃO aborta o fluxo
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

    await db
      .update(schema.investigation_workers)
      .set({ status: 'saturated', saturation_score: engineOutput.saturation_score })
      .where(eq(schema.investigation_workers.id, iw.id))

    // Verificar se TODOS os workers desta investigação estão saturados ou unresponsive
    const allIws = await db
      .select({ status: schema.investigation_workers.status })
      .from(schema.investigation_workers)
      .where(eq(schema.investigation_workers.investigation_id, iw.investigation_id))

    const allDone = allIws.every(
      w => w.status === 'saturated' || w.status === 'unresponsive'
    )

    if (!allDone) return

    // Atualizar investigação para 'saturated' antes de gerar relatório
    await db
      .update(schema.investigations)
      .set({ status: 'saturated' })
      .where(eq(schema.investigations.id, iw.investigation_id))

    // ── Gerar relatório ──────────────────────────────────────────────────────

    // Buscar todas as mensagens da investigação
    const allMsgs = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.investigation_id, iw.investigation_id))
      .orderBy(schema.messages.created_at)

    // Buscar workers da investigação com seus aliases
    const allIwsWithWorkers = await db
      .select({
        worker_id: schema.investigation_workers.worker_id,
        alias: schema.workers.anonymous_alias,
        role: schema.workers.role,
      })
      .from(schema.investigation_workers)
      .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
      .where(eq(schema.investigation_workers.investigation_id, iw.investigation_id))

    const workerMap = new Map<string, { alias: string; role: string }>()
    for (const row of allIwsWithWorkers) {
      workerMap.set(row.worker_id, { alias: row.alias, role: row.role })
    }

    const reportMessages: ReportMessageEntry[] = allMsgs
      .filter(m => m.content !== null)
      .map(m => {
        const wInfo = workerMap.get(m.worker_id) ?? { alias: 'Desconhecido', role: '' }
        let keyPoints: string[] | undefined
        try {
          keyPoints = m.key_points_extracted
            ? (JSON.parse(m.key_points_extracted) as string[])
            : undefined
        } catch {
          keyPoints = undefined
        }
        return {
          alias: wInfo.alias,
          role: wInfo.role,
          direction: m.direction as 'outbound' | 'inbound',
          content: m.content as string,
          key_points_extracted: keyPoints,
        }
      })

    const workerAliases: WorkerAlias[] = Array.from(workerMap.values())

    try {
      const report = await generateReport({
        investigation: {
          title: investigation.title,
          problem_description: investigation.problem_description,
        },
        allMessages: reportMessages,
        workerAliases,
      })

      // Upsert — pode já existir se regenerado manualmente
      const existingReport = await db
        .select({ id: schema.reports.id })
        .from(schema.reports)
        .where(eq(schema.reports.investigation_id, iw.investigation_id))
        .get()

      const reportValues = {
        investigation_id: iw.investigation_id,
        root_cause: report.root_cause,
        confidence_score: report.confidence_score,
        confidence_justification: report.confidence_justification ?? null,
        ishikawa_breakdown: JSON.stringify(report.ishikawa_breakdown),
        sources_summary: JSON.stringify(report.sources_summary),
        recommendations: JSON.stringify(report.recommendations),
        generated_at: new Date().toISOString(),
      }

      if (existingReport) {
        await db
          .update(schema.reports)
          .set(reportValues)
          .where(eq(schema.reports.investigation_id, iw.investigation_id))
      } else {
        await db.insert(schema.reports).values({ id: crypto.randomUUID(), ...reportValues })
      }
    } catch (error) {
      console.error('[process-webhook] report generation error (non-fatal — regenerate via API)', error)
    }

    // Marcar como completed — independente do sucesso da geração do relatório
    await db
      .update(schema.investigations)
      .set({ status: 'completed', completed_at: new Date().toISOString() })
      .where(eq(schema.investigations.id, iw.investigation_id))
  }
}

