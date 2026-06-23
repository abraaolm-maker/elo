'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface WorkerFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function WorkerForm({ onSuccess, onCancel }: WorkerFormProps) {
  const [role, setRole] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function validateForm(): string | null {
    if (!role.trim()) return 'O cargo é obrigatório.'
    if (!whatsappNumber.trim()) return 'O número WhatsApp é obrigatório.'
    if (!/^\d+$/.test(whatsappNumber)) return 'O número deve conter apenas dígitos.'
    if (!whatsappNumber.startsWith('55')) return 'O número deve começar com 55.'
    if (whatsappNumber.length < 12 || whatsappNumber.length > 13) {
      return 'Formato inválido. Use: 5511999999999'
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: role.trim(),
          role_description: roleDescription.trim(),
          whatsapp_number: whatsappNumber.trim(),
        }),
      })

      const result = await response.json() as { error?: string }

      if (!response.ok) {
        setError(result.error ?? 'Erro ao cadastrar worker.')
        return
      }

      onSuccess()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="role">Cargo</Label>
        <Input
          id="role"
          value={role}
          onChange={e => setRole(e.target.value)}
          placeholder="Ex: Mestre de Obras, Supervisor de Linha"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="role-description">Responsabilidades do cargo</Label>
        <Textarea
          id="role-description"
          value={roleDescription}
          onChange={e => setRoleDescription(e.target.value)}
          placeholder="Descreva o que essa pessoa faz no dia a dia — isso ajuda a IA a fazer as perguntas certas"
          rows={3}
        />
        <p className="text-xs text-gray-500">
          Quanto mais detalhada a descrição, melhores serão as perguntas da IA.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsapp">Número WhatsApp</Label>
        <Input
          id="whatsapp"
          value={whatsappNumber}
          onChange={e => setWhatsappNumber(e.target.value.replace(/\D/g, ''))}
          placeholder="5511999999999"
          maxLength={13}
          required
        />
        <p className="text-xs text-gray-500">
          Formato: 55 + DDD + número. Apenas dígitos, sem espaços ou traços.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? 'Cadastrando…' : 'Cadastrar worker'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
