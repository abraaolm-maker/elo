import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { HomeClient } from '../HomeClient'
import type { InvestigationSummary } from '@/components/investigations/InvestigationCard'
import { redirect } from 'next/navigation'
import { count } from 'drizzle-orm'

export default async function PaginaInicial() {
  const session = await getSession()
  if (!session) redirect('/login')

  const investigacoes = await db
    .select({
      id: schema.investigations.id,
      title: schema.investigations.title,
      status: schema.investigations.status,
      created_at: schema.investigations.created_at,
    })
    .from(schema.investigations)
    .where(eq(schema.investigations.company_id, session.companyId))
    .orderBy(schema.investigations.created_at)

  const contagens = await db
    .select({
      investigation_id: schema.investigation_workers.investigation_id,
      cnt: count(),
    })
    .from(schema.investigation_workers)
    .groupBy(schema.investigation_workers.investigation_id)

  const mapaContagem = new Map(contagens.map(r => [r.investigation_id, r.cnt]))

  const resumos: InvestigationSummary[] = investigacoes.map(inv => ({
    id: inv.id,
    title: inv.title,
    status: inv.status,
    created_at: inv.created_at,
    worker_count: mapaContagem.get(inv.id) ?? 0,
  }))

  // Buscar limite de investigações do plano da empresa
  const company = await db
    .select({ plan: schema.companies.plan })
    .from(schema.companies)
    .where(eq(schema.companies.id, session.companyId))
    .get()

  const planCfg = company
    ? await db
        .select({ max_investigations: schema.plan_configs.max_investigations, label: schema.plan_configs.label })
        .from(schema.plan_configs)
        .where(eq(schema.plan_configs.plan, company.plan))
        .get()
    : null

  const planLimit = {
    max: planCfg?.max_investigations ?? -1,
    used: investigacoes.length,
    plan: company?.plan ?? 'starter',
    planLabel: planCfg?.label ?? '',
  }

  return <HomeClient investigations={resumos} planLimit={planLimit} />
}
