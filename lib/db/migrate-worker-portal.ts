import { db } from '.'

async function runSafe(sql: string) {
  try {
    await db.run(sql)
  } catch (err: unknown) {
    const msg = [
      err instanceof Error ? err.message : '',
      (err as { cause?: { message?: string } })?.cause?.message ?? '',
    ].join(' ')
    if (msg.includes('duplicate column') || msg.includes('already exists')) return
    throw err
  }
}

export async function migrateWorkerPortal() {
  await runSafe(`ALTER TABLE workers ADD COLUMN full_name TEXT`)
  await runSafe(`ALTER TABLE workers ADD COLUMN cpf TEXT`)
  await runSafe(`ALTER TABLE investigation_workers ADD COLUMN access_token TEXT`)
  await runSafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_iw_access_token ON investigation_workers(access_token)`)
  await runSafe(`ALTER TABLE investigation_workers ADD COLUMN push_subscription TEXT`)
  await runSafe(`ALTER TABLE investigation_workers ADD COLUMN first_accessed_at TEXT`)
  console.log('[migrate-worker-portal] ✅ Concluído')
}

migrateWorkerPortal().catch(err => {
  console.error('[migrate-worker-portal] Erro:', err)
  process.exit(1)
})
