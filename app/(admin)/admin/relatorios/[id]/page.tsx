'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface IshikawaBreakdown { mao_de_obra: string | null; maquina: string | null; metodo: string | null; material: string | null; meio_ambiente: string | null; medicao: string | null }
interface SourceSummary { alias: string; role: string; key_points: string[] }
interface Report {
  id: string
  root_cause: string
  confidence_score: number
  confidence_justification: string | null
  ishikawa_breakdown: string
  sources_summary: string
  recommendations: string
  generated_at: string
}
interface Investigation { id: string; title: string; problem_description: string; status: string; created_at: string; completed_at: string | null }
interface PageData { investigation: Investigation; report: Report | null; company_name: string; cost_brl: number; cost_usd: number }

const ISHIKAWA_LABELS: Record<string, string> = {
  mao_de_obra: 'Mão de obra', maquina: 'Máquina', metodo: 'Método',
  material: 'Material', meio_ambiente: 'Meio ambiente', medicao: 'Medição',
}

function fmt(n: number, d = 2) { return n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) }

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}

export default function AdminRelatorioPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/relatorios/${id}`)
      .then(r => r.json() as Promise<{ data: PageData }>)
      .then(j => setData(j.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-sm text-slate-400">Carregando...</div>
  if (!data) return <div className="p-8 text-sm text-red-500">Investigação não encontrada.</div>

  const { investigation, report, company_name, cost_brl } = data

  const ishikawa = parseJson<IshikawaBreakdown>(report?.ishikawa_breakdown, {} as IshikawaBreakdown)
  const sources  = parseJson<SourceSummary[]>(report?.sources_summary, [])
  const recs     = parseJson<string[]>(report?.recommendations, [])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-6">
        <Link href="/admin/investigations" className="hover:text-slate-700">Investigações</Link>
        <span>/</span>
        <span className="text-slate-600">{investigation.title}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{investigation.title}</h1>
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          <span>{company_name}</span>
          <span>·</span>
          <span>{investigation.created_at.slice(0, 10)}</span>
          <span>·</span>
          <span>Custo: R$ {fmt(cost_brl)}</span>
        </div>
      </div>

      <div className="mb-6 bg-white border border-slate-200 rounded-sm p-5">
        <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">Problema investigado</p>
        <p className="text-sm text-slate-700 leading-relaxed">{investigation.problem_description}</p>
      </div>

      {!report && (
        <div className="bg-amber-50 border border-amber-200 rounded-sm px-5 py-6 text-center">
          <p className="text-amber-700 font-medium text-sm">Relatório não disponível</p>
          <p className="text-amber-600 text-xs mt-1">A investigação ainda não gerou um relatório.</p>
          <Link href="/admin/saude" className="mt-3 inline-block text-xs text-amber-700 underline">Ir para saúde do sistema</Link>
        </div>
      )}

      {report && (
        <>
          {/* Causa raiz */}
          <div className="mb-4 bg-white border border-slate-200 rounded-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Causa raiz identificada</p>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${report.confidence_score}%` }} />
                </div>
                <span className="text-xs font-semibold text-teal-700">{report.confidence_score}% confiança</span>
              </div>
            </div>
            <p className="text-slate-800 font-medium leading-relaxed">{report.root_cause}</p>
            {report.confidence_justification && (
              <p className="mt-2 text-xs text-slate-500 italic">{report.confidence_justification}</p>
            )}
          </div>

          {/* Ishikawa */}
          <div className="mb-4 bg-white border border-slate-200 rounded-sm p-5">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-4">Diagrama de Ishikawa</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(ISHIKAWA_LABELS).map(([key, label]) => {
                const val = (ishikawa as unknown as Record<string, string | null>)[key]
                return (
                  <div key={key} className={`rounded-sm border px-4 py-3 ${val ? 'border-teal-200 bg-teal-50' : 'border-slate-100 bg-slate-50'}`}>
                    <p className="text-[10px] font-semibold tracking-widest uppercase mb-1 text-slate-400">{label}</p>
                    <p className={`text-sm ${val ? 'text-teal-800' : 'text-slate-300'}`}>{val ?? 'Não identificado'}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Fontes */}
          {sources.length > 0 && (
            <div className="mb-4 bg-white border border-slate-200 rounded-sm p-5">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-4">Fontes consultadas</p>
              <div className="space-y-3">
                {sources.map((s, i) => (
                  <div key={i} className="border border-slate-100 rounded-sm px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-slate-700">{s.alias}</span>
                      <span className="text-[10px] text-slate-400">— {s.role}</span>
                    </div>
                    <ul className="space-y-1">
                      {s.key_points.map((kp, j) => (
                        <li key={j} className="text-xs text-slate-600 flex gap-2">
                          <span className="text-teal-500 shrink-0">·</span>{kp}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recomendações */}
          {recs.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-sm p-5">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-4">Recomendações</p>
              <ol className="space-y-2">
                {recs.map((r, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-700">
                    <span className="text-teal-600 font-bold shrink-0">{i + 1}.</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  )
}
