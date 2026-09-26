export const maxDuration = 60

import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { generateEvidenceLayer } from '@/lib/ai/evidence-generator'
import { montarEntradaRelatorio } from '@/lib/ai/report-input'
import { canSpendOnAi } from '@/lib/billing/plan-limits'
import { logError } from '@/lib/monitoring/logger'

export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ investigationId: string }> }

/**
 * Segunda fase do relatório gerencial: mapa de evidências, divergências e
 * observações sensíveis.
 *
 * Separada da primeira porque o limite de tempo da função serverless é de 60s
 * e o gargalo é a geração de tokens de saída. Numa investigação com 6 fontes,
 * gerar tudo de uma vez ultrapassava o limite e a função era morta, perdendo
 * também o relatório principal. Em duas chamadas, cada uma cabe.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { investigationId } = await params
    const session = await requireAuth(request)

    const investigation = await db
      .select({
        id: schema.investigations.id,
        title: schema.investigations.title,
        problem_description: schema.investigations.problem_description,
        company_id: schema.investigations.company_id,
      })
      .from(schema.investigations)
      .where(and(
        eq(schema.investigations.id, investigationId),
        eq(schema.investigations.company_id, session.companyId),
      ))
      .get()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    const relatorio = await db
      .select({ id: schema.reports.id, root_cause: schema.reports.root_cause })
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

    if (!relatorio) {
      return Response.json({ error: 'Gere primeiro o relatório principal.' }, { status: 400 })
    }

    const orcamento = await canSpendOnAi(investigation.company_id)
    if (!orcamento.ok) return Response.json({ error: orcamento.reason }, { status: 403 })

    const { allMessages, workerAliases } = await montarEntradaRelatorio(investigationId, { comNomes: true })

    const { saida, telemetria } = await generateEvidenceLayer({
      investigation: { title: investigation.title, problem_description: investigation.problem_description },
      allMessages,
      workerAliases,
      rootCause: relatorio.root_cause,
      companyId: investigation.company_id,
      managerId: session.managerId,
      investigationId,
    })

    await db
      .update(schema.reports)
      .set({
        evidence_map: JSON.stringify(saida.evidence_map),
        divergences: JSON.stringify(saida.divergences),
        sensitive_observations: JSON.stringify(saida.sensitive_observations),
      })
      .where(eq(schema.reports.investigation_id, investigationId))

    return Response.json({
      data: saida,
      diagnostico: {
        ...telemetria,
        itens: saida.evidence_map.length + saida.divergences.length + saida.sensitive_observations.length,
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    await logError('api/reports/evidencias', error)
    return Response.json({ error: 'Não foi possível gerar a camada de evidências.' }, { status: 500 })
  }
}
