import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/utils/env'
import { EVIDENCE_LAYER_SYSTEM_PROMPT } from './prompts'
import { parseAIJson } from './utils'
import { logUsage } from './cost-tracker'
import type {
  ReportMessageEntry, WorkerAlias, EvidenceItemOutput, EvidenceStrength, DivergenceOutput,
} from './types'

export interface EvidenceLayerInput {
  investigation: { title: string; problem_description: string }
  allMessages: ReportMessageEntry[]
  workerAliases: WorkerAlias[]
  rootCause: string
  companyId?: string
  managerId?: string
  investigationId?: string
}

export interface EvidenceLayerOutput {
  evidence_map: EvidenceItemOutput[]
  divergences: DivergenceOutput[]
  sensitive_observations: string[]
}

const FORCAS = ['corroborada', 'fonte_unica', 'divergente'] as const

function validar(raw: unknown): EvidenceLayerOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Camada de evidências não é um objeto')
  }
  const r = raw as Record<string, unknown>

  const evidence_map: EvidenceItemOutput[] = Array.isArray(r.evidence_map)
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

  const sensitive_observations = Array.isArray(r.sensitive_observations)
    ? (r.sensitive_observations as unknown[]).filter((s): s is string => typeof s === 'string')
    : []

  return { evidence_map, divergences, sensitive_observations }
}

/** Gera a camada de evidências do relatório gerencial (segunda chamada). */
export async function generateEvidenceLayer(input: EvidenceLayerInput): Promise<EvidenceLayerOutput> {
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: EVIDENCE_LAYER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  })

  const bloco = response.content[0]
  if (bloco?.type !== 'text') throw new Error('Tipo de resposta inesperado')

  const resultado = validar(parseAIJson<unknown>(bloco.text))

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

  return resultado
}
