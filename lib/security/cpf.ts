import bcrypt from 'bcryptjs'

/**
 * CPF é dado pessoal sensível sob a LGPD e serve como credencial de acesso do
 * trabalhador ao portal. Por isso é armazenado apenas como hash — nunca em
 * texto plano.
 */

/** Normaliza para 11 dígitos, ou null se inválido. */
export function normalizarCpf(valor: string | null | undefined): string | null {
  if (!valor) return null
  const digitos = valor.replace(/\D/g, '')
  return digitos.length === 11 ? digitos : null
}

/** Gera o hash do CPF para gravar em workers.cpf_hash. */
export async function hashCpf(valor: string | null | undefined): Promise<string | null> {
  const digitos = normalizarCpf(valor)
  if (!digitos) return null
  return bcrypt.hash(digitos, 10)
}

/**
 * Verifica o CPF informado pelo trabalhador contra o registro do banco.
 *
 * Cobre os dois formatos porque a base é mista: registros criados antes da
 * migração guardam o CPF em texto plano e só ganham hash no primeiro acesso.
 *
 * TODA validação de CPF deve passar por aqui. Quando esta lógica ficou
 * duplicada entre as rotas, a migração para hash quebrou o envio de mensagens:
 * o login migrava e limpava o campo antigo, e as rotas que ainda comparavam o
 * texto plano passaram a responder "Não autorizado".
 */
export async function verificarCpf(
  cpfInformado: string,
  registro: { cpf: string | null; cpf_hash: string | null }
): Promise<boolean> {
  const informado = cpfInformado.replace(/\D/g, '')
  if (!informado) return false

  if (registro.cpf_hash) return bcrypt.compare(informado, registro.cpf_hash)

  const plano = (registro.cpf ?? '').replace(/\D/g, '')
  return plano.length > 0 && plano === informado
}
