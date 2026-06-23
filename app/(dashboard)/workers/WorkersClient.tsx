'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { WorkerForm } from '@/components/workers/WorkerForm'
import type { MaskedWorker } from './page'

interface WorkersClientProps {
  initialWorkers: MaskedWorker[]
}

export function WorkersClient({ initialWorkers }: WorkersClientProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleToggle(worker: MaskedWorker) {
    setTogglingId(worker.id)
    try {
      await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !worker.is_active }),
      })
      router.refresh()
    } finally {
      setTogglingId(null)
    }
  }

  function handleFormSuccess() {
    setDialogOpen(false)
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Workers</h1>
        <Button onClick={() => setDialogOpen(true)}>Cadastrar worker</Button>
      </div>

      {initialWorkers.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          Nenhum worker cadastrado ainda.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Alias</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cargo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">WhatsApp</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {initialWorkers.map(worker => (
                <tr key={worker.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{worker.anonymous_alias}</td>
                  <td className="px-4 py-3 text-gray-700">{worker.role}</td>
                  <td className="px-4 py-3 font-mono text-gray-500">{worker.whatsapp_masked}</td>
                  <td className="px-4 py-3">
                    <Badge variant={worker.is_active ? 'default' : 'secondary'}>
                      {worker.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={togglingId === worker.id}
                      onClick={() => handleToggle(worker)}
                    >
                      {togglingId === worker.id
                        ? '…'
                        : worker.is_active
                        ? 'Desativar'
                        : 'Ativar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar worker</DialogTitle>
          </DialogHeader>
          <WorkerForm
            onSuccess={handleFormSuccess}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
