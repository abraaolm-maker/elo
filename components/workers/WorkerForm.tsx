'use client'

import { useState } from 'react'

interface WorkerFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function WorkerForm({ onSuccess, onCancel }: WorkerFormProps) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [cpf, setCpf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function validateForm(): string | null {
    if (!name.trim()) return 'O nome é obrigatório.'
    if (!role.trim()) return 'O cargo é obrigatório.'
    const cpfDigits = cpf.replace(/\D/g, '')
    if (cpfDigits && cpfDigits.length !== 11) return 'CPF inválido — deve ter 11 dígitos.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validateForm()
    if (validationError) { setError(validationError); return }

    setLoading(true)
    try {
      const response = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          role_description: roleDescription.trim() || undefined,
          cpf: cpf.replace(/\D/g, '') || undefined,
        }),
      })

      const result = await response.json() as { error?: string }
      if (!response.ok) { setError(result.error ?? 'Erro ao cadastrar trabalhador.'); return }
      onSuccess()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full border border-slate-200 rounded-sm px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
  const labelClass = "block text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5"

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Nome completo <span className="text-red-400">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="João Silva" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>
            CPF
            <span className="text-slate-300 font-normal normal-case tracking-normal ml-1">(acesso ao portal)</span>
          </label>
          <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Cargo <span className="text-red-400">*</span></label>
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="Mestre de obras, Supervisor de linha…" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>
          Responsabilidades do cargo
          <span className="text-slate-300 font-normal normal-case tracking-normal ml-1">(melhora as perguntas da IA)</span>
        </label>
        <textarea
          value={roleDescription}
          onChange={e => setRoleDescription(e.target.value)}
          placeholder="Descreva o que essa pessoa faz no dia a dia — isso ajuda a IA a fazer as perguntas certas"
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-sm px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} disabled={loading} className="text-xs font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-4 py-2 rounded-sm hover:bg-slate-50 disabled:opacity-50">
          Cancelar
        </button>
        <button type="submit" disabled={loading} className="text-xs font-semibold uppercase tracking-wider bg-slate-900 text-white px-4 py-2 rounded-sm hover:bg-slate-800 disabled:opacity-50">
          {loading ? 'Cadastrando…' : 'Cadastrar trabalhador'}
        </button>
      </div>
    </form>
  )
}
