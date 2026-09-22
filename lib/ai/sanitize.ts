/**
 * Remoção de preâmbulos de reconhecimento nas mensagens geradas pela IA.
 *
 * Contexto: na API da Anthropic, `role: 'user'` significa "o humano está se
 * dirigindo ao assistente". No Elo os papéis são invertidos — quem pergunta é
 * o Claude e quem responde é o gestor/trabalhador. O treinamento do modelo o
 * leva a validar cada turno do usuário ("Ótima pergunta!"), o que aqui soa
 * falso: ninguém perguntou nada.
 *
 * O system prompt já instrui contra isso, mas instrução de prompt é
 * probabilística. Esta função é a garantia determinística aplicada na saída.
 */

/**
 * Preâmbulos a remover quando aparecem no INÍCIO da mensagem.
 * Ancorados em ^ para não afetar o texto legítimo no meio da frase.
 */
const PREAMBULOS = [
  // Elogio a "pergunta" que não existiu
  /^(que\s+)?[óo]tima\s+pergunta[!.,…]*\s*/i,
  /^(que\s+)?boa\s+pergunta[!.,…]*\s*/i,
  /^(que\s+)?excelente\s+pergunta[!.,…]*\s*/i,
  /^(que\s+)?ótimo\s+ponto[!.,…]*\s*/i,
  /^(que\s+)?excelente\s+ponto[!.,…]*\s*/i,
  /^(que\s+)?bom\s+ponto[!.,…]*\s*/i,
  /^(que\s+)?[óo]tima\s+observa[çc][ãa]o[!.,…]*\s*/i,
  /^(que\s+)?excelente\s+observa[çc][ãa]o[!.,…]*\s*/i,
  /^(que\s+)?boa\s+coloca[çc][ãa]o[!.,…]*\s*/i,
  /^que\s+bom\s+que\s+(voc[êe]\s+)?(perguntou|mencionou|trouxe|falou)[!.,…]*\s*/i,

  // Agradecimento/validação genérica
  /^obrigad[oa]\s+por\s+(compartilhar|responder|explicar|detalhar)[!.,…]*\s*/i,
  /^agrade[çc]o\s+(o\s+)?(retorno|compartilhamento|detalhamento)[!.,…]*\s*/i,
  /^entendi\s+perfeitamente[!.,…]*\s*/i,
  /^compreendo\s+perfeitamente[!.,…]*\s*/i,
  /^perfeito[!.,…]+\s*/i,
  /^excelente[!.,…]+\s*/i,
  /^[óo]timo[!.,…]+\s*/i,
  /^show[!.,…]+\s*/i,
  /^legal[!.,…]+\s*/i,
  /^bacana[!.,…]+\s*/i,
  /^isso\s+[ée]\s+(muito\s+)?importante[!.,…]*\s*/i,
  /^informa[çc][ãa]o\s+(muito\s+)?(valiosa|importante|relevante)[!.,…]*\s*/i,
] as const

/** Emoji solto que às vezes sobra no início após remover o preâmbulo. */
const EMOJI_INICIAL = /^[\p{Extended_Pictographic}️‍]+\s*/u

/**
 * Remove preâmbulos de reconhecimento do início da mensagem.
 *
 * Aplica repetidamente porque o modelo às vezes encadeia dois
 * ("Perfeito! Ótima observação. Qual…").
 *
 * Se após a limpeza sobrar pouco texto, devolve o original — é sinal de que a
 * mensagem era só a saudação e removê-la deixaria a resposta vazia.
 */
export function limparPreambulo(texto: string): string {
  if (!texto) return texto

  let resultado = texto.trimStart()
  let mudou = true
  let voltas = 0

  while (mudou && voltas < 4) {
    mudou = false
    voltas++

    for (const re of PREAMBULOS) {
      const novo = resultado.replace(re, '')
      if (novo !== resultado) {
        resultado = novo.trimStart()
        mudou = true
      }
    }

    const semEmoji = resultado.replace(EMOJI_INICIAL, '')
    if (semEmoji !== resultado) {
      resultado = semEmoji.trimStart()
      mudou = true
    }
  }

  // Sobrou pouco: a mensagem era essencialmente o preâmbulo — preservar original
  if (resultado.trim().length < 10) return texto

  // Recapitalizar a primeira letra, que pode ter ficado minúscula
  return resultado.charAt(0).toUpperCase() + resultado.slice(1)
}
