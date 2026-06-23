'use client'

import { useRouter } from 'next/navigation'
import { InvestigationForm, type WorkerOption } from '@/components/investigations/InvestigationForm'

interface NewInvestigationClientProps {
  workers: WorkerOption[]
}

export function NewInvestigationClient({ workers }: NewInvestigationClientProps) {
  const router = useRouter()

  return (
    <InvestigationForm
      workers={workers}
      onSuccess={id => router.push(`/investigations/${id}`)}
      onCancel={() => router.push('/')}
    />
  )
}
