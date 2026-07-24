'use client'

import { useEffect, useState } from 'react'

interface Manager { id: string; name: string; email: string; is_admin: boolean; is_active: boolean; created_at: string; company_id: string; company_name: string; investigations_count: number; total_cost_brl: number }
interface Company { id: string; name: string }

function fmt(n: number) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function AdminManagersPage() {
  const [managers, setManagers] = useState<Manager[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', company_id: '' })
  const [saving, setSaving] = useState(false)
  const [resetId, setResetId] = useState<string | null>(null)
  const [newPwd, setNewPwd] = useState('')

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/managers').then(r => r.json() as Promise<{ data: Manager[] }>).then(j => j.data),
      fetch('/api/admin/companies').then(r => r.json() as Promise<{ data: Company[] }>).then(j => j.data),
    ]).then(([mgrs, cos]) => { setManagers(mgrs); setCompanies(cos) }).catch(console.error).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await fetch('/api/admin/managers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, is_admin: false }) })
    setShowForm(false); setForm({ name: '', email: '', password: '', company_id: '' }); setSaving(false); load()
  }

  async function handleReset(id: string) {
    if (!newPwd) return
    await fetch("/api/admin/managers/" + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPwd }) })
    setResetId(null); setNewPwd(''); load()
  }

  async function toggleActive(m: Manager) {
    await fetch("/api/admin/managers/" + m.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !m.is_active }) })
    load()
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-semibold text-slate-900">Gestores</h1><p className="text-sm text-slate-500 mt-1">{managers.length} gestor(es)</p></div>
        <button onClick={() => setShowForm(v => !v)} className="bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2 px-4 rounded-sm hover:bg-slate-800 transition-all">+ Novo gestor</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-sm p-5 mb-6 grid grid-cols-2 gap-4">
          <div><label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">Nome</label><input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm" /></div>
          <div><label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} required className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm" /></div>
          <div><label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">Senha</label><input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} required className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm" /></div>
          <div><label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">Empresa</label><select value={form.company_id} onChange={e => setForm(f => ({...f, company_id: e.target.value}))} required className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm"><option value="">Selecione...</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
<button type="submit" disabled={saving} className="col-span-2 bg-teal-600 text-white text-xs font-semibold uppercase tracking-wider py-2 px-4 rounded-sm hover:bg-teal-700 transition-all disabled:opacity-50">{saving ? 'Criando...' : 'Criar gestor'}</button>
        </form>
      )}

      {loading && <p className="text-sm text-slate-400">Carregando...</p>}
      {!loading && (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100"><th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Nome</th><th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Email</th><th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Empresa</th><th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Investig.</th><th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Custo R$</th><th className="px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase text-right">Status</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>{managers.map(m => (
              <tr key={m.id} className={"border-b border-slate-50 transition-colors " + (m.is_active ? "hover:bg-slate-50" : "bg-slate-50 opacity-60")}>
                <td className="px-4 py-3 font-medium text-slate-900">{m.name}{m.is_admin && <span className="ml-2 text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">admin</span>}</td>
                <td className="px-4 py-3 text-slate-500">{m.email}</td>
                <td className="px-4 py-3 text-slate-600">{m.company_name}</td>
                <td className="px-4 py-3 text-right">{m.investigations_count}</td>
                <td className="px-4 py-3 text-right font-mono">R$ {fmt(m.total_cost_brl)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={"text-[10px] px-2 py-0.5 rounded font-semibold " + (m.is_active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500")}>
                    {m.is_active ? 'ativo' : 'desativado'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="flex items-center gap-3 justify-end">
                    {resetId === m.id ? (
                      <>
                        <input type="password" placeholder="Nova senha" value={newPwd} onChange={e => setNewPwd(e.target.value)} className="border border-slate-200 rounded-sm px-2 py-1 text-xs w-28" />
                        <button onClick={() => handleReset(m.id)} className="text-xs bg-teal-600 text-white px-2 py-1 rounded-sm">Salvar</button>
                        <button onClick={() => setResetId(null)} className="text-xs text-slate-400 hover:text-slate-700">Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setResetId(m.id)} className="text-xs text-slate-400 hover:text-teal-700 hover:underline">Resetar senha</button>
                        <button onClick={() => toggleActive(m)} className={"text-xs hover:underline " + (m.is_active ? "text-red-400 hover:text-red-700" : "text-green-600 hover:text-green-800")}>
                          {m.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </>
                    )}
                  </span>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {managers.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhum gestor</p>}
        </div>
      )}
    </div>
  )
}