import { requireAuth } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth()

    // Buscar investigação validando que pertence à company do manager
    const investigation = await db
      .select()
      .from(schema.investigations)
      .where(
        and(
          eq(schema.investigations.id, id),
          eq(schema.investigations.company_id, session.companyId)
        )
      )
      .get()

    if (!investigation) {
      return Response.json({ error: 'Investigação não encontrada.' }, { status: 404 })
    }

    // Buscar workers participantes com alias e cargo
    const iwRows = await db
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
      .orderBy(schema.investigation_workers.created_at)

    // Buscar mensagens (sem whatsapp_number)
    const messages = await db
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
      .orderBy(schema.messages.created_at)

    return Response.json({
      data: {
        investigation,
        workers: iwRows,
        messages: messages.filter(m => m.content !== null),
      },
    }, { status: 200 })
  } catch (error) {
    console.error('[investigations/:id GET]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
