import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { ChatInvestigacao } from './ChatInvestigacao'

export type CompanyContext = {
  company_description: string
  sector: string
  manager_position: string
}

export default async function NovaInvestigacaoPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const manager = await db
    .select({ name: schema.managers.name, company_context: schema.managers.company_context })
    .from(schema.managers)
    .where(eq(schema.managers.id, session.managerId))
    .get()

  const nome = manager?.name ?? 'Gestor'
  const primeiroNome = nome.split(' ')[0]!

  let companyContext: CompanyContext | null = null
  try {
    if (manager?.company_context) {
      companyContext = JSON.parse(manager.company_context) as CompanyContext
    }
  } catch { /* ignore malformed JSON */ }

  let mensagemInicial: string
  if (!companyContext) {
    mensagemInicial = `Olá, ${primeiroNome}! 👋 Antes de criar a investigação, preciso entender um pouco o contexto da sua empresa.\n\n**Sobre o que sua empresa trabalha?** Qual é o produto ou serviço principal?`
  } else {
    mensagemInicial = `Olá, ${primeiroNome}! 👋 Tenho aqui os dados que você me passou anteriormente:\n\n• **Empresa:** ${companyContext.company_description}\n• **Setor:** ${companyContext.sector}\n• **Seu cargo:** ${companyContext.manager_position}\n\nEssas informações ainda estão corretas?`
  }

  return (
    <ChatInvestigacao
      managerName={nome}
      mensagemInicial={mensagemInicial}
      faseInicial={companyContext ? 'contexto_confirmar' : 'contexto'}
    />
  )
}
