'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { fmtDataHora } from '@/lib/utils/date'
import type { WorkerReportOutput } from '@/lib/ai/types'

export interface DevolutivaData extends WorkerReportOutput {
  generated_at: string
}

interface Props {
  investigationId: string
  devolutivaInicial: DevolutivaData | null
}

/**
 * Devolutiva aos participantes — versão do relatório sem nenhuma atribuição.
 *
 * Fica separada do relatório gerencial na tela porque são documentos com
 * públicos distintos: um orienta a decisão da liderança, o outro é entregue a
 * quem respondeu. Misturá-los na mesma visualização convidaria ao erro de
 * repassar o documento errado.
 */
export function DevolutivaSection({ investigationId, devolutivaInicial }: Props) {
  const [devolutiva, setDevolutiva] = useState<DevolutivaData | null>(devolutivaInicial)
  const [gerando, setGerando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const toast = useToast()

  async function gerar() {
    setGerando(true)
    try {
      const res = await fetch(`/api/reports/${investigationId}/devolutiva`, { method: 'POST' })
      const json = await res.json() as { data?: WorkerReportOutput; error?: string }
      if (!res.ok || !json.data) {
        toast.error(json.error ?? 'Não foi possível gerar a devolutiva.')
        return
      }
      setDevolutiva({ ...json.data, generated_at: new Date().toISOString() })
      toast.success(devolutiva ? 'Devolutiva regenerada!' : 'Devolutiva gerada!')
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setGerando(false)
    }
  }

  function copiarTexto() {
    if (!devolutiva) return
    const linhas = [
      devolutiva.titulo,
      '',
      devolutiva.resumo_do_problema,
      '',
      'O QUE ENCONTRAMOS',
      ...devolutiva.o_que_encontramos.map(x => `• ${x}`),
      '',
      'CONCLUSÃO',
      devolutiva.conclusao,
      '',
      'O QUE VAI MUDAR',
      ...devolutiva.o_que_vai_mudar.map(x => `• ${x.acao} (${x.prazo})`),
      '',
      'O QUE PEDIMOS',
      ...devolutiva.o_que_pedimos.map(x => `• ${x}`),
      '',
      devolutiva.mensagem_final,
    ]
    navigator.clipboard.writeText(linhas.join('\n')).then(
      () => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) },
      () => toast.error('Não foi possível copiar.')
    )
  }

  return (
    <section className="border-t border-slate-200 pt-8">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">
            Devolutiva aos participantes
          </p>
          <p className="text-sm text-slate-500 max-w-xl leading-relaxed">
            Versão para compartilhar com quem respondeu. Não atribui nenhuma informação a pessoa,
            cargo ou setor — e omite divergências e observações sensíveis.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {devolutiva && (
            <button
              onClick={copiarTexto}
              className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-600 px-3 py-2 rounded-sm hover:bg-slate-50 transition-colors"
            >
              {copiado ? '✓ Copiado' : 'Copiar texto'}
            </button>
          )}
          <button
            onClick={gerar}
            disabled={gerando}
            className="flex items-center gap-2 border border-teal-200 bg-teal-50 text-teal-700 text-[10px] font-semibold uppercase tracking-wider py-2 px-4 rounded-sm hover:bg-teal-100 transition-colors disabled:opacity-50"
          >
            {gerando ? (
              <>
                <svg className="animate-spin w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Gerando…
              </>
            ) : devolutiva ? 'Gerar novamente' : 'Gerar devolutiva'}
          </button>
        </div>
      </div>

      {!devolutiva ? (
        <div className="mt-5 border border-dashed border-slate-200 rounded-sm px-6 py-8 text-center">
          <p className="text-sm text-slate-500 mb-1">Devolutiva ainda não gerada</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Gere para ter um texto pronto de retorno ao time. Mostrar que falar produziu resultado
            é o que sustenta a participação nas próximas investigações.
          </p>
        </div>
      ) : (
        <div className="mt-5 border border-slate-200 rounded-sm bg-white overflow-hidden">
          <div className="bg-teal-50 border-b border-teal-100 px-5 py-2.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-700">
              Pode ser compartilhada com o time
            </span>
            <span className="text-[10px] text-teal-600">
              Gerada em {fmtDataHora(devolutiva.generated_at)}
            </span>
          </div>

          <div className="p-6 space-y-5">
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">{devolutiva.titulo}</h3>

            <p className="text-sm text-slate-600 leading-relaxed">{devolutiva.resumo_do_problema}</p>

            {devolutiva.o_que_encontramos.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">
                  O que encontramos
                </p>
                <ul className="space-y-1.5">
                  {devolutiva.o_que_encontramos.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                      <span className="text-teal-500 shrink-0 mt-0.5">•</span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-l-2 border-teal-300 bg-teal-50/50 pl-4 py-3 pr-4 rounded-r-sm">
              <p className="text-[10px] font-semibold tracking-widest text-teal-700 uppercase mb-1.5">
                Conclusão
              </p>
              <p className="text-sm text-slate-800 leading-relaxed">{devolutiva.conclusao}</p>
            </div>

            {devolutiva.o_que_vai_mudar.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">
                  O que vai mudar
                </p>
                <div className="space-y-2">
                  {devolutiva.o_que_vai_mudar.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 border border-slate-200 rounded-sm px-3.5 py-2.5">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 leading-relaxed">{item.acao}</p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">{item.prazo}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {devolutiva.o_que_pedimos.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">
                  O que pedimos ao time
                </p>
                <ul className="space-y-1.5">
                  {devolutiva.o_que_pedimos.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                      <span className="text-slate-400 shrink-0 mt-0.5">→</span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {devolutiva.mensagem_final && (
              <p className="text-sm text-slate-500 italic leading-relaxed border-t border-slate-100 pt-4">
                {devolutiva.mensagem_final}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
