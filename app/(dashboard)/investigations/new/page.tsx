import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NewInvestigationClient } from './NewInvestigationClient'
import type { WorkerOption } from '@/components/investigations/InvestigationForm'
import { redirect } from 'next/navigation'

export default async function NewInvestigationPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const workers = await db
    .select({
      id: schema.workers.id,
      anonymous_alias: schema.workers.anonymous_alias,
      role: schema.workers.role,
    })
    .from(schema.workers)
    .where(
      and(
        eq(schema.workers.company_id, session.companyId),
        eq(schema.workers.is_active, true)
      )
    )
    .orderBy(schema.workers.created_at)

  const workerOptions: WorkerOption[] = workers.map(w => ({
    id: w.id,
    anonymous_alias: w.anonymous_alias,
    role: w.role,
  }))

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold mb-6">Nova investigação</h1>
      <NewInvestigationClient workers={workerOptions} />
    </div>
  )
}
