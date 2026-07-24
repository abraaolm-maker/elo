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
  // whatsapp_number e cpf ausentes intencionalmente — nunca expostos no dashboard (CLAUDE.md §11)
  status: string
  saturation_score: number
  manager_notes: string | null
  access_token: string | null
  first_accessed_at: string | null
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

interface AvailableWorker {
  id: string
  anonymous_alias: string
  role: string
  role_description: string | null
  whatsapp_masked: string
  is_active: boolean
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

// ─── Modal de edição de worker ────────────────────────────────────────────────
function EditWorkerModal({
  worker,
  onClose,
  onSaved,
}: {
  worker: WorkerParticipant
  onClose: () => void
  onSaved: () => void
}) {
  const [role, setRole] = useState(worker.role)
  const [roleDesc, setRoleDesc] = useState(worker.role_description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  async function salvar() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/workers/${worker.worker_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, role_description: roleDesc }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Erro ao salvar.')
        return
      }
      toast.success('Participante atualizado!')
      onSaved()
      onClose()
    } catch {
      setError('Erro de conexão.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-sm shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Editar participante</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-slate-500">
          <span className="font-semibold">{worker.alias}</span> · {worker.name}
        </p>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Cargo</label>
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Responsabilidades</label>
          <textarea
            value={roleDesc}
            onChange={e => setRoleDesc(e.target.value)}
            rows={3}
            placeholder="Descreva o que essa pessoa faz no dia a dia…"
            className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-xs font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-4 py-2 rounded-sm hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving || !role.trim()}
            className="text-xs font-semibold uppercase tracking-wider bg-slate-900 text-white px-4 py-2 rounded-sm hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal para adicionar participante ────────────────────────────────────────
function AddParticipantModal({
  investigationId,
  currentWorkerIds,
  onClose,
  onAdded,
}: {
  investigationId: string
  currentWorkerIds: string[]
  onClose: () => void
  onAdded: () => void
}) {
  const [workers, setWorkers] = useState<AvailableWorker[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    fetch('/api/workers')
      .then(r => r.json())
      .then((d: { data: AvailableWorker[] }) => setWorkers(d.data ?? []))
      .catch(() => {/* silencioso */})
      .finally(() => setLoading(false))
  }, [])

  const disponíveis = workers.filter(w => w.is_active && !currentWorkerIds.includes(w.id))

  async function adicionar(workerId: string) {
    setAdding(workerId)
    try {
      const res = await fetch(`/api/investigations/${investigationId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        toast.error(d.error ?? 'Erro ao adicionar.')
        return
      }
      toast.success('Participante adicionado!')
      onAdded()
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-sm shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Adicionar participante</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-4">Carregando…</p>
        ) : disponíveis.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            Todos os trabalhadores ativos já são participantes, ou não há trabalhadores cadastrados.
          </p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {disponíveis.map(w => (
              <li key={w.id} className="flex items-center justify-between gap-3 border border-slate-100 rounded-sm px-3 py-2.5 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{w.anonymous_alias}</p>
                  <p className="text-xs text-slate-500">{w.role} · {w.whatsapp_masked}</p>
                </div>
                <button
                  onClick={() => void adicionar(w.id)}
                  disabled={adding === w.id}
                  className="text-[10px] font-semibold uppercase tracking-wider bg-slate-900 text-white px-3 py-1.5 rounded-sm hover:bg-slate-800 disabled:opacity-50 shrink-0"
                >
                  {adding === w.id ? '…' : 'Adicionar'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between items-center pt-1 border-t border-slate-100">
          <Link href="/workers" className="text-xs text-teal-600 hover:underline">
            Cadastrar novo trabalhador
          </Link>
          <button
            onClick={onClose}
            className="text-xs font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-4 py-1.5 rounded-sm hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Observações do gestor ────────────────────────────────────────────────────
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
      if (res.ok) toast.success('Observação salva!')
      else toast.error('Erro ao salvar observação')
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
  const [cancelando, setCancelando] = useState(false)
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false)
  const [erroInicio, setErroInicio] = useState<string | null>(null)
  const [editandoWorker, setEditandoWorker] = useState<WorkerParticipant | null>(null)
  const [adicionandoParticipante, setAdicionandoParticipante] = useState(false)
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
      toast.success('Investigação iniciada! Links de acesso gerados — copie e envie para cada participante.')
      await refreshData()
    } catch {
      setErroInicio('Erro de conexão.')
    } finally {
      setIniciando(false)
    }
  }

  async function cancelar() {
    setCancelando(true)
    try {
      const res = await fetch(`/api/investigations/${investigation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (res.ok) {
        toast.success('Investigação cancelada.')
        await refreshData()
      } else {
        toast.error('Erro ao cancelar.')
      }
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setCancelando(false)
      setConfirmarCancelamento(false)
    }
  }

  const statusCfg = STATUS_CONFIG[investigation.status] ?? STATUS_CONFIG.pending
  const podeEditarObservacoes = investigation.status === 'active'
  const isPending = investigation.status === 'pending'
  const isConcluida = investigation.status === 'completed' || investigation.status === 'cancelled'

  const msgsPorWorker = new Map<string, MessageItem[]>()
  for (const msg of messages) {
    if (!msgsPorWorker.has(msg.worker_id)) msgsPorWorker.set(msg.worker_id, [])
    msgsPorWorker.get(msg.worker_id)!.push(msg)
  }

  const saturados = workers.filter(w => w.status === 'saturated' || w.status === 'unresponsive').length
  const progressoPct = workers.length > 0 ? Math.round((saturados / workers.length) * 100) : 0

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Modais */}
      {editandoWorker && (
        <EditWorkerModal
          worker={editandoWorker}
          onClose={() => setEditandoWorker(null)}
          onSaved={() => void refreshData()}
        />
      )}
      {adicionandoParticipante && (
        <AddParticipantModal
          investigationId={investigation.id}
          currentWorkerIds={workers.map(w => w.worker_id)}
          onClose={() => setAdicionandoParticipante(false)}
          onAdded={() => { void refreshData(); setAdicionandoParticipante(false) }}
        />
      )}

      {/* Confirmação de cancelamento */}
      {confirmarCancelamento && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm shadow-xl border border-slate-200 w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Cancelar investigação?</h2>
            <p className="text-sm text-slate-500">
              Esta ação não pode ser desfeita. A investigação será encerrada sem gerar relatório.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmarCancelamento(false)}
                className="text-xs font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-4 py-2 rounded-sm hover:bg-slate-50"
              >
                Voltar
              </button>
              <button
                onClick={cancelar}
                disabled={cancelando}
                className="text-xs font-semibold uppercase tracking-wider bg-red-600 text-white px-4 py-2 rounded-sm hover:bg-red-700 disabled:opacity-50"
              >
                {cancelando ? 'Cancelando…' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

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

          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
            {isPending && (
              <>
                <button
                  onClick={iniciar}
                  disabled={iniciando || workers.length === 0}
                  title={workers.length === 0 ? 'Adicione pelo menos um participante' : undefined}
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
                <button
                  onClick={() => setConfirmarCancelamento(true)}
                  className="text-xs font-semibold uppercase tracking-wider border border-red-200 text-red-600 bg-red-50 px-4 py-2.5 rounded-sm hover:bg-red-100 transition-colors"
                >
                  Cancelar
                </button>
              </>
            )}
            {investigation.status === 'active' && (
              <button
                onClick={() => setConfirmarCancelamento(true)}
                className="text-xs font-semibold uppercase tracking-wider border border-red-200 text-red-600 bg-red-50 px-4 py-2.5 rounded-sm hover:bg-red-100 transition-colors"
              >
                Encerrar
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

        {isPending && workers.length === 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-sm px-4 py-2.5 text-xs text-amber-700">
            Adicione pelo menos um participante antes de iniciar a investigação.
          </div>
        )}

        {/* Barra de progresso geral */}
        {!isConcluida && workers.length > 0 && investigation.status !== 'pending' && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Progresso</span>
              <span className="text-[10px] font-mono text-slate-400">{saturados}/{workers.length} saturados</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-700"
                style={{ width: `${progressoPct}%` }}
              />
            </div>
          </div>
        )}

        {isConcluida && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-sm px-4 py-2.5 text-xs text-slate-500 font-mono">
            {investigation.status === 'cancelled' ? 'Investigação cancelada — somente leitura' : 'Investigação concluída — somente leitura'}
          </div>
        )}
      </div>

      {/* Participantes + conversas */}
      <div className="px-8 py-6 space-y-4 max-w-4xl">
        {/* Cabeçalho da seção + botão adicionar */}
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
            Participantes ({workers.length})
          </h2>
          {isPending && (
            <button
              onClick={() => setAdicionandoParticipante(true)}
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-600 hover:text-teal-800 border border-teal-200 bg-teal-50 px-3 py-1.5 rounded-sm hover:bg-teal-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Adicionar participante
            </button>
          )}
        </div>

        {workers.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-sm p-8 text-center">
            <p className="text-sm text-slate-400 mb-3">Nenhum participante adicionado ainda.</p>
            {isPending && (
              <button
                onClick={() => setAdicionandoParticipante(true)}
                className="text-xs font-semibold uppercase tracking-wider bg-slate-900 text-white px-4 py-2 rounded-sm hover:bg-slate-800"
              >
                Adicionar participante
              </button>
            )}
          </div>
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

                    <div className="flex items-center gap-3 shrink-0">
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
                      {/* placeholder — link está abaixo do header */}
                      {/* Botão editar (apenas quando não concluída) */}
                      {!isConcluida && (
                        <button
                          onClick={() => setEditandoWorker(worker)}
                          className="text-slate-300 hover:text-teal-600 transition-colors"
                          title="Editar cargo e responsabilidades"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                      )}
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

                {/* Bloco de link do portal — visível quando há access_token */}
                {worker.access_token && (
                  <div className="px-5 py-3 border-b border-slate-100 bg-teal-50/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 text-teal-600 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-700 mb-0.5">Link do portal</p>
                        <p className="text-xs text-slate-500 font-mono truncate">
                          {typeof window !== 'undefined' ? `${window.location.origin}/worker/${worker.access_token}` : `/worker/${worker.access_token}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Status de acesso */}
                      {worker.first_accessed_at ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-sm font-medium whitespace-nowrap">
                          ✓ Acessado em {new Date(worker.first_accessed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-2 py-1 rounded-sm font-medium whitespace-nowrap">
                          Nunca acessado
                        </span>
                      )}
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/worker/${worker.access_token}`
                          navigator.clipboard.writeText(url)
                          toast.success('Link copiado!')
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-sm transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                        </svg>
                        Copiar link
                      </button>
                    </div>
                  </div>
                )}

                {/* Conversa */}
                <div className="p-5 space-y-2 min-h-[60px]">
                  {workerMsgs.length === 0 ? (
                    <div className="text-center py-4">
                      {investigation.status === 'active' ? (
                        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                          <svg className="animate-spin w-3 h-3 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Aguardando primeira resposta…
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 font-mono">Nenhuma mensagem ainda.</p>
                      )}
                    </div>
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
