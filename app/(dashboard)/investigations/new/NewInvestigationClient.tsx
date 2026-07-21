'use client'

import { useRouter } from 'next/navigation'
import { InvestigationForm } from '@/components/investigations/InvestigationForm'

export function NewInvestigationClient() {
  const router = useRouter()

  return (
    <InvestigationForm
      onSuccess={id => router.push(`/investigations/${id}`)}
      onCancel={() => router.push('/')}
    />
  )
}
