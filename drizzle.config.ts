import type { Config } from 'drizzle-kit'
import path from 'path'

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: `file:${path.join(process.cwd(), 'data', 'elo.db')}`,
  },
} satisfies Config
