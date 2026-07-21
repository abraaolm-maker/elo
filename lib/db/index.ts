import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

// Cliente lazy — só inicializa quando a primeira query for executada
let _client: Client | null = null

function getClient(): Client {
  if (_client) return _client

  if (process.env.TURSO_DATABASE_URL) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN ?? '',
    })
    return _client
  }

  // SQLite local (desenvolvimento)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path') as typeof import('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs') as typeof import('fs')
  const DATA_DIR = nodePath.join(process.cwd(), 'data')
  const DB_URL   = `file:${nodePath.join(DATA_DIR, 'elo.db')}`
  if (!nodeFs.existsSync(DATA_DIR)) nodeFs.mkdirSync(DATA_DIR, { recursive: true })
  _client = createClient({ url: DB_URL })
  return _client
}

// Proxy que resolve o cliente lazily a cada acesso
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    const instance = drizzle(getClient(), { schema })
    return (instance as Record<string | symbol, unknown>)[prop]
  },
})

export { schema }
