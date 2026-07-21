import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { ReportView, type ReportData, type ActionItemData } from '@/components/reports/ReportView'
import { GenerateReportButton } from './GenerateReportButton'
import type { IshikawaBreakdownOutput, SourceSummaryOutput, ActionPlanTimeframe } from '@/lib/ai/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

function parseJsonSafe<T>(raw: string | null): T | null {
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export default async function ReportPage({ params }: RouteParams) {
  const { id: investigationId } = await params
  const session = await getSession()
  if (!session) redirect('/login')

  const [investigation, report] = await Promise.all([
    db
      .select({ id: schema.investigations.id, title: schema.investigations.title, status: schema.investigations.status })
      .from(schema.investigations)
      .where(and(eq(schema.investigations.id, investigationId), eq(schema.investigations.company_id, session.companyId)))
      .get(),

    db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get(),
  ])

  if (!investigation) notFound()

  const canGenerate = investigation.status === 'completed' || investigation.status === 'saturated'

  let reportData: ReportData | null = null
  if (report) {
    // Buscar action_items deste relatório
    const actionItemRows = await db
      .select()
      .from(schema.action_items)
      .where(eq(schema.action_items.report_id, report.id))
      .orderBy(schema.action_items.priority_rank)

    const actionItems: ActionItemData[] = actionItemRows.map(ai => ({
      id:                   ai.id,
      what:                 ai.what,
      why:                  ai.why,
      where_scope:          ai.where_scope,
      who_role:             ai.who_role,
      how_to:               ai.how_to,
      how_much_estimate:    ai.how_much_estimate,
      impact_score:         ai.impact_score,
      effort_score:         ai.effort_score,
      timeframe:            ai.timeframe as ActionPlanTimeframe,
      priority_rank:        ai.priority_rank,
      is_recurring_pattern: Boolean(ai.is_recurring_pattern),
      related_pattern_note: ai.related_pattern_note,
      status:               ai.status,
    }))

    reportData = {
      id:                      report.id,
      investigation_id:        report.investigation_id,
      root_cause:              report.root_cause,
      confidence_score:        report.confidence_score,
      confidence_justification: report.confidence_justification,
      ishikawa_breakdown:      parseJsonSafe<IshikawaBreakdownOutput>(report.ishikawa_breakdown),
      sources_summary:         parseJsonSafe<SourceSummaryOutput[]>(report.sources_summary),
      recommendations:         parseJsonSafe<string[]>(report.recommendations) ?? [],
      generated_at:            report.generated_at,
      action_items:            actionItems,
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-100 px-8 py-6 bg-white sticky top-0 z-10">
        <Link
          href={`/investigations/${investigationId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-teal-600 transition-colors mb-4"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Voltar à investigação
        </Link>
        <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Relatório</p>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight mt-1">{investigation.title}</h1>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {reportData ? (
          <ReportView investigationTitle={investigation.title} report={reportData} />
        ) : canGenerate ? (
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-sm bg-white p-6 max-w-md">
              <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-slate-400 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-900 mb-1">Relatório não gerado ainda</p>
              <p className="text-sm text-slate-500 mb-4">A investigação foi concluída. Gere o relatório para ver a análise de causa raiz e o plano de ação.</p>
              <GenerateReportButton investigationId={investigationId} investigationTitle={investigation.title} />
            </div>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-sm bg-white p-6 max-w-md">
            <p className="text-sm font-semibold text-slate-900 mb-1">Investigação em andamento</p>
            <p className="text-sm text-slate-500">O relatório estará disponível quando a investigação for concluída.</p>
          </div>
        )}
      </div>
    </div>
  )
}
