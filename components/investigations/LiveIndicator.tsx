'use client'

import { useEffect, useState } from 'react'

interface Props {
  ativo: boolean
  ultimaAtualizacao: Date | null
  atualizando: boolean
  comFalha: boolean
  onAtualizarAgora: () => void
}

function haQuantoTempo(quando: Date | null, agora: number): string {
  if (!quando) return 'aguardando…'
  const seg = Math.max(0, Math.round((agora - quando.getTime()) / 1000))
  if (seg < 5) return 'agora mesmo'
  if (seg < 60) return `há ${seg}s`
  const min = Math.floor(seg / 60)
  return `há ${min} min`
}

/**
 * Mostra que a conversa está sendo acompanhada ao vivo.
 *
 * Sem isto, o polling era invisível: o gestor não tinha como saber se a tela
 * estava atualizando sozinha ou se precisava recarregar a página.
 */
export function LiveIndicator({ ativo, ultimaAtualizacao, atualizando, comFalha, onAtualizarAgora }: Props) {
  const [agora, setAgora] = useState(() => Date.now())

  // Reavalia o texto a cada segundo para o "há Xs" não congelar
  useEffect(() => {
    if (!ativo) return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [ativo])

  if (!ativo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
        Encerrada
      </span>
    )
  }

  if (comFalha) {
    return (
      <button
        onClick={onAtualizarAgora}
        className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 hover:text-amber-700 transition-colors"
        title="A última tentativa falhou. Clique para tentar de novo."
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Sem conexão · tentar agora
      </button>
    )
  }

  return (
    <button
      onClick={onAtualizarAgora}
      className="group inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-600 hover:text-teal-700 transition-colors"
      title="Atualiza sozinho. Clique para atualizar na hora."
    >
      <span className="relative flex w-1.5 h-1.5">
        <span className={`absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75 ${atualizando ? 'animate-ping' : ''}`} />
        <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-teal-500" />
      </span>
      Ao vivo
      <span className="font-normal normal-case tracking-normal text-slate-400 group-hover:text-slate-500">
        · {haQuantoTempo(ultimaAtualizacao, agora)}
      </span>
    </button>
  )
}
