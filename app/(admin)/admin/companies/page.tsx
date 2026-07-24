'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useState as useStateForm } from 'react'

interface Company {
  id: string
  name: string
  plan: string
  created_at: string
  managers_count: number
  investigations_count: number
  total_cost_brl: number
}

function fmt(n: number) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [plan, setPlan] = useState('starter')
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    fetch('/api/admin/companies')
      .then(r => r.json() as Promise<{ data: Company[] }>)
      .then(j => setCompanies(j.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/admin/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, plan }) })
    setShowForm(false)
    setName('')
    setPlan('starter')
    setSaving(false)
    load()
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Empresas</h1>
          <p className="text-sm text-slate-500 mt-1">{companies.length} empresa(s) cadastrada(s)</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2 px-4 rounded-sm hover:bg-slate-800 transition-all">
          + Nova empresa
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-sm p-5 mb-6 flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} required className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">Plano</label>
            <select value={plan} onChange={e => setPlan(e.target.value)} className="border border-slate-200 rounded-sm px-3 py-2 text-sm">
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <button type="submit" disabled={saving} className="bg-teal-600 text-white text-xs font-semibold uppercase tracking-wider py-2 px-4 rounded-sm hover:bg-teal-700 transition-all disabled:opacity-50">
            {saving ? 'Criando...' : 'Criar'}
          </button>
        </form>
      )}

      {loading && <p className="text-sm text-slate-400">Carregando...</p>}

      {!loading && (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Empresa</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Plano</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Gestores</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Investigacoes</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Custo R$</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3"><span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{c.plan}</span></td>
                  <td className="px-4 py-3 text-right text-slate-600">{c.managers_count}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{c.investigations_count}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">R$ {fmt(c.total_cost_brl)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={"/admin/companies/" + c.id} className="text-xs text-teal-700 hover:underline">Ver detalhe</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {companies.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhuma empresa cadastrada</p>}
        </div>
      )}
    </div>
  )
}