'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/esqueci-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }

      if (!res.ok) {
        setErro(data.error ?? 'Não foi possível processar o pedido.')
        setLoading(false)
        return
      }
      setEnviado(true)
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-reveal">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 bg-teal-50 text-teal-600 rounded flex items-center justify-center border border-teal-100">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <span className="text-lg font-semibold tracking-tight text-slate-900">Elo</span>
      </div>

      {enviado ? (
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight mb-2">Verifique seu email</h1>
          <div className="bg-teal-50 border border-teal-200 rounded-sm px-4 py-3 mb-6">
            <p className="text-sm text-teal-800 leading-relaxed">
              Se <strong>{email}</strong> estiver cadastrado, você receberá em instantes um link
              para criar uma nova senha. O link vale por 1 hora.
            </p>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-6">
            Não recebeu? Verifique a caixa de spam. Se ainda assim não chegar, fale com o
            administrador da sua conta.
          </p>
          <Link href="/login" className="text-xs font-semibold text-teal-600 hover:underline">
            ← Voltar ao login
          </Link>
        </div>
      ) : (
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight mb-1">Recuperar senha</h1>
          <p className="text-sm text-slate-500 mb-6">
            Informe o email da sua conta e enviaremos um link para criar uma nova senha.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="gestor@empresa.com"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-sm text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              />
            </div>

            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-sm px-3 py-2.5">
                <p className="text-sm text-red-700">{erro}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-3 px-5 rounded-sm hover:bg-slate-800 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Enviando…' : 'Enviar link de recuperação'}
            </button>

            <div className="text-center pt-1">
              <Link href="/login" className="text-xs text-slate-500 hover:text-teal-600 transition-colors">
                ← Voltar ao login
              </Link>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
