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

/**
 * Alias → nome real, a partir do cadastro.
 *
 * O nome nunca é gravado junto do relatório nem enviado à IA. Ele entra só na
 * hora de exibir, por três motivos:
 *
 *  1. relatórios emitidos antes desta funcionalidade passam a mostrar o nome,
 *     sem custo de regeneração;
 *  2. corrigir o cadastro de alguém se reflete em tudo que já foi emitido;
 *  3. a devolutiva é derivada do gerencial — se o nome estivesse gravado, cada
 *     etapa dessa derivação seria mais uma chance de ele vazar.
 */
export async function mapaDeNomes(investigationId: string): Promise<Map<string, string>> {
  try {
    const rows = await db
      .select({
        alias: schema.workers.anonymous_alias,
        name: schema.workers.name,
        full_name: schema.workers.full_name,
      })
      .from(schema.investigation_workers)
      .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
      .where(eq(schema.investigation_workers.investigation_id, investigationId))

    const mapa = new Map<string, string>()
    for (const r of rows) {
      const nome = r.full_name?.trim() || r.name?.trim()
      if (nome) mapa.set(r.alias, nome)
    }
    return mapa
  } catch {
    // Sem os nomes o relatório continua utilizável — não vale derrubar a página
    return new Map()
  }
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Concordância ao trocar o alias pelo nome.
 *
 * "Colaborador" é masculino; a pessoa por trás dele pode não ser. Trocar
 * cru produziria "o relato do Lethicia". Como o cadastro não guarda gênero e
 * inferir pelo nome erraria, a saída é desfazer o artigo: o que sobra vale
 * para qualquer pessoa. A preposição é preservada.
 */
const CONCORDANCIA: Record<string, string> = {
  o: '', a: '', os: '', as: '',
  do: 'de ', da: 'de ', dos: 'de ', das: 'de ',
  ao: 'a ', à: 'a ', aos: 'a ', às: 'a ',
  pelo: 'por ', pela: 'por ', pelos: 'por ', pelas: 'por ',
  no: 'em ', na: 'em ', nos: 'em ', nas: 'em ',
}

/**
 * Troca toda menção a alias por nome real, em qualquer profundidade.
 *
 * Não basta resolver os campos estruturados: a IA também escreve o alias dentro
 * da prosa ("Colaborador G nega assinatura..."), e era justamente aí que o
 * relatório do gestor continuava anônimo. Como a troca é textual, ela alcança
 * causa raiz, Ishikawa, mapa de evidências, divergências, observações
 * sensíveis e plano de ação de uma vez — inclusive em relatórios antigos.
 *
 * Aliases mais longos primeiro: "Colaborador AB" tem de casar antes de
 * "Colaborador A".
 */
export function identificarFontes<T>(dados: T, nomes: Map<string, string>): T {
  if (nomes.size === 0) return dados

  const pares = [...nomes.entries()].sort((a, b) => b[0].length - a[0].length)
  const alias = pares.map(([a]) => escaparRegex(a)).join('|')

  const conectores = Object.keys(CONCORDANCIA).sort((a, b) => b.length - a.length).join('|')
  // Limites em Unicode, não \b: "à" não é \w, e com \b a crase escaparia da troca
  const fora = '(?<![\\p{L}\\p{N}])'
  const regex = new RegExp(
    `(?:${fora}(${conectores})\\s+)?${fora}(${alias})(?![\\p{L}\\p{N}])`,
    'giu'
  )

  const porAliasMinusculo = new Map([...nomes].map(([a, n]) => [a.toLowerCase(), n]))

  const trocar = (valor: unknown): unknown => {
    if (typeof valor === 'string') {
      return valor.replace(regex, (m, conector: string | undefined, achado: string) => {
        const nome = porAliasMinusculo.get(achado.toLowerCase())
        if (!nome) return m
        if (!conector) return nome
        const prefixo = CONCORDANCIA[conector.toLowerCase()] ?? `${conector} `
        // Se o conector abria a frase, quem abre agora é o que sobrou dele
        return /^[A-ZÀ-Þ]/.test(conector) && prefixo
          ? prefixo.charAt(0).toUpperCase() + prefixo.slice(1) + nome
          : prefixo + nome
      })
    }
    if (Array.isArray(valor)) return valor.map(trocar)
    if (valor && typeof valor === 'object') {
      return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, trocar(v)]))
    }
    return valor
  }

  return trocar(dados) as T
}

/**
 * Anexa o nome a cada fonte preservando o alias.
 *
 * Só no anexo de fontes o alias continua visível ao lado do nome — é ele que
 * permite ao gestor cruzar este relatório com a conversa original na
 * plataforma. No resto do documento o alias dá lugar ao nome.
 */
export function enriquecerFontes<T extends { alias: string }>(
  fontes: T[],
  nomes: Map<string, string>
): (T & { name?: string })[] {
  return fontes.map(f => {
    const nome = nomes.get(f.alias)
    return nome ? { ...f, name: nome } : f
  })
}

/** Mensagens de um único worker — usado nas fases que processam fonte a fonte. */
export function filtrarPorAlias(msgs: ReportMessageEntry[], alias: string): ReportMessageEntry[] {
  return msgs.filter(m => m.alias === alias)
}

/**
 * O nome real não entra aqui, nem no relatório gerencial.
 *
 * Ele não acrescenta nada à análise — alias e cargo bastam para a IA cruzar
 * fontes — e mantê-lo fora significa que nenhum nome de trabalhador trafega
 * para a Anthropic nem fica gravado no relatório. Quem precisa saber quem
 * falou é o gestor, na tela: a identificação é feita ao exibir, por
 * `mapaDeNomes` + `identificarFontes`.
 */
export async function montarEntradaRelatorio(
  investigationId: string
): Promise<ReportInputData> {
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
      return {
        alias: info.alias,
        role: info.role,
        direction: m.direction as 'outbound' | 'inbound',
        content: m.content as string,
        key_points_extracted: parseJson<string[]>(m.key_points_extracted),
      }
    })

  const descartadasSemConteudo = msgRows.length - allMessages.length

  return { allMessages, workerAliases, aliasMap, descartadasSemConteudo }
}
