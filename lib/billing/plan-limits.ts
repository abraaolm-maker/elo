import { db, schema } from '@/lib/db'
import { eq, count, sum } from 'drizzle-orm'

/**
 * Verificação centralizada dos limites de plano.
 *
 * Antes existia apenas na rota de chat, o que deixava POST /api/investigations
 * livre para criar investigações acima da cota. Toda checagem de limite deve
 * passar por aqui.
 */

export interface LimitCheck {
  /** true = pode prosseguir */
  ok: boolean
  /** Mensagem pronta para o usuário quando ok = false */
  reason: string | null
}

const OK: LimitCheck = { ok: true, reason: null }

/**
 * Pode criar uma nova investigação?
 * Valida cota de investigações e teto de custo acumulado.
 */
export async function canCreateInvestigation(companyId: string): Promise<LimitCheck> {
  try {
    const company = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).get()
    if (!company) return OK

    const cfg = await db.select().from(schema.plan_configs).where(eq(schema.plan_configs.plan, company.plan)).get()
    if (!cfg) return OK

    if (cfg.max_investigations !== -1) {
      const [row] = await db
        .select({ total: count() })
        .from(schema.investigations)
        .where(eq(schema.investigations.company_id, companyId))
      if ((row?.total ?? 0) >= cfg.max_investigations) {
        return {
          ok: false,
          reason: `Sua empresa atingiu o limite de ${cfg.max_investigations} investigações do plano ${cfg.label}. Entre em contato com o suporte para fazer upgrade.`,
        }
      }
    }

    const custo = await custoAcumulado(companyId)
    if (cfg.max_cost_brl !== -1 && custo >= cfg.max_cost_brl) {
      return {
        ok: false,
        reason: `Sua empresa atingiu o limite de custo de IA (R$ ${cfg.max_cost_brl.toFixed(2)}) do plano ${cfg.label}. Entre em contato com o suporte para fazer upgrade.`,
      }
    }

    return OK
  } catch {
    // Se plan_configs ainda não existir, não bloqueia
    return OK
  }
}

/**
 * A investigação pode continuar consumindo IA?
 *
 * Chamado antes de cada chamada ao engine. Sem isto, o teto de custo valia
 * apenas no momento da criação e uma investigação já em andamento poderia
 * ultrapassá-lo indefinidamente — cada resposta de worker dispara uma chamada
 * ao Claude.
 */
export async function canSpendOnAi(companyId: string): Promise<LimitCheck> {
  try {
    const company = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).get()
    if (!company) return OK

    const cfg = await db.select().from(schema.plan_configs).where(eq(schema.plan_configs.plan, company.plan)).get()
    if (!cfg || cfg.max_cost_brl === -1) return OK

    const custo = await custoAcumulado(companyId)
    if (custo >= cfg.max_cost_brl) {
      return {
        ok: false,
        reason: `Limite de custo de IA do plano ${cfg.label} atingido (R$ ${cfg.max_cost_brl.toFixed(2)}).`,
      }
    }

    return OK
  } catch {
    return OK
  }
}

/** Custo acumulado em BRL de todas as chamadas de IA da empresa. */
export async function custoAcumulado(companyId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(schema.api_usage_logs.cost_brl) })
    .from(schema.api_usage_logs)
    .where(eq(schema.api_usage_logs.company_id, companyId))
  return Number(row?.total ?? 0)
}
