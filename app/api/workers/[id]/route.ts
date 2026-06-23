import { requireAuth } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth()

    const body = await request.json() as Record<string, unknown>

    // Campos permitidos — whatsapp_number e anonymous_alias são imutáveis
    const allowed: Partial<{
      role: string
      role_description: string
      is_active: boolean
    }> = {}

    if (typeof body.role === 'string') allowed.role = body.role.trim()
    if (typeof body.role_description === 'string') allowed.role_description = body.role_description.trim()
    if (typeof body.is_active === 'boolean') allowed.is_active = body.is_active

    if (Object.keys(allowed).length === 0) {
      return Response.json({ error: 'Nenhum campo válido para atualizar.' }, { status: 400 })
    }

    // Validar que o worker pertence à company do manager autenticado
    const existing = await db
      .select({ id: schema.workers.id })
      .from(schema.workers)
      .where(
        and(
          eq(schema.workers.id, id),
          eq(schema.workers.company_id, session.companyId)
        )
      )
      .get()

    if (!existing) {
      return Response.json({ error: 'Worker não encontrado.' }, { status: 404 })
    }

    await db
      .update(schema.workers)
      .set(allowed)
      .where(eq(schema.workers.id, id))

    const updated = await db
      .select({
        id: schema.workers.id,
        anonymous_alias: schema.workers.anonymous_alias,
        role: schema.workers.role,
        role_description: schema.workers.role_description,
        is_active: schema.workers.is_active,
      })
      .from(schema.workers)
      .where(eq(schema.workers.id, id))
      .get()

    return Response.json({ data: updated }, { status: 200 })
  } catch (error) {
    console.error('[workers PATCH]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
