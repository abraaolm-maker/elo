import { createClient } from '@/lib/supabase/server'
import { NewInvestigationClient } from './NewInvestigationClient'
import type { WorkerOption } from '@/components/investigations/InvestigationForm'

interface WorkerRow {
  id: string
  anonymous_alias: string
  role: string
}

export default async function NewInvestigationPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('workers')
    .select('id, anonymous_alias, role')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  const workers: WorkerOption[] = ((data ?? []) as WorkerRow[]).map(w => ({
    id: w.id,
    anonymous_alias: w.anonymous_alias,
    role: w.role,
  }))

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold mb-6">Nova investigação</h1>
      <NewInvestigationClient workers={workers} />
    </div>
  )
}
