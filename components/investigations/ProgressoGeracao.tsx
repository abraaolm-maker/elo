'use client'

export type StatusEtapa = 'pendente' | 'rodando' | 'ok' | 'falhou'

export interface Diagnostico {
  mensagens_enviadas?: number
  caracteres_enviados?: number
  tokens_entrada?: number
  tokens_saida?: number
  mensagens_no_banco?: number
  descartadas_sem_conteudo?: number
  participantes?: number
  pontos_extraidos?: number
  lote?: string[]
  itens?: number
}

export interface Etapa {
  id: string
  rotulo: string
  status: StatusEtapa
  /** true quando a etapa é complementar — falhar nela não invalida o relatório */
  opcional?: boolean
  diagnostico?: Diagnostico
  erro?: string
}

function fmt(n: number | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('pt-BR') : '—'
}

const CORES: Record<StatusEtapa, { ponto: string; texto: string }> = {
  pendente: { ponto: 'bg-slate-200',  texto: 'text-slate-400' },
  rodando:  { ponto: 'bg-teal-500',   texto: 'text-slate-900' },
  ok:       { ponto: 'bg-emerald-500', texto: 'text-slate-700' },
  falhou:   { ponto: 'bg-red-400',    texto: 'text-red-700' },
}

/**
 * Acompanhamento da geração do relatório.
 *
 * Mostra, etapa a etapa, o que foi enviado à IA e o que voltou. Serve para dois
 * propósitos: o gestor saber que o processo está andando durante o minuto que
 * leva, e — mais importante — poder conferir que a IA recebeu o volume
 * esperado de conversa, em vez de confiar que nada se perdeu no caminho.
 */
export function ProgressoGeracao({ etapas }: { etapas: Etapa[] }) {
  const concluidas = etapas.filter(e => e.status === 'ok').length
  const pct = etapas.length > 0 ? Math.round((concluidas / etapas.length) * 100) : 0
  const houveFalha = etapas.some(e => e.status === 'falhou')

  // Totais acumulados — a conferência que importa é esta: quantas mensagens
  // existiam no banco e quantas de fato chegaram à IA
  const noBanco = etapas.find(e => e.diagnostico?.mensagens_no_banco)?.diagnostico?.mensagens_no_banco
  const descartadas = etapas.find(e => e.diagnostico?.descartadas_sem_conteudo !== undefined)
    ?.diagnostico?.descartadas_sem_conteudo ?? 0
  const tokensEntrada = etapas.reduce((a, e) => a + (e.diagnostico?.tokens_entrada ?? 0), 0)
  const tokensSaida   = etapas.reduce((a, e) => a + (e.diagnostico?.tokens_saida ?? 0), 0)

  return (
    <div className="border border-slate-200 rounded-sm bg-white overflow-hidden">
      {/* Barra de progresso */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
            Gerando relatório
          </span>
          <span className="text-xs font-semibold tabular-nums text-slate-600">
            {concluidas}/{etapas.length}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${houveFalha ? 'bg-amber-400' : 'bg-teal-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Etapas */}
      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {etapas.map(e => {
          const c = CORES[e.status]
          const d = e.diagnostico
          return (
            <div key={e.id} className="px-5 py-2.5">
              <div className="flex items-center gap-2.5">
                {e.status === 'rodando' ? (
                  <span className="relative flex w-2 h-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex w-2 h-2 rounded-full bg-teal-500" />
                  </span>
                ) : (
                  <span className={`w-2 h-2 rounded-full shrink-0 ${c.ponto}`} />
                )}
                <span className={`text-sm flex-1 ${c.texto}`}>{e.rotulo}</span>
                {e.status === 'ok' && d && (
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                    ↑{fmt(d.tokens_entrada)} ↓{fmt(d.tokens_saida)}
                  </span>
                )}
                {e.status === 'falhou' && e.opcional && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                    opcional
                  </span>
                )}
              </div>

              {/* Detalhe do que foi enviado nesta etapa */}
              {e.status === 'ok' && d && (d.mensagens_enviadas ?? 0) > 0 && (
                <p className="text-[10px] text-slate-400 ml-[18px] mt-0.5">
                  {fmt(d.mensagens_enviadas)} mensagem(ns) enviadas
                  {d.lote ? ` · ${d.lote.join(', ')}` : ''}
                  {typeof d.pontos_extraidos === 'number' ? ` · ${d.pontos_extraidos} ponto(s) extraído(s)` : ''}
                  {typeof d.itens === 'number' ? ` · ${d.itens} item(ns)` : ''}
                </p>
              )}

              {e.status === 'falhou' && e.erro && (
                <p className="text-[11px] text-red-600 ml-[18px] mt-0.5 leading-relaxed">{e.erro}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Conferência de integridade */}
      {typeof noBanco === 'number' && (
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5">
            Conferência
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Mensagens no banco</span>
              <span className="font-mono tabular-nums text-slate-700">{fmt(noBanco)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Enviadas à IA</span>
              <span className="font-mono tabular-nums text-slate-700">{fmt(noBanco - descartadas)}</span>
            </div>
            {descartadas > 0 && (
              <div className="flex justify-between">
                <span className="text-amber-700">Sem conteúdo (áudio não transcrito)</span>
                <span className="font-mono tabular-nums text-amber-700">{fmt(descartadas)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="text-slate-500">Tokens · entrada / saída</span>
              <span className="font-mono tabular-nums text-slate-700">
                {fmt(tokensEntrada)} / {fmt(tokensSaida)}
              </span>
            </div>
          </div>
          {descartadas === 0 ? (
            <p className="text-[10px] text-emerald-600 mt-2">
              ✓ Toda a conversa registrada foi enviada à IA
            </p>
          ) : (
            <p className="text-[10px] text-amber-700 mt-2 leading-relaxed">
              {descartadas} mensagem(ns) não tinham texto e ficaram de fora — são áudios cuja
              transcrição falhou. O conteúdo delas não entrou no relatório.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
