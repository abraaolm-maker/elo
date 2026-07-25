import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, count } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'
import { env } from '@/lib/utils/env'
import { logUsage } from '@/lib/ai/cost-tracker'

const anthropic = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })

interface CompanyContext {
  company_description: string
  sector: string
  manager_position: string
}

interface ParticipanteConfirmado {
  name: string
  whatsapp_number: string
  role: string
  role_description: string
}

interface DraftInvestigacao {
  fase: 'contexto' | 'contexto_confirmar' | 'problema' | 'participantes' | 'pronto'
  titulo: string | null
  descricao_problema: string | null
  participantes: ParticipanteConfirmado[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RespostaIA {
  message: string
  updates: {
    fase?: DraftInvestigacao['fase'] | null
    titulo?: string | null
    descricao_problema?: string | null
    adicionar_participante?: ParticipanteConfirmado | null
    investigacao_pronta?: boolean
    company_context?: CompanyContext | null
  }
}

function extrairJSON(texto: string): RespostaIA | null {
  try { return JSON.parse(texto.trim()) as RespostaIA } catch { /* continua */ }
  const semMarkdown = texto.replace(/^```(?:json)?\s*/im, '').replace(/\s*```$/im, '').trim()
  try { return JSON.parse(semMarkdown) as RespostaIA } catch { /* continua */ }
  const a = texto.indexOf('{'), b = texto.lastIndexOf('}')
  if (a !== -1 && b !== -1 && b > a) {
    try { return JSON.parse(texto.slice(a, b + 1)) as RespostaIA } catch { /* continua */ }
  }
  return null
}

function buildSystemPrompt(managerName: string, draft: DraftInvestigacao, existingContext: CompanyContext | null): string {
  const faseContexto = draft.fase === 'contexto' || draft.fase === 'contexto_confirmar'

  const blocoContexto = faseContexto ? (
    existingContext
      ? `FASE "contexto_confirmar" — CONFIRMAR DADOS EXISTENTES:
Você já tem o contexto da empresa do gestor:
- O que a empresa faz: ${existingContext.company_description}
- Setor de atuação: ${existingContext.sector}
- Cargo do gestor: ${existingContext.manager_position}

Na sua PRIMEIRA mensagem, apresente esses dados de forma clara e amigável e pergunte se ainda estão corretos.

Se o gestor CONFIRMAR (sim, correto, tá bom, etc.):
- Mude updates.fase para "problema"
- Na mesma mensagem, já faça a primeira pergunta sobre o problema da investigação
- NÃO preencha updates.company_context (dados permanecem como estão)

Se o gestor NEGAR ou quiser corrigir:
- Colete as 3 informações novamente, uma pergunta por vez:
  1. O que a empresa faz / produto ou serviço principal
  2. Setor ou área de atuação
  3. Cargo do gestor na empresa
- Quando tiver as 3: preencha updates.company_context E mude updates.fase para "problema", já perguntando sobre o problema na mesma mensagem`
      : `FASE "contexto" — COLETAR CONTEXTO INICIAL:
Você está reunindo contexto básico sobre a empresa antes de criar a investigação.
Faça as perguntas a seguir, UMA POR VEZ, em sequência:
  1. O que a empresa faz? Qual produto ou serviço principal?
  2. Qual é o setor ou área de atuação? (ex: construção civil, manufatura, logística, tecnologia, varejo...)
  3. Qual é o cargo do gestor na empresa?

Quando tiver as 3 respostas:
- Preencha updates.company_context com { company_description, sector, manager_position }
- Mude updates.fase para "problema"
- Na mesma mensagem, agradeça e já faça a primeira pergunta sobre o problema da investigação`
  ) : ''

  const blocoProblema = draft.fase === 'problema' ? `FASE "problema" — ENTENDER O PROBLEMA:
Entenda o problema completamente antes de avançar. Precisa ficar claro:
1. O que exatamente está acontecendo
2. Quando/com que frequência ocorre
3. Qual o impacto (financeiro, operacional, segurança)
4. O que já foi tentado para resolver

Use o contexto da empresa para fazer perguntas mais relevantes e específicas ao setor.
Faça UMA pergunta por vez. Se o gestor for vago, peça números e exemplos concretos.
Quando as 4 dimensões estiverem claras, defina titulo e descricao_problema no JSON e mude a fase para "participantes".` : ''

  const blocoParticipantes = draft.fase === 'participantes' ? `FASE "participantes" — COLETAR PARTICIPANTES:
Colete participantes seguindo esta sequência para cada um:
1. Peça: nome completo, WhatsApp com DDD, cargo (pode pedir os 3 juntos numa mensagem)
2. Após receber esses dados, pergunte o que essa pessoa faz no contexto do problema
3. Com base na resposta, apresente de 4 a 5 bullet points de responsabilidades contextualizadas
4. Pergunte se está correto ou se quer ajustar
5. SÓ APÓS CONFIRMAÇÃO: coloque os dados em "adicionar_participante"
6. Pergunte se há mais participantes
Quando gestor disser que não há mais e tiver pelo menos 1 participante: mude fase para "pronto" e set investigacao_pronta: true` : ''

  const blocoPronte = draft.fase === 'pronto' ? `FASE "pronto": Mande uma mensagem final confirmando que a investigação será criada agora. Não colete mais nada.` : ''

  return `INSTRUÇÃO CRÍTICA: Você deve responder SEMPRE e EXCLUSIVAMENTE com um objeto JSON válido. Nunca escreva texto fora do JSON. Nunca use markdown. Sua resposta inteira deve ser parseável por JSON.parse().

Você é o assistente de criação de investigações do Elo, plataforma de inteligência operacional para empresas brasileiras.

CONTEXTO:
- Gestor: ${managerName}
- Fase atual: ${draft.fase}
- Título coletado: ${draft.titulo ?? 'nenhum ainda'}
- Participantes confirmados: ${draft.participantes.length}

${blocoContexto}
${blocoProblema}
${blocoParticipantes}
${blocoPronte}

REGRAS GERAIS:
- Uma pergunta por vez
- Português brasileiro, direto e amigável
- Emojis com moderação (máx 1 por mensagem)
- Você decide o título da investigação — o gestor não precisa sugerir
- Normalizar WhatsApp: só dígitos, com 55 no início

FORMATO OBRIGATÓRIO — retorne exatamente este JSON (substitua os valores):
{"message":"sua mensagem para o gestor","updates":{"fase":null,"titulo":null,"descricao_problema":null,"adicionar_participante":null,"investigacao_pronta":false,"company_context":null}}

Campos do JSON:
- message: string com \\n para quebras de linha
- updates.fase: "contexto"|"contexto_confirmar"|"problema"|"participantes"|"pronto" apenas quando mudar, senão null
- updates.titulo: string apenas quando problema estiver 100% entendido, senão null
- updates.descricao_problema: string detalhada (mín 3 frases) apenas junto com titulo, senão null
- updates.adicionar_participante: objeto {name,whatsapp_number,role,role_description} apenas após confirmação, senão null
- updates.investigacao_pronta: true apenas quando fase muda para "pronto", senão false
- updates.company_context: objeto {company_description,sector,manager_position} apenas quando coletar/atualizar contexto, senão null`
}

async function gerarAliasWorker(companyId: string): Promise<string> {
  const total = await db
    .select({ cnt: count() })
    .from(schema.workers)
    .where(eq(schema.workers.company_id, companyId))
    .get()
  const idx = total?.cnt ?? 0
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let sufixo: string
  if (idx < 26) {
    sufixo = letras[idx]!
  } else {
    const hi = Math.floor((idx - 26) / 26)
    const lo = (idx - 26) % 26
    sufixo = (hi < 26 ? letras[hi]! : String(hi + 1)) + letras[lo]!
  }
  return `Colaborador ${sufixo}`
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)

    const body = await request.json() as {
      messages: ChatMessage[]
      draft: DraftInvestigacao
      managerName: string
    }

    const { messages, draft, managerName } = body

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'Mensagens inválidas' }, { status: 400 })
    }

    // Fetch existing company context from DB
    let existingContext: CompanyContext | null = null
    try {
      const managerRow = await db
        .select({ company_context: schema.managers.company_context })
        .from(schema.managers)
        .where(eq(schema.managers.id, session.managerId))
        .get()
      if (managerRow?.company_context) {
        existingContext = JSON.parse(managerRow.company_context) as CompanyContext
      }
    } catch { /* column may not exist yet or JSON malformed */ }

    const systemPrompt = buildSystemPrompt(managerName, draft, existingContext)

    const msgsMapeadas = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: msgsMapeadas,
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    if (response.usage) {
      logUsage({
        companyId: session.companyId,
        managerId: session.managerId,
        operation: 'investigation_chat',
        model: 'claude-sonnet-4-6',
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }).catch(() => {})
    }

    let parsed = extrairJSON(rawText)

    if (!parsed) {
      console.warn('[chat] Resposta não era JSON, tentando reformatar...')
      const reformatResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: `Você recebeu uma resposta de texto abaixo. Converta-a para o seguinte JSON (e retorne APENAS o JSON, sem nenhum texto extra):
{"message":"<texto da resposta aqui, com \\n para quebras de linha>","updates":{"fase":null,"titulo":null,"descricao_problema":null,"adicionar_participante":null,"investigacao_pronta":false,"company_context":null}}`,
        messages: [{ role: 'user', content: rawText }],
      })
      const reformatText = reformatResponse.content[0].type === 'text' ? reformatResponse.content[0].text : ''
      parsed = extrairJSON(reformatText)
    }

    if (!parsed) {
      console.error('[chat] Falha total ao parsear JSON. Texto bruto:', rawText.slice(0, 200))
      return Response.json({
        message: rawText.trim() || 'Desculpe, tive um problema. Pode repetir?',
        updates: {},
        investigation_id: null,
      }, { status: 200 })
    }

    // Save company_context if AI returned one
    if (parsed.updates?.company_context) {
      try {
        await db.update(schema.managers)
          .set({ company_context: JSON.stringify(parsed.updates.company_context) })
          .where(eq(schema.managers.id, session.managerId))
      } catch (err) {
        console.error('[chat] Falha ao salvar company_context:', err)
      }
    }

    // Normalize WhatsApp if participante returned
    if (parsed.updates?.adicionar_participante) {
      const p = parsed.updates.adicionar_participante
      let num = p.whatsapp_number.replace(/\D/g, '')
      if (num.startsWith('0')) num = num.slice(1)
      if (!num.startsWith('55')) num = '55' + num
      p.whatsapp_number = num
    }

    // Create investigation if ready
    let investigationId: string | null = null
    const prontoAgora = parsed.updates?.investigacao_pronta === true
    const draftComUpdates = {
      ...draft,
      titulo: parsed.updates?.titulo ?? draft.titulo,
      descricao_problema: parsed.updates?.descricao_problema ?? draft.descricao_problema,
      participantes: parsed.updates?.adicionar_participante
        ? [...draft.participantes, parsed.updates.adicionar_participante]
        : draft.participantes,
    }

    if (prontoAgora && draftComUpdates.titulo && draftComUpdates.descricao_problema && draftComUpdates.participantes.length > 0) {
      investigationId = crypto.randomUUID()

      let investigationContextJson: string | null = null
      try {
        const { generateInvestigationContext } = await import('@/lib/ai/context-generator')
        const workerRoles = draftComUpdates.participantes.map(p => ({
          role: p.role,
          role_description: p.role_description,
        }))
        const ctx = await generateInvestigationContext(
          draftComUpdates.descricao_problema,
          workerRoles,
          { companyId: session.companyId, managerId: session.managerId, investigationId }
        )
        investigationContextJson = JSON.stringify(ctx)
      } catch (err) {
        console.error('[chat] context-generator falhou (não bloqueia criação)', err)
      }

      await db.insert(schema.investigations).values({
        id: investigationId,
        company_id: session.companyId,
        manager_id: session.managerId,
        title: draftComUpdates.titulo,
        problem_description: draftComUpdates.descricao_problema,
        status: 'pending',
        investigation_context: investigationContextJson,
      })

      for (const p of draftComUpdates.participantes) {
        const numLimpo = p.whatsapp_number.replace(/\D/g, '')

        let worker = await db
          .select()
          .from(schema.workers)
          .where(eq(schema.workers.whatsapp_number, numLimpo))
          .get()

        if (!worker) {
          const alias = await gerarAliasWorker(session.companyId)
          const workerId = crypto.randomUUID()
          await db.insert(schema.workers).values({
            id: workerId,
            company_id: session.companyId,
            name: p.name,
            role: p.role,
            role_description: p.role_description,
            whatsapp_number: numLimpo,
            anonymous_alias: alias,
            is_active: true,
          })
          worker = await db.select().from(schema.workers).where(eq(schema.workers.id, workerId)).get()!
        }

        await db.insert(schema.investigation_workers).values({
          id: crypto.randomUUID(),
          investigation_id: investigationId,
          worker_id: worker!.id,
          status: 'pending',
          saturation_score: 0,
          manager_notes: null,
        })
      }
    }

    return Response.json({
      message: parsed.message,
      updates: parsed.updates ?? {},
      investigation_id: investigationId,
    }, { status: 200 })

  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/investigations/chat]', msg, error)
    return Response.json({ error: `Erro interno: ${msg}` }, { status: 500 })
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAuth(request)

    const manager = await db
      .select({ name: schema.managers.name })
      .from(schema.managers)
      .where(eq(schema.managers.id, session.managerId))
      .get()

    return Response.json({ managerName: manager?.name ?? 'Gestor' }, { status: 200 })

  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[GET /api/investigations/chat]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
