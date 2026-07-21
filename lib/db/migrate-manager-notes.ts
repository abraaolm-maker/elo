import { createClient } from '@libsql/client'
import path from 'path'

async function main() {
  const dbPath = path.join(process.cwd(), 'data', 'elo.db')
  const db = createClient({ url: `file:${dbPath}` })
  try {
    await db.execute('ALTER TABLE investigation_workers ADD COLUMN manager_notes TEXT')
    console.log('✅ Coluna manager_notes adicionada com sucesso')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('duplicate column')) {
      console.log('ℹ️  Coluna manager_notes já existe — nada a fazer')
    } else {
      console.error('❌ Erro:', msg)
    }
  }
}

main()
