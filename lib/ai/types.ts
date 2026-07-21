export type IshikawaCategory =
  | 'mao_de_obra'
  | 'maquina'
  | 'metodo'
  | 'material'
  | 'meio_ambiente'
  | 'medicao'

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
  managerNotes: string // observações do gestor para este participante nesta investigação
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

export type ActionPlanTimeframe = 'curto_prazo' | 'medio_prazo' | 'longo_prazo'

export interface ActionPlanItemOutput {
  what: string
  why: string
  where_scope: string | null
  who_role: string | null
  how_to: string
  how_much_estimate: string | null
  impact_score: number     // 0-100
  effort_score: number     // 0-100
  is_recurring_pattern: boolean
  related_pattern_note: string | null
}

export interface ReportGeneratorOutput {
  root_cause: string
  confidence_score: number
  confidence_justification: string
  ishikawa_breakdown: IshikawaBreakdownOutput
  sources_summary: SourceSummaryOutput[]
  recommendations: string[]
  action_plan: ActionPlanItemOutput[]
}
