import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { HomeClient } from './HomeClient'
import type { InvestigationSummary } from '@/components/investigations/InvestigationCard'
import type { WorkerOption } from '@/components/investigations/InvestigationForm'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [investigations, workers, iwCounts] = await Promise.all([
    db
      .select({
        id: schema.investigations.id,
        title: schema.investigations.title,
        status: schema.investigations.status,
        created_at: schema.investigations.created_at,
      })
      .from(schema.investigations)
      .where(eq(schema.investigations.company_id, session.companyId))
      .orderBy(schema.investigations.created_at),

    db
      .select({
        id: schema.workers.id,
        anonymous_alias: schema.workers.anonymous_alias,
        role: schema.workers.role,
      })
      .from(schema.workers)
      .where(eq(schema.workers.company_id, session.companyId))
      .orderBy(schema.workers.created_at),

    db
      .select({
        investigation_id: schema.investigation_workers.investigation_id,
        worker_id: schema.investigation_workers.worker_id,
      })
      .from(schema.investigation_workers),
  ])

  // Contar workers por investigação
  const countMap = new Map<string, number>()
  for (const iw of iwCounts) {
    countMap.set(iw.investigation_id, (countMap.get(iw.investigation_id) ?? 0) + 1)
  }

  const invSummaries: InvestigationSummary[] = investigations.map(inv => ({
    id: inv.id,
    title: inv.title,
    status: inv.status,
    created_at: inv.created_at,
    worker_count: countMap.get(inv.id) ?? 0,
  }))

  const workerOptions: WorkerOption[] = workers.map(w => ({
    id: w.id,
    anonymous_alias: w.anonymous_alias,
    role: w.role,
  }))

  return <HomeClient investigations={invSummaries} workers={workerOptions} />
}

