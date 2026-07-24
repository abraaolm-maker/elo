import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and, count } from 'drizzle-orm'
import crypto from 'crypto'

const ALIAS_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function generateAlias(index: number): string {
  return `Colaborador ${ALIAS_LETTERS[index] ?? index + 1}`
}

function maskNumber(phone: string): string {
  if (phone.startsWith('portal:')) return 'Sem WhatsApp'
  return `****${phone.slice(-4)}`
}

function validateWhatsAppNumber(phone: string): string | null {
  if (!/^\d+$/.test(phone)) return 'O número deve conter apenas dígitos.'
  if (!phone.startsWith('55')) return 'O número deve começar com 55 (código do Brasil).'
  if (phone.length < 12 || phone.length > 13) return 'Formato inválido. Use: 5511999999999'
  return null
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
        whatsapp_number: schema.workers.whatsapp_number,
        is_active: schema.workers.is_active,
        created_at: schema.workers.created_at,
      })
      .from(schema.workers)
      .where(eq(schema.workers.company_id, session.companyId))
      .orderBy(schema.workers.created_at)

    // Nunca expor whatsapp_number completo
    const masked = workers.map(w => ({
      id: w.id,
      anonymous_alias: w.anonymous_alias,
      role: w.role,
      role_description: w.role_description,
      whatsapp_masked: maskNumber(w.whatsapp_number),
      is_active: w.is_active,
      created_at: w.created_at,
    }))

    return Response.json({ data: masked }, { status: 200 })
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
    const whatsapp_number = typeof body.whatsapp_number === 'string' ? body.whatsapp_number.trim() : ''

    if (!name) return Response.json({ error: 'O nome é obrigatório.' }, { status: 400 })
    if (!role) return Response.json({ error: 'O cargo é obrigatório.' }, { status: 400 })
    if (cpf && cpf.length !== 11) return Response.json({ error: 'CPF inválido.' }, { status: 400 })
    if (!whatsapp_number) return Response.json({ error: 'O número WhatsApp é obrigatório.' }, { status: 400 })

    const numberError = validateWhatsAppNumber(whatsapp_number)
    if (numberError) return Response.json({ error: numberError }, { status: 400 })

    // Verificar duplicidade de número na company
    const existing = await db
      .select({ id: schema.workers.id })
      .from(schema.workers)
      .where(
        and(
          eq(schema.workers.company_id, session.companyId),
          eq(schema.workers.whatsapp_number, whatsapp_number)
        )
      )
      .get()

    if (existing) {
      return Response.json({ error: 'Este número já está cadastrado na empresa.' }, { status: 409 })
    }

    // Gerar alias com base no total de workers da company
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
      whatsapp_number,
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
