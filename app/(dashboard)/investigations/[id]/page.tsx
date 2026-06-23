import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { InvestigationDetail } from '@/components/investigations/InvestigationDetail'
import type { InvestigationData, WorkerParticipant, MessageItem } from '@/components/investigations/InvestigationDetail'

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

export default async function InvestigationPage({ params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: invData, error }, { data: iwData }, { data: msgData }] = await Promise.all([
    supabase
      .from('investigations')
      .select('id, title, problem_description, status, created_at, completed_at')
      .eq('id', id)
      .single(),
    supabase
      .from('investigation_workers')
      .select('id, worker_id, status, saturation_score, workers(anonymous_alias, role)')
      .eq('investigation_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('messages')
      .select('id, worker_id, direction, content, content_type, created_at')
      .eq('investigation_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (error || !invData) notFound()

  const investigation = invData as InvestigationData

  const workers: WorkerParticipant[] = ((iwData ?? []) as unknown as IWRow[]).map(row => {
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

  const messages: MessageItem[] = ((msgData ?? []) as MessageRow[])
    .filter(m => m.content !== null)
    .map(m => ({
      id: m.id,
      worker_id: m.worker_id,
      direction: m.direction,
      content: m.content as string,
      content_type: m.content_type,
      created_at: m.created_at,
    }))

  return (
    <InvestigationDetail
      investigation={investigation}
      workers={workers}
      messages={messages}
    />
  )
}
