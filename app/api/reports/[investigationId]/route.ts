import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateReport } from '@/lib/ai/report-generator'
import type { ReportMessageEntry, WorkerAlias } from '@/lib/ai/types'

// ─── Tipos locais ─────────────────────────────────────────────────────────────

interface ManagerRow {
  company_id: string
}

interface InvestigationRow {
  id: string
  title: string
  problem_description: string
  status: string
  company_id: string
}

interface ReportRow {
  id: string
  investigation_id: string
  root_cause: string
  confidence_score: number
  confidence_justification: string | null
  ishikawa_breakdown: unknown
  sources_summary: unknown
  recommendations: string[]
  generated_at: string
}

interface IWWithWorker {
  worker_id: string
  workers: { anonymous_alias: string; role: string } | { anonymous_alias: string; role: string }[] | null
}

interface MessageRow {
  id: string
  worker_id: string
  direction: string
  content: string | null
  key_points_extracted: unknown
}

// ─── GET — buscar relatório existente ────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ investigationId: string }> }
) {
  try {
    const { investigationId } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

    // Verificar que a investigação pertence à company do manager
    const { data: manager } = await supabase
      .from('managers')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!manager) return Response.json({ error: 'Manager não encontrado' }, { status: 403 })

    const { data: investigation } = await supabase
      .from('investigations')
      .select('id, company_id')
      .eq('id', investigationId)
      .single()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    const inv = investigation as { id: string; company_id: string }
    const mgr = manager as ManagerRow

    if (inv.company_id !== mgr.company_id) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const { data: report } = await supabase
      .from('reports')
      .select('id, investigation_id, root_cause, confidence_score, confidence_justification, ishikawa_breakdown, sources_summary, recommendations, generated_at')
      .eq('investigation_id', investigationId)
      .single()

    if (!report) {
      return Response.json({ data: null }, { status: 200 })
    }

    return Response.json({ data: report as ReportRow }, { status: 200 })
  } catch (error) {
    console.error('[GET /api/reports/[investigationId]]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ─── POST — gerar ou regenerar relatório manualmente ─────────────────────────

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ investigationId: string }> }
) {
  try {
    const { investigationId } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: manager } = await supabase
      .from('managers')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!manager) return Response.json({ error: 'Manager não encontrado' }, { status: 403 })

    const { data: investigation } = await supabase
      .from('investigations')
      .select('id, title, problem_description, status, company_id')
      .eq('id', investigationId)
      .single()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    const inv = investigation as InvestigationRow
    const mgr = manager as ManagerRow

    if (inv.company_id !== mgr.company_id) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 })
    }

    if (inv.status !== 'completed' && inv.status !== 'saturated') {
      return Response.json(
        { error: 'A investigação precisa estar concluída ou saturada para gerar o relatório' },
        { status: 400 }
      )
    }

    // Buscar workers participantes com alias e role
    const { data: iwData } = await supabase
      .from('investigation_workers')
      .select('worker_id, workers(anonymous_alias, role)')
      .eq('investigation_id', investigationId)

    const iwRows = (iwData ?? []) as unknown as IWWithWorker[]

    const aliasMap = new Map<string, { alias: string; role: string }>()
    const workerAliases: WorkerAlias[] = []

    for (const row of iwRows) {
      const w = Array.isArray(row.workers) ? row.workers[0] : row.workers
      if (w) {
        aliasMap.set(row.worker_id, { alias: w.anonymous_alias, role: w.role })
        workerAliases.push({ alias: w.anonymous_alias, role: w.role })
      }
    }

    // Buscar todas as mensagens da investigação
    const { data: msgData } = await supabase
      .from('messages')
      .select('id, worker_id, direction, content, key_points_extracted')
      .eq('investigation_id', investigationId)
      .order('created_at', { ascending: true })

    const msgRows = (msgData ?? []) as MessageRow[]

    const allMessages: ReportMessageEntry[] = msgRows
      .filter(m => m.content !== null)
      .map(m => {
        const workerInfo = aliasMap.get(m.worker_id)
        return {
          alias: workerInfo?.alias ?? 'Colaborador',
          role: workerInfo?.role ?? '',
          direction: m.direction as 'outbound' | 'inbound',
          content: m.content as string,
          key_points_extracted: Array.isArray(m.key_points_extracted)
            ? (m.key_points_extracted as string[])
            : undefined,
        }
      })

    const reportOutput = await generateReport({
      investigation: { title: inv.title, problem_description: inv.problem_description },
      allMessages,
      workerAliases,
    })

    // Upsert por investigation_id
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: saved, error: upsertError } = await admin
      .from('reports')
      .upsert(
        {
          investigation_id: investigationId,
          root_cause: reportOutput.root_cause,
          confidence_score: reportOutput.confidence_score,
          confidence_justification: reportOutput.confidence_justification,
          ishikawa_breakdown: reportOutput.ishikawa_breakdown,
          sources_summary: reportOutput.sources_summary,
          recommendations: reportOutput.recommendations,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'investigation_id' }
      )
      .select('id, investigation_id, root_cause, confidence_score, confidence_justification, ishikawa_breakdown, sources_summary, recommendations, generated_at')
      .single()

    if (upsertError) {
      console.error('[POST /api/reports/[investigationId]] upsert error', upsertError)
      return Response.json({ error: 'Erro ao salvar relatório' }, { status: 500 })
    }

    return Response.json({ data: saved as ReportRow }, { status: 200 })
  } catch (error) {
    console.error('[POST /api/reports/[investigationId]]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
