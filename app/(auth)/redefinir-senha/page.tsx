'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function RedefinirSenhaForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''

  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (senha.length < 8) {
      setErro('A senha deve ter ao menos 8 caracteres.')
      return
    }
    if (senha !== confirma) {
      setErro('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/redefinir-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: senha }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }

      if (!res.ok) {
        setErro(data.error ?? 'Não foi possível redefinir a senha.')
        setLoading(false)
        return
      }
      setPronto(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch {
      setErro('Erro de conexão. Tente novamente.')
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight mb-2">Link inválido</h1>
        <p className="text-sm text-slate-500 mb-6">
          Este endereço não contém um token de recuperação válido. Solicite um novo link.
        </p>
        <Link href="/esqueci-senha" className="text-xs font-semibold text-teal-600 hover:underline">
          Solicitar novo link
        </Link>
      </div>
    )
  }

  if (pronto) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight mb-2">Senha redefinida</h1>
        <div className="bg-teal-50 border border-teal-200 rounded-sm px-4 py-3 mb-4">
          <p className="text-sm text-teal-800">
            Pronto! Sua senha foi alterada. Redirecionando para o login…
          </p>
        </div>
        <Link href="/login" className="text-xs font-semibold text-teal-600 hover:underline">
          Ir para o login agora
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 tracking-tight mb-1">Criar nova senha</h1>
      <p className="text-sm text-slate-500 mb-6">Escolha uma senha com pelo menos 8 caracteres.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="senha" className="block text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5">
            Nova senha
          </label>
          <input
            id="senha"
            type="password"
            required
            value={senha}
            onChange={e => setSenha(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-sm text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
          />
        </div>

        <div>
          <label htmlFor="confirma" className="block text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5">
            Confirmar senha
          </label>
          <input
            id="confirma"
            type="password"
            required
            value={confirma}
            onChange={e => setConfirma(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-sm text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
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
          {loading ? 'Salvando…' : 'Redefinir senha'}
        </button>
      </form>
    </div>
  )
}

export default function RedefinirSenhaPage() {
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

      <Suspense fallback={<p className="text-sm text-slate-400">Carregando…</p>}>
        <RedefinirSenhaForm />
      </Suspense>
    </div>
  )
}
