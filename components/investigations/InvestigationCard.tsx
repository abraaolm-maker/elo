import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Pendente',      className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' },
  active:    { label: 'Em andamento',  className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  saturated: { label: 'Saturado',      className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  completed: { label: 'Concluído',     className: 'bg-green-100 text-green-700 hover:bg-green-100' },
  cancelled: { label: 'Cancelado',     className: 'bg-red-100 text-red-700 hover:bg-red-100' },
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
  const statusCfg = STATUS_CONFIG[investigation.status] ?? STATUS_CONFIG.pending
  const date = new Date(investigation.created_at).toLocaleDateString('pt-BR')

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-tight">
            {investigation.title}
          </CardTitle>
          <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-gray-500 mb-3">
          {investigation.worker_count} worker{investigation.worker_count !== 1 ? 's' : ''} · {date}
        </p>
        <Link
          href={`/investigations/${investigation.id}`}
          className="inline-flex items-center justify-center w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Ver detalhes
        </Link>
      </CardContent>
    </Card>
  )
}
