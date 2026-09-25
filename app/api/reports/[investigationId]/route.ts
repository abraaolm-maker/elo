// Geração de relatório é a operação mais longa do sistema: manda todas as
// conversas da investigação para a IA. Sem isto a rota rodava com o padrão da
// Vercel (10s) e era morta antes de terminar — sem nem chegar ao catch, o que
// deixava a falha invisível nos logs.
export const maxDuration = 60

import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { generateReport } from '@/lib/ai/report-generator'
import type { ReportMessageEntry, WorkerAlias } from '@/lib/ai/types'
import type { IshikawaBreakdownOutput } from '@/lib/ai/types'
import { montarEntradaRelatorio } from '@/lib/ai/report-input'
import { logError } from '@/lib/monitoring/logger'
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

    // Payload enxuto e compartilhado com as demais fases — as perguntas da
    // própria IA vão truncadas, já que a evidência está nas respostas
    const { allMessages } = await montarEntradaRelatorio(investigationId)

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
      // evidence_map, divergences e sensitive_observations são preenchidos pela
      // segunda fase (POST .../evidencias) — não sobrescrever aqui
      generated_at: new Date().toISOString(),
    }

    let reportId: string
    if (existingReport) {
      await db
        .update(schema.reports)
        .set(reportValues)
        .where(eq(schema.reports.investigation_id, investigationId))
      reportId = existingReport.id
    } else {
      reportId = crypto.randomUUID()
      await db.insert(schema.reports).values({ id: reportId, ...reportValues })
    }

    // O plano de ação é gerado na fase seguinte (POST .../plano) — não mexer
    // nos action_items aqui, para uma regeração da análise não apagar um plano
    // que já esteja pronto

    // Com o relatório pronto, a investigação está concluída. Antes isso era
    // feito pelo fluxo automático; como a geração agora é disparada pelo
    // gestor, o encerramento precisa acontecer aqui — senão a investigação
    // ficaria presa em 'saturated' mesmo já tendo relatório.
    if (investigation.status !== 'completed') {
      await db
        .update(schema.investigations)
        .set({ status: 'completed', completed_at: new Date().toISOString() })
        .where(eq(schema.investigations.id, investigationId))
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
    // Registrado no banco: sem isto, falhas nesta rota só existiam no console
    // da Vercel e não apareciam no painel de Saúde do sistema
    await logError('api/reports POST', error)
    return Response.json({ error: 'Erro interno ao gerar o relatório.' }, { status: 500 })
  }
}
