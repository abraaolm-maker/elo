'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Atualização ao vivo por polling.
 *
 * Substitui o padrão anterior, que usava `setTimeout` de disparo único e só
 * reagendava porque as dependências do efeito trocavam de referência a cada
 * render. Era um heartbeat acidental: bastava uma requisição falhar — o
 * retorno antecipado não mudava o estado, o efeito não reexecutava e a
 * atualização parava de vez, sem nenhum aviso ao usuário.
 *
 * Aqui o intervalo é explícito e sobrevive a erros. Além disso:
 * - pausa quando a aba está oculta (não gasta requisição à toa);
 * - ao voltar para a aba, atualiza na hora, sem esperar o próximo ciclo;
 * - expõe o instante da última atualização para a interface poder mostrar
 *   que está realmente ao vivo.
 */

export interface LiveRefreshOptions {
  /** Intervalo entre atualizações, em ms */
  intervalMs: number
  /** Quando false, o polling fica parado (ex: investigação concluída) */
  enabled: boolean
}

export interface LiveRefreshState {
  /** Momento da última atualização bem-sucedida */
  ultimaAtualizacao: Date | null
  /** true enquanto uma atualização está em andamento */
  atualizando: boolean
  /** true quando a última tentativa falhou (a próxima ainda vai acontecer) */
  comFalha: boolean
  /** Força uma atualização imediata */
  atualizarAgora: () => void
}

export function useLiveRefresh(
  fn: () => Promise<void>,
  { intervalMs, enabled }: LiveRefreshOptions
): LiveRefreshState {
  // Começa com o instante da montagem: os dados iniciais vieram da renderização
  // no servidor, que acabou de acontecer. Iniciar em null faria a interface
  // dizer "aguardando…" com informação recém-carregada na tela.
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(() => new Date())
  const [atualizando, setAtualizando] = useState(false)
  const [comFalha, setComFalha] = useState(false)

  // Mantém a função mais recente sem reiniciar o intervalo a cada render
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn }, [fn])

  // Evita chamadas concorrentes quando a rede está lenta
  const emVooRef = useRef(false)

  const executar = useCallback(async () => {
    if (emVooRef.current) return
    emVooRef.current = true
    setAtualizando(true)
    try {
      await fnRef.current()
      setUltimaAtualizacao(new Date())
      setComFalha(false)
    } catch {
      // Falha não interrompe o ciclo — a próxima tentativa acontece normalmente
      setComFalha(true)
    } finally {
      emVooRef.current = false
      setAtualizando(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void executar()
    }, intervalMs)

    function aoVoltarParaAba() {
      if (document.visibilityState === 'visible') void executar()
    }
    document.addEventListener('visibilitychange', aoVoltarParaAba)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', aoVoltarParaAba)
    }
  }, [enabled, intervalMs, executar])

  return { ultimaAtualizacao, atualizando, comFalha, atualizarAgora: () => void executar() }
}
