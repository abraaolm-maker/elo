import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'
import { generateWorkerReport } from '@/lib/ai/worker-report-generator'
import { canSpendOnAi } from '@/lib/billing/plan-limits'
import { logError } from '@/lib/monitoring/logger'
import type { ReportMessageEntry, WorkerAlias, ActionPlanItemOutput } from '@/lib/ai/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteParams { params: Promise<{ investigationId: string }> }

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

/** GET — devolutiva já gerada, se existir. */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { investigationId } = await params
    const session = await requireAuth(request)

    const inv = await db
      .select({ id: schema.investigations.id })
      .from(schema.investigations)
      .where(and(
        eq(schema.investigations.id, investigationId),
        eq(schema.investigations.company_id, session.companyId),
      ))
      .get()

    if (!inv) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    const row = await db
      .select()
      .from(schema.worker_reports)
      .where(eq(schema.worker_reports.investigation_id, investigationId))
      .get()

    if (!row) return Response.json({ data: null })

    return Response.json({
      data: {
        ...row,
        o_que_encontramos: parseJson<string[]>(row.o_que_encontramos, []),
        o_que_vai_mudar: parseJson<{ acao: string; prazo: string }[]>(row.o_que_vai_mudar, []),
        o_que_pedimos: parseJson<string[]>(row.o_que_pedimos, []),
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    await logError('api/reports/devolutiva GET', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * POST — gera a devolutiva para os participantes.
 *
 * Exige o relatório gerencial pronto: a devolutiva é derivada dele, para que as
 * duas versões contem a mesma história — uma com a estrutura de evidências que
 * a liderança precisa, outra sem nada que exponha quem falou.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { investigationId } = await params
    const session = await requireAuth(request)

    const investigation = await db
      .select({
        id: schema.investigations.id,
        title: schema.investigations.title,
        problem_description: schema.investigations.problem_description,
        company_id: schema.investigations.company_id,
      })
      .from(schema.investigations)
      .where(and(
        eq(schema.investigations.id, investigationId),
        eq(schema.investigations.company_id, session.companyId),
      ))
      .get()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    const gerencial = await db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

    if (!gerencial) {
      return Response.json(
        { error: 'Gere primeiro o relatório gerencial — a devolutiva é derivada dele.' },
        { status: 400 }
      )
    }

    const orcamento = await canSpendOnAi(investigation.company_id)
    if (!orcamento.ok) return Response.json({ error: orcamento.reason }, { status: 403 })

    // Fontes e mensagens, sempre por alias
    const iwRows = await db
      .select({
        worker_id: schema.investigation_workers.worker_id,
        alias: schema.workers.anonymous_alias,
        role: schema.workers.role,
      })
      .from(schema.investigation_workers)
      .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
      .where(eq(schema.investigation_workers.investigation_id, investigationId))

    const aliasMap = new Map(iwRows.map(r => [r.worker_id, { alias: r.alias, role: r.role }]))
    const workerAliases: WorkerAlias[] = iwRows.map(r => ({ alias: r.alias, role: r.role }))

    const msgRows = await db
      .select({
        worker_id: schema.messages.worker_id,
        direction: schema.messages.direction,
        content: schema.messages.content,
        key_points_extracted: schema.messages.key_points_extracted,
      })
      .from(schema.messages)
      .where(eq(schema.messages.investigation_id, investigationId))
      .orderBy(schema.messages.created_at)

    const allMessages: ReportMessageEntry[] = msgRows
      .filter(m => m.content !== null)
      .map(m => {
        const info = aliasMap.get(m.worker_id) ?? { alias: 'Colaborador', role: '' }
        return {
          alias: info.alias,
          role: info.role,
          direction: m.direction as 'outbound' | 'inbound',
          content: m.content!,
          key_points_extracted: Array.isArray(m.key_points_extracted)
            ? (m.key_points_extracted as string[])
            : undefined,
        }
      })

    const acoes = await db
      .select({ what: schema.action_items.what, why: schema.action_items.why })
      .from(schema.action_items)
      .where(eq(schema.action_items.report_id, gerencial.id))
      .orderBy(schema.action_items.priority_rank)

    const saida = await generateWorkerReport({
      investigation: { title: investigation.title, problem_description: investigation.problem_description },
      allMessages,
      workerAliases,
      rootCause: gerencial.root_cause,
      recommendations: parseJson<string[]>(gerencial.recommendations, []),
      actionPlan: acoes as Pick<ActionPlanItemOutput, 'what' | 'why'>[],
      companyId: investigation.company_id,
      managerId: session.managerId,
      investigationId,
    })

    const valores = {
      investigation_id:   investigationId,
      titulo:             saida.titulo,
      resumo_do_problema: saida.resumo_do_problema,
      o_que_encontramos:  JSON.stringify(saida.o_que_encontramos),
      conclusao:          saida.conclusao,
      o_que_vai_mudar:    JSON.stringify(saida.o_que_vai_mudar),
      o_que_pedimos:      JSON.stringify(saida.o_que_pedimos),
      mensagem_final:     saida.mensagem_final,
      generated_at:       new Date().toISOString(),
    }

    const existente = await db
      .select({ id: schema.worker_reports.id })
      .from(schema.worker_reports)
      .where(eq(schema.worker_reports.investigation_id, investigationId))
      .get()

    if (existente) {
      await db.update(schema.worker_reports).set(valores)
        .where(eq(schema.worker_reports.investigation_id, investigationId))
    } else {
      await db.insert(schema.worker_reports).values({ id: crypto.randomUUID(), ...valores })
    }

    return Response.json({ data: saida })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    await logError('api/reports/devolutiva POST', error)
    return Response.json({ error: 'Não foi possível gerar a devolutiva.' }, { status: 500 })
  }
}
