import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogoutButton } from '@/components/LogoutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const manager = await db
    .select({ is_admin: schema.managers.is_admin })
    .from(schema.managers)
    .where(eq(schema.managers.id, session.managerId))
    .get()

  if (!manager?.is_admin) redirect('/')

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col border-r border-slate-200 shrink-0 bg-slate-900">
        {/* Logo */}
        <div className="h-[64px] px-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-7 h-7 bg-teal-500/10 text-teal-400 rounded flex items-center justify-center border border-teal-500/20 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-white" style={{ fontFamily: 'var(--font-jakarta)' }}>
              Elo
            </span>
            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
              Admin
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          <p className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase px-3 pt-3 pb-2">
            Gerenciamento
          </p>
          <Link
            href="/admin"
            className="flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
            </svg>
            Empresas
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 [&_button]:text-slate-400 [&_button:hover]:text-white [&_button:hover]:bg-slate-800">
          <LogoutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-slate-50">
        {children}
      </main>
    </div>
  )
}
