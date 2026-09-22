import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { desc, sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/** Últimos erros registrados em produção — alimenta o painel Saúde do sistema. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request)

    const url = new URL(request.url)
    const limite = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

    const erros = await db
      .select()
      .from(schema.error_logs)
      .orderBy(desc(schema.error_logs.created_at))
      .limit(limite)

    // Contagem nas últimas 24h, para o indicador de saúde
    const [recentes] = await db
      .select({ total: sql<number>`count(*)` })
      .from(schema.error_logs)
      .where(sql`${schema.error_logs.created_at} >= datetime('now', '-1 day')`)

    return Response.json({
      data: {
        erros,
        ultimas_24h: Number(recentes?.total ?? 0),
      },
    })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    // Tabela pode não existir antes de rodar /api/setup
    return Response.json({ data: { erros: [], ultimas_24h: 0 } })
  }
}
