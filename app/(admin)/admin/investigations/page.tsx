'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

interface Inv { id: string; title: string; status: string; company_name: string; company_id: string; created_at: string; cost_brl: number; completed_at: string | null }
interface Company { id: string; name: string }

function fmt(n: number) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  saturated: 'bg-amber-100 text-amber-700',
}

function InvestigationsTable() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Inv[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter]   = useState(searchParams.get('status') ?? '')
  const [companyFilter, setCompanyFilter] = useState(searchParams.get('company_id') ?? '')
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')

  useEffect(() => {
    fetch('/api/admin/companies')
      .then(r => r.json() as Promise<{ data: Company[] }>)
      .then(j => setCompanies(j.data))
      .catch(console.error)
  }, [])

  function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (statusFilter)  p.set('status', statusFilter)
    if (companyFilter) p.set('company_id', companyFilter)
    if (dateFrom)      p.set('date_from', dateFrom)
    if (dateTo)        p.set('date_to', dateTo)
    fetch('/api/admin/investigations?' + p.toString())
      .then(r => r.json() as Promise<{ data: Inv[] }>)
      .then(j => setItems(j.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [statusFilter, companyFilter, dateFrom, dateTo])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-semibold text-slate-900">Investigações</h1><p className="text-sm text-slate-500 mt-1">{items.length} resultado(s)</p></div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-sm px-3 py-2 text-sm bg-white">
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="active">Ativa</option>
          <option value="saturated">Saturada</option>
          <option value="completed">Concluída</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="border border-slate-200 rounded-sm px-3 py-2 text-sm bg-white">
          <option value="">Todas as empresas</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-slate-200 rounded-sm px-3 py-2 text-sm bg-white" title="De" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-slate-200 rounded-sm px-3 py-2 text-sm bg-white" title="Até" />
        {(statusFilter || companyFilter || dateFrom || dateTo) && (
          <button onClick={() => { setStatusFilter(''); setCompanyFilter(''); setDateFrom(''); setDateTo('') }} className="text-xs text-slate-500 hover:text-slate-900 underline">Limpar filtros</button>
        )}
      </div>

      {loading && <p className="text-sm text-slate-400">Carregando...</p>}
      {!loading && (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Título</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Empresa</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Data</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Custo R$</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{i.title}</td>
                  <td className="px-4 py-3 text-slate-500">{i.company_name}</td>
                  <td className="px-4 py-3"><span className={"text-xs px-2 py-0.5 rounded " + (STATUS_COLORS[i.status] ?? '')}>{i.status}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{i.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">R$ {fmt(i.cost_brl)}</td>
                  <td className="px-4 py-3 text-right space-x-3">
                    {i.status === 'completed' && (
                      <Link href={`/admin/relatorios/${i.id}`} className="text-xs text-teal-700 hover:underline">Ver relatório</Link>
                    )}
                    {i.status === 'saturated' && (
                      <Link href="/admin/saude" className="text-xs text-amber-600 hover:underline">Reprocessar</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhuma investigação encontrada</p>}
        </div>
      )}
    </div>
  )
}

export default function AdminInvestigationsPage() {
  return <Suspense fallback={<div className="p-8 text-sm text-slate-400">Carregando...</div>}><InvestigationsTable /></Suspense>
}
