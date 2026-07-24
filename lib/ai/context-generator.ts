import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/utils/env'
import { parseAIJson } from './utils'
import { logUsage } from './cost-tracker'
import type { InvestigationContext } from './types'

const CONTEXT_GENERATOR_PROMPT = `Você é um especialista em investigação de causa raiz em ambientes corporativos brasileiros.

Você receberá um JSON com:
- problem_description: descrição do problema a investigar
- worker_roles: array de { role, role_description } dos participantes da investigação

Sua tarefa é inferir o domínio e gerar um contexto de investigação adaptado. Retorne APENAS um JSON puro (sem markdown, sem texto extra):

{
  "domain": "nome curto do domínio (ex: 'construção civil', 'supply chain', 'vendas B2B', 'manutenção industrial', 'RH', 'TI')",
  "investigator_persona": "instrução de 2-3 frases dizendo ao engine como se comportar neste domínio específico. Ex: 'Você investiga problemas em canteiros de obras. Foque em sequência de atividades, disponibilidade de insumos e comunicação entre encarregados e operários.'",
  "relevant_ishikawa_categories": ["lista das categorias mais relevantes para este domínio, em ordem de prioridade. Use: mao_de_obra, maquina, metodo, material, meio_ambiente, medicao"],
  "language_guidelines": {
    "operacional": "tom para cargos operacionais (operador, auxiliar, técnico) — ex: 'linguagem simples, direta, sem jargão técnico, perguntas curtas'",
    "tatico": "tom para cargos táticos (supervisor, encarregado, coordenador) — ex: 'linguagem técnica moderada, foco em processos e indicadores'",
    "estrategico": "tom para cargos estratégicos (gerente, diretor, CEO) — ex: 'linguagem executiva, foco em impacto financeiro e decisões'"
  },
  "domain_specific_probes": ["lista de 3-5 aspectos específicos do domínio que devem ser investigados — pontos que frequentemente são causa raiz neste setor e que o engine deve cobrir proativamente"]
}`

function classifyRoleLevel(role: string, roleDescription: string): string {
  const text = `${role} ${roleDescription}`.toLowerCase()
  if (text.match(/diretor|ceo|presidente|vp |vice/)) return 'estrategico'
  if (text.match(/gerente|coordenador|analista|engenheiro|supervisor|líder|lider|head/)) return 'tatico'
  return 'operacional'
}

function buildDefaultContext(problemDescription: string): InvestigationContext {
  return {
    domain: 'operações industriais',
    investigator_persona: 'Você investiga problemas operacionais em empresas brasileiras. Adapte suas perguntas ao cargo e contexto do trabalhador.',
    relevant_ishikawa_categories: ['mao_de_obra', 'metodo', 'maquina', 'material', 'meio_ambiente', 'medicao'],
    language_guidelines: {
      operacional: 'linguagem simples e direta, sem jargão técnico, perguntas curtas',
      tatico: 'linguagem técnica moderada, foco em processos e indicadores',
      estrategico: 'linguagem executiva, foco em impacto e decisões',
    },
    domain_specific_probes: [
      'Verificar se o problema é recorrente ou pontual',
      'Identificar se há falha de comunicação entre níveis hierárquicos',
      'Checar se há recursos (materiais, pessoas, equipamentos) insuficientes',
    ],
  }
}

export { classifyRoleLevel }

export async function generateInvestigationContext(
  problemDescription: string,
  workerRoles: { role: string; role_description: string }[],
  options?: { companyId?: string; managerId?: string; investigationId?: string }
): Promise<InvestigationContext> {
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: CONTEXT_GENERATOR_PROMPT,
      messages: [{
        role: 'user',
        content: JSON.stringify({ problem_description: problemDescription, worker_roles: workerRoles }),
      }],
    })

    if (response.usage && options?.companyId) {
      logUsage({
        companyId: options.companyId,
        managerId: options.managerId,
        investigationId: options.investigationId,
        operation: 'context_generator',
        model: 'claude-sonnet-4-6',
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }).catch(() => {})
    }

    const firstBlock = response.content[0]
    if (firstBlock?.type !== 'text') return buildDefaultContext(problemDescription)

    const parsed = parseAIJson<InvestigationContext>(firstBlock.text)

    // Validação básica
    if (
      typeof parsed.domain !== 'string' ||
      typeof parsed.investigator_persona !== 'string' ||
      !Array.isArray(parsed.relevant_ishikawa_categories) ||
      typeof parsed.language_guidelines !== 'object' ||
      !Array.isArray(parsed.domain_specific_probes)
    ) {
      return buildDefaultContext(problemDescription)
    }

    return parsed
  } catch (err) {
    console.error('[context-generator] falhou, usando default', err)
    return buildDefaultContext(problemDescription)
  }
}
