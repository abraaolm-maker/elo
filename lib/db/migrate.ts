/**
 * Executa as migrations Drizzle no banco SQLite local.
 * Uso: npx tsx lib/db/migrate.ts
 */
import { migrate } from 'drizzle-orm/libsql/migrator'
import { db } from './index'
import path from 'path'

const migrationsFolder = path.join(process.cwd(), 'drizzle')

async function main() {
  console.log('[migrate] Rodando migrations em', migrationsFolder)
  await migrate(db, { migrationsFolder })
  console.log('[migrate] Concluído.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
