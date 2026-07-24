import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

interface RouteParams { params: Promise<{ token: string }> }

// GET — retorna dados da sessão (sem auth) para mostrar tela de login
export async function GET(_req: Request, { params }: RouteParams): Promise<Response> {
  const { token } = await params

  const iw = await db
    .select({
      iw_id: schema.investigation_workers.id,
      status: schema.investigation_workers.status,
      saturation_score: schema.investigation_workers.saturation_score,
      investigation_title: schema.investigations.title,
      investigation_status: schema.investigations.status,
      company_name: schema.companies.name,
    })
    .from(schema.investigation_workers)
    .innerJoin(schema.investigations, eq(schema.investigation_workers.investigation_id, schema.investigations.id))
    .innerJoin(schema.companies, eq(schema.investigations.company_id, schema.companies.id))
    .where(eq(schema.investigation_workers.access_token, token))
    .get()

  if (!iw) return Response.json({ error: 'Link inválido ou expirado.' }, { status: 404 })
  if (iw.investigation_status === 'cancelled') return Response.json({ error: 'Esta investigação foi cancelada.' }, { status: 410 })

  return Response.json({ data: iw }, { status: 200 })
}

// POST — autenticar worker com CPF
export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const { token } = await params
  const body = await req.json() as { cpf?: string }
  const cpf = typeof body.cpf === 'string' ? body.cpf.replace(/\D/g, '') : ''

  if (!cpf) return Response.json({ error: 'CPF obrigatório.' }, { status: 400 })

  const iw = await db
    .select({
      iw_id: schema.investigation_workers.id,
      worker_id: schema.investigation_workers.worker_id,
      status: schema.investigation_workers.status,
      saturation_score: schema.investigation_workers.saturation_score,
      investigation_id: schema.investigation_workers.investigation_id,
      investigation_title: schema.investigations.title,
      investigation_status: schema.investigations.status,
      problem_description: schema.investigations.problem_description,
      company_name: schema.companies.name,
      worker_cpf: schema.workers.cpf,
      worker_alias: schema.workers.anonymous_alias,
      worker_role: schema.workers.role,
    })
    .from(schema.investigation_workers)
    .innerJoin(schema.investigations, eq(schema.investigation_workers.investigation_id, schema.investigations.id))
    .innerJoin(schema.companies, eq(schema.investigations.company_id, schema.companies.id))
    .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
    .where(eq(schema.investigation_workers.access_token, token))
    .get()

  if (!iw) return Response.json({ error: 'Link inválido.' }, { status: 404 })

  const cpfCadastrado = (iw.worker_cpf ?? '').replace(/\D/g, '')
  if (!cpfCadastrado) return Response.json({ error: 'Trabalhador não possui CPF cadastrado. Fale com seu gestor.' }, { status: 400 })
  if (cpf !== cpfCadastrado) return Response.json({ error: 'CPF incorreto.' }, { status: 401 })

  if (iw.investigation_status !== 'active') {
    return Response.json({ error: 'Esta investigação não está ativa no momento.' }, { status: 400 })
  }

  // Registrar primeiro acesso se ainda não registrado
  const iwFull = await db
    .select({ first_accessed_at: schema.investigation_workers.first_accessed_at })
    .from(schema.investigation_workers)
    .where(eq(schema.investigation_workers.id, iw.iw_id))
    .get()

  if (!iwFull?.first_accessed_at) {
    await db
      .update(schema.investigation_workers)
      .set({ first_accessed_at: new Date().toISOString() })
      .where(eq(schema.investigation_workers.id, iw.iw_id))
  }

  // Buscar histórico de mensagens
  const messages = await db
    .select({
      id: schema.messages.id,
      direction: schema.messages.direction,
      content: schema.messages.content,
      content_type: schema.messages.content_type,
      created_at: schema.messages.created_at,
    })
    .from(schema.messages)
    .where(eq(schema.messages.investigation_id, iw.investigation_id))
    .orderBy(schema.messages.created_at)
    .all()

  const workerMessages = messages.filter(m => m.content !== null)

  return Response.json({
    data: {
      iw_id: iw.iw_id,
      status: iw.status,
      saturation_score: iw.saturation_score,
      investigation_title: iw.investigation_title,
      company_name: iw.company_name,
      worker_role: iw.worker_role,
      messages: workerMessages,
    }
  }, { status: 200 })
}
