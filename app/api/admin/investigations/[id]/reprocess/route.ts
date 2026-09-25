export const maxDuration = 60

import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { eq } from 'drizzle-orm'
import { generateReport } from '@/lib/ai/report-generator'
import { montarEntradaRelatorio } from '@/lib/ai/report-input'
import crypto from 'crypto'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id: investigationId } = await params

    const investigation = await db
      .select({ title: schema.investigations.title, problem_description: schema.investigations.problem_description, status: schema.investigations.status, company_id: schema.investigations.company_id, manager_id: schema.investigations.manager_id })
      .from(schema.investigations)
      .where(eq(schema.investigations.id, investigationId))
      .get()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    const iwRows = await db
      .select({ worker_id: schema.investigation_workers.worker_id, alias: schema.workers.anonymous_alias, role: schema.workers.role })
      .from(schema.investigation_workers)
      .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
      .where(eq(schema.investigation_workers.investigation_id, investigationId))
      .all()

    const workerMap = new Map(iwRows.map(w => [w.worker_id, { alias: w.alias, role: w.role }]))

    // Mesmo payload enxuto das demais rotas — o tamanho aqui é o que decide se
    // a geração cabe no tempo limite da função
    const { allMessages } = await montarEntradaRelatorio(investigationId)
    const workerAliases = Array.from(workerMap.values())

    const reportOutput = await generateReport({
      investigation: { title: investigation.title, problem_description: investigation.problem_description },
      allMessages,
      workerAliases,
      companyId: investigation.company_id,
      managerId: investigation.manager_id,
      investigationId,
    })

    const reportValues = {
      investigation_id: investigationId,
      root_cause: reportOutput.root_cause,
      confidence_score: reportOutput.confidence_score,
      confidence_justification: reportOutput.confidence_justification ?? null,
      ishikawa_breakdown: JSON.stringify(reportOutput.ishikawa_breakdown),
      sources_summary: JSON.stringify(reportOutput.sources_summary),
      recommendations: JSON.stringify(reportOutput.recommendations),
      generated_at: new Date().toISOString(),
    }

    const existing = await db.select({ id: schema.reports.id }).from(schema.reports).where(eq(schema.reports.investigation_id, investigationId)).get()
    if (existing) {
      await db.update(schema.reports).set(reportValues).where(eq(schema.reports.investigation_id, investigationId))
    } else {
      await db.insert(schema.reports).values({ id: crypto.randomUUID(), ...reportValues })
    }

    // Atualizar status para completed se ainda estiver em saturated
    if (investigation.status === 'saturated') {
      await db.update(schema.investigations)
        .set({ status: 'completed', completed_at: new Date().toISOString() })
        .where(eq(schema.investigations.id, investigationId))
    }

    return Response.json({ data: { ok: true } })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[admin/investigations/reprocess]', msg, error)
    return Response.json({ error: msg }, { status: 500 })
  }
}
