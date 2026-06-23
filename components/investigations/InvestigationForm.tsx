'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface WorkerOption {
  id: string
  anonymous_alias: string
  role: string
}

interface InvestigationFormProps {
  workers: WorkerOption[]
  onSuccess: (investigationId: string) => void
  onCancel: () => void
}

export function InvestigationForm({ workers, onSuccess, onCancel }: InvestigationFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function toggleWorker(id: string) {
    setSelectedWorkers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function validate(): string | null {
    if (!title.trim()) return 'O título é obrigatório.'
    if (description.trim().length < 20) return 'A descrição deve ter pelo menos 20 caracteres.'
    if (selectedWorkers.size < 1) return 'Selecione pelo menos um worker.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setLoading(true)
    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          problem_description: description.trim(),
          worker_ids: Array.from(selectedWorkers),
        }),
      })

      const result = await res.json() as { data?: { id: string }; error?: string }
      if (!res.ok) { setError(result.error ?? 'Erro ao criar investigação.'); return }
      onSuccess(result.data!.id)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="inv-title">Título</Label>
        <Input
          id="inv-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ex: Alta taxa de defeitos na linha 3"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="inv-desc">Descrição do problema</Label>
        <Textarea
          id="inv-desc"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descreva o problema com o máximo de contexto possível — quando começou, frequência, impacto, o que já foi tentado"
          rows={4}
        />
        <p className="text-xs text-gray-500">Mínimo 20 caracteres. Quanto mais contexto, melhor a qualidade das perguntas.</p>
      </div>

      <div className="space-y-2">
        <Label>Workers participantes</Label>
        {workers.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum worker ativo cadastrado.</p>
        ) : (
          <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
            {workers.map(w => (
              <label
                key={w.id}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedWorkers.has(w.id)}
                  onChange={() => toggleWorker(w.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm">
                  <span className="font-medium">{w.anonymous_alias}</span>
                  <span className="text-gray-500 ml-2">— {w.role}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500">{selectedWorkers.size} selecionado(s)</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? 'Criando…' : 'Criar investigação'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
