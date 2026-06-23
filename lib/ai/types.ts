import type { IshikawaCategory } from '../supabase/types'

// ─── Investigation Engine ─────────────────────────────────────────────────────

export interface MessageHistoryEntry {
  direction: 'outbound' | 'inbound'
  content: string
}

export interface InvestigationEngineInput {
  problemDescription: string
  workerRole: string
  workerRoleDescription: string
  messageHistory: MessageHistoryEntry[]
  crossValidationContext: string
}

export interface InvestigationEngineOutput {
  action: 'ask_question' | 'mark_saturated'
  next_question: string
  saturation_score: number
  key_points_extracted: string[]
  ishikawa_categories_touched: IshikawaCategory[]
  cross_validation_hints: string[]
}

// ─── Report Generator ─────────────────────────────────────────────────────────

export interface ReportMessageEntry {
  alias: string
  role: string
  direction: 'outbound' | 'inbound'
  content: string
  key_points_extracted?: string[]
}

export interface WorkerAlias {
  alias: string
  role: string
}

export interface ReportGeneratorInput {
  investigation: {
    title: string
    problem_description: string
  }
  allMessages: ReportMessageEntry[]
  workerAliases: WorkerAlias[]
}

export interface IshikawaBreakdownOutput {
  mao_de_obra: string | null
  maquina: string | null
  metodo: string | null
  material: string | null
  meio_ambiente: string | null
  medicao: string | null
}

export interface SourceSummaryOutput {
  alias: string
  role: string
  key_points: string[]
}

export interface ReportGeneratorOutput {
  root_cause: string
  confidence_score: number
  confidence_justification: string
  ishikawa_breakdown: IshikawaBreakdownOutput
  sources_summary: SourceSummaryOutput[]
  recommendations: string[]
}
