'use client'

import Link from 'next/link'
import { InvestigationCard, type InvestigationSummary } from '@/components/investigations/InvestigationCard'

interface Props {
  investigations: InvestigationSummary[]
}

export function HomeClient({ investigations }: Props) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-100 px-8 py-6 flex items-center justify-between bg-white sticky top-0 z-10">
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {investigations.map(inv => (
              <InvestigationCard key={inv.id} investigation={inv} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
