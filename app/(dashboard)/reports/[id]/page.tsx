import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ReportView, type ReportData } from '@/components/reports/ReportView'
import { GenerateReportButton } from './GenerateReportButton'
import type { IshikawaBreakdownOutput, SourceSummaryOutput } from '@/lib/ai/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface InvestigationRow {
  id: string
  title: string
  status: string
}

interface RawReport {
  id: string
  investigation_id: string
  root_cause: string
  confidence_score: number
  confidence_justification: string | null
  ishikawa_breakdown: unknown
  sources_summary: unknown
  recommendations: string[]
  generated_at: string
}

function parseReport(raw: RawReport, investigationId: string): ReportData {
  return {
    id: raw.id,
    investigation_id: investigationId,
    root_cause: raw.root_cause,
    confidence_score: raw.confidence_score,
    confidence_justification: raw.confidence_justification,
    ishikawa_breakdown: raw.ishikawa_breakdown as IshikawaBreakdownOutput,
    sources_summary: raw.sources_summary as SourceSummaryOutput[],
    recommendations: raw.recommendations,
    generated_at: raw.generated_at,
  }
}

export default async function ReportPage({ params }: RouteParams) {
  // [id] is the investigation_id
  const { id: investigationId } = await params
  const supabase = await createClient()

  const [{ data: invData, error: invError }, { data: reportData }] = await Promise.all([
    supabase
      .from('investigations')
      .select('id, title, status')
      .eq('id', investigationId)
      .single(),
    supabase
      .from('reports')
      .select('id, investigation_id, root_cause, confidence_score, confidence_justification, ishikawa_breakdown, sources_summary, recommendations, generated_at')
      .eq('investigation_id', investigationId)
      .maybeSingle(),
  ])

  if (invError || !invData) notFound()

  const investigation = invData as InvestigationRow
  const canGenerate = investigation.status === 'completed' || investigation.status === 'saturated'

  return (
    <div className="space-y-6">
      {/* Navegação */}
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
          report={parseReport(reportData as RawReport, investigationId)}
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
