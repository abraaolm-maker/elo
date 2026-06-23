import { getSession } from './session'
import type { SessionPayload } from './session'

export async function requireAuth(request?: Request): Promise<SessionPayload> {
  const session = await getSession(request)
  if (!session) {
    throw new Error('UNAUTHORIZED')
  }
  return session
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'UNAUTHORIZED'
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Não autenticado' }, { status: 401 })
}
