export const CompanyPlan = {
  STARTER: 'starter',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const
export type CompanyPlan = typeof CompanyPlan[keyof typeof CompanyPlan]

export const InvestigationStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SATURATED: 'saturated',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const
export type InvestigationStatus = typeof InvestigationStatus[keyof typeof InvestigationStatus]

export const IshikawaCategory = {
  MAO_DE_OBRA: 'mao_de_obra',
  MAQUINA: 'maquina',
  METODO: 'metodo',
  MATERIAL: 'material',
  MEIO_AMBIENTE: 'meio_ambiente',
  MEDICAO: 'medicao',
} as const
export type IshikawaCategory = typeof IshikawaCategory[keyof typeof IshikawaCategory]

export const InvestigationWorkerStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SATURATED: 'saturated',
  UNRESPONSIVE: 'unresponsive',
} as const
export type InvestigationWorkerStatus = typeof InvestigationWorkerStatus[keyof typeof InvestigationWorkerStatus]

export const MessageDirection = {
  OUTBOUND: 'outbound',
  INBOUND: 'inbound',
} as const
export type MessageDirection = typeof MessageDirection[keyof typeof MessageDirection]

export const MessageContentType = {
  TEXT: 'text',
  AUDIO: 'audio',
} as const
export type MessageContentType = typeof MessageContentType[keyof typeof MessageContentType]

export const TranscriptionStatus = {
  SUCCESS: 'success',
  FAILED: 'failed',
  PERMANENTLY_FAILED: 'permanently_failed',
  NOT_APPLICABLE: 'not_applicable',
} as const
export type TranscriptionStatus = typeof TranscriptionStatus[keyof typeof TranscriptionStatus]

export interface Company {
  id: string
  name: string
  plan: CompanyPlan
  created_at: string
}

export interface Manager {
  id: string
  company_id: string
  name: string
  email: string
  created_at: string
}

export interface Worker {
  id: string
  company_id: string
  role: string
  role_description: string | null
  whatsapp_number: string
  anonymous_alias: string
  is_active: boolean
  created_at: string
}

export interface Investigation {
  id: string
  company_id: string
  manager_id: string
  title: string
  problem_description: string
  ishikawa_category: IshikawaCategory | null
  status: InvestigationStatus
  created_at: string
  completed_at: string | null
}

export interface InvestigationWorker {
  id: string
  investigation_id: string
  worker_id: string
  status: InvestigationWorkerStatus
  saturation_score: number
  created_at: string
}

export interface Message {
  id: string
  investigation_id: string
  worker_id: string
  direction: MessageDirection
  content_type: MessageContentType
  content: string | null
  audio_url: string | null
  raw_whatsapp_id: string | null
  transcription_status: TranscriptionStatus
  retry_count: number
  key_points_extracted: string[] | null
  created_at: string
}

export interface IshikawaBreakdown {
  mao_de_obra: string | null
  maquina: string | null
  metodo: string | null
  material: string | null
  meio_ambiente: string | null
  medicao: string | null
}

export interface SourceSummaryEntry {
  alias: string
  role: string
  key_points: string[]
}

export interface Report {
  id: string
  investigation_id: string
  root_cause: string
  confidence_score: number
  confidence_justification: string | null
  ishikawa_breakdown: IshikawaBreakdown | null
  sources_summary: SourceSummaryEntry[] | null
  recommendations: string[] | null
  generated_at: string
}

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: Company
        Insert: Omit<Company, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Company, 'id'>>
      }
      managers: {
        Row: Manager
        Insert: Omit<Manager, 'created_at'> & { created_at?: string }
        Update: Partial<Omit<Manager, 'id'>>
      }
      workers: {
        Row: Worker
        Insert: Omit<Worker, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Worker, 'id'>>
      }
      investigations: {
        Row: Investigation
        Insert: Omit<Investigation, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Investigation, 'id'>>
      }
      investigation_workers: {
        Row: InvestigationWorker
        Insert: Omit<InvestigationWorker, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<InvestigationWorker, 'id'>>
      }
      messages: {
        Row: Message
        Insert: Omit<Message, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Message, 'id'>>
      }
      reports: {
        Row: Report
        Insert: Omit<Report, 'id' | 'generated_at'> & { id?: string; generated_at?: string }
        Update: Partial<Omit<Report, 'id'>>
      }
    }
  }
}
