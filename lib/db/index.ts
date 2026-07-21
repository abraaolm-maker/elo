import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

function createDbClient() {
  // Turso (produção / Vercel)
  if (process.env.TURSO_DATABASE_URL) {
    return createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN ?? '',
    })
  }

  // SQLite local (desenvolvimento)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path') as typeof import('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs') as typeof import('fs')
  const DATA_DIR = nodePath.join(process.cwd(), 'data')
  const DB_URL   = `file:${nodePath.join(DATA_DIR, 'elo.db')}`
  if (!nodeFs.existsSync(DATA_DIR)) nodeFs.mkdirSync(DATA_DIR, { recursive: true })
  return createClient({ url: DB_URL })
}

const client = createDbClient()
export const db = drizzle(client, { schema })
export { schema }
