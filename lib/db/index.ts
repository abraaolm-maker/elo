import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

function buildDb() {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.replace(/^﻿/, '').trim()
  if (tursoUrl) {
    const client = createClient({
      url: tursoUrl,
      authToken: (process.env.TURSO_AUTH_TOKEN ?? '').replace(/^﻿/, '').trim(),
    })
    return drizzle(client, { schema })
  }

  // SQLite local (desenvolvimento)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodePath = require('path') as typeof import('path')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeFs   = require('fs')   as typeof import('fs')
  const DATA_DIR = nodePath.join(process.cwd(), 'data')
  const DB_URL   = `file:${nodePath.join(DATA_DIR, 'elo.db')}`
  if (!nodeFs.existsSync(DATA_DIR)) nodeFs.mkdirSync(DATA_DIR, { recursive: true })
  const client = createClient({ url: DB_URL })
  return drizzle(client, { schema })
}

type Db = ReturnType<typeof buildDb>

let instancia: Db | null = null

function getDb(): Db {
  if (!instancia) instancia = buildDb()
  return instancia
}

/**
 * Conexão preguiçosa: o cliente só é construído no primeiro acesso real a uma
 * propriedade, não no import do módulo.
 *
 * Isso importa no build: o Next avalia cada rota para coletar metadados, e uma
 * conexão criada no import fazia o build inteiro falhar quando as credenciais
 * do Turso não estavam presentes no ambiente. Em runtime o comportamento é o
 * mesmo — a instância é criada uma vez e reaproveitada.
 */
export const db = new Proxy({} as Db, {
  get(_alvo, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>
    const valor = Reflect.get(real, prop, receiver)
    return typeof valor === 'function' ? valor.bind(real) : valor
  },
})

export { schema }
