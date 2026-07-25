'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { InvestigationCard, type InvestigationSummary } from '@/components/investigations/InvestigationCard'

const STATUS_LABELS: Record<string, string> = {
  all: 'Todos',
  pending: 'Pendente',
  active: 'Em andamento',
  saturated: 'Saturando',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

const PAGE_SIZE = 12

interface Props {
  investigations: InvestigationSummary[]
}

export function HomeClient({ investigations }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return investigations.filter(inv => {
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter
      const matchesSearch = !q || inv.title.toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [investigations, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-100 px-8 py-6 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">Painel</p>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Investigações</h1>
          </div>
          <Link
            href="/investigations/new"
            className="flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 px-5 rounded-sm hover:bg-slate-800 transition-all shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nova investigação
          </Link>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Buscar por título…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-sm text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <button
                key={value}
                onClick={() => handleStatusChange(value)}
                className={`text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-sm transition-colors ${
                  statusFilter === value
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {investigations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-400 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-base font-medium text-slate-900 mb-1">Nenhuma investigação ainda</p>
            <p className="text-sm text-slate-500 max-w-xs">
              Crie sua primeira investigação para começar a identificar causas raiz com IA.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-slate-500">Nenhuma investigação corresponde aos filtros.</p>
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setPage(1) }}
              className="mt-3 text-xs font-semibold text-teal-600 hover:underline"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginated.map(inv => (
                <InvestigationCard key={inv.id} investigation={inv} />
              ))}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-400 font-mono">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-500 px-3 py-1.5 rounded-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Anterior
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | '...')[]>((acc, p, i, arr) => {
                      if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) =>
                      p === '...'
                        ? <span key={`e${i}`} className="text-xs text-slate-400 px-1">…</span>
                        : <button
                            key={p}
                            onClick={() => setPage(p as number)}
                            className={`text-[10px] font-semibold uppercase tracking-wider w-8 h-7 rounded-sm transition-colors ${
                              page === p ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {p}
                          </button>
                    )
                  }
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-500 px-3 py-1.5 rounded-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Próxima →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
