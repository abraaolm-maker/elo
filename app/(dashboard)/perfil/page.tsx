import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { PerfilClient } from './PerfilClient'

export default async function PerfilPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const manager = await db
    .select({
      id:         schema.managers.id,
      name:       schema.managers.name,
      email:      schema.managers.email,
      created_at: schema.managers.created_at,
    })
    .from(schema.managers)
    .where(eq(schema.managers.id, session.managerId))
    .get()

  if (!manager) redirect('/login')

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-100 px-8 py-6 bg-white sticky top-0 z-10">
        <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">Conta</p>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Meu perfil</h1>
      </div>

      <div className="px-8 py-6 max-w-xl space-y-6">
        <PerfilClient
          id={manager.id}
          name={manager.name}
          email={manager.email}
          createdAt={manager.created_at}
        />
      </div>
    </div>
  )
}
