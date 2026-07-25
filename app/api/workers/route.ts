import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and, count } from 'drizzle-orm'
import crypto from 'crypto'

// Gerar alias sequencial: Colaborador A…Z, AA, AB…
function generateAlias(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let suffix: string
  if (index < 26) {
    suffix = letters[index]!
  } else {
    const hi = Math.floor((index - 26) / 26)
    const lo = (index - 26) % 26
    suffix = (hi < 26 ? letters[hi]! : String(hi + 1)) + letters[lo]!
  }
  return `Colaborador ${suffix}`
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)

    const workers = await db
      .select({
        id: schema.workers.id,
        anonymous_alias: schema.workers.anonymous_alias,
        role: schema.workers.role,
        role_description: schema.workers.role_description,
        is_active: schema.workers.is_active,
        created_at: schema.workers.created_at,
      })
      .from(schema.workers)
      .where(eq(schema.workers.company_id, session.companyId))
      .orderBy(schema.workers.created_at)

    return Response.json({ data: workers }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[workers GET]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)

    const body = await request.json() as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : ''
    const cpf = typeof body.cpf === 'string' ? body.cpf.replace(/\D/g, '') : ''
    const role = typeof body.role === 'string' ? body.role.trim() : ''
    const role_description = typeof body.role_description === 'string' ? body.role_description.trim() : ''
    const whatsapp_raw = typeof body.whatsapp_number === 'string' ? body.whatsapp_number.trim() : ''

    if (!name) return Response.json({ error: 'O nome é obrigatório.' }, { status: 400 })
    if (!role) return Response.json({ error: 'O cargo é obrigatório.' }, { status: 400 })
    if (cpf && cpf.length !== 11) return Response.json({ error: 'CPF inválido — deve ter 11 dígitos.' }, { status: 400 })

    // WhatsApp é opcional: valida só se informado
    let whatsapp_number = ''
    if (whatsapp_raw) {
      if (!/^\d+$/.test(whatsapp_raw)) return Response.json({ error: 'O número deve conter apenas dígitos.' }, { status: 400 })
      if (!whatsapp_raw.startsWith('55')) return Response.json({ error: 'O número deve começar com 55 (código do Brasil).' }, { status: 400 })
      if (whatsapp_raw.length < 12 || whatsapp_raw.length > 13) return Response.json({ error: 'Formato inválido. Use: 5511999999999' }, { status: 400 })
      whatsapp_number = whatsapp_raw

      const existing = await db
        .select({ id: schema.workers.id })
        .from(schema.workers)
        .where(and(eq(schema.workers.company_id, session.companyId), eq(schema.workers.whatsapp_number, whatsapp_number)))
        .get()
      if (existing) return Response.json({ error: 'Este número já está cadastrado na empresa.' }, { status: 409 })
    }

    const [{ value: workerCount }] = await db
      .select({ value: count() })
      .from(schema.workers)
      .where(eq(schema.workers.company_id, session.companyId))

    const alias = generateAlias(workerCount)
    const newId = crypto.randomUUID()

    await db.insert(schema.workers).values({
      id: newId,
      company_id: session.companyId,
      name,
      full_name: full_name || null,
      cpf: cpf || null,
      role,
      role_description: role_description || null,
      whatsapp_number: whatsapp_number || `portal:${newId}`,
      anonymous_alias: alias,
    })

    const newWorker = await db
      .select({
        id: schema.workers.id,
        anonymous_alias: schema.workers.anonymous_alias,
        role: schema.workers.role,
        role_description: schema.workers.role_description,
        is_active: schema.workers.is_active,
        created_at: schema.workers.created_at,
      })
      .from(schema.workers)
      .where(eq(schema.workers.id, newId))
      .get()

    return Response.json({ data: newWorker }, { status: 201 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[workers POST]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
