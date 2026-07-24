'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface ManagerRow { id: string; name: string; email: string; is_admin: boolean; is_active: boolean; created_at: string; total_cost_brl: number }
interface InvRow { id: string; title: string; status: string; created_at: string }
interface Company { id: string; name: string; plan: string; created_at: string }
interface Detail {
  company: Company
  managers: ManagerRow[]
  investigations: InvRow[]
  total_cost_brl: number
  recent_logs: { id: string; operation: string; input_tokens: number; output_tokens: number; cost_brl: number; created_at: string }[]
}

function fmt(n: number) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  saturated: 'bg-amber-100 text-amber-700',
}

export default function CompanyDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [detail, setDetail] = useState<Detail | null>(null)
  const [tab, setTab] = useState<'overview' | 'managers' | 'investigations' | 'logs'>('overview')

  // Estado formulário novo gestor
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState({ name: '', email: '', password: '' })
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState('')

  // Estado reset de senha
  const [resetId, setResetId]       = useState<string | null>(null)
  const [newPwd, setNewPwd]         = useState('')

  // Estado confirmação de exclusão
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [deleteMsg, setDeleteMsg]   = useState('')
  const [deleting, setDeleting]     = useState(false)

  function load() {
    fetch("/api/admin/companies/" + id)
      .then(r => r.json() as Promise<{ data: Detail }>)
      .then(j => setDetail(j.data))
      .catch(console.error)
  }

  useEffect(() => { load() }, [id])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFormError('')
    try {
      const res = await fetch('/api/admin/managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, company_id: id, is_admin: false }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        setFormError(j.error ?? 'Erro ao criar gestor')
        return
      }
      setShowForm(false)
      setForm({ name: '', email: '', password: '' })
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleReset(managerId: string) {
    if (!newPwd.trim()) return
    await fetch(`/api/admin/managers/${managerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPwd }),
    })
    setResetId(null); setNewPwd(''); load()
  }

  async function toggleActive(m: ManagerRow) {
    await fetch(`/api/admin/managers/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !m.is_active }),
    })
    load()
  }

  async function handleDelete(managerId: string) {
    setDeleting(true); setDeleteMsg('')
    const res = await fetch(`/api/admin/managers/${managerId}`, { method: 'DELETE' })
    const j = await res.json() as { data?: { deleted: boolean; deactivated: boolean; reason?: string }; error?: string }
    if (j.error) {
      setDeleteMsg(j.error)
    } else if (j.data?.deactivated) {
      setDeleteMsg(j.data.reason ?? 'Gestor desativado.')
      setTimeout(() => { setDeleteId(null); setDeleteMsg(''); load() }, 2500)
    } else {
      setDeleteId(null); load()
    }
    setDeleting(false)
  }

  if (!detail) return <div className="p-8 text-sm text-slate-400">Carregando...</div>
  const { company, managers, investigations, total_cost_brl, recent_logs } = detail

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/companies" className="text-xs text-slate-400 hover:text-slate-700 mb-2 block">← Empresas</Link>
        <h1 className="text-2xl font-semibold text-slate-900">{company.name}</h1>
        <p className="text-sm text-slate-500 mt-1">
          Plano: <span className="font-medium">{company.plan}</span> · Custo total: <span className="font-medium">R$ {fmt(total_cost_brl)}</span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['overview', 'managers', 'investigations', 'logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={"px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors " + (tab === t ? "border-teal-600 text-teal-700" : "border-transparent text-slate-400 hover:text-slate-700")}>
            {t === 'overview' ? 'Visão Geral' : t === 'managers' ? `Gestores (${managers.length})` : t === 'investigations' ? `Investigações (${investigations.length})` : 'Logs de uso'}
          </button>
        ))}
      </div>

      {/* Visão Geral */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-sm p-5">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">Gestores</p>
            <p className="text-3xl font-bold text-slate-900">{managers.length}</p>
            <p className="text-xs text-slate-400 mt-1">{managers.filter(m => m.is_active).length} ativo(s)</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-sm p-5">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">Investigações</p>
            <p className="text-3xl font-bold text-slate-900">{investigations.length}</p>
            <p className="text-xs text-slate-400 mt-1">{investigations.filter(i => i.status === 'completed').length} concluída(s)</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-sm p-5 col-span-2">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-4">Custo por gestor</p>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100"><th className="text-left py-2 text-xs text-slate-500">Gestor</th><th className="text-right py-2 text-xs text-slate-500">Custo R$</th></tr></thead>
              <tbody>{managers.map(m => (
                <tr key={m.id} className="border-b border-slate-50">
                  <td className="py-2 text-slate-700">{m.name}{!m.is_active && <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded">desativado</span>}</td>
                  <td className="py-2 text-right font-mono text-slate-700">R$ {fmt(m.total_cost_brl)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gestores */}
      {tab === 'managers' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setShowForm(v => !v); setFormError('') }}
              className="bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2 px-4 rounded-sm hover:bg-slate-800 transition-all">
              + Novo gestor
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-sm p-5 mb-4 grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">Nome</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">Senha inicial</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm" />
              </div>
              {formError && <p className="col-span-2 text-xs text-red-500">{formError}</p>}
              <div className="col-span-2 flex gap-3">
                <button type="submit" disabled={saving} className="bg-teal-600 text-white text-xs font-semibold uppercase tracking-wider py-2 px-4 rounded-sm hover:bg-teal-700 disabled:opacity-50">
                  {saving ? 'Criando...' : 'Criar gestor'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setFormError('') }} className="text-sm text-slate-500 hover:text-slate-800">Cancelar</button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Nome</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Email</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Custo R$</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {managers.map(m => (
                  <tr key={m.id} className={"border-b border-slate-50 transition-colors " + (m.is_active ? "hover:bg-slate-50" : "bg-slate-50 opacity-60")}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {m.name}
                      {m.is_admin && <span className="ml-2 text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">admin</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{m.email}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">R$ {fmt(m.total_cost_brl)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={"text-[10px] px-2 py-0.5 rounded font-semibold " + (m.is_active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500")}>
                        {m.is_active ? 'ativo' : 'desativado'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {/* Confirmação de exclusão */}
                      {deleteId === m.id ? (
                        <div className="flex flex-col items-end gap-1">
                          {deleteMsg ? (
                            <span className="text-xs text-amber-600">{deleteMsg}</span>
                          ) : (
                            <>
                              <p className="text-xs text-red-600 font-medium">Confirmar exclusão?</p>
                              <p className="text-[10px] text-slate-400">Se tiver investigações, será desativado.</p>
                              <div className="flex gap-2 mt-1">
                                <button onClick={() => handleDelete(m.id)} disabled={deleting}
                                  className="text-xs bg-red-600 text-white px-2 py-1 rounded-sm hover:bg-red-700 disabled:opacity-50">
                                  {deleting ? '...' : 'Confirmar'}
                                </button>
                                <button onClick={() => setDeleteId(null)} className="text-xs text-slate-400 hover:text-slate-700">Cancelar</button>
                              </div>
                            </>
                          )}
                        </div>
                      ) : resetId === m.id ? (
                        <span className="flex items-center gap-2 justify-end">
                          <input type="password" placeholder="Nova senha" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                            className="border border-slate-200 rounded-sm px-2 py-1 text-xs w-28" />
                          <button onClick={() => handleReset(m.id)} className="text-xs bg-teal-600 text-white px-2 py-1 rounded-sm">Salvar</button>
                          <button onClick={() => setResetId(null)} className="text-xs text-slate-400 hover:text-slate-700">Cancelar</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-3 justify-end">
                          <button onClick={() => setResetId(m.id)} className="text-xs text-slate-400 hover:text-teal-700 hover:underline">
                            Resetar senha
                          </button>
                          <button onClick={() => toggleActive(m)} className={"text-xs hover:underline " + (m.is_active ? "text-amber-500 hover:text-amber-700" : "text-green-600 hover:text-green-800")}>
                            {m.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                          <button onClick={() => { setDeleteId(m.id); setDeleteMsg('') }}
                            className="text-xs text-red-400 hover:text-red-700 hover:underline">
                            Excluir
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {managers.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhum gestor</p>}
          </div>
        </div>
      )}

      {/* Investigações */}
      {tab === 'investigations' && (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Título</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Data</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {investigations.map(i => (
                <tr key={i.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{i.title}</td>
                  <td className="px-4 py-3">
                    <span className={"text-xs px-2 py-0.5 rounded " + (STATUS_COLORS[i.status] ?? '')}>{i.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{i.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right">
                    {i.status === 'completed' && (
                      <Link href={`/admin/relatorios/${i.id}`} className="text-xs text-teal-700 hover:underline">Ver relatório</Link>
                    )}
                    {i.status === 'saturated' && (
                      <Link href="/admin/saude" className="text-xs text-amber-600 hover:underline">Reprocessar</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {investigations.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhuma investigação</p>}
        </div>
      )}

      {/* Logs */}
      {tab === 'logs' && (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Operação</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Tokens in</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Tokens out</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Custo R$</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Data</th>
              </tr>
            </thead>
            <tbody>
              {recent_logs.map(l => (
                <tr key={l.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-700">{l.operation}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{l.input_tokens.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{l.output_tokens.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">R$ {fmt(l.cost_brl)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{l.created_at.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent_logs.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Sem logs ainda</p>}
        </div>
      )}
    </div>
  )
}
