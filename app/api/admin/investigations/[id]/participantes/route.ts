import { db, schema } from '@/lib/db'
import { requireAdmin, isForbiddenError, forbiddenResponse, unauthorizedResponse, isUnauthorizedError } from '@/lib/auth/middleware'
import { eq, sql } from 'drizzle-orm'
import { logError, logWarn } from '@/lib/monitoring/logger'
import { env } from '@/lib/utils/env'

export const dynamic = 'force-dynamic'

/**
 * Diagnóstico de acesso dos participantes de uma investigação.
 *
 * Existe para suporte: descobrir por que um trabalhador não consegue entrar ou
 * responder, e reenviar o link de acesso quando ele o perde.
 *
 * Devolve o link porque é exatamente o que o suporte precisa repassar. Não
 * devolve o CPF (nem o hash) nem o WhatsApp — o primeiro é credencial, o
 * segundo é proibido de sair da base por regra do projeto. Todo acesso fica
 * registrado, para haver rastro de quem consultou links de acesso.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params

    const inv = await db
      .select({
        id: schema.investigations.id,
        title: schema.investigations.title,
        status: schema.investigations.status,
        company_id: schema.investigations.company_id,
      })
      .from(schema.investigations)
      .where(eq(schema.investigations.id, id))
      .get()

    if (!inv) return Response.json({ error: 'Investigação não encontrada' }, { status: 404 })

    // env() remove o BOM que a Vercel às vezes grava no início da variável —
    // sem isso o link sai com um caractere invisível antes do "https" e não abre
    const base = env('NEXT_PUBLIC_APP_URL').replace(/\/$/, '')

    const linhas = await db
      .select({
        iw_id: schema.investigation_workers.id,
        status: schema.investigation_workers.status,
        saturation_score: schema.investigation_workers.saturation_score,
        access_token: schema.investigation_workers.access_token,
        first_accessed_at: schema.investigation_workers.first_accessed_at,
        alias: schema.workers.anonymous_alias,
        role: schema.workers.role,
        // Apenas se existe credencial — nunca o valor
        tem_cpf_plano: sql<number>`CASE WHEN ${schema.workers.cpf} IS NOT NULL AND ${schema.workers.cpf} != '' THEN 1 ELSE 0 END`,
        tem_cpf_hash: sql<number>`CASE WHEN ${schema.workers.cpf_hash} IS NOT NULL THEN 1 ELSE 0 END`,
        worker_id: schema.workers.id,
      })
      .from(schema.investigation_workers)
      .innerJoin(schema.workers, eq(schema.investigation_workers.worker_id, schema.workers.id))
      .where(eq(schema.investigation_workers.investigation_id, id))

    const participantes = await Promise.all(
      linhas.map(async l => {
        const [msgs] = await db
          .select({ total: sql<number>`count(*)` })
          .from(schema.messages)
          .where(sql`${schema.messages.investigation_id} = ${id} AND ${schema.messages.worker_id} = ${l.worker_id}`)

        const temCredencial = l.tem_cpf_hash === 1 || l.tem_cpf_plano === 1

        return {
          alias: l.alias,
          role: l.role,
          status: l.status,
          saturation_score: l.saturation_score,
          primeiro_acesso: l.first_accessed_at,
          mensagens: Number(msgs?.total ?? 0),
          // Diagnóstico de credencial
          credencial: l.tem_cpf_hash === 1 ? 'hash' : l.tem_cpf_plano === 1 ? 'texto_plano' : 'ausente',
          pode_entrar: temCredencial,
          motivo_bloqueio: temCredencial ? null : 'Trabalhador sem CPF cadastrado — ele não consegue entrar.',
          link: l.access_token ? `${base}/worker/${l.access_token}` : null,
          observacao_link: l.access_token ? null : 'Investigação ainda não foi iniciada — link é gerado no início.',
        }
      })
    )

    await logWarn('api/admin/investigations/participantes', 'Links de acesso consultados', {
      companyId: inv.company_id,
      investigationId: id,
      extra: { participantes: participantes.length },
    })

    return Response.json({ data: { investigation: inv, participantes } })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    await logError('api/admin/investigations/participantes', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
