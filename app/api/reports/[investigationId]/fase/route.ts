export const maxDuration = 60

import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'
import { gerarAnalise, gerarFontes, gerarRecomendacoes } from '@/lib/ai/report-phases'
import { montarEntradaRelatorio } from '@/lib/ai/report-input'
import { canSpendOnAi } from '@/lib/billing/plan-limits'
import { logError } from '@/lib/monitoring/logger'
import type { IshikawaBreakdownOutput, SourceSummaryOutput, WorkerAlias } from '@/lib/ai/types'

export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ investigationId: string }> }

type Fase = 'analise' | 'fontes' | 'recomendacoes'

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

/**
 * Executa uma fase da geração do relatório.
 *
 * O relatório é montado em etapas porque não cabe numa única execução da
 * função. Cada fase grava o que produziu, então uma falha no meio não descarta
 * o que já ficou pronto — basta repetir a fase que faltou.
 *
 * Corpo: { fase, aliases? }
 *   - analise       → causa raiz, confiança e Ishikawa (cria o relatório)
 *   - fontes        → resumo das fontes indicadas em `aliases` (processado em lotes)
 *   - recomendacoes → recomendações, a partir do que as fases anteriores gravaram
 */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { investigationId } = await params
    const session = await requireAuth(request)

    const body = await request.json().catch(() => ({})) as { fase?: unknown; aliases?: unknown }
    const fase = body.fase as Fase
    if (!['analise', 'fontes', 'recomendacoes'].includes(fase)) {
      return Response.json({ error: 'Fase inválida.' }, { status: 400 })
    }

    const investigation = await db
      .select({
        id: schema.investigations.id,
        title: schema.investigations.title,
        problem_description: schema.investigations.problem_description,
        status: schema.investigations.status,
        company_id: schema.investigations.company_id,
      })
      .from(schema.investigations)
      .where(and(
        eq(schema.investigations.id, investigationId),
        eq(schema.investigations.company_id, session.companyId),
      ))
      .get()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    if (fase === 'analise' && investigation.status !== 'completed' && investigation.status !== 'saturated') {
      return Response.json(
        { error: 'A investigação precisa estar com a coleta encerrada para gerar o relatório.' },
        { status: 400 }
      )
    }

    const orcamento = await canSpendOnAi(investigation.company_id)
    if (!orcamento.ok) return Response.json({ error: orcamento.reason }, { status: 403 })

    const ctx = {
      companyId: investigation.company_id,
      managerId: session.managerId,
      investigationId,
    }
    const dadosInvestigacao = {
      title: investigation.title,
      problem_description: investigation.problem_description,
    }

    const { allMessages, workerAliases, descartadasSemConteudo } = await montarEntradaRelatorio(investigationId)

    // ── Fase: análise ────────────────────────────────────────────────────────
    if (fase === 'analise') {
      const { saida, telemetria } = await gerarAnalise(
        { investigation: dadosInvestigacao, allMessages, workerAliases },
        ctx
      )

      const valores = {
        root_cause:               saida.root_cause,
        confidence_score:         saida.confidence_score,
        confidence_justification: saida.confidence_justification,
        ishikawa_breakdown:       JSON.stringify(saida.ishikawa_breakdown),
        generated_at:             new Date().toISOString(),
      }

      const existente = await db
        .select({ id: schema.reports.id })
        .from(schema.reports)
        .where(eq(schema.reports.investigation_id, investigationId))
        .get()

      if (existente) {
        // Zera as partes das fases seguintes — senão um relatório novo ficaria
        // com fontes e evidências do anterior, que já não correspondem
        await db.update(schema.reports).set({
          ...valores,
          sources_summary: JSON.stringify([]),
          recommendations: JSON.stringify([]),
          evidence_map: null,
          divergences: null,
          sensitive_observations: null,
        }).where(eq(schema.reports.investigation_id, investigationId))
      } else {
        await db.insert(schema.reports).values({
          id: crypto.randomUUID(),
          investigation_id: investigationId,
          ...valores,
          sources_summary: JSON.stringify([]),
          recommendations: JSON.stringify([]),
        })
      }

      return Response.json({
        data: {
          root_cause: saida.root_cause,
          confidence_score: saida.confidence_score,
          // O cliente usa isto para saber quantos lotes de fontes rodar
          aliases: workerAliases.map(w => w.alias),
        },
        diagnostico: {
          ...telemetria,
          // Total no banco vs. o que chegou à IA — se houver diferença, a tela
          // mostra quantas mensagens ficaram de fora e por quê
          mensagens_no_banco: allMessages.length + descartadasSemConteudo,
          descartadas_sem_conteudo: descartadasSemConteudo,
          participantes: workerAliases.length,
        },
      })
    }

    // As demais fases dependem da análise já gravada
    const relatorio = await db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, investigationId))
      .get()

    if (!relatorio) {
      return Response.json({ error: 'Rode a fase de análise primeiro.' }, { status: 400 })
    }

    // ── Fase: fontes (lote) ──────────────────────────────────────────────────
    if (fase === 'fontes') {
      const pedidos = Array.isArray(body.aliases)
        ? (body.aliases as unknown[]).filter((a): a is string => typeof a === 'string')
        : []
      if (pedidos.length === 0) {
        return Response.json({ error: 'Informe os aliases do lote.' }, { status: 400 })
      }

      const fontesDoLote: WorkerAlias[] = workerAliases.filter(w => pedidos.includes(w.alias))
      const msgsDoLote = allMessages.filter(m => pedidos.includes(m.alias))

      const { fontes: novas, telemetria } = await gerarFontes(
        {
          investigation: dadosInvestigacao,
          rootCause: relatorio.root_cause,
          fontes: fontesDoLote,
          allMessages: msgsDoLote,
        },
        ctx
      )

      // Acumula com os lotes anteriores, substituindo eventual repetição
      const atuais = parseJson<SourceSummaryOutput[]>(relatorio.sources_summary, [])
      const mantidas = atuais.filter(s => !pedidos.includes(s.alias))
      const total = [...mantidas, ...novas]

      await db.update(schema.reports)
        .set({ sources_summary: JSON.stringify(total) })
        .where(eq(schema.reports.investigation_id, investigationId))

      return Response.json({
        data: { fontes_no_lote: novas.length, total: total.length },
        diagnostico: {
          ...telemetria,
          lote: pedidos,
          pontos_extraidos: novas.reduce((acc, f) => acc + f.key_points.length, 0),
        },
      })
    }

    // ── Fase: recomendações ──────────────────────────────────────────────────
    const { recomendacoes: recs, telemetria } = await gerarRecomendacoes(
      {
        investigation: dadosInvestigacao,
        rootCause: relatorio.root_cause,
        ishikawa: parseJson<IshikawaBreakdownOutput>(relatorio.ishikawa_breakdown, {} as IshikawaBreakdownOutput),
        sourcesSummary: parseJson<SourceSummaryOutput[]>(relatorio.sources_summary, []),
      },
      ctx
    )

    await db.update(schema.reports)
      .set({ recommendations: JSON.stringify(recs) })
      .where(eq(schema.reports.investigation_id, investigationId))

    // Com a análise, as fontes e as recomendações gravadas, a investigação está
    // concluída — o plano e as evidências enriquecem, mas não são pré-requisito
    if (investigation.status !== 'completed') {
      await db.update(schema.investigations)
        .set({ status: 'completed', completed_at: new Date().toISOString() })
        .where(eq(schema.investigations.id, investigationId))
    }

    return Response.json({
      data: { recomendacoes: recs.length },
      diagnostico: { ...telemetria, itens: recs.length },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    await logError('api/reports/fase', error)
    return Response.json({ error: 'Falha ao executar esta etapa do relatório.' }, { status: 500 })
  }
}
