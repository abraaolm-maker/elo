import { createClient } from '@/lib/supabase/server'

interface WorkerRow {
  id: string
  anonymous_alias: string
  role: string
  role_description: string | null
  whatsapp_number: string
  is_active: boolean
  created_at: string
}

interface ManagerRow {
  company_id: string
}

const ALIAS_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function generateAlias(index: number): string {
  return `Colaborador ${ALIAS_LETTERS[index] ?? index + 1}`
}

function maskNumber(phone: string): string {
  return `****${phone.slice(-4)}`
}

function validateWhatsAppNumber(phone: string): string | null {
  if (!/^\d+$/.test(phone)) return 'O número deve conter apenas dígitos.'
  if (!phone.startsWith('55')) return 'O número deve começar com 55 (código do Brasil).'
  if (phone.length < 12 || phone.length > 13) return 'Formato inválido. Use: 5511999999999'
  return null
}

export async function GET(): Promise<Response> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

    const { data, error } = await supabase
      .from('workers')
      .select('id, anonymous_alias, role, role_description, whatsapp_number, is_active, created_at')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[workers GET]', error)
      return Response.json({ error: 'Erro interno' }, { status: 500 })
    }

    // Nunca expor whatsapp_number completo
    const workers = ((data ?? []) as WorkerRow[]).map(w => ({
      id: w.id,
      anonymous_alias: w.anonymous_alias,
      role: w.role,
      role_description: w.role_description,
      whatsapp_masked: maskNumber(w.whatsapp_number),
      is_active: w.is_active,
      created_at: w.created_at,
    }))

    return Response.json({ data: workers }, { status: 200 })
  } catch (error) {
    console.error('[workers GET]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json() as Record<string, unknown>
    const role = typeof body.role === 'string' ? body.role.trim() : ''
    const role_description = typeof body.role_description === 'string' ? body.role_description.trim() : ''
    const whatsapp_number = typeof body.whatsapp_number === 'string' ? body.whatsapp_number.trim() : ''

    if (!role) return Response.json({ error: 'O cargo é obrigatório.' }, { status: 400 })
    if (!whatsapp_number) return Response.json({ error: 'O número WhatsApp é obrigatório.' }, { status: 400 })

    const numberError = validateWhatsAppNumber(whatsapp_number)
    if (numberError) return Response.json({ error: numberError }, { status: 400 })

    // Buscar company_id do manager autenticado
    const { data: managerData } = await supabase
      .from('managers')
      .select('company_id')
      .eq('id', user.id)
      .single()

    const manager = managerData as ManagerRow | null
    if (!manager) return Response.json({ error: 'Manager não encontrado.' }, { status: 404 })

    // Verificar duplicidade de número na company
    const { data: existing } = await supabase
      .from('workers')
      .select('id')
      .eq('company_id', manager.company_id)
      .eq('whatsapp_number', whatsapp_number)
      .maybeSingle()

    if (existing) {
      return Response.json({ error: 'Este número já está cadastrado na empresa.' }, { status: 409 })
    }

    // Gerar alias com base no total de workers da company (incluindo inativos)
    const { count } = await supabase
      .from('workers')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', manager.company_id)

    const alias = generateAlias(count ?? 0)

    const { data: newWorkerData, error: insertError } = await supabase
      .from('workers')
      .insert({
        company_id: manager.company_id,
        role,
        role_description: role_description || null,
        whatsapp_number,
        anonymous_alias: alias,
      })
      .select('id, anonymous_alias, role, role_description, is_active, created_at')
      .single()

    const newWorker = newWorkerData as WorkerRow | null

    if (insertError) {
      console.error('[workers POST]', insertError)
      return Response.json({ error: 'Erro ao criar worker.' }, { status: 500 })
    }

    return Response.json({ data: newWorker }, { status: 201 })
  } catch (error) {
    console.error('[workers POST]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
