import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import type { ReportMessageEntry, WorkerAlias } from './types'

/**
 * Montagem do payload enviado à IA para gerar relatório.
 *
 * Nada é truncado: o conteúdo integral das conversas é o insumo do relatório, e
 * cortar entrada para caber no tempo limite significaria produzir um
 * diagnóstico sobre evidência incompleta. O tempo é resolvido dividindo a
 * geração em fases (ver lib/ai/report-phases.ts), não descartando dado.
 */

function parseJson<T>(raw: unknown): T | undefined {
  if (typeof raw !== 'string') return Array.isArray(raw) ? (raw as T) : undefined
  try { return JSON.parse(raw) as T } catch { return undefined }
}

export interface ReportInputData {
  allMessages: ReportMessageEntry[]
  workerAliases: WorkerAlias[]
  aliasMap: Map<string, { alias: string; role: string }>
  /**
   * Mensagens existentes no banco que ficaram de fora por não terem conteúdo —
   * tipicamente áudios cuja transcrição falhou. Exposto para que o gestor veja
   * na tela que aquela informação não chegou à IA, em vez de o descarte
   * acontecer em silêncio.
   */
  descartadasSemConteudo: number
}

/** Mensagens de um único worker — usado nas fases que processam fonte a fonte. */
export function filtrarPorAlias(msgs: ReportMessageEntry[], alias: string): ReportMessageEntry[] {
  return msgs.filter(m => m.alias === alias)
}

/**
 * @param comNomes  true no relatório gerencial, onde a liderança precisa saber
 *   quem disse o quê. Sempre false na devolutiva aos participantes: lá o nome
 *   não pode sequer chegar à IA, para não haver como vazar.
 */
export async function montarEntradaRelatorio(
  investigationId: string,
  { comNomes = false }: { comNomes?: boolean } = {}
): Promise<ReportInputData> {
  const iwRows = await db
    .select({
      worker_id: schema.investigation_workers.worker_id,
      alias: schema.workers.anonymous_alias,
      role: schema.workers.role,
      name: schema.workers.name,
      full_name: schema.workers.full_name,
    })
    .from(schema.investigation_workers)
    .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
    .where(eq(schema.investigation_workers.investigation_id, investigationId))

  const aliasMap = new Map<string, { alias: string; role: string; name?: string }>()
  const workerAliases: WorkerAlias[] = []
  for (const row of iwRows) {
    // full_name quando existe, senão o nome curto do cadastro
    const nome = comNomes ? ((row.full_name?.trim() || row.name?.trim()) ?? undefined) : undefined
    aliasMap.set(row.worker_id, { alias: row.alias, role: row.role, name: nome })
    workerAliases.push({ alias: row.alias, role: row.role, ...(nome ? { name: nome } : {}) })
  }

  const msgRows = await db
    .select({
      worker_id: schema.messages.worker_id,
      direction: schema.messages.direction,
      content: schema.messages.content,
      key_points_extracted: schema.messages.key_points_extracted,
    })
    .from(schema.messages)
    .where(eq(schema.messages.investigation_id, investigationId))
    .orderBy(schema.messages.created_at)

  const allMessages: ReportMessageEntry[] = msgRows
    .filter(m => m.content !== null)
    .map(m => {
      const info = aliasMap.get(m.worker_id) ?? { alias: 'Colaborador', role: '' }
      return {
        alias: info.alias,
        role: info.role,
        ...(info.name ? { name: info.name } : {}),
        direction: m.direction as 'outbound' | 'inbound',
        content: m.content as string,
        key_points_extracted: parseJson<string[]>(m.key_points_extracted),
      }
    })

  const descartadasSemConteudo = msgRows.length - allMessages.length

  return { allMessages, workerAliases, aliasMap, descartadasSemConteudo }
}
