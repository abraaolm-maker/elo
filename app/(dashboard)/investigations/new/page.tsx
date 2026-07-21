import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { ChatInvestigacao } from './ChatInvestigacao'

export default async function NovaInvestigacaoPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const manager = await db
    .select({ name: schema.managers.name })
    .from(schema.managers)
    .where(eq(schema.managers.id, session.managerId))
    .get()

  const nome = manager?.name ?? 'Gestor'
  const primeiroNome = nome.split(' ')[0]

  const mensagemInicial = `Olá, ${primeiroNome}! 👋 Vou te ajudar a criar uma investigação para identificar a causa raiz do seu problema.

Para começar: **qual problema você quer investigar?**

Pode descrever com suas palavras mesmo — vou fazendo perguntas para entender melhor.`

  return <ChatInvestigacao managerName={nome} mensagemInicial={mensagemInicial} />
}
