import Anthropic from '@anthropic-ai/sdk'
import { REPORT_GENERATOR_SYSTEM_PROMPT } from './prompts'
import { parseAIJson } from './utils'
import { logUsage } from './cost-tracker'
import type { ReportGeneratorInput, ReportGeneratorOutput, IshikawaBreakdownOutput, ActionPlanItemOutput } from './types'

const ISHIKAWA_KEYS = [
  'mao_de_obra', 'maquina', 'metodo', 'material', 'meio_ambiente', 'medicao',
] as const

const RETRY_DELAYS = [1_000, 3_000]

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return error.status === 429 || error.status === 503 || error.status === 529
  }
  if (error instanceof Error && error.message.toLowerCase().includes('network')) return true
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function validateIshikawaBreakdown(raw: unknown): IshikawaBreakdownOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('ishikawa_breakdown must be an object')
  }

  const r = raw as Record<string, unknown>
  const result = {} as IshikawaBreakdownOutput

  for (const key of ISHIKAWA_KEYS) {
    const value = r[key]
    if (value !== null && typeof value !== 'string') {
      throw new Error(`ishikawa_breakdown.${key} must be string or null`)
    }
    result[key] = (value as string | null) ?? null
  }

  return result
}

function validateOutput(raw: unknown): ReportGeneratorOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Report response is not an object')
  }

  const r = raw as Record<string, unknown>

  if (typeof r.root_cause !== 'string' || r.root_cause.trim() === '') {
    throw new Error('root_cause must be a non-empty string')
  }

  if (typeof r.confidence_score !== 'number' || r.confidence_score < 0 || r.confidence_score > 100) {
    throw new Error(`Invalid confidence_score: ${String(r.confidence_score)}`)
  }

  if (typeof r.confidence_justification !== 'string') {
    throw new Error('confidence_justification must be a string')
  }

  const ishikawa = validateIshikawaBreakdown(r.ishikawa_breakdown)

  if (!Array.isArray(r.sources_summary)) {
    throw new Error('sources_summary must be an array')
  }

  const sources = r.sources_summary.map((s: unknown, i: number) => {
    if (typeof s !== 'object' || s === null) throw new Error(`sources_summary[${i}] is not an object`)
    const source = s as Record<string, unknown>
    if (typeof source.alias !== 'string') throw new Error(`sources_summary[${i}].alias must be a string`)
    if (typeof source.role !== 'string') throw new Error(`sources_summary[${i}].role must be a string`)
    if (!Array.isArray(source.key_points) || !source.key_points.every((k: unknown) => typeof k === 'string')) {
      throw new Error(`sources_summary[${i}].key_points must be an array of strings`)
    }
    return { alias: source.alias, role: source.role, key_points: source.key_points as string[] }
  })

  if (!Array.isArray(r.recommendations) || !r.recommendations.every((rec: unknown) => typeof rec === 'string')) {
    throw new Error('recommendations must be an array of strings')
  }

  // action_plan — opcional para compatibilidade com relatórios antigos
  const actionPlan: ActionPlanItemOutput[] = []
  if (Array.isArray(r.action_plan)) {
    for (const item of r.action_plan) {
      if (typeof item !== 'object' || item === null) continue
      const a = item as Record<string, unknown>
      actionPlan.push({
        what:                 typeof a.what === 'string'              ? a.what              : '',
        why:                  typeof a.why === 'string'               ? a.why               : '',
        where_scope:          typeof a.where_scope === 'string'       ? a.where_scope       : null,
        who_role:             typeof a.who_role === 'string'          ? a.who_role          : null,
        how_to:               typeof a.how_to === 'string'            ? a.how_to            : '',
        how_much_estimate:    typeof a.how_much_estimate === 'string' ? a.how_much_estimate : null,
        impact_score:         typeof a.impact_score === 'number'      ? Math.min(100, Math.max(0, a.impact_score)) : 50,
        effort_score:         typeof a.effort_score === 'number'      ? Math.min(100, Math.max(0, a.effort_score)) : 50,
        is_recurring_pattern: typeof a.is_recurring_pattern === 'boolean' ? a.is_recurring_pattern : false,
        related_pattern_note: typeof a.related_pattern_note === 'string' ? a.related_pattern_note : null,
      })
    }
  }

  return {
    root_cause: r.root_cause,
    confidence_score: r.confidence_score,
    confidence_justification: r.confidence_justification,
    ishikawa_breakdown: ishikawa,
    sources_summary: sources,
    recommendations: r.recommendations as string[],
    action_plan: actionPlan,
  }
}

async function callClaude(
  client: Anthropic,
  input: ReportGeneratorInput
): Promise<Anthropic.Message> {
  return client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: REPORT_GENERATOR_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  })
}

export async function generateReport(
  input: ReportGeneratorInput
): Promise<ReportGeneratorOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let lastError: unknown
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await callClaude(client, input)

      const firstBlock = response.content[0]
      if (firstBlock?.type !== 'text') {
        throw new Error('Unexpected response type from Claude')
      }

      const parsed = parseAIJson<unknown>(firstBlock.text)
      const result = validateOutput(parsed)

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

      return result
    } catch (error) {
      lastError = error
      const willRetry = attempt < RETRY_DELAYS.length && isRetryable(error)
      console.error(
        `[report-generator] attempt ${attempt + 1} failed${willRetry ? `, retrying in ${RETRY_DELAYS[attempt]}ms` : ''}`,
        error
      )
      if (!willRetry) break
      await sleep(RETRY_DELAYS[attempt])
    }
  }

  throw lastError
}
