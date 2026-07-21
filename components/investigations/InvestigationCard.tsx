import Link from 'next/link'

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  pending:   { label: 'Pendente',      dot: 'bg-slate-300',    text: 'text-slate-500' },
  active:    { label: 'Em andamento',  dot: 'bg-teal-500',     text: 'text-teal-700' },
  saturated: { label: 'Saturando',     dot: 'bg-amber-400',    text: 'text-amber-700' },
  completed: { label: 'Concluído',     dot: 'bg-emerald-500',  text: 'text-emerald-700' },
  cancelled: { label: 'Cancelado',     dot: 'bg-red-400',      text: 'text-red-600' },
}

export interface InvestigationSummary {
  id: string
  title: string
  status: string
  created_at: string
  worker_count: number
}

interface InvestigationCardProps {
  investigation: InvestigationSummary
}

export function InvestigationCard({ investigation }: InvestigationCardProps) {
  const cfg = STATUS_CONFIG[investigation.status] ?? STATUS_CONFIG.pending
  const date = new Date(investigation.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div className="group border border-slate-200 rounded-sm bg-white hover:border-slate-300 hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col">
      {/* Body */}
      <div className="p-6 flex-1">
        {/* Status badge */}
        <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-3 ${cfg.text}`}>
          {investigation.status === 'active' ? (
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-75`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot}`} />
            </span>
          ) : (
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          )}
          {cfg.label}
        </div>

        <h3 className="text-base font-semibold text-slate-900 tracking-tight leading-snug mb-2">
          {investigation.title}
        </h3>

        <p className="text-xs text-slate-400 font-mono">
          {investigation.worker_count} participante{investigation.worker_count !== 1 ? 's' : ''} · {date}
        </p>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-between">
        <div className="h-0.5 w-8 bg-slate-200 group-hover:w-full group-hover:bg-teal-500 transition-all duration-700 ease-out" />
        <Link
          href={`/investigations/${investigation.id}`}
          className="text-xs font-semibold uppercase tracking-wide text-teal-600 hover:text-teal-800 transition-colors flex items-center gap-1"
        >
          Ver detalhes
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
