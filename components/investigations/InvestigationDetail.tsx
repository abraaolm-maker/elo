'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Pendente',      className: 'bg-gray-100 text-gray-700' },
  active:    { label: 'Em andamento',  className: 'bg-blue-100 text-blue-700' },
  saturated: { label: 'Saturado',      className: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Concluído',     className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelado',     className: 'bg-red-100 text-red-700' },
}

const IW_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:      { label: 'Aguardando',   className: 'bg-gray-100 text-gray-600' },
  active:       { label: 'Respondendo',  className: 'bg-blue-100 text-blue-600' },
  saturated:    { label: 'Saturado',     className: 'bg-green-100 text-green-600' },
  unresponsive: { label: 'Sem resposta', className: 'bg-red-100 text-red-600' },
}

export interface WorkerParticipant {
  iw_id: string
  worker_id: string
  alias: string
  role: string
  status: string
  saturation_score: number
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

interface InvestigationDetailProps {
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

export function InvestigationDetail(props: InvestigationDetailProps) {
  const [investigation, setInvestigation] = useState(props.investigation)
  const [workers, setWorkers] = useState(props.workers)
  const [messages, setMessages] = useState(props.messages)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const refreshData = useCallback(async () => {
    try {
      const res = await fetch(`/api/investigations/${props.investigation.id}`)
      if (!res.ok) return
      const { data } = await res.json() as ApiDetailResponse
      setInvestigation(data.investigation)
      setWorkers(data.workers)
      setMessages(data.messages)
    } catch {
      // falha silenciosa — dados já estão na tela
    }
  }, [props.investigation.id])

  // Polling de 5s para manter a UI atualizada (substitui Supabase Realtime)
  useEffect(() => {
    const invStatus = investigation.status
    if (invStatus === 'completed' || invStatus === 'cancelled') return

    const interval = setInterval(() => {
      void refreshData()
    }, 5000)

    return () => clearInterval(interval)
  }, [investigation.status, refreshData])

  async function handleStart() {
    setStartError(null)
    setStarting(true)
    try {
      const res = await fetch(`/api/investigations/${investigation.id}/start`, { method: 'POST' })
      const result = await res.json() as { error?: string }
      if (!res.ok) { setStartError(result.error ?? 'Erro ao iniciar.'); return }
      await refreshData()
    } catch {
      setStartError('Erro de conexão.')
    } finally {
      setStarting(false)
    }
  }

  // Agrupar mensagens por worker_id
  const messagesByWorker = new Map<string, MessageItem[]>()
  for (const msg of messages) {
    if (!messagesByWorker.has(msg.worker_id)) messagesByWorker.set(msg.worker_id, [])
    messagesByWorker.get(msg.worker_id)!.push(msg)
  }

  const statusCfg = STATUS_CONFIG[investigation.status] ?? STATUS_CONFIG.pending

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{investigation.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{investigation.problem_description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
          {investigation.status === 'pending' && (
            <Button onClick={handleStart} disabled={starting} size="sm">
              {starting ? 'Iniciando…' : 'Iniciar investigação'}
            </Button>
          )}
          {investigation.status === 'completed' && (
            <Link
              href={`/reports/${investigation.id}`}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Ver relatório
            </Link>
          )}
        </div>
      </div>

      {startError && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{startError}</p>
      )}

      {/* Threads por worker */}
      {workers.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum worker associado.</p>
      ) : (
        <div className="space-y-4">
          {workers.map(worker => {
            const workerMsgs = messagesByWorker.get(worker.worker_id) ?? []
            const iwCfg = IW_STATUS_CONFIG[worker.status] ?? IW_STATUS_CONFIG.pending

            return (
              <div key={worker.iw_id} className="border rounded-lg bg-white overflow-hidden">
                {/* Worker header */}
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{worker.alias}</span>
                    <span className="text-gray-500 text-sm ml-2">— {worker.role}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${worker.saturation_score}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{worker.saturation_score}%</span>
                    </div>
                    <Badge className={`text-xs ${iwCfg.className}`}>{iwCfg.label}</Badge>
                  </div>
                </div>

                {/* Messages */}
                <div className="p-4 space-y-2 min-h-[60px]">
                  {workerMsgs.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">Sem mensagens ainda.</p>
                  ) : (
                    workerMsgs.map(msg => {
                      const isOutbound = msg.direction === 'outbound'
                      const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOutbound ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                              isOutbound
                                ? 'bg-gray-100 text-gray-800'
                                : 'bg-blue-50 text-blue-900'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <p className={`text-xs mt-1 ${isOutbound ? 'text-gray-400' : 'text-blue-400'}`}>
                              {isOutbound ? 'Sistema' : worker.alias} · {time}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
