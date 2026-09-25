'use client'

import { useEffect, useState } from 'react'
import { fmtDataHoraCurta, fmtData } from '@/lib/utils/date'

interface StuckInv { id: string; title: string; status: string; company_name: string; created_at: string; cost_brl: number }

interface ErroLog {
  id: string
  level: string
  source: string
  message: string
  stack: string | null
  context: string | null
  created_at: string
}

const fmtQuando = fmtDataHoraCurta

/** Lista de erros capturados em produção. */
function PainelErros() {
  const [erros, setErros] = useState<ErroLog[]>([])
  const [ultimas24h, setUltimas24h] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/erros?limit=50')
      .then(r => r.json() as Promise<{ data: { erros: ErroLog[]; ultimas_24h: number } }>)
      .then(j => { setErros(j.data?.erros ?? []); setUltimas24h(j.data?.ultimas_24h ?? 0) })
      .catch(() => { /* tabela pode não existir ainda */ })
      .finally(() => setCarregando(false))
  }, [])

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold text-slate-900">Erros recentes</h2>
        {!carregando && (
          <span className={`text-xs font-semibold px-2 py-1 rounded ${
            ultimas24h === 0 ? 'bg-green-100 text-green-700'
            : ultimas24h < 10 ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
          }`}>
            {ultimas24h} nas últimas 24h
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Falhas capturadas em produção. Use para detectar problemas antes que o cliente reclame.
      </p>

      {carregando && <p className="text-sm text-slate-400">Carregando…</p>}

      {!carregando && erros.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-sm px-5 py-6 text-center">
          <p className="text-green-700 font-medium text-sm">Nenhum erro registrado</p>
          <p className="text-green-600 text-xs mt-1">
            Se esta seção estiver sempre vazia, confirme que <code>/api/setup</code> já foi executado.
          </p>
        </div>
      )}

      {!carregando && erros.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-sm divide-y divide-slate-100">
          {erros.map(e => (
            <div key={e.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                  e.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>
                  {e.level}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <code className="text-xs font-semibold text-slate-700">{e.source}</code>
                    <span className="text-[10px] text-slate-400">{fmtQuando(e.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1 break-words">{e.message}</p>
                  {(e.stack || e.context) && (
                    <button
                      onClick={() => setAberto(aberto === e.id ? null : e.id)}
                      className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 hover:text-teal-800 mt-1.5"
                    >
                      {aberto === e.id ? 'Ocultar detalhes' : 'Ver detalhes'}
                    </button>
                  )}
                  {aberto === e.id && (
                    <div className="mt-2 space-y-2">
                      {e.context && (
                        <pre className="text-[10px] bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto text-slate-600">
                          {e.context}
                        </pre>
                      )}
                      {e.stack && (
                        <pre className="text-[10px] bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto text-slate-500 max-h-48">
                          {e.stack}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  saturated: 'bg-amber-100 text-amber-700',
}

export default function AdminSaudePage() {
  const [stuck, setStuck] = useState<StuckInv[]>([])
  const [loading, setLoading] = useState(true)
  const [reprocessing, setReprocessing] = useState<string | null>(null)
  const [errorModal, setErrorModal] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/admin/investigations?status=saturated')
      .then(r => r.json() as Promise<{ data: StuckInv[] }>)
      .then(j => setStuck(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function reprocess(id: string) {
    setReprocessing(id)
    setSuccessId(null)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 58_000)
    try {
      const res = await fetch(`/api/admin/investigations/${id}/reprocess`, {
        method: 'POST',
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok) {
        setSuccessId(id)
        setTimeout(() => load(), 1000)
      } else {
        let detail = `HTTP ${res.status}`
        try {
          const j = await res.json() as { error?: string; detail?: string }
          detail = j.error ?? j.detail ?? detail
        } catch { /* body não é JSON */ }
        setErrorModal(`Erro ao reprocessar relatório (${res.status}):\n\n${detail}`)
      }
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof Error && err.name === 'AbortError') {
        setErrorModal(
          'Tempo esgotado (58s).\n\nPossíveis causas:\n' +
          '• Plano Vercel Hobby tem limite de 10s — atualize para Pro.\n' +
          '• A chave ANTHROPIC_API_KEY pode estar com BOM ou inválida.\n' +
          '• O Claude API pode estar fora do ar.\n\n' +
          'Verifique os logs do Vercel em: vercel.com → projeto → Deployments → Functions.'
        )
      } else {
        setErrorModal(
          `Erro de rede inesperado:\n${err instanceof Error ? err.message : String(err)}\n\n` +
          'Verifique os logs do Vercel.'
        )
      }
    } finally {
      setReprocessing(null)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-900 mb-1">Saúde do sistema</h1>
      <p className="text-sm text-slate-500 mb-8">
        Investigações com a coleta encerrada e o relatório ainda não gerado
      </p>

      {loading && <p className="text-sm text-slate-400">Carregando...</p>}

      {!loading && stuck.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-sm px-5 py-6 text-center">
          <p className="text-green-700 font-medium text-sm">Nenhuma investigação aguardando relatório</p>
          <p className="text-green-600 text-xs mt-1">Todas as coletas encerradas já têm relatório gerado.</p>
        </div>
      )}

      {!loading && stuck.length > 0 && (
        <>
          {/* Estar aqui deixou de ser sinal de falha: desde que a geração passou a
              ser manual, aguardar o gestor é o comportamento normal. Só vira
              problema se ficar parado por muito tempo. */}
          <div className="bg-slate-50 border border-slate-200 rounded-sm px-4 py-3 mb-6 flex items-start gap-2 text-sm text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <span>
              {stuck.length} investigação(ões) com a coleta encerrada aguardando o gestor gerar o
              relatório — isso é normal. Use &quot;Gerar relatório&quot; apenas se o gestor pedir
              ajuda ou se a geração dele tiver falhado.
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Título</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Empresa</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Data</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {stuck.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{inv.title}</td>
                    <td className="px-4 py-3 text-slate-500">{inv.company_name}</td>
                    <td className="px-4 py-3">
                      <span className={"text-xs px-2 py-0.5 rounded " + (STATUS_COLORS[inv.status] ?? '')}>{inv.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtData(inv.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {successId === inv.id ? (
                        <span className="text-xs text-green-600 font-medium">Relatório gerado!</span>
                      ) : (
                        <button
                          onClick={() => reprocess(inv.id)}
                          disabled={reprocessing === inv.id}
                          className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-sm hover:bg-teal-700 transition-colors disabled:opacity-50"
                        >
                          {reprocessing === inv.id ? 'Gerando…' : 'Gerar relatório'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <PainelErros />

      {/* Modal de erro */}
      {errorModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-md shadow-xl max-w-lg w-full p-6">
            <h2 className="text-base font-semibold text-red-700 mb-3">Erro ao gerar relatório</h2>
            <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 whitespace-pre-wrap max-h-72 overflow-y-auto font-mono">
              {errorModal}
            </pre>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setErrorModal(null)}
                className="text-sm bg-slate-800 text-white px-4 py-2 rounded-sm hover:bg-slate-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
