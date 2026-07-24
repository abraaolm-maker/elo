'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Stats {
  companies_count: number
  managers_count: number
  workers_count: number
  investigations: { total: number; active: number; completed: number; pending: number; cancelled: number; saturated: number }
  completion_rate: number
  avg_completion_hours: number | null
  workers_saturated: number
  workers_unresponsive: number
  total_cost_brl: number
  total_cost_usd: number
  this_month_cost_brl: number
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => r.json() as Promise<{ data: Stats; error?: string }>)
      .then(j => {
        if (j.error || !j.data) { setError(j.error ?? 'Erro ao carregar'); return }
        setStats(j.data)
      })
      .catch(() => setError('Erro de conexão'))
  }, [])

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-900 mb-1">Overview</h1>
      <p className="text-sm text-slate-500 mb-8">Visão geral da plataforma</p>

      {!stats && !error && <p className="text-sm text-slate-400">Carregando...</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-3 text-sm text-red-700">
          {error} — <a href="/login" className="underline">Fazer login novamente</a>
        </div>
      )}

      {stats && (
        <>
          {/* Contadores principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Empresas', value: stats.companies_count, href: '/admin/companies' },
              { label: 'Gestores', value: stats.managers_count, href: '/admin/managers' },
              { label: 'Ativas', value: stats.investigations.active, href: '/admin/investigations?status=active' },
              { label: 'Concluídas', value: stats.investigations.completed, href: '/admin/investigations?status=completed' },
            ].map(c => (
              <Link key={c.label} href={c.href} className="bg-white border border-slate-200 rounded-sm p-5 hover:border-slate-300 transition-colors">
                <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">{c.label}</p>
                <p className="text-3xl font-bold text-slate-900">{c.value}</p>
              </Link>
            ))}
          </div>

          {/* Métricas operacionais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-sm p-5">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">Taxa de conclusão</p>
              <p className="text-3xl font-bold text-teal-700">{stats.completion_rate}%</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-sm p-5">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">Tempo médio</p>
              <p className="text-3xl font-bold text-slate-900">
                {stats.avg_completion_hours !== null ? `${stats.avg_completion_hours}h` : '—'}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-sm p-5">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">Workers saturados</p>
              <p className="text-3xl font-bold text-green-700">{stats.workers_saturated}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-sm p-5">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">Sem resposta</p>
              <p className="text-3xl font-bold text-amber-600">{stats.workers_unresponsive}</p>
            </div>
          </div>

          {/* Custos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-sm p-5">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">Custo este mês</p>
              <p className="text-2xl font-bold text-teal-700">R$ {fmt(stats.this_month_cost_brl)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-sm p-5">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">Custo total (R$)</p>
              <p className="text-2xl font-bold text-slate-900">R$ {fmt(stats.total_cost_brl)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-sm p-5">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">Custo total (USD)</p>
              <p className="text-2xl font-bold text-slate-900">$ {fmt(stats.total_cost_usd, 4)}</p>
            </div>
          </div>

          {/* Investigações por status */}
          <div className="bg-white border border-slate-200 rounded-sm p-5">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-4">Investigações por status</p>
            <div className="flex gap-6 flex-wrap">
              {(Object.entries(stats.investigations) as [string, number][]).map(([k, v]) => (
                <Link key={k} href={`/admin/investigations?status=${k}`} className="hover:opacity-80 transition-opacity">
                  <p className="text-xs text-slate-500 capitalize">{k}</p>
                  <p className="text-xl font-bold text-slate-900">{v}</p>
                </Link>
              ))}
            </div>
            {(stats.investigations.saturated ?? 0) > 0 && (
              <div className="mt-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {stats.investigations.saturated} investigação(ões) travada(s) em &quot;saturated&quot;.{' '}
                <Link href="/admin/saude" className="underline font-semibold">Ver saúde do sistema</Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
