import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (session) redirect(session.isAdmin ? '/admin' : '/investigations')

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-teal-50 rounded-full blur-[100px] opacity-60 pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-sky-50 rounded-full blur-[100px] opacity-50 pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm px-4">
        {children}
      </div>
    </div>
  )
}
