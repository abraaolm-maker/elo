'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface StuckInv { id: string; title: string; status: string; company_name: string; created_at: string; cost_brl: number }

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
  const [messages, setMessages] = useState<Record<string, string>>({})

  function load() {
    setLoading(true)
    fetch('/api/admin/investigations?status=saturated')
      .then(r => r.json() as Promise<{ data: StuckInv[] }>)
      .then(j => setStuck(j.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function reprocess(id: string) {
    setReprocessing(id)
    setMessages(m => ({ ...m, [id]: '' }))
    try {
      const res = await fetch(`/api/admin/investigations/${id}/reprocess`, { method: 'POST' })
      if (res.ok) {
        setMessages(m => ({ ...m, [id]: 'Relatório gerado com sucesso!' }))
        setTimeout(() => load(), 800)
      } else {
        const j = await res.json() as { error?: string }
        setMessages(m => ({ ...m, [id]: j.error ?? 'Erro ao reprocessar' }))
      }
    } catch {
      setMessages(m => ({ ...m, [id]: 'Erro de conexão' }))
    } finally {
      setReprocessing(null)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-900 mb-1">Saúde do sistema</h1>
      <p className="text-sm text-slate-500 mb-8">Investigações travadas em &quot;saturated&quot; — precisam ter o relatório reprocessado manualmente</p>

      {loading && <p className="text-sm text-slate-400">Carregando...</p>}

      {!loading && stuck.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-sm px-5 py-6 text-center">
          <p className="text-green-700 font-medium text-sm">Tudo certo — nenhuma investigação travada</p>
          <p className="text-green-600 text-xs mt-1">Todas as investigações finalizadas geraram relatório com sucesso.</p>
        </div>
      )}

      {!loading && stuck.length > 0 && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-sm px-4 py-3 mb-6 flex items-center gap-2 text-sm text-amber-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {stuck.length} investigação(ões) precisam de atenção. Clique em &quot;Reprocessar&quot; para gerar o relatório manualmente.
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
                    <td className="px-4 py-3 text-xs text-slate-500">{inv.created_at.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-3 justify-end">
                        {messages[inv.id] && (
                          <span className={`text-xs ${messages[inv.id].includes('sucesso') ? 'text-green-600' : 'text-red-500'}`}>
                            {messages[inv.id]}
                          </span>
                        )}
                        <button
                          onClick={() => reprocess(inv.id)}
                          disabled={reprocessing === inv.id}
                          className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-sm hover:bg-teal-700 transition-colors disabled:opacity-50"
                        >
                          {reprocessing === inv.id ? 'Gerando...' : 'Reprocessar relatório'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
