import { createClient } from '@/lib/supabase/server'

interface InvestigationRow {
  id: string
  title: string
  status: string
  created_at: string
  investigation_workers: { id: string }[]
}

interface ManagerRow {
  company_id: string
}

interface WorkerValidationRow {
  id: string
  company_id: string
}

export async function GET(): Promise<Response> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

    const { data, error } = await supabase
      .from('investigations')
      .select('id, title, status, created_at, investigation_workers(id)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[investigations GET]', error)
      return Response.json({ error: 'Erro interno' }, { status: 500 })
    }

    const investigations = ((data ?? []) as unknown as InvestigationRow[]).map(inv => ({
      id: inv.id,
      title: inv.title,
      status: inv.status,
      created_at: inv.created_at,
      worker_count: inv.investigation_workers.length,
    }))

    return Response.json({ data: investigations }, { status: 200 })
  } catch (error) {
    console.error('[investigations GET]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json() as Record<string, unknown>
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const problem_description = typeof body.problem_description === 'string' ? body.problem_description.trim() : ''
    const worker_ids = Array.isArray(body.worker_ids) ? body.worker_ids as string[] : []

    if (!title) return Response.json({ error: 'O título é obrigatório.' }, { status: 400 })
    if (problem_description.length < 20) {
      return Response.json({ error: 'A descrição do problema deve ter pelo menos 20 caracteres.' }, { status: 400 })
    }
    if (worker_ids.length < 1) {
      return Response.json({ error: 'Selecione pelo menos um worker.' }, { status: 400 })
    }

    // Buscar company_id do manager
    const { data: managerData } = await supabase
      .from('managers')
      .select('company_id')
      .eq('id', user.id)
      .single()

    const manager = managerData as ManagerRow | null
    if (!manager) return Response.json({ error: 'Manager não encontrado.' }, { status: 404 })

    // Validar que todos os worker_ids pertencem à company
    const { data: workersData } = await supabase
      .from('workers')
      .select('id, company_id')
      .in('id', worker_ids)
      .eq('company_id', manager.company_id)
      .eq('is_active', true)

    const validWorkers = (workersData ?? []) as WorkerValidationRow[]
    if (validWorkers.length !== worker_ids.length) {
      return Response.json({ error: 'Um ou mais workers são inválidos.' }, { status: 400 })
    }

    // Criar investigação
    const { data: invData, error: invError } = await supabase
      .from('investigations')
      .insert({
        company_id: manager.company_id,
        manager_id: user.id,
        title,
        problem_description,
        status: 'pending',
      })
      .select('id, title, status, created_at')
      .single()

    if (invError || !invData) {
      console.error('[investigations POST]', invError)
      return Response.json({ error: 'Erro ao criar investigação.' }, { status: 500 })
    }

    const investigation = invData as { id: string; title: string; status: string; created_at: string }

    // Criar registros em investigation_workers
    const iwInserts = worker_ids.map(wid => ({
      investigation_id: investigation.id,
      worker_id: wid,
      status: 'pending',
      saturation_score: 0,
    }))

    const { error: iwError } = await supabase.from('investigation_workers').insert(iwInserts)
    if (iwError) {
      console.error('[investigations POST iw]', iwError)
      return Response.json({ error: 'Erro ao associar workers.' }, { status: 500 })
    }

    return Response.json({ data: investigation }, { status: 201 })
  } catch (error) {
    console.error('[investigations POST]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
