import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { WorkersClient } from './WorkersClient'
import { redirect } from 'next/navigation'

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
  const session = await getSession()
  if (!session) redirect('/login')

  const workers = await db
    .select()
    .from(schema.workers)
    .where(eq(schema.workers.company_id, session.companyId))
    .orderBy(schema.workers.created_at)

  const masked: MaskedWorker[] = workers.map(w => ({
    id: w.id,
    anonymous_alias: w.anonymous_alias,
    role: w.role,
    role_description: w.role_description,
    whatsapp_masked: maskNumber(w.whatsapp_number),
    is_active: w.is_active,
    created_at: w.created_at,
  }))

  return <WorkersClient initialWorkers={masked} />
}
