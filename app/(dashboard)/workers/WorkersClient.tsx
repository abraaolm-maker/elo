'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import type { MaskedWorker } from './page'

interface WorkersClientProps {
  initialWorkers: MaskedWorker[]
}

// ─── Modal de cadastro de trabalhador ────────────────────────────────────────
function CadastrarWorkerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [roleDesc, setRoleDesc] = useState('')
  const [cpf, setCpf] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const inputClass = "w-full border border-slate-200 rounded-sm px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
  const labelClass = "block text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5"

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Nome é obrigatório.'); return }
    if (!role.trim()) { setError('Cargo é obrigatório.'); return }

    const cpfDigits = cpf.replace(/\D/g, '')
    if (cpfDigits && cpfDigits.length !== 11) { setError('CPF inválido — deve ter 11 dígitos.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          role_description: roleDesc.trim() || undefined,
          cpf: cpfDigits || undefined,
        }),
      })
      const d = await res.json() as { error?: string }
      if (!res.ok) { setError(d.error ?? 'Erro ao cadastrar.'); return }
      toast.success('Trabalhador cadastrado!')
      onSaved()
      onClose()
    } catch {
      setError('Erro de conexão.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-sm shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Cadastrar trabalhador</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={salvar} className="space-y-4">
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
              Responsabilidades
              <span className="text-slate-300 font-normal normal-case tracking-normal ml-1">(melhora as perguntas da IA)</span>
            </label>
            <textarea
              value={roleDesc}
              onChange={e => setRoleDesc(e.target.value)}
              placeholder="O que essa pessoa faz no dia a dia?"
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-sm px-3 py-2">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="text-xs font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-4 py-2 rounded-sm hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="text-xs font-semibold uppercase tracking-wider bg-slate-900 text-white px-4 py-2 rounded-sm hover:bg-slate-800 disabled:opacity-50">
              {saving ? 'Salvando…' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function WorkersClient({ initialWorkers }: WorkersClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleToggle(worker: MaskedWorker) {
    setTogglingId(worker.id)
    try {
      const res = await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !worker.is_active }),
      })
      if (res.ok) {
        toast.success(worker.is_active ? 'Trabalhador desativado.' : 'Trabalhador ativado.')
        router.refresh()
      } else {
        toast.error('Erro ao alterar status.')
      }
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setTogglingId(null)
    }
  }

  const ativos = initialWorkers.filter(w => w.is_active).length

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-100 px-8 py-6 flex items-center justify-between bg-white sticky top-0 z-10">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">Configuração</p>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Trabalhadores</h1>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 px-5 rounded-sm hover:bg-slate-800 transition-all shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Cadastrar trabalhador
        </button>
      </div>

      {/* Modal */}
      {dialogOpen && (
        <CadastrarWorkerModal
          onClose={() => setDialogOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}

      {/* Conteúdo */}
      <div className="px-8 py-6">
        {initialWorkers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-400 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="text-base font-medium text-slate-900 mb-1">Nenhum trabalhador cadastrado</p>
            <p className="text-sm text-slate-500 max-w-xs mb-4">
              Cadastre os trabalhadores que participarão das investigações.
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="text-xs font-semibold uppercase tracking-wider bg-slate-900 text-white px-4 py-2.5 rounded-sm hover:bg-slate-800"
            >
              Cadastrar primeiro trabalhador
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4 text-xs text-slate-400 font-mono">
              <span>{initialWorkers.length} trabalhador{initialWorkers.length !== 1 ? 'es' : ''}</span>
              <span>·</span>
              <span>{ativos} ativo{ativos !== 1 ? 's' : ''}</span>
            </div>

            <div className="border border-slate-200 rounded-sm overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>
                    <th className="text-left px-5 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Alias</th>
                    <th className="text-left px-5 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Cargo</th>
                    <th className="text-left px-5 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {initialWorkers.map(worker => (
                    <tr key={worker.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-sm bg-slate-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-slate-600">{worker.anonymous_alias.charAt(worker.anonymous_alias.length - 1)}</span>
                          </div>
                          <span className="font-medium text-slate-900 text-sm">{worker.anonymous_alias}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-slate-700 text-sm">{worker.role}</span>
                        {worker.role_description && (
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{worker.role_description}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${worker.is_active ? 'text-teal-700' : 'text-slate-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${worker.is_active ? 'bg-teal-500' : 'bg-slate-300'}`} />
                          {worker.is_active ? 'Ativo' : 'Inativo'}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => void handleToggle(worker)}
                          disabled={togglingId === worker.id}
                          className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-3 py-1.5 rounded-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
                        >
                          {togglingId === worker.id ? '…' : worker.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
