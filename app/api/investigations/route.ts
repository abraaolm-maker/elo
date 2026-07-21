import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and, inArray, count } from 'drizzle-orm'
import crypto from 'crypto'

// Gerar alias sequencial: Colaborador A, B, C...
async function gerarAlias(companyId: string): Promise<string> {
  const total = await db
    .select({ cnt: count() })
    .from(schema.workers)
    .where(eq(schema.workers.company_id, companyId))
    .get()
  const idx = total?.cnt ?? 0
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const sufixo = idx < 26 ? letras[idx] : String(idx + 1)
  return `Colaborador ${sufixo}`
}

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

interface ParticipanteInput {
  name: string
  role: string
  role_description?: string
  whatsapp_number: string
  manager_notes?: string
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)

    const body = await request.json() as Record<string, unknown>
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const problem_description = typeof body.problem_description === 'string' ? body.problem_description.trim() : ''
    const participantes = Array.isArray(body.participantes) ? body.participantes as ParticipanteInput[] : []

    if (!title) return Response.json({ error: 'O título é obrigatório.' }, { status: 400 })
    if (problem_description.length < 20) {
      return Response.json({ error: 'A descrição do problema deve ter pelo menos 20 caracteres.' }, { status: 400 })
    }
    if (participantes.length < 1) {
      return Response.json({ error: 'Adicione pelo menos um participante.' }, { status: 400 })
    }

    // Validar campos obrigatórios dos participantes
    for (const p of participantes) {
      if (!p.name?.trim()) return Response.json({ error: 'Nome do participante é obrigatório.' }, { status: 400 })
      if (!p.role?.trim()) return Response.json({ error: 'Cargo do participante é obrigatório.' }, { status: 400 })
      if (!p.whatsapp_number?.trim()) return Response.json({ error: 'WhatsApp do participante é obrigatório.' }, { status: 400 })
      // Normalizar número: remover tudo que não é dígito
      const numLimpo = p.whatsapp_number.replace(/\D/g, '')
      if (numLimpo.length < 10) return Response.json({ error: `Número de WhatsApp inválido: ${p.whatsapp_number}` }, { status: 400 })
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

    // Criar/encontrar workers e vincular à investigação
    const iwValues: {
      id: string
      investigation_id: string
      worker_id: string
      status: 'pending'
      saturation_score: number
      manager_notes: string | null
    }[] = []

    for (const p of participantes) {
      const numLimpo = p.whatsapp_number.replace(/\D/g, '')

      // Tentar encontrar worker existente pelo número + empresa
      let worker = await db
        .select()
        .from(schema.workers)
        .where(
          and(
            eq(schema.workers.company_id, session.companyId),
            eq(schema.workers.whatsapp_number, numLimpo)
          )
        )
        .get()

      if (!worker) {
        // Criar novo worker
        const alias = await gerarAlias(session.companyId)
        const workerId = crypto.randomUUID()
        await db.insert(schema.workers).values({
          id: workerId,
          company_id: session.companyId,
          name: p.name.trim(),
          role: p.role.trim(),
          role_description: p.role_description?.trim() ?? null,
          whatsapp_number: numLimpo,
          anonymous_alias: alias,
          is_active: true,
        })
        worker = await db.select().from(schema.workers).where(eq(schema.workers.id, workerId)).get()!
      } else {
        // Atualizar dados do worker existente (nome/cargo podem ter mudado)
        await db.update(schema.workers)
          .set({
            name: p.name.trim(),
            role: p.role.trim(),
            role_description: p.role_description?.trim() ?? worker.role_description,
          })
          .where(eq(schema.workers.id, worker.id))
      }

      iwValues.push({
        id: crypto.randomUUID(),
        investigation_id: invId,
        worker_id: worker!.id,
        status: 'pending' as const,
        saturation_score: 0,
        manager_notes: p.manager_notes?.trim() ?? null,
      })
    }

    await db.insert(schema.investigation_workers).values(iwValues)

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
