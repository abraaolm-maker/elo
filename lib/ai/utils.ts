/**
 * parseAIJson — parse JSON retornado pela Claude API.
 *
 * O modelo às vezes envolve a resposta em blocos markdown (```json ... ```).
 * Esta função faz strip desse wrapper antes de tentar o JSON.parse,
 * garantindo robustez independente do comportamento do modelo.
 */
export function parseAIJson<T>(raw: string): T {
  // 1. Tentar parse direto
  const direct = raw.trim()
  try { return JSON.parse(direct) as T } catch { /* continua */ }

  // 2. Strip bloco markdown ```json ... ``` ou ``` ... ```
  const stripped = direct
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
  try { return JSON.parse(stripped) as T } catch { /* continua */ }

  // 3. Extrair primeiro objeto JSON entre { e } (ou array entre [ e ])
  const objMatch = raw.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) as T } catch { /* continua */ }
  }
  const arrMatch = raw.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]) as T } catch { /* continua */ }
  }

  const preview = raw.slice(0, 400).replace(/\n/g, '\\n')
  throw new Error(`Claude retornou JSON inválido.\nPrimeiros 400 chars: ${preview}`)
}
