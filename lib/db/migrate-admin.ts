import { db } from '.'

async function runSafe(sqlStr: string) {
  try {
    await db.run(sqlStr as Parameters<typeof db.run>[0])
  } catch (err: unknown) {
    const msg = [
      err instanceof Error ? err.message : '',
      (err as { cause?: { message?: string } })?.cause?.message ?? '',
    ].join(' ')
    if (msg.includes('duplicate column') || msg.includes('already exists')) return
    throw err
  }
}

export async function migrateAdmin() {
  await runSafe(`
    CREATE TABLE IF NOT EXISTS api_usage_logs (
      id               TEXT PRIMARY KEY,
      company_id       TEXT NOT NULL REFERENCES companies(id),
      manager_id       TEXT REFERENCES managers(id),
      investigation_id TEXT REFERENCES investigations(id),
      operation        TEXT NOT NULL,
      model            TEXT NOT NULL,
      input_tokens     INTEGER NOT NULL,
      output_tokens    INTEGER NOT NULL,
      cost_usd         REAL NOT NULL,
      cost_brl         REAL NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  await runSafe(`ALTER TABLE managers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`)
  console.log('[migrate-admin] Concluido')
}

migrateAdmin().catch(err => {
  console.error('[migrate-admin] Erro:', err)
  process.exit(1)
})
