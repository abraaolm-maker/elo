import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { ReportView, type ReportData } from '@/components/reports/ReportView'
import { GenerateReportButton } from './GenerateReportButton'
import type { IshikawaBreakdownOutput, SourceSummaryOutput } from '@/lib/ai/types'

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
      .where(
        and(
          eq(schema.investigations.id, investigationId),
          eq(schema.investigations.company_id, session.companyId)
        )
      )
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
    reportData = {
      id: report.id,
      investigation_id: report.investigation_id,
      root_cause: report.root_cause,
      confidence_score: report.confidence_score,
      confidence_justification: report.confidence_justification,
      ishikawa_breakdown: parseJsonSafe<IshikawaBreakdownOutput>(report.ishikawa_breakdown),
      sources_summary: parseJsonSafe<SourceSummaryOutput[]>(report.sources_summary),
      recommendations: parseJsonSafe<string[]>(report.recommendations) ?? [],
      generated_at: report.generated_at,
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/investigations/${investigationId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          ← Voltar para investigação
        </Link>
      </div>

      {reportData ? (
        <ReportView
          investigationTitle={investigation.title}
          report={reportData}
        />
      ) : canGenerate ? (
        <div className="flex flex-col items-start gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{investigation.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              O relatório desta investigação ainda não foi gerado.
            </p>
          </div>
          <GenerateReportButton investigationId={investigationId} investigationTitle={investigation.title} />
        </div>
      ) : (
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{investigation.title}</h1>
          <p className="mt-2 text-sm text-gray-500">
            O relatório estará disponível quando a investigação for concluída.
          </p>
        </div>
      )}
    </div>
  )
}
