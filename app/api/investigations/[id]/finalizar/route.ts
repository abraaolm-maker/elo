import { requireAuth, isUnauthorizedError } from '@/lib/auth/middleware'
import { db, schema } from '@/lib/db'
import { eq, and, ne } from 'drizzle-orm'
import { logError, logWarn } from '@/lib/monitoring/logger'

export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * Encerra a coleta de respostas.
 *
 * Passa a investigação para 'saturated', o que faz as rotas do trabalhador
 * recusarem novas mensagens. O relatório é gerado em seguida, por
 * POST /api/reports/[investigationId] — mantido separado para que o gestor
 * possa reprocessar o relatório sem reabrir a coleta.
 *
 * Pode ser chamado a qualquer momento enquanto a investigação está ativa: o
 * gestor pode encerrar antes de todos saturarem, se já tiver o que precisa.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const session = await requireAuth(request)

    const investigation = await db
      .select({
        id: schema.investigations.id,
        status: schema.investigations.status,
        company_id: schema.investigations.company_id,
      })
      .from(schema.investigations)
      .where(and(eq(schema.investigations.id, id), eq(schema.investigations.company_id, session.companyId)))
      .get()

    if (!investigation) return Response.json({ error: 'Investigação não encontrada.' }, { status: 404 })

    if (investigation.status === 'completed') {
      return Response.json({ error: 'Esta investigação já foi concluída.' }, { status: 400 })
    }
    if (investigation.status === 'cancelled') {
      return Response.json({ error: 'Esta investigação foi cancelada.' }, { status: 400 })
    }
    if (investigation.status === 'pending') {
      return Response.json({ error: 'A investigação ainda não foi iniciada.' }, { status: 400 })
    }

    // Participantes que ainda não terminaram: se responderam algo, ficam como
    // 'saturated' (contribuíram); se nunca responderam, 'unresponsive'. A
    // distinção importa porque o relatório trata as duas coisas de forma
    // diferente ao avaliar a convergência entre fontes.
    const pendentes = await db
      .select({
        iw_id: schema.investigation_workers.id,
        worker_id: schema.investigation_workers.worker_id,
        status: schema.investigation_workers.status,
      })
      .from(schema.investigation_workers)
      .where(and(
        eq(schema.investigation_workers.investigation_id, id),
        ne(schema.investigation_workers.status, 'saturated'),
      ))

    let encerradosComResposta = 0
    let semResposta = 0

    for (const p of pendentes) {
      if (p.status === 'unresponsive') { semResposta++; continue }

      const respostas = await db
        .select({ id: schema.messages.id })
        .from(schema.messages)
        .where(and(
          eq(schema.messages.investigation_id, id),
          eq(schema.messages.worker_id, p.worker_id),
          eq(schema.messages.direction, 'inbound'),
        ))

      const novoStatus = respostas.length > 0 ? 'saturated' : 'unresponsive'
      if (respostas.length > 0) encerradosComResposta++
      else semResposta++

      await db
        .update(schema.investigation_workers)
        .set({ status: novoStatus })
        .where(eq(schema.investigation_workers.id, p.iw_id))
    }

    await db
      .update(schema.investigations)
      .set({ status: 'saturated' })
      .where(eq(schema.investigations.id, id))

    await logWarn('api/investigations/finalizar', 'Coleta encerrada manualmente pelo gestor', {
      companyId: investigation.company_id,
      investigationId: id,
      extra: { encerradosComResposta, semResposta },
    })

    return Response.json({
      data: {
        status: 'saturated',
        encerrados_com_resposta: encerradosComResposta,
        sem_resposta: semResposta,
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: 'Não autenticado' }, { status: 401 })
    await logError('api/investigations/finalizar', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
