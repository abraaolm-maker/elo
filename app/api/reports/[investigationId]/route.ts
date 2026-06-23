import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { generateReport } from '@/lib/ai/report-generator'
import type { ReportMessageEntry, WorkerAlias } from '@/lib/ai/types'
import type { IshikawaBreakdownOutput } from '@/lib/ai/types'
import crypto from 'crypto'

function parseJsonField<T>(raw: string | null): T | null {
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

// ─── GET — buscar relatório existente ────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ investigationId: string }> }
) {
  try {
    const { investigationId } = await params
    const session = await requireAuth(_req)

    // Verificar que a investigação pertence à company
    const investigation = await db
      .select({ id: schema.investigations.id, company_id: schema.investigations.company_id })
      .from(schema.investigations)
      .where(
        and(
          eq(schema.investigations.id, investigationId),
          eq(schema.investigations.company_id, session.companyId)
        )
      )
      .get()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    const report = await db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

    if (!report) return Response.json({ data: null }, { status: 200 })

    return Response.json({
      data: {
        ...report,
        ishikawa_breakdown: parseJsonField<IshikawaBreakdownOutput>(report.ishikawa_breakdown),
        sources_summary: parseJsonField<unknown[]>(report.sources_summary),
        recommendations: parseJsonField<string[]>(report.recommendations),
      },
    }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[GET /api/reports/[investigationId]]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ─── POST — gerar ou regenerar relatório manualmente ─────────────────────────

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ investigationId: string }> }
) {
  try {
    const { investigationId } = await params
    const session = await requireAuth(_req)

    const investigation = await db
      .select()
      .from(schema.investigations)
      .where(
        and(
          eq(schema.investigations.id, investigationId),
          eq(schema.investigations.company_id, session.companyId)
        )
      )
      .get()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    if (investigation.status !== 'completed' && investigation.status !== 'saturated') {
      return Response.json(
        { error: 'A investigação precisa estar concluída ou saturada para gerar o relatório' },
        { status: 400 }
      )
    }

    // Buscar workers com aliases
    const iwRows = await db
      .select({
        worker_id: schema.investigation_workers.worker_id,
        alias: schema.workers.anonymous_alias,
        role: schema.workers.role,
      })
      .from(schema.investigation_workers)
      .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
      .where(eq(schema.investigation_workers.investigation_id, investigationId))

    const aliasMap = new Map<string, { alias: string; role: string }>()
    const workerAliases: WorkerAlias[] = []
    for (const row of iwRows) {
      aliasMap.set(row.worker_id, { alias: row.alias, role: row.role })
      workerAliases.push({ alias: row.alias, role: row.role })
    }

    // Buscar todas as mensagens
    const msgRows = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.investigation_id, investigationId))
      .orderBy(schema.messages.created_at)

    const allMessages: ReportMessageEntry[] = msgRows
      .filter(m => m.content !== null)
      .map(m => {
        const workerInfo = aliasMap.get(m.worker_id)
        return {
          alias: workerInfo?.alias ?? 'Colaborador',
          role: workerInfo?.role ?? '',
          direction: m.direction as 'outbound' | 'inbound',
          content: m.content as string,
          key_points_extracted: parseJsonField<string[]>(m.key_points_extracted) ?? undefined,
        }
      })

    const reportOutput = await generateReport({
      investigation: { title: investigation.title, problem_description: investigation.problem_description },
      allMessages,
      workerAliases,
    })

    // Upsert por investigation_id
    const existingReport = await db
      .select({ id: schema.reports.id })
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

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

    if (existingReport) {
      await db
        .update(schema.reports)
        .set(reportValues)
        .where(eq(schema.reports.investigation_id, investigationId))
    } else {
      await db.insert(schema.reports).values({ id: crypto.randomUUID(), ...reportValues })
    }

    const saved = await db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

    return Response.json({
      data: saved ? {
        ...saved,
        ishikawa_breakdown: parseJsonField<IshikawaBreakdownOutput>(saved.ishikawa_breakdown),
        sources_summary: parseJsonField<unknown[]>(saved.sources_summary),
        recommendations: parseJsonField<string[]>(saved.recommendations),
      } : null,
    }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[POST /api/reports/[investigationId]]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
