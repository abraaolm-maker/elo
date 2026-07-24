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
  const secret = (process.env.SETUP_SECRET ?? '').trim()
  if (!secret) {
    return Response.json({ error: 'Setup desabilitado' }, { status: 403 })
  }

  const url = new URL(request.url)
  const provided = (url.searchParams.get('secret') ?? '').trim()
  if (provided !== secret) {
    return Response.json({ error: 'Secret inválido', provided_len: provided.length, stored_len: secret.length }, { status: 401 })
  }

  const results: string[] = []

  // ── Tabelas base ──────────────────────────────────────────────────────────
  results.push(await runSafe(`
    CREATE TABLE IF NOT EXISTS companies (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      plan       TEXT NOT NULL DEFAULT 'starter',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `, 'tabela companies'))

  results.push(await runSafe(`
    CREATE TABLE IF NOT EXISTS managers (
      id            TEXT PRIMARY KEY,
      company_id    TEXT NOT NULL REFERENCES companies(id),
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT '',
      is_admin      INTEGER NOT NULL DEFAULT 0,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `, 'tabela managers'))

  results.push(await runSafe(`
    CREATE TABLE IF NOT EXISTS workers (
      id               TEXT PRIMARY KEY,
      company_id       TEXT NOT NULL REFERENCES companies(id),
      name             TEXT NOT NULL DEFAULT '',
      full_name        TEXT,
      cpf              TEXT,
      role             TEXT NOT NULL,
      role_description TEXT,
      whatsapp_number  TEXT NOT NULL,
      anonymous_alias  TEXT NOT NULL,
      is_active        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, whatsapp_number)
    )
  `, 'tabela workers'))

  results.push(await runSafe(`
    CREATE TABLE IF NOT EXISTS investigations (
      id                  TEXT PRIMARY KEY,
      company_id          TEXT NOT NULL REFERENCES companies(id),
      manager_id          TEXT NOT NULL REFERENCES managers(id),
      title               TEXT NOT NULL,
      problem_description TEXT NOT NULL,
      ishikawa_category   TEXT,
      status              TEXT NOT NULL DEFAULT 'pending',
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at        TEXT
    )
  `, 'tabela investigations'))

  results.push(await runSafe(`
    CREATE TABLE IF NOT EXISTS investigation_workers (
      id               TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id),
      worker_id        TEXT NOT NULL REFERENCES workers(id),
      status           TEXT NOT NULL DEFAULT 'pending',
      saturation_score INTEGER NOT NULL DEFAULT 0,
      manager_notes    TEXT,
      access_token     TEXT UNIQUE,
      push_subscription TEXT,
      first_accessed_at TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(investigation_id, worker_id)
    )
  `, 'tabela investigation_workers'))

  results.push(await runSafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_iw_access_token ON investigation_workers(access_token)
  `, 'index access_token'))

  results.push(await runSafe(`
    CREATE TABLE IF NOT EXISTS messages (
      id                   TEXT PRIMARY KEY,
      investigation_id     TEXT NOT NULL REFERENCES investigations(id),
      worker_id            TEXT NOT NULL REFERENCES workers(id),
      direction            TEXT NOT NULL,
      content_type         TEXT NOT NULL DEFAULT 'text',
      content              TEXT,
      audio_url            TEXT,
      raw_whatsapp_id      TEXT UNIQUE,
      transcription_status TEXT NOT NULL DEFAULT 'not_applicable',
      retry_count          INTEGER NOT NULL DEFAULT 0,
      key_points_extracted TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `, 'tabela messages'))

  results.push(await runSafe(`
    CREATE TABLE IF NOT EXISTS reports (
      id                       TEXT PRIMARY KEY,
      investigation_id         TEXT NOT NULL UNIQUE REFERENCES investigations(id),
      root_cause               TEXT NOT NULL,
      confidence_score         INTEGER NOT NULL,
      confidence_justification TEXT,
      ishikawa_breakdown       TEXT,
      sources_summary          TEXT,
      recommendations          TEXT,
      generated_at             TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `, 'tabela reports'))

  results.push(await runSafe(`
    CREATE TABLE IF NOT EXISTS action_items (
      id                   TEXT PRIMARY KEY,
      report_id            TEXT NOT NULL REFERENCES reports(id),
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
  `, 'tabela action_items'))

  // ── Tabela api_usage_logs ─────────────────────────────────────────────────
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
