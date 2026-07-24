import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

async function runSafe(sqlStr: string, label: string): Promise<string> {
  try {
    await db.run(sql.raw(sqlStr))
    return `✓ ${label}`
  } catch (err: unknown) {
    const msg = [
      err instanceof Error ? err.message : '',
      (err as { cause?: { message?: string } })?.cause?.message ?? '',
    ].join(' ')
    if (msg.includes('duplicate column') || msg.includes('already exists') || msg.includes('UNIQUE constraint')) {
      return `~ ${label} (já existe)`
    }
    return `✗ ${label}: ${msg}`
  }
}

export async function GET(request: Request) {
  const secret = process.env.SETUP_SECRET
  if (!secret) {
    return Response.json({ error: 'Setup desabilitado' }, { status: 403 })
  }

  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== secret) {
    return Response.json({ error: 'Secret inválido' }, { status: 401 })
  }

  const results: string[] = []

  // Tabela api_usage_logs
  results.push(await runSafe(`
    CREATE TABLE IF NOT EXISTS api_usage_logs (
      id               TEXT PRIMARY KEY,
      company_id       TEXT NOT NULL,
      manager_id       TEXT,
      investigation_id TEXT,
      operation        TEXT NOT NULL,
      model            TEXT NOT NULL,
      input_tokens     INTEGER NOT NULL,
      output_tokens    INTEGER NOT NULL,
      cost_usd         REAL NOT NULL,
      cost_brl         REAL NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `, 'tabela api_usage_logs'))

  // Colunas em managers
  results.push(await runSafe(`ALTER TABLE managers ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`, 'managers.is_admin'))
  results.push(await runSafe(`ALTER TABLE managers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`, 'managers.is_active'))
  results.push(await runSafe(`ALTER TABLE managers ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`, 'managers.password_hash'))

  // Colunas em workers
  results.push(await runSafe(`ALTER TABLE workers ADD COLUMN name TEXT NOT NULL DEFAULT ''`, 'workers.name'))
  results.push(await runSafe(`ALTER TABLE workers ADD COLUMN full_name TEXT`, 'workers.full_name'))
  results.push(await runSafe(`ALTER TABLE workers ADD COLUMN cpf TEXT`, 'workers.cpf'))
  results.push(await runSafe(`ALTER TABLE workers ADD COLUMN role_description TEXT`, 'workers.role_description'))

  // Colunas em investigation_workers
  results.push(await runSafe(`ALTER TABLE investigation_workers ADD COLUMN manager_notes TEXT`, 'iw.manager_notes'))
  results.push(await runSafe(`ALTER TABLE investigation_workers ADD COLUMN access_token TEXT`, 'iw.access_token'))
  results.push(await runSafe(`ALTER TABLE investigation_workers ADD COLUMN push_subscription TEXT`, 'iw.push_subscription'))
  results.push(await runSafe(`ALTER TABLE investigation_workers ADD COLUMN first_accessed_at TEXT`, 'iw.first_accessed_at'))
  results.push(await runSafe(`ALTER TABLE investigation_workers ADD COLUMN saturation_score INTEGER NOT NULL DEFAULT 0`, 'iw.saturation_score'))

  // Index único para access_token
  results.push(await runSafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_iw_access_token ON investigation_workers(access_token)`, 'index access_token'))

  // Colunas em messages
  results.push(await runSafe(`ALTER TABLE messages ADD COLUMN transcription_status TEXT NOT NULL DEFAULT 'not_applicable'`, 'messages.transcription_status'))
  results.push(await runSafe(`ALTER TABLE messages ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`, 'messages.retry_count'))
  results.push(await runSafe(`ALTER TABLE messages ADD COLUMN key_points_extracted TEXT`, 'messages.key_points_extracted'))

  // Colunas em reports
  results.push(await runSafe(`ALTER TABLE reports ADD COLUMN confidence_justification TEXT`, 'reports.confidence_justification'))

  // Criar admin
  try {
    const bcrypt = await import('bcryptjs')
    const crypto = await import('crypto')
    const { schema } = await import('@/lib/db')
    const { eq } = await import('drizzle-orm')

    // Verificar se já existe company
    let company = await db.select().from(schema.companies).limit(1).then(r => r[0])
    if (!company) {
      const cid = crypto.default.randomUUID()
      await db.insert(schema.companies).values({ id: cid, name: 'Elo Admin', plan: 'enterprise' })
      company = await db.select().from(schema.companies).where(eq(schema.companies.id, cid)).then(r => r[0])
    }

    const existing = await db.select().from(schema.managers).where(eq(schema.managers.email, 'admin@elo.com')).then(r => r[0])
    if (existing) {
      const hash = await bcrypt.default.hash('elo@admin2024', 10)
      await db.update(schema.managers).set({ is_admin: true, password_hash: hash, is_active: true }).where(eq(schema.managers.email, 'admin@elo.com'))
      results.push('~ admin@elo.com (atualizado)')
    } else {
      const hash = await bcrypt.default.hash('elo@admin2024', 10)
      await db.insert(schema.managers).values({
        id: crypto.default.randomUUID(),
        company_id: company!.id,
        name: 'Admin Elo',
        email: 'admin@elo.com',
        password_hash: hash,
        is_admin: true,
        is_active: true,
      })
      results.push('✓ admin@elo.com criado')
    }
  } catch (err) {
    results.push(`✗ admin: ${err instanceof Error ? err.message : String(err)}`)
  }

  return Response.json({ ok: true, results })
}
