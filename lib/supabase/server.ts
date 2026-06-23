import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Sem generic <Database>: evita inferência 'never' com tipos manuais.
// Cada arquivo tipifica os resultados de query explicitamente.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Em Server Components o set é ignorado silenciosamente
          }
        },
      },
    }
  )
}
