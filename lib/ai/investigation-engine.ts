import Anthropic from '@anthropic-ai/sdk'
import { INVESTIGATION_ENGINE_SYSTEM_PROMPT } from './prompts'
import { parseAIJson } from './utils'
import type { InvestigationEngineInput, InvestigationEngineOutput } from './types'

const VALID_ACTIONS = ['ask_question', 'mark_saturated'] as const
const VALID_ISHIKAWA = [
  'mao_de_obra', 'maquina', 'metodo', 'material', 'meio_ambiente', 'medicao',
] as const

// Delays em ms para retry: 1s depois da 1ª falha, 3s depois da 2ª
const RETRY_DELAYS = [1_000, 3_000]

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return error.status === 429 || error.status === 503 || error.status === 529
  }
  // Erros de rede (sem status HTTP)
  if (error instanceof Error && error.message.toLowerCase().includes('network')) return true
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function validateOutput(raw: unknown): InvestigationEngineOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Engine response is not an object')
  }

  const r = raw as Record<string, unknown>

  if (!VALID_ACTIONS.includes(r.action as typeof VALID_ACTIONS[number])) {
    throw new Error(`Invalid action: ${String(r.action)}`)
  }

  if (typeof r.saturation_score !== 'number' || r.saturation_score < 0 || r.saturation_score > 100) {
    throw new Error(`Invalid saturation_score: ${String(r.saturation_score)}`)
  }

  if (!Array.isArray(r.key_points_extracted) || !r.key_points_extracted.every(k => typeof k === 'string')) {
    throw new Error('key_points_extracted must be an array of strings')
  }

  if (!Array.isArray(r.ishikawa_categories_touched)) {
    throw new Error('ishikawa_categories_touched must be an array')
  }

  if (!Array.isArray(r.cross_validation_hints) || !r.cross_validation_hints.every(h => typeof h === 'string')) {
    throw new Error('cross_validation_hints must be an array of strings')
  }

  const filteredIshikawa = (r.ishikawa_categories_touched as unknown[]).filter(
    (c): c is typeof VALID_ISHIKAWA[number] =>
      typeof c === 'string' && VALID_ISHIKAWA.includes(c as typeof VALID_ISHIKAWA[number])
  )

  return {
    action: r.action as InvestigationEngineOutput['action'],
    next_question: typeof r.next_question === 'string' ? r.next_question : '',
    saturation_score: r.saturation_score,
    key_points_extracted: r.key_points_extracted as string[],
    ishikawa_categories_touched: filteredIshikawa,
    cross_validation_hints: r.cross_validation_hints as string[],
  }
}

async function callClaude(
  client: Anthropic,
  input: InvestigationEngineInput
): Promise<Anthropic.Message> {
  return client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: INVESTIGATION_ENGINE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  })
}

export async function runInvestigationEngine(
  input: InvestigationEngineInput
): Promise<InvestigationEngineOutput> {
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
      return validateOutput(parsed)
    } catch (error) {
      lastError = error
      const willRetry = attempt < RETRY_DELAYS.length && isRetryable(error)
      console.error(
        `[investigation-engine] attempt ${attempt + 1} failed${willRetry ? `, retrying in ${RETRY_DELAYS[attempt]}ms` : ''}`,
        error
      )
      if (!willRetry) break
      await sleep(RETRY_DELAYS[attempt])
    }
  }

  throw lastError
}
