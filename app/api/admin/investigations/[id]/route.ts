import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { eq, inArray } from 'drizzle-orm'
import { logError, logWarn } from '@/lib/monitoring/logger'

export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * GET — resumo do que será apagado, para a confirmação na interface.
 * Permite mostrar ao admin o volume real antes de ele confirmar.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    await requireAdmin(request)
    const { id } = await params

    const inv = await db
      .select({
        id: schema.investigations.id,
        title: schema.investigations.title,
        status: schema.investigations.status,
        company_id: schema.investigations.company_id,
      })
      .from(schema.investigations)
      .where(eq(schema.investigations.id, id))
      .get()

    if (!inv) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    // Só o id: basta para contar, evita trafegar dados desnecessários e não
    // quebra se o schema tiver colunas que o banco ainda não recebeu
    const [msgs, workers, reports] = await Promise.all([
      db.select({ id: schema.messages.id }).from(schema.messages).where(eq(schema.messages.investigation_id, id)),
      db.select({ id: schema.investigation_workers.id }).from(schema.investigation_workers).where(eq(schema.investigation_workers.investigation_id, id)),
      db.select({ id: schema.reports.id }).from(schema.reports).where(eq(schema.reports.investigation_id, id)),
    ])

    return Response.json({
      data: {
        investigation: inv,
        vai_apagar: {
          mensagens: msgs.length,
          participantes: workers.length,
          relatorios: reports.length,
        },
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    await logError('api/admin/investigations/[id] GET', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * DELETE — apaga a investigação e tudo que depende dela.
 *
 * Restrito a admin. Um gestor não pode apagar porque o limite de investigações
 * do plano conta o total criado — se ele pudesse apagar, contornaria a cota
 * apagando investigações antigas.
 *
 * Os registros de `api_usage_logs` NÃO são apagados: são o histórico de custo
 * da empresa. Apagá-los falsearia a contabilidade e reduziria o custo
 * acumulado, abrindo brecha no teto de gastos do plano. A referência à
 * investigação é apenas anulada.
 */
export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    await requireAdmin(request)
    const { id } = await params

    const inv = await db
      .select({
        id: schema.investigations.id,
        title: schema.investigations.title,
        company_id: schema.investigations.company_id,
      })
      .from(schema.investigations)
      .where(eq(schema.investigations.id, id))
      .get()

    if (!inv) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    // Ordem obrigatória — das folhas para a raiz, respeitando as foreign keys
    const relatorios = await db
      .select({ id: schema.reports.id })
      .from(schema.reports)
      .where(eq(schema.reports.investigation_id, id))

    let acoesApagadas = 0
    if (relatorios.length > 0) {
      const reportIds = relatorios.map(r => r.id)
      const acoes = await db
        .select({ id: schema.action_items.id })
        .from(schema.action_items)
        .where(inArray(schema.action_items.report_id, reportIds))
      acoesApagadas = acoes.length

      await db.delete(schema.action_items).where(inArray(schema.action_items.report_id, reportIds))
      await db.delete(schema.reports).where(eq(schema.reports.investigation_id, id))
    }

    const msgs = await db.select({ id: schema.messages.id }).from(schema.messages).where(eq(schema.messages.investigation_id, id))
    await db.delete(schema.messages).where(eq(schema.messages.investigation_id, id))

    const iws = await db.select({ id: schema.investigation_workers.id }).from(schema.investigation_workers).where(eq(schema.investigation_workers.investigation_id, id))
    await db.delete(schema.investigation_workers).where(eq(schema.investigation_workers.investigation_id, id))

    // Preserva o histórico de custo, apenas soltando o vínculo
    await db
      .update(schema.api_usage_logs)
      .set({ investigation_id: null })
      .where(eq(schema.api_usage_logs.investigation_id, id))

    await db.delete(schema.investigations).where(eq(schema.investigations.id, id))

    await logWarn('api/admin/investigations/[id] DELETE', `Investigação apagada: "${inv.title}"`, {
      companyId: inv.company_id,
      extra: {
        investigationId: id,
        mensagens: msgs.length,
        participantes: iws.length,
        relatorios: relatorios.length,
        acoes: acoesApagadas,
      },
    })

    return Response.json({
      data: {
        apagado: true,
        titulo: inv.title,
        detalhes: {
          mensagens: msgs.length,
          participantes: iws.length,
          relatorios: relatorios.length,
          acoes: acoesApagadas,
        },
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    await logError('api/admin/investigations/[id] DELETE', error)
    return Response.json({ error: 'Erro interno ao apagar' }, { status: 500 })
  }
}
