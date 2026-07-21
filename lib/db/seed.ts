/**
 * Cria o primeiro manager (admin Elo) no banco SQLite.
 * Uso: npx tsx lib/db/seed.ts admin@elo.com senha123 [NomeDaEmpresa]
 * O manager criado pelo seed é sempre marcado como is_admin = true.
 */
import bcrypt from 'bcryptjs'
import { db, schema } from './index'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'

const [, , email, password, companyName] = process.argv

if (!email || !password) {
  console.error('Uso: npx tsx lib/db/seed.ts email@example.com senha123 [NomeDaEmpresa]')
  process.exit(1)
}

async function main() {
  // Verificar se manager já existe
  const existing = await db
    .select()
    .from(schema.managers)
    .where(eq(schema.managers.email, email.toLowerCase()))
    .get()

  if (existing) {
    console.log(`[seed] Manager com email ${email} já existe (id: ${existing.id}). Nada a fazer.`)
    return
  }

  // Criar company
  const companyId = crypto.randomUUID()
  await db.insert(schema.companies).values({
    id: companyId,
    name: companyName ?? 'Empresa Elo',
    plan: 'starter',
  })

  // Criar manager
  const managerId = crypto.randomUUID()
  const passwordHash = await bcrypt.hash(password, 12)

  await db.insert(schema.managers).values({
    id: managerId,
    company_id: companyId,
    name: 'Admin Elo',
    email: email.toLowerCase(),
    password_hash: passwordHash,
    is_admin: true,
  })

  console.log(`[seed] Admin Elo criado com sucesso!`)
  console.log(`  Email:      ${email}`)
  console.log(`  Manager ID: ${managerId}`)
  console.log(`  Company ID: ${companyId}`)
  console.log(`  is_admin:   true`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
