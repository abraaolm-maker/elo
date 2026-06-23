import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export async function POST(): Promise<never> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
  redirect('/login')
}
