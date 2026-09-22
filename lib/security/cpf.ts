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
