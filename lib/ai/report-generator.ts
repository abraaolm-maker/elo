import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/utils/env'
import { REPORT_GENERATOR_SYSTEM_PROMPT } from './prompts'
import { parseAIJson } from './utils'
import { logUsage } from './cost-tracker'
import type {
  ReportGeneratorInput, ReportGeneratorOutput, IshikawaBreakdownOutput, ActionPlanItemOutput,
  EvidenceItemOutput, EvidenceStrength, DivergenceOutput,
} from './types'

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

  // ── Campos exclusivos do gerencial ─────────────────────────────────────────
  const FORCAS = ['corroborada', 'fonte_unica', 'divergente'] as const

  const evidenceMap: EvidenceItemOutput[] = Array.isArray(r.evidence_map)
    ? (r.evidence_map as unknown[])
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .map(e => ({
          finding: typeof e.finding === 'string' ? e.finding : '',
          supporting_sources: Array.isArray(e.supporting_sources)
            ? (e.supporting_sources as unknown[]).filter((s): s is string => typeof s === 'string')
            : [],
          strength: FORCAS.includes(e.strength as typeof FORCAS[number])
            ? (e.strength as EvidenceStrength)
            : 'fonte_unica',
          note: typeof e.note === 'string' ? e.note : null,
        }))
        .filter(e => e.finding.length > 0)
    : []

  const divergences: DivergenceOutput[] = Array.isArray(r.divergences)
    ? (r.divergences as unknown[])
        .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
        .map(d => ({
          topic: typeof d.topic === 'string' ? d.topic : '',
          positions: Array.isArray(d.positions)
            ? (d.positions as unknown[])
                .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
                .map(p => ({
                  alias: typeof p.alias === 'string' ? p.alias : '',
                  role: typeof p.role === 'string' ? p.role : '',
                  position: typeof p.position === 'string' ? p.position : '',
                }))
            : [],
          reading: typeof d.reading === 'string' ? d.reading : '',
        }))
        .filter(d => d.topic.length > 0)
    : []

  const sensitiveObservations = Array.isArray(r.sensitive_observations)
    ? (r.sensitive_observations as unknown[]).filter((s): s is string => typeof s === 'string')
    : []

  return {
    root_cause: r.root_cause,
    confidence_score: r.confidence_score,
    confidence_justification: r.confidence_justification,
    ishikawa_breakdown: ishikawa,
    sources_summary: sources,
    recommendations: r.recommendations as string[],
    action_plan: actionPlan,
    evidence_map: evidenceMap,
    divergences,
    sensitive_observations: sensitiveObservations,
  }
}

async function callClaude(
  client: Anthropic,
  input: ReportGeneratorInput
): Promise<Anthropic.Message> {
  return client.messages.create({
    model: 'claude-sonnet-4-6',
    // 3000 truncava o JSON em investigações grandes: com 6 fontes, o
    // sources_summary somado ao plano de ação e aos campos de evidência passa
    // folgado disso — e um JSON cortado ao meio não parseia, perdendo tudo.
    max_tokens: 8000,
    system: REPORT_GENERATOR_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  })
}

export async function generateReport(
  input: ReportGeneratorInput
): Promise<ReportGeneratorOutput> {
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })

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
