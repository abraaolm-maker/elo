import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json() as Record<string, unknown>

    // Campos permitidos para atualização — whatsapp_number e anonymous_alias são imutáveis
    const allowed: Record<string, unknown> = {}
    if (typeof body.role === 'string') allowed.role = body.role.trim()
    if (typeof body.role_description === 'string') allowed.role_description = body.role_description.trim()
    if (typeof body.is_active === 'boolean') allowed.is_active = body.is_active

    if (Object.keys(allowed).length === 0) {
      return Response.json({ error: 'Nenhum campo válido para atualizar.' }, { status: 400 })
    }

    // RLS garante que o manager só pode atualizar workers da própria company
    const { data: rawData, error } = await supabase
      .from('workers')
      .update(allowed as Record<string, unknown>)
      .eq('id', id)
      .select('id, anonymous_alias, role, role_description, is_active')
      .single()

    const data = rawData as { id: string; anonymous_alias: string; role: string; role_description: string | null; is_active: boolean } | null

    if (error) {
      console.error('[workers PATCH]', error)
      return Response.json({ error: 'Erro ao atualizar worker.' }, { status: 500 })
    }

    return Response.json({ data }, { status: 200 })
  } catch (error) {
    console.error('[workers PATCH]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
