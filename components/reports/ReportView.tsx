'use client'

import type { IshikawaBreakdownOutput, SourceSummaryOutput } from '@/lib/ai/types'

export interface ReportData {
  id: string
  investigation_id: string
  root_cause: string
  confidence_score: number
  confidence_justification: string | null
  ishikawa_breakdown: IshikawaBreakdownOutput | null
  sources_summary: SourceSummaryOutput[] | null
  recommendations: string[]
  generated_at: string
}

interface ReportViewProps {
  investigationTitle: string
  report: ReportData
}

const ISHIKAWA_LABELS: Record<keyof IshikawaBreakdownOutput, string> = {
  mao_de_obra:   'Mão de obra',
  maquina:       'Máquina',
  metodo:        'Método',
  material:      'Material',
  meio_ambiente: 'Meio ambiente',
  medicao:       'Medição',
}

const ISHIKAWA_KEYS = [
  'mao_de_obra', 'maquina', 'metodo', 'material', 'meio_ambiente', 'medicao',
] as const

function ConfidenceBadge({ score }: { score: number }) {
  const cfg =
    score >= 70 ? { label: 'Alta confiança', className: 'bg-green-100 text-green-800' }
    : score >= 40 ? { label: 'Confiança moderada', className: 'bg-amber-100 text-amber-800' }
    : { label: 'Baixa confiança', className: 'bg-red-100 text-red-800' }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${cfg.className}`}>
      {score}% — {cfg.label}
    </span>
  )
}

export function ReportView({ investigationTitle, report }: ReportViewProps) {
  const generatedAt = new Date(report.generated_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="space-y-8 max-w-3xl">

      {/* 1. CABEÇALHO */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{investigationTitle}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-500">Gerado em {generatedAt}</span>
          <ConfidenceBadge score={report.confidence_score} />
        </div>
      </div>

      {/* 2. CAUSA RAIZ */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Causa raiz</h2>
        <div className="rounded-lg border-2 border-gray-900 bg-gray-50 p-5">
          <p className="text-lg font-medium text-gray-900 leading-snug">{report.root_cause}</p>
          {report.confidence_justification && (
            <p className="mt-3 text-sm text-gray-500 leading-relaxed">
              {report.confidence_justification}
            </p>
          )}
        </div>
      </section>

      {/* 3. DIAGRAMA DE ISHIKAWA */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Análise de Ishikawa (6M)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ISHIKAWA_KEYS.map(key => {
            const value = report.ishikawa_breakdown?.[key] ?? null
            const isEmpty = value === null || value === undefined
            return (
              <div
                key={key}
                className={`rounded-lg border p-4 ${isEmpty ? 'bg-white border-gray-100' : 'bg-white border-gray-200'}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                  {ISHIKAWA_LABELS[key]}
                </p>
                {isEmpty ? (
                  <p className="text-sm text-gray-300">Não identificado</p>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed">{value}</p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* 4. FONTES */}
      {(report.sources_summary ?? []).length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Fontes consultadas
          </h2>
          <div className="space-y-4">
            {(report.sources_summary ?? []).map((source, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900">{source.alias}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-sm text-gray-500">{source.role}</span>
                </div>
                {source.key_points.length > 0 && (
                  <ul className="space-y-1">
                    {source.key_points.map((point, j) => (
                      <li key={j} className="flex gap-2 text-sm text-gray-600">
                        <span className="text-gray-300 shrink-0">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. RECOMENDAÇÕES */}
      {report.recommendations.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Recomendações
          </h2>
          <ol className="space-y-3">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-4 rounded-lg border border-gray-200 bg-white p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <p className="text-sm text-gray-700 leading-relaxed pt-0.5">{rec}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
