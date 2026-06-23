/**
 * parseAIJson — parse JSON retornado pela Claude API.
 *
 * O modelo às vezes envolve a resposta em blocos markdown (```json ... ```).
 * Esta função faz strip desse wrapper antes de tentar o JSON.parse,
 * garantindo robustez independente do comportamento do modelo.
 */
export function parseAIJson<T>(raw: string): T {
  // Strip bloco markdown: ```json\n...\n``` ou ```\n...\n```
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const preview = raw.slice(0, 300).replace(/\n/g, '\\n')
    throw new Error(
      `Claude retornou JSON inválido.\nPrimeiros 300 chars: ${preview}`
    )
  }

  return parsed as T
}
