import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { redirect } from 'next/navigation'
import { AdminCompaniesClient } from './AdminCompaniesClient'

export default async function AdminPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const empresas = await db
    .select()
    .from(schema.companies)
    .orderBy(schema.companies.created_at)

  const gestores = await db
    .select({
      id:         schema.managers.id,
      name:       schema.managers.name,
      email:      schema.managers.email,
      company_id: schema.managers.company_id,
      is_admin:   schema.managers.is_admin,
      created_at: schema.managers.created_at,
    })
    .from(schema.managers)

  const investigacoes = await db
    .select({
      id:         schema.investigations.id,
      title:      schema.investigations.title,
      status:     schema.investigations.status,
      company_id: schema.investigations.company_id,
      created_at: schema.investigations.created_at,
    })
    .from(schema.investigations)
    .orderBy(schema.investigations.created_at)

  const dados = empresas.map(e => ({
    ...e,
    gestores:             gestores.filter(g => g.company_id === e.id),
    total_investigacoes:  investigacoes.filter(i => i.company_id === e.id).length,
    investigacoes:        investigacoes.filter(i => i.company_id === e.id),
  }))

  return <AdminCompaniesClient empresas={dados} />
}
