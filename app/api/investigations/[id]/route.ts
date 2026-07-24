import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(_request)

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

    const iwRows = await db
      .select({
        iw_id: schema.investigation_workers.id,
        worker_id: schema.investigation_workers.worker_id,
        status: schema.investigation_workers.status,
        saturation_score: schema.investigation_workers.saturation_score,
        manager_notes: schema.investigation_workers.manager_notes,
        access_token: schema.investigation_workers.access_token,
        first_accessed_at: schema.investigation_workers.first_accessed_at,
        alias: schema.workers.anonymous_alias,
        name: schema.workers.name,
        role: schema.workers.role,
        role_description: schema.workers.role_description,
        // whatsapp_number e cpf NUNCA expostos via API do dashboard
      })
      .from(schema.investigation_workers)
      .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
      .where(eq(schema.investigation_workers.investigation_id, id))
      .orderBy(schema.investigation_workers.created_at)

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
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[investigations/:id GET]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// PATCH — atualizar observações do gestor por participante (apenas quando active)
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)

    const investigation = await db
      .select({ status: schema.investigations.status })
      .from(schema.investigations)
      .where(and(eq(schema.investigations.id, id), eq(schema.investigations.company_id, session.companyId)))
      .get()

    if (!investigation) return Response.json({ error: 'Não encontrada.' }, { status: 404 })
    if (investigation.status === 'completed' || investigation.status === 'cancelled') {
      return Response.json({ error: 'Investigação concluída não pode ser editada.' }, { status: 400 })
    }

    const body = await request.json() as Record<string, unknown>

    // Cancelar investigação
    if (body.action === 'cancel') {
      await db.update(schema.investigations)
        .set({ status: 'cancelled' })
        .where(eq(schema.investigations.id, id))
      return Response.json({ ok: true }, { status: 200 })
    }

    // pending: pode editar título e descrição
    if (investigation.status === 'pending') {
      const updates: Record<string, string> = {}
      if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim()
      if (typeof body.problem_description === 'string' && body.problem_description.trim().length >= 20) {
        updates.problem_description = body.problem_description.trim()
      }
      if (Object.keys(updates).length > 0) {
        await db.update(schema.investigations).set(updates).where(eq(schema.investigations.id, id))
      }
    }

    // pending ou active: pode editar observações de participante
    if (typeof body.iw_id === 'string' && typeof body.manager_notes === 'string') {
      await db.update(schema.investigation_workers)
        .set({ manager_notes: body.manager_notes.trim() || null })
        .where(
          and(
            eq(schema.investigation_workers.id, body.iw_id),
            eq(schema.investigation_workers.investigation_id, id)
          )
        )
    }

    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[investigations/:id PATCH]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
