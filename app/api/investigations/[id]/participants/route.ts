import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST — adicionar worker à investigação (apenas quando pending)
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)

    const investigation = await db
      .select({ status: schema.investigations.status, company_id: schema.investigations.company_id })
      .from(schema.investigations)
      .where(and(eq(schema.investigations.id, id), eq(schema.investigations.company_id, session.companyId)))
      .get()

    if (!investigation) return Response.json({ error: 'Não encontrada.' }, { status: 404 })
    if (investigation.status !== 'pending') {
      return Response.json({ error: 'Só é possível adicionar participantes enquanto a investigação está pendente.' }, { status: 400 })
    }

    const body = await request.json() as Record<string, unknown>
    const worker_id = typeof body.worker_id === 'string' ? body.worker_id : ''
    if (!worker_id) return Response.json({ error: 'worker_id obrigatório.' }, { status: 400 })

    // Verificar que o worker pertence à company
    const worker = await db
      .select({ id: schema.workers.id })
      .from(schema.workers)
      .where(and(eq(schema.workers.id, worker_id), eq(schema.workers.company_id, session.companyId)))
      .get()

    if (!worker) return Response.json({ error: 'Worker não encontrado.' }, { status: 404 })

    // Verificar se já está na investigação
    const existing = await db
      .select({ id: schema.investigation_workers.id })
      .from(schema.investigation_workers)
      .where(and(
        eq(schema.investigation_workers.investigation_id, id),
        eq(schema.investigation_workers.worker_id, worker_id)
      ))
      .get()

    if (existing) return Response.json({ error: 'Worker já é participante desta investigação.' }, { status: 409 })

    await db.insert(schema.investigation_workers).values({
      id: crypto.randomUUID(),
      investigation_id: id,
      worker_id,
      status: 'pending',
      saturation_score: 0,
    })

    return Response.json({ ok: true }, { status: 201 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[investigations/:id/participants POST]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// DELETE — remover worker da investigação (apenas quando pending)
export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)

    const investigation = await db
      .select({ status: schema.investigations.status })
      .from(schema.investigations)
      .where(and(eq(schema.investigations.id, id), eq(schema.investigations.company_id, session.companyId)))
      .get()

    if (!investigation) return Response.json({ error: 'Não encontrada.' }, { status: 404 })
    if (investigation.status !== 'pending') {
      return Response.json({ error: 'Só é possível remover participantes enquanto a investigação está pendente.' }, { status: 400 })
    }

    const body = await request.json() as Record<string, unknown>
    const iw_id = typeof body.iw_id === 'string' ? body.iw_id : ''
    if (!iw_id) return Response.json({ error: 'iw_id obrigatório.' }, { status: 400 })

    await db
      .delete(schema.investigation_workers)
      .where(and(
        eq(schema.investigation_workers.id, iw_id),
        eq(schema.investigation_workers.investigation_id, id)
      ))

    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[investigations/:id/participants DELETE]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
