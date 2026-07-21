'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Gestor {
  id: string
  name: string
  email: string
  company_id: string
  is_admin: boolean
  created_at: string
}

interface InvestigacaoResumida {
  id: string
  title: string
  status: string
  created_at: string
}

interface Empresa {
  id: string
  name: string
  plan: string
  created_at: string
  total_investigacoes: number
  gestores: Gestor[]
  investigacoes: InvestigacaoResumida[]
}

interface Props {
  empresas: Empresa[]
}

const PLANOS = [
  { value: 'starter',    label: 'Starter' },
  { value: 'pro',        label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

const planoCfg: Record<string, { label: string; cls: string }> = {
  starter:    { label: 'Starter',    cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pro:        { label: 'Pro',        cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  enterprise: { label: 'Enterprise', cls: 'bg-slate-900 text-white border-slate-900' },
}

// ─── Input / Textarea helpers ─────────────────────────────────────────────────
const inputCls = "w-full border border-slate-200 rounded-sm px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white transition-all"
const labelCls = "block text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5"

// ─── CampoSenha ──────────────────────────────────────────────────────────────
function CampoSenha({ senha }: { senha: string }) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-sm text-slate-700">{visivel ? senha : '••••••••••'}</span>
      <button
        type="button"
        onClick={() => setVisivel(v => !v)}
        className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
        title={visivel ? 'Ocultar senha' : 'Revelar senha'}
      >
        {visivel ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  )
}

// ─── Modal de credenciais ─────────────────────────────────────────────────────
function ModalCredenciais({
  open,
  onClose,
  email,
  senha,
  titulo,
}: {
  open: boolean
  onClose: () => void
  email: string
  senha: string
  titulo: string
}) {
  const [copiado, setCopiado] = useState(false)

  function copiar() {
    void navigator.clipboard.writeText(`Email: ${email}\nSenha: ${senha}`)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-slate-200 rounded-sm shadow-xl w-full max-w-sm mx-4 p-6">
        <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">{titulo}</p>
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight mb-5" style={{ fontFamily: 'var(--font-jakarta)' }}>
          Credenciais de acesso
        </h2>

        <div className="bg-emerald-50 border border-emerald-200 rounded-sm p-4 space-y-3 mb-4">
          <div>
            <p className={`${labelCls} text-slate-400`}>Email</p>
            <p className="font-mono text-sm text-slate-800">{email}</p>
          </div>
          <div>
            <p className={`${labelCls} text-slate-400`}>Senha</p>
            <CampoSenha senha={senha} />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-sm px-3 py-2.5 mb-4 flex items-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-amber-700">Copie a senha agora — ela não será exibida novamente.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={copiar}
            className="flex-1 flex items-center justify-center gap-2 border border-slate-200 text-slate-700 text-xs font-semibold uppercase tracking-wider py-2.5 rounded-sm hover:bg-slate-50 transition-all"
          >
            {copiado ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Copiado!
              </>
            ) : 'Copiar credenciais'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 rounded-sm hover:bg-slate-800 transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal genérico ───────────────────────────────────────────────────────────
function Modal({ open, onClose, titulo, children }: { open: boolean; onClose: () => void; titulo: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-slate-200 rounded-sm shadow-xl w-full max-w-md mx-4 p-6">
        <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">Novo cadastro</p>
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight mb-5" style={{ fontFamily: 'var(--font-jakarta)' }}>
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  )
}

// ─── Card de Gestor ───────────────────────────────────────────────────────────
function CardGestor({ gestor, onAtualizado }: { gestor: Gestor; onAtualizado: () => void }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(gestor.name)
  const [email, setEmail] = useState(gestor.email)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [modalSenha, setModalSenha] = useState(false)
  const [novaSenha, setNovaSenha] = useState<string | null>(null)
  const [resetando, setResetando] = useState(false)

  async function salvarEdicao() {
    setErro(null)
    setSalvando(true)
    try {
      const res = await fetch(`/api/admin/managers/${gestor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome, email }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setErro(data.error ?? 'Erro ao salvar'); return }
      setEditando(false)
      onAtualizado()
    } catch {
      setErro('Erro de conexão')
    } finally {
      setSalvando(false)
    }
  }

  async function resetarSenha() {
    setResetando(true)
    try {
      const res = await fetch(`/api/admin/managers/${gestor.id}/reset-senha`, { method: 'POST' })
      const data = await res.json() as { data?: { nova_senha: string }; error?: string }
      if (!res.ok) { alert(data.error ?? 'Erro ao redefinir senha'); return }
      setNovaSenha(data.data!.nova_senha)
      setModalSenha(true)
    } catch {
      alert('Erro de conexão')
    } finally {
      setResetando(false)
    }
  }

  return (
    <>
      {modalSenha && novaSenha && (
        <ModalCredenciais
          open={modalSenha}
          onClose={() => { setModalSenha(false); setNovaSenha(null) }}
          email={gestor.email}
          senha={novaSenha}
          titulo="Nova senha gerada"
        />
      )}

      <div className="border border-slate-200 rounded-sm p-4 bg-white hover:border-slate-300 transition-colors">
        {editando ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nome</label>
                <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
              </div>
            </div>
            {erro && <p className="text-xs text-red-600">{erro}</p>}
            <div className="flex gap-2">
              <button
                onClick={salvarEdicao}
                disabled={salvando}
                className="text-[10px] font-semibold uppercase tracking-wider bg-slate-900 text-white px-3 py-1.5 rounded-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {salvando ? '…' : 'Salvar'}
              </button>
              <button
                onClick={() => { setEditando(false); setNome(gestor.name); setEmail(gestor.email) }}
                className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-3 py-1.5 rounded-sm hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-7 h-7 rounded-sm bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <span className="text-xs font-bold">{gestor.name.charAt(0).toUpperCase()}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">{gestor.name}</p>
                {gestor.is_admin && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-sm">Admin</span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono ml-9">{gestor.email}</p>
              <div className="flex items-center gap-1.5 mt-1.5 ml-9">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Senha:</p>
                <CampoSenha senha="[redefina para ver]" />
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => setEditando(true)}
                className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-2.5 py-1.5 rounded-sm hover:bg-slate-50 transition-colors"
              >
                Editar
              </button>
              <button
                onClick={resetarSenha}
                disabled={resetando}
                className="text-[10px] font-semibold uppercase tracking-wider border border-amber-200 text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-sm hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                {resetando ? '…' : 'Redefinir senha'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Card de Empresa ──────────────────────────────────────────────────────────
function CardEmpresa({ empresa, onAtualizado }: { empresa: Empresa; onAtualizado: () => void }) {
  const [expandido, setExpandido] = useState(false)
  const [expandidoInv, setExpandidoInv] = useState(false)
  const [editandoEmpresa, setEditandoEmpresa] = useState(false)
  const [nomeEmpresa, setNomeEmpresa] = useState(empresa.name)
  const [plano, setPlano] = useState(empresa.plan)
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false)

  const [modalNovoGestor, setModalNovoGestor] = useState(false)
  const [nomeGestor, setNomeGestor] = useState('')
  const [emailGestor, setEmailGestor] = useState('')
  const [criadoEmail, setCriadoEmail] = useState<string | null>(null)
  const [criadoSenha, setCriadoSenha] = useState<string | null>(null)
  const [erroGestor, setErroGestor] = useState<string | null>(null)
  const [criandoGestor, setCriandoGestor] = useState(false)

  const pc = planoCfg[empresa.plan] ?? planoCfg.starter

  async function salvarEmpresa() {
    setSalvandoEmpresa(true)
    try {
      await fetch(`/api/admin/companies/${empresa.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nomeEmpresa, plan: plano }),
      })
      setEditandoEmpresa(false)
      onAtualizado()
    } finally {
      setSalvandoEmpresa(false)
    }
  }

  async function adicionarGestor(e: React.FormEvent) {
    e.preventDefault()
    setErroGestor(null)
    setCriandoGestor(true)
    try {
      const res = await fetch('/api/admin/managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: empresa.id, name: nomeGestor, email: emailGestor }),
      })
      const data = await res.json() as { data?: { email: string; senha_temporaria: string }; error?: string }
      if (!res.ok) { setErroGestor(data.error ?? 'Erro ao criar'); return }
      setCriadoEmail(data.data!.email)
      setCriadoSenha(data.data!.senha_temporaria)
      setNomeGestor('')
      setEmailGestor('')
      onAtualizado()
    } catch {
      setErroGestor('Erro de conexão')
    } finally {
      setCriandoGestor(false)
    }
  }

  return (
    <>
      {criadoSenha && criadoEmail && (
        <ModalCredenciais
          open={true}
          onClose={() => { setCriadoEmail(null); setCriadoSenha(null); setModalNovoGestor(false) }}
          email={criadoEmail}
          senha={criadoSenha}
          titulo="Gestor criado com sucesso"
        />
      )}

      <Modal
        open={modalNovoGestor && !criadoSenha}
        onClose={() => { setModalNovoGestor(false); setErroGestor(null) }}
        titulo={`Adicionar gestor — ${empresa.name}`}
      >
        <form onSubmit={adicionarGestor} className="space-y-4">
          <div>
            <label className={labelCls}>Nome</label>
            <input value={nomeGestor} onChange={e => setNomeGestor(e.target.value)} placeholder="Maria Silva" required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={emailGestor} onChange={e => setEmailGestor(e.target.value)} placeholder="maria@empresa.com" required className={inputCls} />
          </div>
          {erroGestor && <p className="text-xs text-red-600">{erroGestor}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setModalNovoGestor(false)} className="flex-1 border border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider py-2.5 rounded-sm hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={criandoGestor} className="flex-1 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 rounded-sm hover:bg-slate-800 disabled:opacity-50">
              {criandoGestor ? 'Criando…' : 'Criar gestor'}
            </button>
          </div>
        </form>
      </Modal>

      <div className="border border-slate-200 rounded-sm bg-white overflow-hidden hover:border-slate-300 transition-colors">
        {/* Cabeçalho da empresa */}
        <div className="px-6 py-4">
          {editandoEmpresa ? (
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className={labelCls}>Nome da empresa</label>
                <input value={nomeEmpresa} onChange={e => setNomeEmpresa(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Plano</label>
                <select
                  value={plano}
                  onChange={e => setPlano(e.target.value)}
                  className="border border-slate-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900"
                >
                  {PLANOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={salvarEmpresa} disabled={salvandoEmpresa} className="text-[10px] font-semibold uppercase tracking-wider bg-slate-900 text-white px-3 py-2 rounded-sm hover:bg-slate-800 disabled:opacity-50">
                  {salvandoEmpresa ? '…' : 'Salvar'}
                </button>
                <button onClick={() => { setEditandoEmpresa(false); setNomeEmpresa(empresa.name); setPlano(empresa.plan) }} className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-3 py-2 rounded-sm hover:bg-slate-50">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-sm bg-slate-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-slate-600">{empresa.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900 truncate">{empresa.name}</h2>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border ${pc.cls}`}>
                      {pc.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 shrink-0">
                {/* Stats */}
                <div className="flex gap-6 text-center">
                  <div>
                    <p className="text-xl font-semibold text-slate-900">{empresa.gestores.length}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">gestores</p>
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-slate-900">{empresa.total_investigacoes}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">investigações</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setEditandoEmpresa(true)}
                    className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-2.5 py-1.5 rounded-sm hover:bg-slate-50 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => { setExpandidoInv(v => !v); setExpandido(false) }}
                    className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-2.5 py-1.5 rounded-sm hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                  >
                    {expandidoInv ? 'Ocultar' : `Investigações (${empresa.total_investigacoes})`}
                    <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 transition-transform ${expandidoInv ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { setExpandido(v => !v); setExpandidoInv(false) }}
                    className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-2.5 py-1.5 rounded-sm hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                  >
                    {expandido ? 'Ocultar' : `Gestores (${empresa.gestores.length})`}
                    <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 transition-transform ${expandido ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Investigações expandidas */}
        {expandidoInv && (
          <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50">
            {empresa.investigacoes.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-3">Nenhuma investigação registrada.</p>
            ) : (
              <div className="space-y-1.5">
                {empresa.investigacoes.map(inv => {
                  const statusCfg: Record<string, { dot: string; text: string; label: string }> = {
                    pending:   { dot: 'bg-slate-300',   text: 'text-slate-500',   label: 'Pendente'     },
                    active:    { dot: 'bg-teal-500',    text: 'text-teal-700',    label: 'Em andamento' },
                    saturated: { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Saturando'    },
                    completed: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Concluído'    },
                    cancelled: { dot: 'bg-red-400',     text: 'text-red-600',     label: 'Cancelado'    },
                  }
                  const s = statusCfg[inv.status] ?? statusCfg.pending
                  const data = new Date(inv.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
                  return (
                    <div key={inv.id} className="flex items-center justify-between gap-4 border border-slate-200 rounded-sm bg-white px-4 py-2.5 hover:border-slate-300 transition-colors">
                      <p className="text-sm text-slate-900 font-medium truncate flex-1">{inv.title}</p>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-mono text-slate-400">{data}</span>
                        <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${s.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          {s.label}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Gestores expandidos */}
        {expandido && (
          <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50 space-y-2">
            {empresa.gestores.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-3">Nenhum gestor cadastrado.</p>
            ) : (
              empresa.gestores.map(g => (
                <CardGestor key={g.id} gestor={g} onAtualizado={onAtualizado} />
              ))
            )}
            <div className="pt-1">
              <button
                onClick={() => setModalNovoGestor(true)}
                className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 hover:text-teal-800 border border-teal-200 bg-teal-50 px-3 py-1.5 rounded-sm transition-colors flex items-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Adicionar gestor
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Painel principal ─────────────────────────────────────────────────────────
export function AdminCompaniesClient({ empresas: inicial }: Props) {
  const router = useRouter()
  const [empresas, setEmpresas] = useState(inicial)
  const [modalEmpresa, setModalEmpresa] = useState(false)
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [plano, setPlano] = useState('starter')
  const [nomeGestor, setNomeGestor] = useState('')
  const [emailGestor, setEmailGestor] = useState('')
  const [criando, setCriando] = useState(false)
  const [erroEmpresa, setErroEmpresa] = useState<string | null>(null)
  const [credenciaisCriadas, setCredenciaisCriadas] = useState<{ email: string; senha: string } | null>(null)

  async function criarEmpresa(e: React.FormEvent) {
    e.preventDefault()
    setErroEmpresa(null)
    setCriando(true)
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: nomeEmpresa,
          plan: plano,
          manager_name: nomeGestor,
          manager_email: emailGestor,
        }),
      })
      const data = await res.json() as { data?: { email: string; senha_temporaria: string }; error?: string }
      if (!res.ok) { setErroEmpresa(data.error ?? 'Erro ao criar'); return }
      setCredenciaisCriadas({ email: data.data!.email, senha: data.data!.senha_temporaria })
      setNomeEmpresa(''); setPlano('starter'); setNomeGestor(''); setEmailGestor('')
      router.refresh()
    } catch {
      setErroEmpresa('Erro de conexão')
    } finally {
      setCriando(false)
    }
  }

  function fecharModalEmpresa() {
    setModalEmpresa(false)
    setCredenciaisCriadas(null)
    setErroEmpresa(null)
  }

  return (
    <div>
      {credenciaisCriadas && (
        <ModalCredenciais
          open={true}
          onClose={fecharModalEmpresa}
          email={credenciaisCriadas.email}
          senha={credenciaisCriadas.senha}
          titulo="Empresa criada com sucesso"
        />
      )}

      <Modal
        open={modalEmpresa && !credenciaisCriadas}
        onClose={fecharModalEmpresa}
        titulo="Nova empresa"
      >
        <form onSubmit={criarEmpresa} className="space-y-4">
          <div>
            <label className={labelCls}>Nome da empresa</label>
            <input value={nomeEmpresa} onChange={e => setNomeEmpresa(e.target.value)} placeholder="Construtora Exemplo Ltda" required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Plano</label>
            <select
              value={plano}
              onChange={e => setPlano(e.target.value)}
              className={`${inputCls} cursor-pointer`}
            >
              {PLANOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-3">Gestor responsável</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nome</label>
                <input value={nomeGestor} onChange={e => setNomeGestor(e.target.value)} placeholder="João Silva" required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={emailGestor} onChange={e => setEmailGestor(e.target.value)} placeholder="gestor@empresa.com" required className={inputCls} />
              </div>
            </div>
          </div>

          {erroEmpresa && (
            <div className="bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              <p className="text-sm text-red-700">{erroEmpresa}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={fecharModalEmpresa} className="flex-1 border border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider py-2.5 rounded-sm hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={criando} className="flex-1 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 rounded-sm hover:bg-slate-800 disabled:opacity-50">
              {criando ? 'Criando…' : 'Criar empresa'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Header */}
      <div className="border-b border-slate-200 px-8 py-6 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">Administração</p>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Empresas</h1>
          </div>
          <button
            onClick={() => setModalEmpresa(true)}
            className="flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 px-5 rounded-sm hover:bg-slate-800 transition-all shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nova empresa
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {empresas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-400 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
            </div>
            <p className="text-base font-medium text-slate-900 mb-1">Nenhuma empresa cadastrada</p>
            <p className="text-sm text-slate-500">Crie a primeira empresa para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {empresas.map(e => (
              <CardEmpresa
                key={e.id}
                empresa={e}
                onAtualizado={() => router.refresh()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
