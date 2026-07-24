import { db } from '.'
import { sql } from 'drizzle-orm'

async function run() {
  const r = await db.run(sql`UPDATE investigations SET status = 'completed', completed_at = datetime('now') WHERE status = 'saturated'`)
  console.log('Updated:', r.rowsAffected, 'row(s) — investigações travadas em saturated marcadas como completed')
}

run().catch(console.error)
