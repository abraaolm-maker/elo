import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

/**
 * Marca a investigação como saturada quando todos os participantes terminaram.
 *
 * ─── Por que NÃO gera o relatório aqui ──────────────────────────────────────
 *
 * Antes o relatório era gerado automaticamente neste ponto e a investigação ia
 * direto para "completed". Isso tirava do gestor a decisão de encerrar: ele
 * podia querer incluir mais um participante, reler as conversas antes de
 * concluir, ou simplesmente conferir o que foi coletado.
 *
 * Agora a investigação para em "saturated" — coleta encerrada, relatório
 * pendente — e o gestor decide quando gerar, pelo botão "Encerrar e gerar
 * relatório". A geração vive em POST /api/reports/[investigationId].
 *
 * @returns true se a investigação passou para 'saturated' nesta chamada
 */
export async function marcarSaturadaSeTodosTerminaram(investigationId: string): Promise<boolean> {
  const participantes = await db
    .select({ status: schema.investigation_workers.status })
    .from(schema.investigation_workers)
    .where(eq(schema.investigation_workers.investigation_id, investigationId))
    .all()

  if (participantes.length === 0) return false

  const todosTerminaram = participantes.every(
    p => p.status === 'saturated' || p.status === 'unresponsive'
  )
  if (!todosTerminaram) return false

  const inv = await db
    .select({ status: schema.investigations.status })
    .from(schema.investigations)
    .where(eq(schema.investigations.id, investigationId))
    .get()

  // Só avança a partir de 'active' — não mexe em algo já encerrado ou cancelado
  if (!inv || inv.status !== 'active') return false

  await db
    .update(schema.investigations)
    .set({ status: 'saturated' })
    .where(eq(schema.investigations.id, investigationId))

  return true
}
