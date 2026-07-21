'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/toast'
import type { IshikawaBreakdownOutput, SourceSummaryOutput, ActionPlanTimeframe } from '@/lib/ai/types'

export interface ActionItemData {
  id: string
  what: string
  why: string
  where_scope: string | null
  who_role: string | null
  how_to: string
  how_much_estimate: string | null
  impact_score: number
  effort_score: number
  timeframe: ActionPlanTimeframe
  priority_rank: number
  is_recurring_pattern: boolean
  related_pattern_note: string | null
  status: string
}

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
  action_items?: ActionItemData[]
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

// ─── ConfidenceMeter ──────────────────────────────────────────────────────────
function ConfidenceMeter({ score }: { score: number }) {
  const cfg =
    score >= 70 ? { label: 'Alta confiança',     dot: 'bg-emerald-500', text: 'text-emerald-700', bar: 'bg-emerald-500' }
    : score >= 40 ? { label: 'Confiança moderada', dot: 'bg-amber-400',   text: 'text-amber-700',   bar: 'bg-amber-400' }
    : { label: 'Baixa confiança',     dot: 'bg-red-400',     text: 'text-red-600',     bar: 'bg-red-400' }

  return (
    <div className="flex items-center gap-3">
      <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${cfg.text}`}>
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </div>
      <div className="flex items-center gap-2">
        <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full ${cfg.bar} rounded-full transition-all`} style={{ width: `${score}%` }} />
        </div>
        <span className="text-xs font-mono text-slate-500">{score}%</span>
      </div>
    </div>
  )
}

// ─── ActionItemCard ───────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  suggested:   { label: 'Sugerido',      cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  in_progress: { label: 'Em andamento',  cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  done:        { label: 'Concluído',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  dismissed:   { label: 'Descartado',    cls: 'bg-slate-50 text-slate-400 border-slate-200 opacity-60' },
}

const NEXT_STATUS: Record<string, string> = {
  suggested:   'in_progress',
  in_progress: 'done',
  done:        'dismissed',
  dismissed:   'suggested',
}

function ActionItemCard({ item }: { item: ActionItemData }) {
  const [status, setStatus] = useState(item.status)
  const [expanded, setExpanded] = useState(false)
  const [updating, setUpdating] = useState(false)
  const toast = useToast()

  const cfg = STATUS_CFG[status] ?? STATUS_CFG.suggested

  async function nextStatus() {
    const next = NEXT_STATUS[status] ?? 'suggested'
    setUpdating(true)
    try {
      const res = await fetch(`/api/action-items/${item.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: next }),
      })
      if (res.ok) {
        setStatus(next)
        toast.info(`Ação marcada como "${STATUS_CFG[next]?.label ?? next}"`)
      } else {
        toast.error('Erro ao atualizar status')
      }
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className={`border rounded-sm bg-white transition-all ${status === 'dismissed' ? 'opacity-60' : 'hover:shadow-sm'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="text-sm font-semibold text-slate-900 leading-snug flex-1">{item.what}</p>
          <button
            onClick={nextStatus}
            disabled={updating}
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm border shrink-0 transition-all hover:opacity-80 disabled:opacity-50 ${cfg.cls}`}
            title="Clique para avançar o status"
          >
            {cfg.label}
          </button>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed mb-2">{item.why}</p>

        <div className="flex flex-wrap gap-2">
          {item.who_role && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              {item.who_role}
            </span>
          )}
          {item.where_scope && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {item.where_scope}
            </span>
          )}
          {item.how_much_estimate && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-sm">
              {item.how_much_estimate}
            </span>
          )}
          {item.is_recurring_pattern && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-sm" title={item.related_pattern_note ?? ''}>
              ⚠ Padrão recorrente
            </span>
          )}
        </div>

        {/* how_to expansível */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-teal-600 hover:text-teal-800 transition-colors flex items-center gap-1"
        >
          {expanded ? 'Ocultar como executar' : 'Ver como executar'}
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {expanded && (
          <div className="mt-2 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-600 leading-relaxed">{item.how_to}</p>
            <div className="flex gap-4 mt-2">
              <div className="text-[10px] text-slate-400">
                <span className="font-semibold">Impacto:</span> {item.impact_score}/100
              </div>
              <div className="text-[10px] text-slate-400">
                <span className="font-semibold">Esforço:</span> {item.effort_score}/100
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ActionPlanSection ────────────────────────────────────────────────────────
const TIMEFRAME_CFG: Record<ActionPlanTimeframe, { label: string; dot: string; header: string; border: string }> = {
  curto_prazo:  { label: 'Curto Prazo',  dot: 'bg-emerald-500', header: 'text-emerald-700', border: 'border-emerald-200' },
  medio_prazo:  { label: 'Médio Prazo',  dot: 'bg-amber-400',   header: 'text-amber-700',   border: 'border-amber-200' },
  longo_prazo:  { label: 'Longo Prazo',  dot: 'bg-red-400',     header: 'text-red-600',     border: 'border-red-200' },
}

const TIMEFRAME_ORDER: ActionPlanTimeframe[] = ['curto_prazo', 'medio_prazo', 'longo_prazo']

function ActionPlanSection({ items }: { items: ActionItemData[] }) {
  const grouped = TIMEFRAME_ORDER.reduce<Record<ActionPlanTimeframe, ActionItemData[]>>((acc, tf) => {
    acc[tf] = items.filter(i => i.timeframe === tf).sort((a, b) => a.priority_rank - b.priority_rank)
    return acc
  }, { curto_prazo: [], medio_prazo: [], longo_prazo: [] })

  const hasItems = items.length > 0

  if (!hasItems) return null

  return (
    <section>
      <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-3">
        Plano de ação
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIMEFRAME_ORDER.map(tf => {
          const cfg = TIMEFRAME_CFG[tf]
          const tfItems = grouped[tf]
          return (
            <div key={tf} className={`border ${cfg.border} rounded-sm overflow-hidden`}>
              <div className="px-4 py-3 border-b border-inherit bg-white flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${cfg.dot} shrink-0`} />
                <p className={`text-[10px] font-bold uppercase tracking-widest ${cfg.header}`}>{cfg.label}</p>
                <span className="ml-auto text-[10px] font-mono text-slate-400">{tfItems.length} ação{tfItems.length !== 1 ? 'ões' : ''}</span>
              </div>
              <div className="p-3 space-y-2 bg-slate-50/50">
                {tfItems.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Nenhuma ação neste prazo</p>
                ) : (
                  tfItems.map(item => <ActionItemCard key={item.id} item={item} />)
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── ReportView principal ─────────────────────────────────────────────────────
export function ReportView({ investigationTitle, report }: ReportViewProps) {
  const generatedAt = new Date(report.generated_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="space-y-8 max-w-4xl">

      {/* 1. CABEÇALHO */}
      <div>
        <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">Relatório de causa raiz</p>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{investigationTitle}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span className="text-xs font-mono text-slate-400">Gerado em {generatedAt}</span>
          <ConfidenceMeter score={report.confidence_score} />
        </div>
      </div>

      {/* 2. CAUSA RAIZ */}
      <section>
        <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-3">Causa raiz identificada</p>
        <div className="border-2 border-slate-900 rounded-sm p-6 bg-white">
          <p className="text-lg font-semibold text-slate-900 leading-snug tracking-tight">{report.root_cause}</p>
          {report.confidence_justification && (
            <p className="mt-3 text-sm text-slate-500 leading-relaxed border-l-2 border-teal-100 pl-3">
              {report.confidence_justification}
            </p>
          )}
        </div>
      </section>

      {/* 3. PLANO DE AÇÃO */}
      {(report.action_items ?? []).length > 0 && (
        <ActionPlanSection items={report.action_items!} />
      )}

      {/* 4. DIAGRAMA DE ISHIKAWA */}
      <section>
        <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-3">
          Análise de Ishikawa (6M)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ISHIKAWA_KEYS.map(key => {
            const value = report.ishikawa_breakdown?.[key] ?? null
            const isEmpty = value === null || value === undefined
            return (
              <div
                key={key}
                className={`rounded-sm border p-4 ${isEmpty ? 'bg-slate-50/50 border-slate-100' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all'}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                  {ISHIKAWA_LABELS[key]}
                </p>
                {isEmpty ? (
                  <p className="text-xs text-slate-300">Não identificado</p>
                ) : (
                  <p className="text-sm text-slate-700 leading-relaxed">{value}</p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* 5. FONTES */}
      {(report.sources_summary ?? []).length > 0 && (
        <section>
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-3">
            Fontes consultadas
          </p>
          <div className="space-y-3">
            {(report.sources_summary ?? []).map((source, i) => (
              <div key={i} className="rounded-sm border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-sm bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold">{source.alias.charAt(source.alias.length - 1)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{source.alias}</p>
                    <p className="text-[10px] font-mono text-slate-400">{source.role}</p>
                  </div>
                </div>
                {source.key_points.length > 0 && (
                  <ul className="space-y-1 border-t border-slate-100 pt-3">
                    {source.key_points.map((point, j) => (
                      <li key={j} className="flex gap-2.5 text-sm text-slate-600">
                        <span className="text-teal-400 shrink-0 mt-0.5">•</span>
                        <span className="leading-relaxed">{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. RECOMENDAÇÕES */}
      {report.recommendations.length > 0 && (
        <section>
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-3">
            Recomendações
          </p>
          <ol className="space-y-3">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-4 rounded-sm border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition-all">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-slate-900 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <p className="text-sm text-slate-700 leading-relaxed pt-0.5">{rec}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
