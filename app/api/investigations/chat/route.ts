import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, count } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ParticipanteConfirmado {
  name: string
  whatsapp_number: string
  role: string
  role_description: string
}

interface DraftInvestigacao {
  fase: 'problema' | 'participantes' | 'pronto'
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
    fase?: 'problema' | 'participantes' | 'pronto'
    titulo?: string | null
    descricao_problema?: string | null
    adicionar_participante?: ParticipanteConfirmado | null
    investigacao_pronta?: boolean
  }
}

// Tenta extrair JSON de uma string que pode ter texto ao redor
function extrairJSON(texto: string): RespostaIA | null {
  // Tentar direto
  try {
    return JSON.parse(texto.trim()) as RespostaIA
  } catch { /* continua */ }

  // Tentar remover markdown ```json ... ```
  const semMarkdown = texto.replace(/^```(?:json)?\s*/im, '').replace(/\s*```$/im, '').trim()
  try {
    return JSON.parse(semMarkdown) as RespostaIA
  } catch { /* continua */ }

  // Tentar achar { ... } no texto
  const primeiroAbre = texto.indexOf('{')
  const ultimoFecha = texto.lastIndexOf('}')
  if (primeiroAbre !== -1 && ultimoFecha !== -1 && ultimoFecha > primeiroAbre) {
    try {
      return JSON.parse(texto.slice(primeiroAbre, ultimoFecha + 1)) as RespostaIA
    } catch { /* continua */ }
  }

  return null
}

function buildSystemPrompt(managerName: string, draft: DraftInvestigacao): string {
  return `INSTRUÇÃO CRÍTICA: Você deve responder SEMPRE e EXCLUSIVAMENTE com um objeto JSON válido. Nunca escreva texto fora do JSON. Nunca use markdown. Sua resposta inteira deve ser parseável por JSON.parse().

Você é o assistente de criação de investigações do Elo, plataforma de inteligência operacional para empresas brasileiras.

CONTEXTO:
- Gestor: ${managerName}
- Fase atual: ${draft.fase}
- Título coletado: ${draft.titulo ?? 'nenhum ainda'}
- Participantes confirmados: ${draft.participantes.length}

FASE "${draft.fase}" — O QUE FAZER AGORA:
${draft.fase === 'problema' ? `Entenda o problema completamente antes de avançar. Precisa ficar claro:
1. O que exatamente está acontecendo
2. Quando/com que frequência ocorre
3. Qual o impacto (financeiro, operacional, segurança)
4. O que já foi tentado para resolver

Faça UMA pergunta por vez. Se o gestor for vago, peça números e exemplos concretos.
Quando as 4 dimensões estiverem claras, defina titulo e descricao_problema no JSON e mude a fase para "participantes".` : ''}
${draft.fase === 'participantes' ? `Colete participantes seguindo esta sequência para cada um:
1. Peça: nome completo, WhatsApp com DDD, cargo (pode pedir os 3 juntos numa mensagem)
2. Após receber esses dados, pergunte o que essa pessoa faz no contexto do problema
3. Com base na resposta, apresente de 4 a 5 bullet points de responsabilidades contextualizadas
4. Pergunte se está correto ou se quer ajustar
5. SÓ APÓS CONFIRMAÇÃO: coloque os dados em "adicionar_participante"
6. Pergunte se há mais participantes
Quando gestor disser que não há mais e tiver pelo menos 1 participante: mude fase para "pronto" e set investigacao_pronta: true` : ''}
${draft.fase === 'pronto' ? `Mande uma mensagem final confirmando que a investigação será criada agora. Não colete mais nada.` : ''}

REGRAS:
- Uma pergunta por vez
- Português brasileiro, direto e amigável
- Emojis com moderação (máx 1 por mensagem)
- Você decide o título — o gestor não precisa sugerir
- Normalizar WhatsApp: só dígitos, com 55 no início

FORMATO OBRIGATÓRIO — retorne exatamente este JSON (substitua os valores):
{"message":"sua mensagem para o gestor","updates":{"fase":null,"titulo":null,"descricao_problema":null,"adicionar_participante":null,"investigacao_pronta":false}}

Campos do JSON:
- message: string com \\n para quebras de linha
- updates.fase: "problema"|"participantes"|"pronto" apenas quando mudar, senão null
- updates.titulo: string apenas quando problema estiver 100% entendido, senão null
- updates.descricao_problema: string detalhada (mín 3 frases) apenas junto com titulo, senão null
- updates.adicionar_participante: objeto {name,whatsapp_number,role,role_description} apenas após confirmação, senão null
- updates.investigacao_pronta: true apenas quando fase muda para "pronto", senão false`
}

async function gerarAliasWorker(companyId: string): Promise<string> {
  const total = await db
    .select({ cnt: count() })
    .from(schema.workers)
    .where(eq(schema.workers.company_id, companyId))
    .get()
  const idx = total?.cnt ?? 0
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const sufixo = idx < 26 ? letras[idx] : String(idx + 1)
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

    const systemPrompt = buildSystemPrompt(managerName, draft)

    const msgsMapeadas = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: msgsMapeadas,
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    let parsed = extrairJSON(rawText)

    // Se JSON falhou, fazer uma segunda chamada curta pedindo reformatação
    if (!parsed) {
      console.warn('[chat] Resposta não era JSON, tentando reformatar...')
      const reformatResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: `Você recebeu uma resposta de texto abaixo. Converta-a para o seguinte JSON (e retorne APENAS o JSON, sem nenhum texto extra):
{"message":"<texto da resposta aqui, com \\n para quebras de linha>","updates":{"fase":null,"titulo":null,"descricao_problema":null,"adicionar_participante":null,"investigacao_pronta":false}}`,
        messages: [{ role: 'user', content: rawText }],
      })
      const reformatText = reformatResponse.content[0].type === 'text' ? reformatResponse.content[0].text : ''
      parsed = extrairJSON(reformatText)
    }

    if (!parsed) {
      // Último recurso: usar o texto bruto como mensagem
      console.error('[chat] Falha total ao parsear JSON. Texto bruto:', rawText.slice(0, 200))
      return Response.json({
        message: rawText.trim() || 'Desculpe, tive um problema. Pode repetir?',
        updates: {},
        investigation_id: null,
      }, { status: 200 })
    }

    // Aplicar normalização do WhatsApp se houver participante
    if (parsed.updates?.adicionar_participante) {
      const p = parsed.updates.adicionar_participante
      let num = p.whatsapp_number.replace(/\D/g, '')
      if (num.startsWith('0')) num = num.slice(1)
      if (!num.startsWith('55')) num = '55' + num
      p.whatsapp_number = num
    }

    // Se investigação pronta, criar no banco
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

      await db.insert(schema.investigations).values({
        id: investigationId,
        company_id: session.companyId,
        manager_id: session.managerId,
        title: draftComUpdates.titulo,
        problem_description: draftComUpdates.descricao_problema,
        status: 'pending',
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
    console.error('[POST /api/investigations/chat]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
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

    const nome = manager?.name ?? 'Gestor'

    return Response.json({ managerName: nome }, { status: 200 })

  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    console.error('[GET /api/investigations/chat]', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
