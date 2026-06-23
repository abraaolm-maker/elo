import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface InvestigationRow {
  id: string
  title: string
  problem_description: string
  status: string
  created_at: string
  completed_at: string | null
}

interface IWRow {
  id: string
  worker_id: string
  status: string
  saturation_score: number
  workers: { anonymous_alias: string; role: string } | { anonymous_alias: string; role: string }[] | null
}

interface MessageRow {
  id: string
  worker_id: string
  direction: string
  content: string | null
  content_type: string
  created_at: string
}

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

    // Buscar investigação (RLS filtra por company)
    const { data: invData, error: invError } = await supabase
      .from('investigations')
      .select('id, title, problem_description, status, created_at, completed_at')
      .eq('id', id)
      .single()

    if (invError || !invData) {
      return Response.json({ error: 'Investigação não encontrada.' }, { status: 404 })
    }

    const investigation = invData as InvestigationRow

    // Buscar workers participantes com alias e cargo
    const { data: iwData } = await supabase
      .from('investigation_workers')
      .select('id, worker_id, status, saturation_score, workers(anonymous_alias, role)')
      .eq('investigation_id', id)
      .order('created_at', { ascending: true })

    const workers = ((iwData ?? []) as unknown as IWRow[]).map(row => {
      const w = Array.isArray(row.workers) ? row.workers[0] : row.workers
      return {
        iw_id: row.id,
        worker_id: row.worker_id,
        alias: w?.anonymous_alias ?? 'Desconhecido',
        role: w?.role ?? '',
        status: row.status,
        saturation_score: row.saturation_score,
      }
    })

    // Buscar mensagens (sem whatsapp_number)
    const { data: msgData } = await supabase
      .from('messages')
      .select('id, worker_id, direction, content, content_type, created_at')
      .eq('investigation_id', id)
      .order('created_at', { ascending: true })

    const messages = ((msgData ?? []) as MessageRow[]).filter(m => m.content !== null)

    return Response.json({
      data: { investigation, workers, messages },
    }, { status: 200 })
  } catch (error) {
    console.error('[investigations/:id GET]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
