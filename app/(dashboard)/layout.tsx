import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogoutButton } from '@/components/LogoutButton'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 flex flex-col border-r bg-white shrink-0">
        <div className="p-4 border-b">
          <span className="font-bold text-lg tracking-tight">Elo</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Investigações
          </Link>
          <Link
            href="/workers"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Workers
          </Link>
        </nav>
        <div className="p-3 border-t">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-6 bg-gray-50 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
