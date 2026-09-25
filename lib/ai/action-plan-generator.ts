import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/utils/env'
import { ACTION_PLAN_SYSTEM_PROMPT } from './prompts'
import { parseAIJson } from './utils'
import { logUsage } from './cost-tracker'
import type { ReportMessageEntry, WorkerAlias, ActionPlanItemOutput } from './types'
import type { Telemetria } from './report-phases'

export interface ActionPlanInput {
  investigation: { title: string; problem_description: string }
  rootCause: string
  recommendations: string[]
  allMessages: ReportMessageEntry[]
  workerAliases: WorkerAlias[]
  companyId?: string
  managerId?: string
  investigationId?: string
}

function limitar(n: unknown, padrao: number): number {
  return typeof n === 'number' && !isNaN(n) ? Math.min(100, Math.max(0, Math.round(n))) : padrao
}

function texto(v: unknown, padrao = ''): string {
  return typeof v === 'string' ? v : padrao
}

function textoOuNulo(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

function validar(raw: unknown): ActionPlanItemOutput[] {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Plano de ação não é um objeto')
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.action_plan)) return []

  return (r.action_plan as unknown[])
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map(i => ({
      what:                 texto(i.what),
      why:                  texto(i.why),
      where_scope:          textoOuNulo(i.where_scope),
      who_role:             textoOuNulo(i.who_role),
      how_to:               texto(i.how_to),
      how_much_estimate:    textoOuNulo(i.how_much_estimate),
      impact_score:         limitar(i.impact_score, 50),
      effort_score:         limitar(i.effort_score, 50),
      is_recurring_pattern: i.is_recurring_pattern === true,
      related_pattern_note: textoOuNulo(i.related_pattern_note),
    }))
    // Sem "what" a ação não existe; sem "how_to" ninguém consegue executar
    .filter(i => i.what.length > 0 && i.how_to.length > 0)
}

/** Gera o plano de ação a partir da causa raiz já apurada. */
export async function generateActionPlan(
  input: ActionPlanInput
): Promise<{ itens: ActionPlanItemOutput[]; telemetria: Telemetria }> {
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
  const corpo = JSON.stringify(input)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: ACTION_PLAN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: corpo }],
  })

  const bloco = response.content[0]
  if (bloco?.type !== 'text') throw new Error('Tipo de resposta inesperado')

  // Resposta cortada pelo limite = JSON incompleto. Falhar é melhor que gravar
  // um plano pela metade sem ninguém perceber.
  if (response.stop_reason === 'max_tokens') {
    throw new Error('A resposta da IA foi cortada pelo limite de tokens. Nada foi gravado — refaça esta etapa.')
  }

  const itens = validar(parseAIJson<unknown>(bloco.text))

  if (response.usage) {
    logUsage({
      companyId:       input.companyId ?? '',
      managerId:       input.managerId,
      investigationId: input.investigationId,
      operation:       'report_generator',
      model:           'claude-sonnet-4-6',
      inputTokens:     response.usage.input_tokens,
      outputTokens:    response.usage.output_tokens,
    }).catch(() => {})
  }

  return {
    itens,
    telemetria: {
      mensagens_enviadas: input.allMessages.length,
      caracteres_enviados: corpo.length,
      tokens_entrada: response.usage?.input_tokens ?? 0,
      tokens_saida: response.usage?.output_tokens ?? 0,
      truncada: false,
    },
  }
}
