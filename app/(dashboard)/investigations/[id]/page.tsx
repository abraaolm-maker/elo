import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { InvestigationDetail } from '@/components/investigations/InvestigationDetail'
import type { InvestigationData, WorkerParticipant, MessageItem } from '@/components/investigations/InvestigationDetail'

interface RouteParams {
  params: Promise<{ id: string }>
}

export default async function InvestigationPage({ params }: RouteParams) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/login')

  const [investigation, iwRows, msgRows] = await Promise.all([
    db
      .select()
      .from(schema.investigations)
      .where(
        and(
          eq(schema.investigations.id, id),
          eq(schema.investigations.company_id, session.companyId)
        )
      )
      .get(),

    db
      .select({
        iw_id: schema.investigation_workers.id,
        worker_id: schema.investigation_workers.worker_id,
        status: schema.investigation_workers.status,
        saturation_score: schema.investigation_workers.saturation_score,
        alias: schema.workers.anonymous_alias,
        role: schema.workers.role,
      })
      .from(schema.investigation_workers)
      .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
      .where(eq(schema.investigation_workers.investigation_id, id))
      .orderBy(schema.investigation_workers.created_at),

    db
      .select({
        id: schema.messages.id,
        worker_id: schema.messages.worker_id,
        direction: schema.messages.direction,
        content: schema.messages.content,
        content_type: schema.messages.content_type,
        created_at: schema.messages.created_at,
      })
      .from(schema.messages)
      .where(eq(schema.messages.investigation_id, id))
      .orderBy(schema.messages.created_at),
  ])

  if (!investigation) notFound()

  const invData: InvestigationData = {
    id: investigation.id,
    title: investigation.title,
    problem_description: investigation.problem_description,
    status: investigation.status,
    created_at: investigation.created_at,
    completed_at: investigation.completed_at,
  }

  const workers: WorkerParticipant[] = iwRows.map(row => ({
    iw_id: row.iw_id,
    worker_id: row.worker_id,
    alias: row.alias,
    role: row.role,
    status: row.status,
    saturation_score: row.saturation_score,
  }))

  const messages: MessageItem[] = msgRows
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
      investigation={invData}
      workers={workers}
      messages={messages}
    />
  )
}
