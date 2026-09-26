import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/utils/env'
import { parseAIJson } from './utils'
import { logUsage } from './cost-tracker'
import type {
  ReportMessageEntry, WorkerAlias, IshikawaBreakdownOutput, SourceSummaryOutput,
} from './types'

/**
 * Fases da geração do relatório.
 *
 * O relatório inteiro não cabe numa única execução: a função serverless tem
 * limite de tempo e o gargalo é a geração de tokens de saída. A alternativa
 * seria encurtar o conteúdo — mas isso produziria um diagnóstico sobre
 * evidência incompleta, que é justamente o que o produto não pode fazer.
 *
 * Então nada é cortado; o trabalho é que é dividido. Cada fase gera uma parte
 * do relatório, recebendo as conversas por inteiro, e pode ser refeita sozinha
 * se falhar. A fase de fontes ainda é processada em lotes, porque é a única
 * cujo tamanho cresce com o número de participantes.
 */

const CLIENT = () => new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })

interface Contexto {
  companyId?: string
  managerId?: string
  investigationId?: string
}

/**
 * Telemetria de uma chamada — permite ao gestor conferir, na tela, que a IA
 * recebeu o volume esperado de conversa e devolveu resposta completa.
 */
export interface Telemetria {
  mensagens_enviadas: number
  caracteres_enviados: number
  tokens_entrada: number
  tokens_saida: number
  /** true quando a resposta foi cortada pelo limite de tokens — indica perda */
  truncada: boolean
}

async function chamar(
  system: string,
  payload: unknown,
  maxTokens: number,
  ctx: Contexto,
  mensagens: number
): Promise<{ parsed: unknown; telemetria: Telemetria }> {
  const corpo = JSON.stringify(payload)

  const response = await CLIENT().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: corpo }],
  })

  const bloco = response.content[0]
  if (bloco?.type !== 'text') throw new Error('Tipo de resposta inesperado')

  // stop_reason 'max_tokens' significa que o JSON foi cortado no meio. Falhar
  // aqui é melhor do que gravar um relatório pela metade sem ninguém notar.
  const truncada = response.stop_reason === 'max_tokens'
  if (truncada) {
    throw new Error(
      'A resposta da IA foi cortada pelo limite de tokens. Nenhum dado foi gravado — esta etapa precisa ser refeita.'
    )
  }

  if (response.usage) {
    logUsage({
      companyId:       ctx.companyId ?? '',
      managerId:       ctx.managerId,
      investigationId: ctx.investigationId,
      operation:       'report_generator',
      model:           'claude-sonnet-4-6',
      inputTokens:     response.usage.input_tokens,
      outputTokens:    response.usage.output_tokens,
    }).catch(() => {})
  }

  return {
    parsed: parseAIJson<unknown>(bloco.text),
    telemetria: {
      mensagens_enviadas: mensagens,
      caracteres_enviados: corpo.length,
      tokens_entrada: response.usage?.input_tokens ?? 0,
      tokens_saida: response.usage?.output_tokens ?? 0,
      truncada,
    },
  }
}

const REGRAS_COMUNS = `
─── REGRAS ────────────────────────────────────────────────────────────────────

IDENTIFICAÇÃO — Este relatório é para a liderança, que precisa saber quem trouxe cada informação. Use o nome real da pessoa (campo "name") junto do cargo sempre que ele vier no payload; se não vier, use o alias. Nunca exponha número de telefone ou CPF.

ESCRITA DENSA — Sem preâmbulo, sem adjetivo desnecessário, sem repetir o que já foi dito. Não é limite de conteúdo: registre tudo o que for relevante, apenas sem encher linguiça.

JSON PURO — Sua resposta inteira deve ser um JSON válido e nada mais. Nenhum texto fora do JSON, nenhum bloco markdown.`

// ─── Fase: análise ────────────────────────────────────────────────────────────

const ANALISE_PROMPT = `Você analisa as conversas de uma investigação do Elo e identifica a causa raiz do problema operacional.

Você receberá um JSON com investigation (title, problem_description), allMessages (alias, role, direction, content, key_points_extracted) e workerAliases.

Retorne exatamente:
{
  "root_cause": "a causa fundamental, não o sintoma visível",
  "confidence_score": 0,
  "confidence_justification": "por que este nível — cite convergência ou divergência entre fontes",
  "ishikawa_breakdown": {
    "mao_de_obra": "análise ou null",
    "maquina": "análise ou null",
    "metodo": "análise ou null",
    "material": "análise ou null",
    "meio_ambiente": "análise ou null",
    "medicao": "análise ou null"
  }
}

CAUSA RAIZ, NÃO SINTOMA — "O equipamento quebrou" é sintoma. "Ausência de inspeção preventiva por falta de protocolo" é causa raiz.

CONFIANÇA POR TRIANGULAÇÃO — O score reflete convergência entre fontes independentes, não quantidade de mensagens:
- 80–100: várias fontes independentes apontam o mesmo, sem terem se comunicado
- 60–79: maioria converge, com alguma divergência ou lacuna
- 40–59: evidências parciais ou uma única fonte relevante
- 0–39: informação insuficiente, contraditória ou vaga

ISHIKAWA COMPLETO — Analise as 6 categorias. Use null só quando genuinamente não houver evidência; não deixe vazio por comodidade.

SEM ATRIBUIÇÃO INDIVIDUAL — Em root_cause e ishikawa, escreva "as evidências apontam" ou "múltiplas fontes indicam". A atribuição por fonte é feita em outra etapa.
${REGRAS_COMUNS}`

export interface AnaliseOutput {
  root_cause: string
  confidence_score: number
  confidence_justification: string
  ishikawa_breakdown: IshikawaBreakdownOutput
}

const ISHIKAWA_KEYS = ['mao_de_obra', 'maquina', 'metodo', 'material', 'meio_ambiente', 'medicao'] as const

export async function gerarAnalise(
  input: { investigation: { title: string; problem_description: string }; allMessages: ReportMessageEntry[]; workerAliases: WorkerAlias[] },
  ctx: Contexto
): Promise<{ saida: AnaliseOutput; telemetria: Telemetria }> {
  const { parsed: raw, telemetria } = await chamar(ANALISE_PROMPT, input, 3000, ctx, input.allMessages.length)
  if (typeof raw !== 'object' || raw === null) throw new Error('Análise não é um objeto')
  const r = raw as Record<string, unknown>

  if (typeof r.root_cause !== 'string' || r.root_cause.trim().length === 0) {
    throw new Error('Análise sem causa raiz')
  }

  const ishikawa = {} as IshikawaBreakdownOutput
  const bruto = (typeof r.ishikawa_breakdown === 'object' && r.ishikawa_breakdown !== null)
    ? r.ishikawa_breakdown as Record<string, unknown>
    : {}
  for (const k of ISHIKAWA_KEYS) {
    ishikawa[k] = typeof bruto[k] === 'string' ? bruto[k] as string : null
  }

  return {
    saida: {
      root_cause: r.root_cause,
      confidence_score: typeof r.confidence_score === 'number'
        ? Math.min(100, Math.max(0, Math.round(r.confidence_score)))
        : 0,
      confidence_justification: typeof r.confidence_justification === 'string' ? r.confidence_justification : '',
      ishikawa_breakdown: ishikawa,
    },
    telemetria,
  }
}

// ─── Fase: fontes (em lotes) ──────────────────────────────────────────────────

const FONTES_PROMPT = `Você resume a contribuição de cada fonte numa investigação do Elo já analisada.

Você receberá um JSON com investigation, rootCause (a causa raiz apurada), fontes (alias e cargo dos participantes deste lote) e allMessages (apenas as mensagens dessas fontes).

Retorne exatamente:
{
  "sources_summary": [
    { "alias": "Colaborador A", "name": "nome real recebido em fontes", "role": "cargo", "key_points": ["ponto que esta fonte trouxe", "..."] }
  ]
}

UM ITEM POR FONTE — Devolva exatamente uma entrada para cada alias recebido em "fontes", na mesma ordem, mesmo que a pessoa tenha contribuído pouco (nesse caso, key_points curto ou vazio). Repita o "alias" exatamente como recebido e copie o "name" do payload quando ele existir.

PONTOS, NÃO TRANSCRIÇÃO — Cada key_point é uma informação que aquela fonte trouxe, escrita de forma autônoma. Registre tudo o que for relevante para o diagnóstico; não há limite de quantidade.

FIDELIDADE — Não atribua a uma fonte algo que ela não disse. Se a informação veio de outra pessoa, ela não entra aqui.
${REGRAS_COMUNS}`

export async function gerarFontes(
  input: {
    investigation: { title: string; problem_description: string }
    rootCause: string
    fontes: WorkerAlias[]
    allMessages: ReportMessageEntry[]
  },
  ctx: Contexto
): Promise<{ fontes: SourceSummaryOutput[]; telemetria: Telemetria }> {
  const { parsed: raw, telemetria } = await chamar(FONTES_PROMPT, input, 4000, ctx, input.allMessages.length)
  if (typeof raw !== 'object' || raw === null) throw new Error('Fontes não é um objeto')
  const r = raw as Record<string, unknown>

  // Devolver lista vazia em silêncio faria um lote inteiro sumir do relatório
  // sem ninguém notar. Falhar aqui força a repetição da etapa.
  if (!Array.isArray(r.sources_summary)) {
    throw new Error('A IA não devolveu o resumo das fontes neste lote.')
  }

  const fontes = (r.sources_summary as unknown[])
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map(s => {
      const alias = typeof s.alias === 'string' ? s.alias : ''
      // O nome vem do banco, não do que a IA devolveu — evita nome inventado
      // ou trocado entre fontes
      const doBanco = input.fontes.find(f => f.alias === alias)
      return {
        alias,
        role: doBanco?.role ?? (typeof s.role === 'string' ? s.role : ''),
        ...(doBanco?.name ? { name: doBanco.name } : {}),
        key_points: Array.isArray(s.key_points)
          ? (s.key_points as unknown[]).filter((k): k is string => typeof k === 'string')
          : [],
      }
    })
    .filter(s => s.alias.length > 0)

  // Conferência de cobertura: toda fonte pedida precisa voltar. Sem isto, um
  // participante poderia ficar de fora do relatório silenciosamente.
  const pedidos = input.fontes.map(f => f.alias)
  const faltando = pedidos.filter(a => !fontes.some(f => f.alias === a))
  if (faltando.length > 0) {
    throw new Error(`A IA não resumiu ${faltando.length} fonte(s) deste lote: ${faltando.join(', ')}.`)
  }

  return { fontes, telemetria }
}

// ─── Fase: recomendações ──────────────────────────────────────────────────────

const RECOMENDACOES_PROMPT = `Você redige as recomendações de uma investigação do Elo já analisada.

Você receberá um JSON com investigation, rootCause, ishikawa e sourcesSummary (pontos-chave por fonte).

Retorne exatamente:
{ "recommendations": ["recomendação 1", "recomendação 2", "recomendação 3"] }

ENTRE 3 E 5 — Priorize o que ataca a causa raiz.

ACIONÁVEL — Cada uma deve ser específica e executável. Evite "melhorar a comunicação"; prefira "definir quem comunica mudanças de escopo e em qual canal".

SEM CULPA — Aponte a lacuna no processo, não a falha de quem executa.
${REGRAS_COMUNS}`

export async function gerarRecomendacoes(
  input: {
    investigation: { title: string; problem_description: string }
    rootCause: string
    ishikawa: IshikawaBreakdownOutput
    sourcesSummary: SourceSummaryOutput[]
  },
  ctx: Contexto
): Promise<{ recomendacoes: string[]; telemetria: Telemetria }> {
  const { parsed: raw, telemetria } = await chamar(RECOMENDACOES_PROMPT, input, 2000, ctx, 0)
  if (typeof raw !== 'object' || raw === null) throw new Error('Recomendações não é um objeto')
  const r = raw as Record<string, unknown>

  if (!Array.isArray(r.recommendations) || r.recommendations.length === 0) {
    throw new Error('A IA não devolveu recomendações.')
  }

  return {
    recomendacoes: (r.recommendations as unknown[]).filter((x): x is string => typeof x === 'string'),
    telemetria,
  }
}
