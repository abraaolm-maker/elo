'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/ui/toast'

const STATUS_CONFIG: Record<string, { label: string; dot: string; textColor: string; bg: string }> = {
  pending:   { label: 'Pendente',      dot: 'bg-slate-300',   textColor: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200' },
  active:    { label: 'Em andamento',  dot: 'bg-teal-500',    textColor: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200' },
  saturated: { label: 'Saturando',     dot: 'bg-amber-400',   textColor: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  completed: { label: 'Concluído',     dot: 'bg-emerald-500', textColor: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  cancelled: { label: 'Cancelado',     dot: 'bg-red-400',     textColor: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
}

const IW_STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  pending:      { label: 'Aguardando',   dot: 'bg-slate-300',   text: 'text-slate-500' },
  active:       { label: 'Respondendo',  dot: 'bg-teal-500',    text: 'text-teal-700' },
  saturated:    { label: 'Saturado',     dot: 'bg-emerald-500', text: 'text-emerald-700' },
  unresponsive: { label: 'Sem resposta', dot: 'bg-red-400',     text: 'text-red-600' },
}

export interface WorkerParticipant {
  iw_id: string
  worker_id: string
  alias: string
  name: string
  role: string
  role_description: string | null
  // whatsapp_number ausente intencionalmente — nunca exposto no dashboard (CLAUDE.md §11)
  status: string
  saturation_score: number
  manager_notes: string | null
}

export interface MessageItem {
  id: string
  worker_id: string
  direction: string
  content: string
  content_type: string
  created_at: string
}

export interface InvestigationData {
  id: string
  title: string
  problem_description: string
  status: string
  created_at: string
  completed_at: string | null
}

interface Props {
  investigation: InvestigationData
  workers: WorkerParticipant[]
  messages: MessageItem[]
}

interface ApiDetailResponse {
  data: {
    investigation: InvestigationData
    workers: WorkerParticipant[]
    messages: MessageItem[]
  }
}

// ─── Componente de observações do gestor editável ─────────────────────────────
function ObservacoesGestor({
  iwId,
  investigationId,
  valorInicial,
  editavel,
}: {
  iwId: string
  investigationId: string
  valorInicial: string | null
  editavel: boolean
}) {
  const [notas, setNotas] = useState(valorInicial ?? '')
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const toast = useToast()

  async function salvar() {
    setSalvando(true)
    try {
      const res = await fetch(`/api/investigations/${investigationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iw_id: iwId, manager_notes: notas }),
      })
      if (res.ok) {
        toast.success('Observação salva!')
      } else {
        toast.error('Erro ao salvar observação')
      }
      setEditando(false)
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setSalvando(false)
    }
  }

  if (!editavel) {
    return notas ? (
      <div className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-sm px-2.5 py-1.5 mt-2">
        <span className="font-semibold text-amber-700">Observação: </span>{notas}
      </div>
    ) : null
  }

  return (
    <div className="mt-2">
      {editando ? (
        <div className="space-y-1.5">
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={2}
            className="w-full border border-slate-200 rounded-sm px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            placeholder="Observações para a IA considerar nas próximas perguntas…"
          />
          <div className="flex gap-1.5">
            <button
              onClick={salvar}
              disabled={salvando}
              className="text-[10px] font-semibold uppercase tracking-wider bg-slate-900 text-white px-3 py-1.5 rounded-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {salvando ? '…' : 'Salvar'}
            </button>
            <button
              onClick={() => setEditando(false)}
              className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-3 py-1.5 rounded-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-xs text-slate-400 hover:text-teal-600 underline underline-offset-2 transition-colors"
        >
          {notas ? `Obs: "${notas.slice(0, 50)}${notas.length > 50 ? '…' : ''}" — editar` : '+ Adicionar observação para a IA'}
        </button>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function InvestigationDetail(props: Props) {
  const [investigation, setInvestigation] = useState(props.investigation)
  const [workers, setWorkers] = useState(props.workers)
  const [messages, setMessages] = useState(props.messages)
  const [iniciando, setIniciando] = useState(false)
  const [erroInicio, setErroInicio] = useState<string | null>(null)
  const toast = useToast()

  const refreshData = useCallback(async () => {
    try {
      const res = await fetch(`/api/investigations/${props.investigation.id}`)
      if (!res.ok) return
      const { data } = await res.json() as ApiDetailResponse
      setInvestigation(data.investigation)
      setWorkers(data.workers)
      setMessages(data.messages)
    } catch {
      // falha silenciosa
    }
  }, [props.investigation.id])

  useEffect(() => {
    const status = investigation.status
    if (status === 'completed' || status === 'cancelled') return
    const interval = setInterval(() => void refreshData(), 5000)
    return () => clearInterval(interval)
  }, [investigation.status, refreshData])

  async function iniciar() {
    setErroInicio(null)
    setIniciando(true)
    try {
      const res = await fetch(`/api/investigations/${investigation.id}/start`, { method: 'POST' })
      const result = await res.json() as { error?: string }
      if (!res.ok) { setErroInicio(result.error ?? 'Erro ao iniciar.'); return }
      toast.success('Investigação iniciada! Primeiras perguntas enviadas via WhatsApp.')
      await refreshData()
    } catch {
      setErroInicio('Erro de conexão.')
    } finally {
      setIniciando(false)
    }
  }

  const statusCfg = STATUS_CONFIG[investigation.status] ?? STATUS_CONFIG.pending
  const podeEditarObservacoes = investigation.status === 'active'

  // Agrupar mensagens por worker
  const msgsPorWorker = new Map<string, MessageItem[]>()
  for (const msg of messages) {
    if (!msgsPorWorker.has(msg.worker_id)) msgsPorWorker.set(msg.worker_id, [])
    msgsPorWorker.get(msg.worker_id)!.push(msg)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-100 px-8 py-6 bg-white sticky top-0 z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5">
              <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm border ${statusCfg.bg} ${statusCfg.textColor}`}>
                {investigation.status === 'active' ? (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusCfg.dot} opacity-75`} />
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${statusCfg.dot}`} />
                  </span>
                ) : (
                  <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                )}
                {statusCfg.label}
              </div>
            </div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight truncate">{investigation.title}</h1>
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{investigation.problem_description}</p>
          </div>

          <div className="flex gap-2 shrink-0">
            {investigation.status === 'pending' && (
              <button
                onClick={iniciar}
                disabled={iniciando}
                className="flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 px-5 rounded-sm hover:bg-slate-800 transition-all shadow-sm disabled:opacity-50"
              >
                {iniciando ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Iniciando…
                  </>
                ) : 'Iniciar investigação'}
              </button>
            )}
            {investigation.status === 'completed' && (
              <Link
                href={`/reports/${investigation.id}`}
                className="text-xs font-semibold uppercase tracking-wide text-teal-600 hover:text-teal-800 transition-colors flex items-center gap-1.5 border border-teal-200 bg-teal-50 px-4 py-2.5 rounded-sm"
              >
                Ver relatório
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        {erroInicio && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-sm px-4 py-3 text-sm text-red-700">
            {erroInicio}
          </div>
        )}

        {investigation.status === 'completed' && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-sm px-4 py-2.5 text-xs text-slate-500 font-mono">
            Investigação concluída — somente leitura
          </div>
        )}
      </div>

      {/* Participantes + conversas */}
      <div className="px-8 py-6 space-y-4 max-w-4xl">
        {workers.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum participante associado.</p>
        ) : (
          workers.map(worker => {
            const workerMsgs = msgsPorWorker.get(worker.worker_id) ?? []
            const iwCfg = IW_STATUS_CONFIG[worker.status] ?? IW_STATUS_CONFIG.pending

            return (
              <div key={worker.iw_id} className="border border-slate-200 rounded-sm bg-white overflow-hidden hover:border-slate-300 transition-colors">
                {/* Cabeçalho do participante */}
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-7 h-7 rounded-sm bg-slate-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-slate-600">{worker.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{worker.name}</span>
                        <span className="text-xs text-slate-400 font-mono">{worker.alias}</span>
                      </div>
                      <p className="text-xs text-slate-500 ml-9">{worker.role}</p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {/* Barra de saturação */}
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full transition-all duration-500"
                            style={{ width: `${worker.saturation_score}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 w-7 text-right">{worker.saturation_score}%</span>
                      </div>
                      {/* Status badge */}
                      <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${iwCfg.text}`}>
                        {worker.status === 'active' ? (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${iwCfg.dot} opacity-75`} />
                            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${iwCfg.dot}`} />
                          </span>
                        ) : (
                          <span className={`w-1.5 h-1.5 rounded-full ${iwCfg.dot}`} />
                        )}
                        {iwCfg.label}
                      </div>
                    </div>
                  </div>

                  <div className="ml-9">
                    <ObservacoesGestor
                      iwId={worker.iw_id}
                      investigationId={investigation.id}
                      valorInicial={worker.manager_notes}
                      editavel={podeEditarObservacoes}
                    />
                  </div>
                </div>

                {/* Conversa */}
                <div className="p-5 space-y-2 min-h-[60px]">
                  {workerMsgs.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3 font-mono">Aguardando mensagens…</p>
                  ) : (
                    workerMsgs.map(msg => {
                      const saiu = msg.direction === 'outbound'
                      const hora = new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      return (
                        <div key={msg.id} className={`flex ${saiu ? 'justify-start' : 'justify-end'}`}>
                          <div
                            className={`max-w-[80%] px-3.5 py-2.5 rounded-sm text-sm ${
                              saiu
                                ? 'bg-slate-100 text-slate-800 border border-slate-200'
                                : 'bg-teal-600 text-white'
                            }`}
                          >
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            <p className={`text-[10px] mt-1.5 font-mono ${saiu ? 'text-slate-400' : 'text-teal-200'}`}>
                              {saiu ? 'Sistema' : worker.alias} · {hora}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
