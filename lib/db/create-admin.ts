import { db, schema } from '.'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

async function createAdmin() {
  const email = 'admin@elo.com'
  const password = 'elo@admin2024'

  // Buscar company existente (ou criar)
  let company = await db.select().from(schema.companies).get()
  if (!company) {
    const cid = crypto.randomUUID()
    await db.insert(schema.companies).values({ id: cid, name: 'Elo Admin', plan: 'enterprise' })
    company = await db.select().from(schema.companies).where(eq(schema.companies.id, cid)).get()
  }

  const existing = await db.select().from(schema.managers).where(eq(schema.managers.email, email)).get()
  if (existing) {
    // Apenas garantir que is_admin = true e atualizar senha
    const hash = await bcrypt.hash(password, 10)
    await db.update(schema.managers).set({ is_admin: true, password_hash: hash }).where(eq(schema.managers.email, email))
    console.log(`✅ Admin atualizado: ${email} / ${password}`)
    return
  }

  const hash = await bcrypt.hash(password, 10)
  await db.insert(schema.managers).values({
    id: crypto.randomUUID(),
    company_id: company!.id,
    name: 'Admin Elo',
    email,
    password_hash: hash,
    is_admin: true,
  })
  console.log(`✅ Admin criado: ${email} / ${password}`)
}

createAdmin().catch(err => { console.error(err); process.exit(1) })
