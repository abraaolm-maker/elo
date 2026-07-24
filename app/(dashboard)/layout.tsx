import { getSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogoutButton } from '@/components/LogoutButton'
import { ToastProvider } from '@/components/ui/toast'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const manager = await db
    .select({ name: schema.managers.name })
    .from(schema.managers)
    .where(eq(schema.managers.id, session.managerId))
    .get()

  const managerInitial = (manager?.name ?? '?').charAt(0).toUpperCase()
  const managerName    = manager?.name ?? ''

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-white">
        {/* Sidebar */}
        <aside className="w-56 flex flex-col border-r border-slate-200 shrink-0 bg-white">
          {/* Logo */}
          <div className="h-[64px] px-5 flex items-center gap-3 border-b border-slate-100">
            <div className="w-7 h-7 bg-teal-50 text-teal-600 rounded flex items-center justify-center border border-teal-100 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <span className="text-base font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'var(--font-jakarta)' }}>
              Elo
            </span>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-0.5">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase px-3 pt-3 pb-2">
              Plataforma
            </p>
            <Link
              href="/investigations"
              className="flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              Investigações
            </Link>
          </nav>

          {/* Footer — perfil + logout */}
          <div className="p-3 border-t border-slate-100 space-y-1">
            <Link
              href="/perfil"
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-sm text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <div className="w-6 h-6 rounded-sm bg-slate-100 flex items-center justify-center shrink-0 text-[10px] font-bold text-slate-500">
                {managerInitial}
              </div>
              <span className="truncate text-xs">{managerName}</span>
            </Link>
            <LogoutButton />
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </ToastProvider>
  )
}
