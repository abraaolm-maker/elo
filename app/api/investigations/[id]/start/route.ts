import { createClient } from '@/lib/supabase/server'
import { runInvestigationEngine } from '@/lib/ai/investigation-engine'
import { sendWhatsAppMessage } from '@/lib/whatsapp/sender'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface InvestigationRow {
  id: string
  title: string
  problem_description: string
  status: string
}

interface IWRow {
  id: string
  worker_id: string
  workers: { anonymous_alias: string; role: string; role_description: string | null; whatsapp_number: string } | null
}

export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

    // Buscar investigação e validar status
    const { data: invData, error: invError } = await supabase
      .from('investigations')
      .select('id, title, problem_description, status')
      .eq('id', id)
      .single()

    if (invError || !invData) {
      return Response.json({ error: 'Investigação não encontrada.' }, { status: 404 })
    }

    const investigation = invData as InvestigationRow
    if (investigation.status !== 'pending') {
      return Response.json({ error: 'Apenas investigações com status pending podem ser iniciadas.' }, { status: 400 })
    }

    // Atualizar investigação para 'active'
    await supabase
      .from('investigations')
      .update({ status: 'active' })
      .eq('id', id)

    // Buscar workers participantes com dados necessários para o engine
    const { data: iwData } = await supabase
      .from('investigation_workers')
      .select('id, worker_id, workers(anonymous_alias, role, role_description, whatsapp_number)')
      .eq('investigation_id', id)

    const investigationWorkers = ((iwData ?? []) as unknown as IWRow[])

    // Atualizar todos para 'active' em lote
    await supabase
      .from('investigation_workers')
      .update({ status: 'active' })
      .eq('investigation_id', id)

    // Para cada worker: gerar primeira pergunta via IA e enviar via WhatsApp
    const sendFirstQuestion = async (iw: IWRow): Promise<void> => {
      const worker = Array.isArray(iw.workers) ? iw.workers[0] : iw.workers
      if (!worker) return

      let engineOutput
      try {
        engineOutput = await runInvestigationEngine({
          problemDescription: investigation.problem_description,
          workerRole: worker.role,
          workerRoleDescription: worker.role_description ?? '',
          messageHistory: [],
          crossValidationContext: '',
        })
      } catch (error) {
        console.error('[investigations start] engine error for worker', iw.worker_id, error)
        return
      }

      if (engineOutput.action !== 'ask_question') return

      // Salvar outbound message
      const { error: msgErr } = await supabase.from('messages').insert({
        investigation_id: id,
        worker_id: iw.worker_id,
        direction: 'outbound',
        content_type: 'text',
        content: engineOutput.next_question,
        transcription_status: 'not_applicable',
        retry_count: 0,
      })

      if (msgErr) {
        console.error('[investigations start] message insert error', msgErr)
        return
      }

      // Enviar via WhatsApp
      await sendWhatsAppMessage({
        number: worker.whatsapp_number,
        text: engineOutput.next_question,
      })
    }

    // Enviar em paralelo (resiliente: um erro não bloqueia os outros)
    await Promise.allSettled(investigationWorkers.map(sendFirstQuestion))

    // Retornar investigação atualizada
    const { data: updated } = await supabase
      .from('investigations')
      .select('id, title, status, created_at')
      .eq('id', id)
      .single()

    return Response.json({ data: updated }, { status: 200 })
  } catch (error) {
    console.error('[investigations start]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
