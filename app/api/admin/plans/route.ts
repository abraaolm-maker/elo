import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { eq, sql } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const configs = await db.select().from(schema.plan_configs).all()
    return Response.json({ data: configs })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error('[admin/plans GET]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin(request)

    const body = await request.json() as {
      plan: string
      max_investigations: number
      max_cost_brl: number
      label?: string
    }

    const { plan, max_investigations, max_cost_brl, label } = body

    if (!plan) return Response.json({ error: 'plan obrigatório' }, { status: 400 })

    await db
      .update(schema.plan_configs)
      .set({
        max_investigations,
        max_cost_brl,
        ...(label ? { label } : {}),
        updated_at: new Date().toISOString(),
      })
      .where(eq(schema.plan_configs.plan, plan))

    const updated = await db.select().from(schema.plan_configs).where(eq(schema.plan_configs.plan, plan)).get()
    return Response.json({ data: updated })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    console.error('[admin/plans PUT]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
