'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InvestigationCard, type InvestigationSummary } from '@/components/investigations/InvestigationCard'
import { InvestigationForm, type WorkerOption } from '@/components/investigations/InvestigationForm'

interface HomeClientProps {
  investigations: InvestigationSummary[]
  workers: WorkerOption[]
}

export function HomeClient({ investigations, workers }: HomeClientProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)

  function handleSuccess(id: string) {
    setDialogOpen(false)
    router.push(`/investigations/${id}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Investigações</h1>
        <Button onClick={() => setDialogOpen(true)}>Nova investigação</Button>
      </div>

      {investigations.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          Nenhuma investigação criada ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {investigations.map(inv => (
            <InvestigationCard key={inv.id} investigation={inv} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova investigação</DialogTitle>
          </DialogHeader>
          <InvestigationForm
            workers={workers}
            onSuccess={handleSuccess}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
