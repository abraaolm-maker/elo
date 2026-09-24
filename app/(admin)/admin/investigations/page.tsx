'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { ConfirmDelete } from '@/components/ui/confirm-delete'
import { fmtData } from '@/lib/utils/date'

interface Inv { id: string; title: string; status: string; company_name: string; company_id: string; created_at: string; cost_brl: number; completed_at: string | null }
interface Company { id: string; name: string }
interface Resumo { mensagens: number; participantes: number; relatorios: number }

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
  const [paraApagar, setParaApagar]       = useState<Inv | null>(null)
  const [resumo, setResumo]               = useState<Resumo | null>(null)
  const [aviso, setAviso]                 = useState<string | null>(null)

  /** Busca o volume real antes de mostrar a confirmação */
  async function abrirConfirmacao(inv: Inv) {
    setParaApagar(inv)
    setResumo(null)
    try {
      const r = await fetch(`/api/admin/investigations/${inv.id}`)
      const j = await r.json() as { data?: { vai_apagar: Resumo } }
      if (j.data) setResumo(j.data.vai_apagar)
    } catch { /* mostra a confirmação mesmo sem o resumo */ }
  }

  async function apagar(inv: Inv) {
    const r = await fetch(`/api/admin/investigations/${inv.id}`, { method: 'DELETE' })
    const j = await r.json() as { data?: { detalhes: Record<string, number> }; error?: string }
    if (!r.ok) throw new Error(j.error ?? `Falha (HTTP ${r.status})`)

    const d = j.data?.detalhes
    setAviso(
      `"${inv.title}" foi apagada` +
      (d ? ` — ${d.mensagens} mensagem(ns), ${d.participantes} participante(s), ${d.relatorios} relatório(s).` : '.')
    )
    setParaApagar(null)
    setResumo(null)
    load()
    setTimeout(() => setAviso(null), 8000)
  }

  useEffect(() => {
    fetch('/api/admin/companies')
      .then(r => r.json() as Promise<{ data: Company[] }>)
      .then(j => setCompanies(j.data ?? []))
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
      .then(j => setItems(j.data ?? []))
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

      {aviso && (
        <div className="bg-green-50 border border-green-200 rounded-sm px-4 py-3 mb-4 flex items-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-green-800">{aviso}</p>
        </div>
      )}

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
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtData(i.created_at)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">R$ {fmt(i.cost_brl)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {i.status === 'completed' && (
                        <Link href={`/admin/relatorios/${i.id}`} className="text-xs text-teal-700 hover:underline">Ver relatório</Link>
                      )}
                      {i.status === 'saturated' && (
                        <Link href="/admin/saude" className="text-xs text-amber-600 hover:underline">Reprocessar</Link>
                      )}
                      <button
                        onClick={() => abrirConfirmacao(i)}
                        className="text-slate-300 hover:text-red-600 transition-colors p-1"
                        title="Apagar investigação"
                        aria-label={`Apagar investigação ${i.title}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhuma investigação encontrada</p>}
        </div>
      )}

      {paraApagar && (
        <ConfirmDelete
          nomeItem={paraApagar.title}
          exigirDigitacao
          onCancelar={() => { setParaApagar(null); setResumo(null) }}
          onConfirmar={() => apagar(paraApagar)}
          descricao={
            <>
              <p className="mb-2">
                Apagar a investigação de <strong>{paraApagar.company_name}</strong> remove
                permanentemente:
              </p>
              {resumo ? (
                <ul className="space-y-0.5 ml-1">
                  <li>• {resumo.mensagens} mensagem(ns) trocada(s) com os trabalhadores</li>
                  <li>• {resumo.participantes} vínculo(s) de participante</li>
                  <li>• {resumo.relatorios} relatório(s) e seus planos de ação</li>
                </ul>
              ) : (
                <p className="text-slate-400">Calculando o que será removido…</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                O histórico de custo da empresa é preservado — o valor já gasto continua
                contando no limite do plano.
              </p>
            </>
          }
        />
      )}
    </div>
  )
}

export default function AdminInvestigationsPage() {
  return <Suspense fallback={<div className="p-8 text-sm text-slate-400">Carregando...</div>}><InvestigationsTable /></Suspense>
}
