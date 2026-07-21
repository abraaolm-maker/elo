import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

const VALID_STATUSES = ['suggested', 'in_progress', 'done', 'dismissed'] as const
type ActionItemStatus = typeof VALID_STATUSES[number]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)

    const body = await request.json() as { status?: unknown }
    const status = body.status

    if (!VALID_STATUSES.includes(status as ActionItemStatus)) {
      return Response.json(
        { error: `Status inválido. Use: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // Verificar que o action_item pertence a um relatório da company do manager
    const item = await db
      .select({
        id: schema.action_items.id,
        investigation_id: schema.reports.investigation_id,
        company_id: schema.investigations.company_id,
      })
      .from(schema.action_items)
      .innerJoin(schema.reports, eq(schema.action_items.report_id, schema.reports.id))
      .innerJoin(schema.investigations, eq(schema.reports.investigation_id, schema.investigations.id))
      .where(eq(schema.action_items.id, id))
      .get()

    if (!item) {
      return Response.json({ error: 'Item não encontrado' }, { status: 404 })
    }

    if (item.company_id !== session.companyId) {
      return Response.json({ error: 'Acesso não autorizado' }, { status: 403 })
    }

    await db
      .update(schema.action_items)
      .set({ status: status as ActionItemStatus })
      .where(eq(schema.action_items.id, id))

    return Response.json({ data: { id, status } }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[PATCH /api/action-items/[id]]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
