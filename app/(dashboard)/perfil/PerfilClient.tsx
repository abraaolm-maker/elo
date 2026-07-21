'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'

interface Props {
  id: string
  name: string
  email: string
  createdAt: string
}

const inputCls = "w-full border border-slate-200 rounded-sm px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white transition-all disabled:bg-slate-50 disabled:text-slate-400"
const labelCls = "block text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5"

// ─── Campo de senha com olhinho ───────────────────────────────────────────────
function SenhaInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
      >
        {visible ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  )
}

// ─── Seção: dados básicos ─────────────────────────────────────────────────────
function SecaoDados({ name: initialName, email }: { name: string; email: string }) {
  const [nome, setNome]     = useState(initialName)
  const [salvando, setSalvando] = useState(false)
  const router  = useRouter()
  const toast   = useToast()

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (nome.trim() === initialName) return
    setSalvando(true)
    try {
      const res  = await fetch('/api/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: nome.trim() }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { toast.error(data.error ?? 'Erro ao salvar'); return }
      toast.success('Nome atualizado com sucesso!')
      router.refresh()
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="border border-slate-200 rounded-sm bg-white p-5">
      <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-4">Dados da conta</p>
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <label className={labelCls}>Nome</label>
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            className={inputCls}
            placeholder="Seu nome"
            required
            minLength={2}
          />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input
            value={email}
            disabled
            className={inputCls}
          />
          <p className="text-[10px] text-slate-400 mt-1">O email não pode ser alterado por aqui.</p>
        </div>
        <div className="pt-1">
          <button
            type="submit"
            disabled={salvando || nome.trim() === initialName}
            className="bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 px-5 rounded-sm hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            {salvando ? 'Salvando…' : 'Salvar nome'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Seção: trocar senha ─────────────────────────────────────────────────────
function SecaoSenha() {
  const [atual,     setAtual]     = useState('')
  const [nova,      setNova]      = useState('')
  const [confirma,  setConfirma]  = useState('')
  const [salvando,  setSalvando]  = useState(false)
  const toast = useToast()

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault()
    if (nova !== confirma) { toast.error('As senhas não coincidem'); return }
    if (nova.length < 8)   { toast.error('A nova senha deve ter ao menos 8 caracteres'); return }
    setSalvando(true)
    try {
      const res  = await fetch('/api/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ current_password: atual, new_password: nova }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { toast.error(data.error ?? 'Erro ao trocar senha'); return }
      toast.success('Senha alterada com sucesso!')
      setAtual(''); setNova(''); setConfirma('')
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="border border-slate-200 rounded-sm bg-white p-5">
      <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-4">Segurança</p>
      <form onSubmit={trocarSenha} className="space-y-4">
        <div>
          <label className={labelCls}>Senha atual</label>
          <SenhaInput value={atual} onChange={setAtual} placeholder="••••••••" />
        </div>
        <div>
          <label className={labelCls}>Nova senha</label>
          <SenhaInput value={nova} onChange={setNova} placeholder="Mínimo 8 caracteres" />
        </div>
        <div>
          <label className={labelCls}>Confirmar nova senha</label>
          <SenhaInput value={confirma} onChange={setConfirma} placeholder="Repita a nova senha" />
        </div>
        {nova && confirma && nova !== confirma && (
          <p className="text-xs text-red-600">As senhas não coincidem</p>
        )}
        <div className="pt-1">
          <button
            type="submit"
            disabled={salvando || !atual || !nova || !confirma}
            className="bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 px-5 rounded-sm hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            {salvando ? 'Salvando…' : 'Trocar senha'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function PerfilClient({ name, email, createdAt }: Props) {
  const criadoEm = new Date(createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <>
      {/* Avatar + info */}
      <div className="flex items-center gap-4 px-5 py-4 border border-slate-200 rounded-sm bg-white">
        <div className="w-12 h-12 rounded-sm bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
          <span className="text-xl font-bold text-teal-600">{name.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <p className="text-base font-semibold text-slate-900 tracking-tight">{name}</p>
          <p className="text-xs text-slate-500 font-mono">{email}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-0.5">Membro desde {criadoEm}</p>
        </div>
      </div>

      <SecaoDados name={name} email={email} />
      <SecaoSenha />
    </>
  )
}
