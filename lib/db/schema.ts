import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ─── COMPANIES ────────────────────────────────────────────────────────────────
export const companies = sqliteTable('companies', {
  id:         text('id').primaryKey(),
  name:       text('name').notNull(),
  plan:       text('plan').notNull().default('starter'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ─── MANAGERS ─────────────────────────────────────────────────────────────────
export const managers = sqliteTable('managers', {
  id:            text('id').primaryKey(),
  company_id:    text('company_id').notNull().references(() => companies.id),
  name:          text('name').notNull(),
  email:         text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  is_admin:      integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  is_active:     integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at:    text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ─── WORKERS ──────────────────────────────────────────────────────────────────
export const workers = sqliteTable('workers', {
  id:               text('id').primaryKey(),
  company_id:       text('company_id').notNull().references(() => companies.id),
  name:             text('name').notNull(),
  full_name:        text('full_name'),
  cpf:              text('cpf'),
  role:             text('role').notNull(),
  role_description: text('role_description'),
  whatsapp_number:  text('whatsapp_number').notNull(),
  anonymous_alias:  text('anonymous_alias').notNull(),
  is_active:        integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at:       text('created_at').notNull().default(sql`(datetime('now'))`),
}, t => ({
  uniq_company_phone: unique().on(t.company_id, t.whatsapp_number),
}))

// ─── INVESTIGATIONS ───────────────────────────────────────────────────────────
export const investigations = sqliteTable('investigations', {
  id:                  text('id').primaryKey(),
  company_id:          text('company_id').notNull().references(() => companies.id),
  manager_id:          text('manager_id').notNull().references(() => managers.id),
  title:               text('title').notNull(),
  problem_description: text('problem_description').notNull(),
  ishikawa_category:    text('ishikawa_category'),
  status:               text('status').notNull().default('pending'),
  investigation_context: text('investigation_context'), // JSON: domínio, persona, categorias, linguagem
  created_at:           text('created_at').notNull().default(sql`(datetime('now'))`),
  completed_at:         text('completed_at'),
})

// ─── INVESTIGATION_WORKERS ────────────────────────────────────────────────────
export const investigation_workers = sqliteTable('investigation_workers', {
  id:                text('id').primaryKey(),
  investigation_id:  text('investigation_id').notNull().references(() => investigations.id),
  worker_id:         text('worker_id').notNull().references(() => workers.id),
  status:            text('status').notNull().default('pending'),
  saturation_score:  integer('saturation_score').notNull().default(0),
  manager_notes:     text('manager_notes'),
  access_token:      text('access_token').unique(),
  push_subscription:  text('push_subscription'),
  first_accessed_at:  text('first_accessed_at'),
  pending_hints:      text('pending_hints'),       // JSON: cross_validation_hints da última resposta deste worker
  created_at:        text('created_at').notNull().default(sql`(datetime('now'))`),
}, t => ({
  uniq_inv_worker: unique().on(t.investigation_id, t.worker_id),
}))

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
export const messages = sqliteTable('messages', {
  id:                   text('id').primaryKey(),
  investigation_id:     text('investigation_id').notNull().references(() => investigations.id),
  worker_id:            text('worker_id').notNull().references(() => workers.id),
  direction:            text('direction').notNull(),
  content_type:         text('content_type').notNull().default('text'),
  content:              text('content'),
  audio_url:            text('audio_url'),
  raw_whatsapp_id:      text('raw_whatsapp_id').unique(),
  transcription_status: text('transcription_status').notNull().default('not_applicable'),
  retry_count:          integer('retry_count').notNull().default(0),
  key_points_extracted: text('key_points_extracted'), // JSON string
  created_at:           text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ─── REPORTS ──────────────────────────────────────────────────────────────────
export const reports = sqliteTable('reports', {
  id:                      text('id').primaryKey(),
  investigation_id:        text('investigation_id').notNull().unique().references(() => investigations.id),
  root_cause:              text('root_cause').notNull(),
  confidence_score:        integer('confidence_score').notNull(),
  confidence_justification: text('confidence_justification'),
  ishikawa_breakdown:      text('ishikawa_breakdown'),  // JSON string
  sources_summary:         text('sources_summary'),     // JSON string
  recommendations:         text('recommendations'),     // JSON string (array)
  generated_at:            text('generated_at').notNull().default(sql`(datetime('now'))`),
})

// ─── ACTION_ITEMS ─────────────────────────────────────────────────────────────
export const action_items = sqliteTable('action_items', {
  id:                   text('id').primaryKey(),
  report_id:            text('report_id').notNull().references(() => reports.id),
  // 5W2H
  what:                 text('what').notNull(),
  why:                  text('why').notNull(),
  where_scope:          text('where_scope'),
  who_role:             text('who_role'),
  how_to:               text('how_to').notNull(),
  how_much_estimate:    text('how_much_estimate'),
  // Priorização (Matriz Impacto x Esforço)
  impact_score:         integer('impact_score').notNull(),
  effort_score:         integer('effort_score').notNull(),
  timeframe:            text('timeframe').notNull(), // 'curto_prazo' | 'medio_prazo' | 'longo_prazo'
  priority_rank:        integer('priority_rank').notNull(),
  // PDCA / recorrência
  is_recurring_pattern: integer('is_recurring_pattern', { mode: 'boolean' }).notNull().default(false),
  related_pattern_note: text('related_pattern_note'),
  // Status do gestor
  status:               text('status').notNull().default('suggested'), // 'suggested' | 'in_progress' | 'done' | 'dismissed'
  created_at:           text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ─── API_USAGE_LOGS ───────────────────────────────────────────────────────────
export const api_usage_logs = sqliteTable('api_usage_logs', {
  id:               text('id').primaryKey(),
  company_id:       text('company_id').notNull().references(() => companies.id),
  manager_id:       text('manager_id').references(() => managers.id),
  investigation_id: text('investigation_id').references(() => investigations.id),
  operation:        text('operation').notNull(),
  model:            text('model').notNull(),
  input_tokens:     integer('input_tokens').notNull(),
  output_tokens:    integer('output_tokens').notNull(),
  cost_usd:         real('cost_usd').notNull(),
  cost_brl:         real('cost_brl').notNull(),
  created_at:       text('created_at').notNull().default(sql`(datetime('now'))`),
})
export type ApiUsageLog    = typeof api_usage_logs.$inferSelect
export type NewApiUsageLog = typeof api_usage_logs.$inferInsert

// ─── Tipos inferidos ──────────────────────────────────────────────────────────
export type Company                = typeof companies.$inferSelect
export type Manager                = typeof managers.$inferSelect
export type Worker                 = typeof workers.$inferSelect
export type Investigation          = typeof investigations.$inferSelect
export type InvestigationWorker    = typeof investigation_workers.$inferSelect
export type Message                = typeof messages.$inferSelect
export type Report                 = typeof reports.$inferSelect

export type ActionItem             = typeof action_items.$inferSelect
export type NewActionItem          = typeof action_items.$inferInsert

export type NewWorker              = typeof workers.$inferInsert
export type NewInvestigation       = typeof investigations.$inferInsert
export type NewInvestigationWorker = typeof investigation_workers.$inferInsert
export type NewMessage             = typeof messages.$inferInsert
export type NewReport              = typeof reports.$inferInsert
