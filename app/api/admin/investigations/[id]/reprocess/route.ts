export const maxDuration = 60

import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { eq } from 'drizzle-orm'
import { generateReport } from '@/lib/ai/report-generator'
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

    const rawMessages = await db
      .select({ worker_id: schema.messages.worker_id, direction: schema.messages.direction, content: schema.messages.content, key_points_extracted: schema.messages.key_points_extracted })
      .from(schema.messages)
      .where(eq(schema.messages.investigation_id, investigationId))
      .orderBy(schema.messages.created_at)
      .all()

    const allMessages = rawMessages
      .filter(m => m.content !== null)
      .map(m => {
        const wInfo = workerMap.get(m.worker_id) ?? { alias: 'Desconhecido', role: '' }
        return {
          alias: wInfo.alias,
          role: wInfo.role,
          direction: m.direction as 'outbound' | 'inbound',
          content: m.content!,
          key_points_extracted: Array.isArray(m.key_points_extracted) ? (m.key_points_extracted as string[]) : undefined,
        }
      })

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
    console.error('[admin/investigations/reprocess]', error)
    return Response.json({ error: 'Erro interno ao gerar relatório' }, { status: 500 })
  }
}
