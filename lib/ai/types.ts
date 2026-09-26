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

export interface InvestigationContext {
  domain: string
  investigator_persona: string
  relevant_ishikawa_categories: string[]
  language_guidelines: Record<string, string>
  domain_specific_probes: string[]
}

export interface InvestigationEngineInput {
  problemDescription: string
  workerRole: string
  workerRoleDescription: string
  messageHistory: MessageHistoryEntry[]
  reportedFacts: string[]       // key_points já extraídos de outros workers (o que foi dito)
  pendingValidations: string[]  // hints gerados por outros workers (o que precisa ser confirmado)
  managerNotes: string
  investigationContext?: InvestigationContext | null
  maxQuestionsPerWorker?: number  // limite de perguntas por worker por investigação (-1 = ilimitado)
  questionsAsked?: number         // quantas perguntas outbound já foram feitas para este worker
  // rastreamento de custos
  companyId?: string
  managerId?: string
  investigationId?: string
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
  /** Nome real — presente apenas no relatório gerencial, nunca na devolutiva */
  name?: string
  direction: 'outbound' | 'inbound'
  content: string
  key_points_extracted?: string[]
}

export interface WorkerAlias {
  alias: string
  role: string
  /** Nome real — presente apenas no relatório gerencial, nunca na devolutiva */
  name?: string
}

export interface ReportGeneratorInput {
  investigation: {
    title: string
    problem_description: string
  }
  allMessages: ReportMessageEntry[]
  workerAliases: WorkerAlias[]
  // contexto para rastreamento de custos (opcional)
  companyId?: string
  managerId?: string
  investigationId?: string
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
  /** Nome real — só no relatório gerencial */
  name?: string
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

/** Força da evidência por achado — quanto a conclusão se sustenta. */
export type EvidenceStrength = 'corroborada' | 'fonte_unica' | 'divergente'

export interface EvidenceItemOutput {
  finding: string
  /** Aliases que sustentam este achado (nunca nomes reais) */
  supporting_sources: string[]
  strength: EvidenceStrength
  note: string | null
}

export interface DivergenceOutput {
  topic: string
  /** Posições conflitantes, por alias + cargo */
  positions: { alias: string; role: string; position: string }[]
  reading: string
}

export interface ReportGeneratorOutput {
  root_cause: string
  confidence_score: number
  confidence_justification: string
  ishikawa_breakdown: IshikawaBreakdownOutput
  sources_summary: SourceSummaryOutput[]
  recommendations: string[]
  action_plan: ActionPlanItemOutput[]
  // ─── Exclusivos do relatório gerencial ───────────────────────────────────
  /** Mapa de evidências: o que sustenta cada achado e com que força */
  evidence_map?: EvidenceItemOutput[]
  /** Pontos em que as fontes discordam — some do relatório dos colaboradores */
  divergences?: DivergenceOutput[]
  /** Observações delicadas: atrito, resistência, questões de liderança */
  sensitive_observations?: string[]
}

// ─── Devolutiva aos colaboradores ─────────────────────────────────────────────

/**
 * Versão do relatório destinada a quem participou.
 *
 * Difere do gerencial não por ser um resumo, mas por ter outra função: fechar o
 * ciclo com quem falou. Por isso não traz atribuição — nem por alias, nem por
 * cargo, nem por qualquer detalhe que permita deduzir a autoria.
 */
export interface WorkerReportOutput {
  titulo: string
  /** O problema investigado, em linguagem acessível */
  resumo_do_problema: string
  /** Achados agregados, sem nenhuma atribuição */
  o_que_encontramos: string[]
  /** Conclusão principal, redigida sem apontar culpados */
  conclusao: string
  /** O que a liderança vai fazer a respeito */
  o_que_vai_mudar: { acao: string; prazo: string }[]
  /** O que se espera do time daqui para frente */
  o_que_pedimos: string[]
  /** Encerramento agradecendo a participação */
  mensagem_final: string
}
