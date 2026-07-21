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

export const db = buildDb()
export { schema }
