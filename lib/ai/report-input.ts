import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import type { ReportMessageEntry, WorkerAlias } from './types'

/**
 * Montagem do payload enviado à IA para gerar relatório.
 *
 * Centralizado porque três rotas precisam exatamente do mesmo recorte, e
 * porque o tamanho deste payload é o que determina se a geração cabe no tempo
 * limite da função — regra que não pode divergir entre elas.
 *
 * As mensagens "outbound" são as perguntas feitas pela própria IA. Elas dão
 * contexto à resposta seguinte, mas não são evidência: o que o relatório
 * analisa é o que o trabalhador respondeu. Por isso são truncadas, enquanto as
 * respostas ("inbound") vão inteiras.
 */

const LIMITE_PERGUNTA = 160   // caracteres — o suficiente para saber o que foi perguntado
const LIMITE_RESPOSTA = 2000  // corta só respostas realmente longas

function parseJson<T>(raw: unknown): T | undefined {
  if (typeof raw !== 'string') return Array.isArray(raw) ? (raw as T) : undefined
  try { return JSON.parse(raw) as T } catch { return undefined }
}

function truncar(texto: string, limite: number): string {
  return texto.length <= limite ? texto : texto.slice(0, limite) + '…'
}

export interface ReportInputData {
  allMessages: ReportMessageEntry[]
  workerAliases: WorkerAlias[]
  aliasMap: Map<string, { alias: string; role: string }>
}

export async function montarEntradaRelatorio(investigationId: string): Promise<ReportInputData> {
  const iwRows = await db
    .select({
      worker_id: schema.investigation_workers.worker_id,
      alias: schema.workers.anonymous_alias,
      role: schema.workers.role,
    })
    .from(schema.investigation_workers)
    .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
    .where(eq(schema.investigation_workers.investigation_id, investigationId))

  const aliasMap = new Map<string, { alias: string; role: string }>()
  const workerAliases: WorkerAlias[] = []
  for (const row of iwRows) {
    aliasMap.set(row.worker_id, { alias: row.alias, role: row.role })
    workerAliases.push({ alias: row.alias, role: row.role })
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
      const ehPergunta = m.direction === 'outbound'
      return {
        alias: info.alias,
        role: info.role,
        direction: m.direction as 'outbound' | 'inbound',
        content: truncar(m.content as string, ehPergunta ? LIMITE_PERGUNTA : LIMITE_RESPOSTA),
        key_points_extracted: parseJson<string[]>(m.key_points_extracted),
      }
    })

  return { allMessages, workerAliases, aliasMap }
}
