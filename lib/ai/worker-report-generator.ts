import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/utils/env'
import { WORKER_REPORT_SYSTEM_PROMPT } from './prompts'
import { parseAIJson } from './utils'
import { logUsage } from './cost-tracker'
import type { ReportMessageEntry, WorkerAlias, WorkerReportOutput, ActionPlanItemOutput } from './types'

const RETRY_DELAYS = [1_000, 3_000]

export interface WorkerReportInput {
  investigation: { title: string; problem_description: string }
  allMessages: ReportMessageEntry[]
  workerAliases: WorkerAlias[]
  /** Conclusões do relatório gerencial, para a devolutiva ficar coerente com ele */
  rootCause: string
  recommendations: string[]
  actionPlan: Pick<ActionPlanItemOutput, 'what' | 'why'>[]
  companyId?: string
  managerId?: string
  investigationId?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return error.status === 429 || error.status === 503 || error.status === 529
  }
  return error instanceof Error && error.message.toLowerCase().includes('network')
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Rede de segurança contra vazamento de identidade.
 *
 * O prompt instrui a não atribuir nada, mas instrução de prompt é
 * probabilística — e aqui o custo de um deslize recai sobre o trabalhador, que
 * respondeu sob promessa de anonimato. Se algum alias escapar para o texto,
 * trocamos por uma formulação impessoal antes de gravar.
 */
function removerAtribuicao(texto: string, aliases: string[]): string {
  let saida = texto

  for (const alias of aliases) {
    if (!alias) continue
    const re = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    saida = saida.replace(re, 'o levantamento')
  }

  // Formulações que indicam origem, ainda que sem nomear
  const origens: [RegExp, string][] = [
    /\buma?\s+(das\s+)?fontes?\s+(disse|relatou|apontou|mencionou|indicou)\b/gi,
    /\balguns?\s+(participantes?|colaboradores?|trabalhadores?)\s+(disseram|relataram|apontaram)\b/gi,
    /\bum\s+(dos\s+)?(participantes?|colaboradores?|entrevistados?)\b/gi,
  ].map(re => [re, 'o levantamento indicou'] as [RegExp, string])

  for (const [re, sub] of origens) saida = saida.replace(re, sub)

  return saida
}

function validar(raw: unknown, aliases: string[]): WorkerReportOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Resposta da devolutiva não é um objeto')
  }
  const r = raw as Record<string, unknown>

  const limpar = (v: unknown, fallback = ''): string =>
    typeof v === 'string' ? removerAtribuicao(v, aliases) : fallback

  const mudancas = Array.isArray(r.o_que_vai_mudar)
    ? (r.o_que_vai_mudar as unknown[])
        .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
        .map(i => ({
          acao: limpar(i.acao),
          prazo: typeof i.prazo === 'string' ? i.prazo : 'a definir',
        }))
        .filter(i => i.acao.length > 0)
    : []

  const titulo = limpar(r.titulo)
  const conclusao = limpar(r.conclusao)

  if (!titulo || !conclusao) {
    throw new Error('Devolutiva sem título ou conclusão')
  }

  return {
    titulo,
    resumo_do_problema: limpar(r.resumo_do_problema),
    o_que_encontramos: asStringArray(r.o_que_encontramos).map(s => removerAtribuicao(s, aliases)),
    conclusao,
    o_que_vai_mudar: mudancas,
    o_que_pedimos: asStringArray(r.o_que_pedimos).map(s => removerAtribuicao(s, aliases)),
    mensagem_final: limpar(r.mensagem_final),
  }
}

/** Gera a devolutiva destinada aos participantes. */
export async function generateWorkerReport(input: WorkerReportInput): Promise<WorkerReportOutput> {
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
  const aliases = input.workerAliases.map(w => w.alias)

  let ultimoErro: unknown
  for (let tentativa = 0; tentativa <= RETRY_DELAYS.length; tentativa++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: WORKER_REPORT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(input) }],
      })

      const bloco = response.content[0]
      if (bloco?.type !== 'text') throw new Error('Tipo de resposta inesperado')

      const resultado = validar(parseAIJson<unknown>(bloco.text), aliases)

      if (response.usage) {
        logUsage({
          companyId:       input.companyId ?? '',
          managerId:       input.managerId,
          investigationId: input.investigationId,
          operation:       'worker_report_generator',
          model:           'claude-sonnet-4-6',
          inputTokens:     response.usage.input_tokens,
          outputTokens:    response.usage.output_tokens,
        }).catch(() => {})
      }

      return resultado
    } catch (err) {
      ultimoErro = err
      // Só repete o que tem chance de mudar de resultado: erro de rede ou
      // sobrecarga. Repetir falha de parse consumiria o tempo limite três
      // vezes para chegar ao mesmo erro.
      const podeTentarDeNovo = tentativa < RETRY_DELAYS.length && isRetryable(err)
      if (!podeTentarDeNovo) break
      await sleep(RETRY_DELAYS[tentativa]!)
    }
  }

  throw ultimoErro instanceof Error ? ultimoErro : new Error('Falha ao gerar a devolutiva')
}
