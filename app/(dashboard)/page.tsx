import { createClient } from '@/lib/supabase/server'
import { HomeClient } from './HomeClient'
import type { InvestigationSummary } from '@/components/investigations/InvestigationCard'
import type { WorkerOption } from '@/components/investigations/InvestigationForm'

interface InvestigationRow {
  id: string
  title: string
  status: string
  created_at: string
  investigation_workers: { id: string }[]
}

interface WorkerRow {
  id: string
  anonymous_alias: string
  role: string
}

export default async function HomePage() {
  const supabase = await createClient()

  const [{ data: invData }, { data: workerData }] = await Promise.all([
    supabase
      .from('investigations')
      .select('id, title, status, created_at, investigation_workers(id)')
      .order('created_at', { ascending: false }),
    supabase
      .from('workers')
      .select('id, anonymous_alias, role')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
  ])

  const investigations: InvestigationSummary[] = ((invData ?? []) as unknown as InvestigationRow[]).map(inv => ({
    id: inv.id,
    title: inv.title,
    status: inv.status,
    created_at: inv.created_at,
    worker_count: inv.investigation_workers.length,
  }))

  const workers: WorkerOption[] = ((workerData ?? []) as WorkerRow[]).map(w => ({
    id: w.id,
    anonymous_alias: w.anonymous_alias,
    role: w.role,
  }))

  return <HomeClient investigations={investigations} workers={workers} />
}
