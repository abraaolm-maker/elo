import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_URL = `file:${path.join(DATA_DIR, 'elo.db')}`

// Cria a pasta /data se não existir
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const client = createClient({ url: DB_URL })

export const db = drizzle(client, { schema })
export { schema }
