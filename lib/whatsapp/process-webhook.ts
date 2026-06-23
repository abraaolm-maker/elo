import { createClient } from '@supabase/supabase-js'
import { parseWhatsAppPayload } from './parser'
import { sendWhatsAppMessage } from './sender'
import { downloadAudio, uploadAudioToStorage, transcribeAudio } from '@/lib/audio/transcriber'
import { runInvestigationEngine } from '@/lib/ai/investigation-engine'
import { generateReport } from '@/lib/ai/report-generator'
import type { MessageHistoryEntry, ReportMessageEntry, WorkerAlias } from '@/lib/ai/types'

// ─── Tipos locais ─────────────────────────────────────────────────────────────

interface WorkerRow {
  id: string
  company_id: string
  role: string
  role_description: string | null
  whatsapp_number: string
  anonymous_alias: string
}

interface InvestigationWorkerRow {
  id: string
  investigation_id: string
  saturation_score: number
  status: string
}

interface InvestigationRow {
  id: string
  problem_description: string
  status: string
  company_id: string
  title: string
}

interface MessageRow {
  id: string
  direction: string
  content: string | null
  key_points_extracted: unknown
  worker_id: string
}

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role env vars missing')
  return createClient(url, key)
}

// ─── Lógica central — aceita payload bruto do Evolution API ──────────────────

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
  const db = getAdminClient()

  // Deduplicação
  const { data: existing } = await db
    .from('messages')
    .select('id')
    .eq('raw_whatsapp_id', messageId)
    .maybeSingle()
  if (existing) return

  // Buscar worker pelo phoneNumber
  const { data: workerData } = await db
    .from('workers')
    .select('id, company_id, role, role_description, whatsapp_number, anonymous_alias')
    .eq('whatsapp_number', phoneNumber)
    .eq('is_active', true)
    .maybeSingle()
  if (!workerData) return
  const worker = workerData as WorkerRow

  // Buscar investigation_worker ativo
  const { data: iwData } = await db
    .from('investigation_workers')
    .select('id, investigation_id, saturation_score, status')
    .eq('worker_id', worker.id)
    .eq('status', 'active')
    .maybeSingle()
  if (!iwData) return
  const iw = iwData as InvestigationWorkerRow

  // Confirmar que a investigação está ativa
  const { data: invData } = await db
    .from('investigations')
    .select('id, problem_description, status, company_id, title')
    .eq('id', iw.investigation_id)
    .eq('status', 'active')
    .maybeSingle()
  if (!invData) return
  const investigation = invData as InvestigationRow

  // Processar mensagem
  let messageContent: string | null = null
  let audioUrl: string | null = null
  let transcriptionStatus = 'not_applicable'
  let savedMessageId: string | null = null

  if (type === 'audio') {
    const { data: lastFailedMsg } = await db
      .from('messages')
      .select('retry_count')
      .eq('worker_id', worker.id)
      .eq('investigation_id', iw.investigation_id)
      .eq('transcription_status', 'failed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const currentRetryCount = ((lastFailedMsg as { retry_count: number } | null)?.retry_count ?? 0)

    try {
      const audioBuffer = await downloadAudio(content)
      const fileName = `${iw.investigation_id}/${worker.id}/${messageId}.ogg`
      audioUrl = await uploadAudioToStorage(audioBuffer, fileName)
      const { text, reliable } = await transcribeAudio(audioBuffer)

      if (!reliable) {
        if (currentRetryCount < 2) {
          const { data: savedMsg } = await db
            .from('messages')
            .insert({
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
            .select('id')
            .single()

          if (savedMsg) savedMessageId = (savedMsg as { id: string }).id

          await sendWhatsAppMessage({
            number: worker.whatsapp_number,
            text: 'Não consegui entender bem o áudio 🎙️\n\nPode repetir sua resposta? Tente falar um pouco mais devagar e em um local mais silencioso.\n\nSe preferir, pode responder por escrito também.',
          })
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
    const { data: savedMsg, error: insertErr } = await db
      .from('messages')
      .insert({
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
      .select('id')
      .single()

    if (insertErr || !savedMsg) {
      console.error('[process-webhook] failed to save inbound message', insertErr)
      return
    }
    savedMessageId = (savedMsg as { id: string }).id
  }

  if (!messageContent) return

  // Construir crossValidationContext
  const { data: otherMessages } = await db
    .from('messages')
    .select('key_points_extracted')
    .eq('investigation_id', iw.investigation_id)
    .eq('direction', 'inbound')
    .neq('worker_id', worker.id)
    .not('key_points_extracted', 'is', null)

  const crossValidationContext = ((otherMessages ?? []) as { key_points_extracted: unknown }[])
    .flatMap(m => (m.key_points_extracted as string[] | null) ?? [])
    .join('; ')

  // Buscar messageHistory deste worker
  const { data: rawHistory } = await db
    .from('messages')
    .select('direction, content')
    .eq('investigation_id', iw.investigation_id)
    .eq('worker_id', worker.id)
    .order('created_at', { ascending: true })

  const messageHistory: MessageHistoryEntry[] = ((rawHistory ?? []) as { direction: string; content: string | null }[])
    .filter(m => m.content !== null)
    .map(m => ({
      direction: m.direction as 'outbound' | 'inbound',
      content: m.content as string,
    }))

  // Chamar o engine
  let engineOutput
  try {
    engineOutput = await runInvestigationEngine({
      problemDescription: investigation.problem_description,
      workerRole: worker.role,
      workerRoleDescription: worker.role_description ?? '',
      messageHistory,
      crossValidationContext,
    })
  } catch (error) {
    console.error('[process-webhook] investigation engine error', error)
    return
  }

  if (engineOutput.action === 'ask_question') {
    await db
      .from('messages')
      .update({ key_points_extracted: engineOutput.key_points_extracted })
      .eq('id', savedMessageId)

    await db
      .from('investigation_workers')
      .update({ saturation_score: engineOutput.saturation_score })
      .eq('id', iw.id)

    await db.from('messages').insert({
      investigation_id: iw.investigation_id,
      worker_id: worker.id,
      direction: 'outbound',
      content_type: 'text',
      content: engineOutput.next_question,
      transcription_status: 'not_applicable',
      retry_count: 0,
    })

    // Enviar via WhatsApp — falha aqui NÃO aborta o fluxo.
    // A pergunta já está salva no banco; o gestor pode ver no dashboard.
    sendWhatsAppMessage({
      number: worker.whatsapp_number,
      text: engineOutput.next_question,
    }).catch(err => {
      console.error('[process-webhook] whatsapp send failed (non-fatal)', err)
    })

    return
  }

  if (engineOutput.action === 'mark_saturated') {
    await db
      .from('messages')
      .update({ key_points_extracted: engineOutput.key_points_extracted })
      .eq('id', savedMessageId)

    await db
      .from('investigation_workers')
      .update({ status: 'saturated', saturation_score: engineOutput.saturation_score })
      .eq('id', iw.id)

    const { data: allIws } = await db
      .from('investigation_workers')
      .select('status')
      .eq('investigation_id', iw.investigation_id)

    const allDone = ((allIws ?? []) as { status: string }[]).every(
      w => w.status === 'saturated' || w.status === 'unresponsive'
    )

    if (!allDone) return

    await db
      .from('investigations')
      .update({ status: 'saturated' })
      .eq('id', iw.investigation_id)

    // Buscar tudo para o relatório
    const { data: allMsgs } = await db
      .from('messages')
      .select('direction, content, key_points_extracted, worker_id')
      .eq('investigation_id', iw.investigation_id)
      .order('created_at', { ascending: true })

    const { data: allIwsWithWorkers } = await db
      .from('investigation_workers')
      .select('worker_id, workers(anonymous_alias, role)')
      .eq('investigation_id', iw.investigation_id)

    const workerMap = new Map<string, { alias: string; role: string }>()
    for (const row of (allIwsWithWorkers ?? []) as unknown as { worker_id: string; workers: { anonymous_alias: string; role: string } | { anonymous_alias: string; role: string }[] | null }[]) {
      const w = Array.isArray(row.workers) ? row.workers[0] : row.workers
      if (w) workerMap.set(row.worker_id, { alias: w.anonymous_alias, role: w.role })
    }

    const reportMessages: ReportMessageEntry[] = ((allMsgs ?? []) as MessageRow[])
      .filter(m => m.content !== null)
      .map(m => {
        const wInfo = workerMap.get(m.worker_id) ?? { alias: 'Desconhecido', role: '' }
        return {
          alias: wInfo.alias,
          role: wInfo.role,
          direction: m.direction as 'outbound' | 'inbound',
          content: m.content as string,
          key_points_extracted: (m.key_points_extracted as string[] | null) ?? undefined,
        }
      })

    const workerAliases: WorkerAlias[] = Array.from(workerMap.values())

    const { data: invFull } = await db
      .from('investigations')
      .select('title, problem_description')
      .eq('id', iw.investigation_id)
      .single()

    if (!invFull) {
      console.error('[process-webhook] could not fetch investigation for report')
      return
    }

    const invFullTyped = invFull as { title: string; problem_description: string }

    // Gerar e salvar relatório.
    // Se falhar, a investigação ainda avança para 'completed' — o relatório pode
    // ser regenerado manualmente via POST /api/reports/[investigationId].
    try {
      const report = await generateReport({
        investigation: {
          title: invFullTyped.title,
          problem_description: invFullTyped.problem_description,
        },
        allMessages: reportMessages,
        workerAliases,
      })

      const { error: reportErr } = await db.from('reports').upsert(
        {
          investigation_id: iw.investigation_id,
          root_cause: report.root_cause,
          confidence_score: report.confidence_score,
          confidence_justification: report.confidence_justification,
          ishikawa_breakdown: report.ishikawa_breakdown,
          sources_summary: report.sources_summary,
          recommendations: report.recommendations,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'investigation_id' }
      )

      if (reportErr) {
        console.error('[process-webhook] failed to save report', reportErr)
        // Não retornar — ainda marcar como completed abaixo
      }
    } catch (error) {
      console.error('[process-webhook] report generation error (non-fatal — regenerate manually)', error)
      // Não retornar — investigação avança para completed sem relatório
    }

    // Marcar completed independente do sucesso da geração do relatório
    await db
      .from('investigations')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', iw.investigation_id)
  }
}
