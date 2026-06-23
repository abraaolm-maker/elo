import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and, inArray, count } from 'drizzle-orm'
import crypto from 'crypto'

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)

    const investigations = await db
      .select({
        id: schema.investigations.id,
        title: schema.investigations.title,
        status: schema.investigations.status,
        created_at: schema.investigations.created_at,
      })
      .from(schema.investigations)
      .where(eq(schema.investigations.company_id, session.companyId))
      .orderBy(schema.investigations.created_at)

    // Buscar contagem de workers por investigação
    const workerCounts = await db
      .select({
        investigation_id: schema.investigation_workers.investigation_id,
        cnt: count(),
      })
      .from(schema.investigation_workers)
      .where(
        inArray(
          schema.investigation_workers.investigation_id,
          investigations.map(i => i.id)
        )
      )
      .groupBy(schema.investigation_workers.investigation_id)

    const countMap = new Map(workerCounts.map(r => [r.investigation_id, r.cnt]))

    const result = investigations.map(inv => ({
      ...inv,
      worker_count: countMap.get(inv.id) ?? 0,
    }))

    return Response.json({ data: result }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[investigations GET]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)

    const body = await request.json() as Record<string, unknown>
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const problem_description = typeof body.problem_description === 'string' ? body.problem_description.trim() : ''
    const worker_ids = Array.isArray(body.worker_ids) ? body.worker_ids as string[] : []

    if (!title) return Response.json({ error: 'O título é obrigatório.' }, { status: 400 })
    if (problem_description.length < 20) {
      return Response.json({ error: 'A descrição do problema deve ter pelo menos 20 caracteres.' }, { status: 400 })
    }
    if (worker_ids.length < 1) {
      return Response.json({ error: 'Selecione pelo menos um worker.' }, { status: 400 })
    }

    // Validar que todos os worker_ids pertencem à company
    const validWorkers = await db
      .select({ id: schema.workers.id })
      .from(schema.workers)
      .where(
        and(
          eq(schema.workers.company_id, session.companyId),
          eq(schema.workers.is_active, true),
          inArray(schema.workers.id, worker_ids)
        )
      )

    if (validWorkers.length !== worker_ids.length) {
      return Response.json({ error: 'Um ou mais workers são inválidos.' }, { status: 400 })
    }

    // Criar investigação
    const invId = crypto.randomUUID()
    await db.insert(schema.investigations).values({
      id: invId,
      company_id: session.companyId,
      manager_id: session.managerId,
      title,
      problem_description,
      status: 'pending',
    })

    // Criar registros em investigation_workers
    await db.insert(schema.investigation_workers).values(
      worker_ids.map(wid => ({
        id: crypto.randomUUID(),
        investigation_id: invId,
        worker_id: wid,
        status: 'pending' as const,
        saturation_score: 0,
      }))
    )

    const investigation = await db
      .select({ id: schema.investigations.id, title: schema.investigations.title, status: schema.investigations.status, created_at: schema.investigations.created_at })
      .from(schema.investigations)
      .where(eq(schema.investigations.id, invId))
      .get()

    return Response.json({ data: investigation }, { status: 201 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[investigations POST]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
