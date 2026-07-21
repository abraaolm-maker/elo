import { createClient } from '@libsql/client'
import path from 'path'

async function main() {
  const dbPath = path.join(process.cwd(), 'data', 'elo.db')
  const db = createClient({ url: `file:${dbPath}` })

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS action_items (
        id                   TEXT PRIMARY KEY,
        report_id            TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
        what                 TEXT NOT NULL,
        why                  TEXT NOT NULL,
        where_scope          TEXT,
        who_role             TEXT,
        how_to               TEXT NOT NULL,
        how_much_estimate    TEXT,
        impact_score         INTEGER NOT NULL,
        effort_score         INTEGER NOT NULL,
        timeframe            TEXT NOT NULL,
        priority_rank        INTEGER NOT NULL,
        is_recurring_pattern INTEGER NOT NULL DEFAULT 0,
        related_pattern_note TEXT,
        status               TEXT NOT NULL DEFAULT 'suggested',
        created_at           TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    console.log('✅ Tabela action_items criada (ou já existia)')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('❌ Erro na migration:', msg)
    process.exit(1)
  }
}

main()
