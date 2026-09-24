/**
 * Formatação de datas vindas do banco.
 *
 * ─── O problema que isto resolve ────────────────────────────────────────────
 *
 * O SQLite grava com `datetime('now')`, que produz UTC no formato
 * "2026-09-24 19:09:00" — sem nenhum marcador de fuso.
 *
 * Ao fazer `new Date("2026-09-24 19:09:00")`, o JavaScript interpreta a string
 * como horário LOCAL, não como UTC. O resultado é que 19:09 UTC aparecia como
 * 19:09 na tela, quando o correto em Brasília seria 16:09 — três horas a mais.
 *
 * ─── A correção ─────────────────────────────────────────────────────────────
 *
 * 1. `parseDbDate` acrescenta 'Z' quando a string não traz fuso, forçando a
 *    leitura como UTC.
 * 2. Toda formatação fixa `timeZone: 'America/Sao_Paulo'`. Sem isso, o
 *    servidor da Vercel (que roda em UTC) renderizaria a hora de Londres em
 *    páginas server-side, mesmo com o parse correto.
 *
 * Use sempre estas funções para exibir timestamps do banco — nunca
 * `new Date(x).toLocaleString()` direto.
 */

const TZ = 'America/Sao_Paulo'
const LOCALE = 'pt-BR'

/**
 * Converte um timestamp do banco em Date, tratando-o como UTC.
 * Retorna null quando a string é inválida ou vazia.
 */
export function parseDbDate(valor: string | null | undefined): Date | null {
  if (!valor) return null

  const texto = valor.trim()

  // Já tem fuso explícito (Z ou ±HH:MM) — respeitar
  const temFuso = /[Zz]$/.test(texto) || /[+-]\d{2}:?\d{2}$/.test(texto)

  // "2026-09-24 19:09:00" → "2026-09-24T19:09:00"
  const iso = texto.includes('T') ? texto : texto.replace(' ', 'T')

  const d = new Date(temFuso ? iso : iso + 'Z')
  return isNaN(d.getTime()) ? null : d
}

/** "24/09/2026 16:09" */
export function fmtDataHora(valor: string | null | undefined, fallback = '—'): string {
  const d = parseDbDate(valor)
  if (!d) return fallback
  return d.toLocaleString(LOCALE, {
    timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** "24/09 16:09" — para listas onde o ano é redundante */
export function fmtDataHoraCurta(valor: string | null | undefined, fallback = '—'): string {
  const d = parseDbDate(valor)
  if (!d) return fallback
  return d.toLocaleString(LOCALE, {
    timeZone: TZ,
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** "16:09" — usado nas bolhas de mensagem */
export function fmtHora(valor: string | null | undefined, fallback = ''): string {
  const d = parseDbDate(valor)
  if (!d) return fallback
  return d.toLocaleTimeString(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

/** "24/09/2026" */
export function fmtData(valor: string | null | undefined, fallback = '—'): string {
  const d = parseDbDate(valor)
  if (!d) return fallback
  return d.toLocaleDateString(LOCALE, { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** "24 de setembro de 2026" */
export function fmtDataExtenso(valor: string | null | undefined, fallback = '—'): string {
  const d = parseDbDate(valor)
  if (!d) return fallback
  return d.toLocaleDateString(LOCALE, { timeZone: TZ, day: '2-digit', month: 'long', year: 'numeric' })
}

/** "setembro de 2026" */
export function fmtMesAno(valor: string | null | undefined, fallback = '—'): string {
  const d = parseDbDate(valor)
  if (!d) return fallback
  return d.toLocaleDateString(LOCALE, { timeZone: TZ, month: 'long', year: 'numeric' })
}

/** "24 set 26" — compacto para tabelas densas */
export function fmtDataCompacta(valor: string | null | undefined, fallback = '—'): string {
  const d = parseDbDate(valor)
  if (!d) return fallback
  return d.toLocaleDateString(LOCALE, { timeZone: TZ, day: '2-digit', month: 'short', year: '2-digit' })
}

/** "2026-09-24" no fuso de Brasília — para agrupar por dia sem pular data */
export function diaBrasilia(valor: string | null | undefined): string {
  const d = parseDbDate(valor)
  if (!d) return ''
  // en-CA produz YYYY-MM-DD
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}
