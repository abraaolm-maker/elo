import { createClient } from '@/lib/supabase/server'
import { WorkersClient } from './WorkersClient'

interface WorkerRow {
  id: string
  anonymous_alias: string
  role: string
  role_description: string | null
  whatsapp_number: string
  is_active: boolean
  created_at: string
}

export interface MaskedWorker {
  id: string
  anonymous_alias: string
  role: string
  role_description: string | null
  whatsapp_masked: string
  is_active: boolean
  created_at: string
}

function maskNumber(phone: string): string {
  return `****${phone.slice(-4)}`
}

export default async function WorkersPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('workers')
    .select('id, anonymous_alias, role, role_description, whatsapp_number, is_active, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">Workers</h1>
        <p className="text-red-600 text-sm">Erro ao carregar workers.</p>
      </div>
    )
  }

  const workers: MaskedWorker[] = (data as WorkerRow[]).map(w => ({
    id: w.id,
    anonymous_alias: w.anonymous_alias,
    role: w.role,
    role_description: w.role_description,
    whatsapp_masked: maskNumber(w.whatsapp_number),
    is_active: w.is_active,
    created_at: w.created_at,
  }))

  return <WorkersClient initialWorkers={workers} />
}
