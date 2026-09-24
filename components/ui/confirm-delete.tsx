'use client'

import { useState, useEffect } from 'react'

interface Props {
  /** Título do item, exibido em destaque e usado na confirmação por digitação */
  nomeItem: string
  /** Texto explicando o que será perdido */
  descricao: React.ReactNode
  /** Quando true, exige digitar o nome do item para liberar o botão */
  exigirDigitacao?: boolean
  rotuloConfirmar?: string
  onConfirmar: () => Promise<void>
  onCancelar: () => void
}

/**
 * Modal de confirmação para ações irreversíveis.
 *
 * Com `exigirDigitacao`, o usuário precisa digitar o nome do item — uma
 * barreira deliberada contra o clique automático em exclusões destrutivas.
 */
export function ConfirmDelete({
  nomeItem,
  descricao,
  exigirDigitacao = false,
  rotuloConfirmar = 'Apagar definitivamente',
  onConfirmar,
  onCancelar,
}: Props) {
  const [digitado, setDigitado] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const liberado = !exigirDigitacao || digitado.trim() === nomeItem.trim()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !processando) onCancelar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancelar, processando])

  async function confirmar() {
    if (!liberado || processando) return
    setProcessando(true)
    setErro(null)
    try {
      await onConfirmar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao apagar.')
      setProcessando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-md shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Esta ação não pode ser desfeita</h2>
            <p className="text-sm text-slate-500 mt-0.5 break-words">{nomeItem}</p>
          </div>
        </div>

        <div className="text-sm text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-sm p-3 mb-4">
          {descricao}
        </div>

        {exigirDigitacao && (
          <div className="mb-4">
            <label className="block text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5">
              Digite o título para confirmar
            </label>
            <input
              type="text"
              value={digitado}
              onChange={e => setDigitado(e.target.value)}
              disabled={processando}
              placeholder={nomeItem}
              autoFocus
              className="w-full px-3 py-2 border border-slate-200 rounded-sm text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent disabled:bg-slate-50"
            />
          </div>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-sm px-3 py-2 mb-4">
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancelar}
            disabled={processando}
            className="text-xs font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-4 py-2 rounded-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!liberado || processando}
            className="text-xs font-semibold uppercase tracking-wider bg-red-600 text-white px-4 py-2 rounded-sm hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {processando ? 'Apagando…' : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
