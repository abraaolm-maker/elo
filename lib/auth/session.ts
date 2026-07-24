import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { env } from '@/lib/utils/env'

const COOKIE_NAME = 'elo-session'
const SESSION_DURATION = 60 * 60 * 24 * 7 // 7 dias em segundos

function getSecret(): Uint8Array {
  const secret = env('JWT_SECRET')
  if (!secret) throw new Error('JWT_SECRET env var is not set')
  return new TextEncoder().encode(secret)
}

export interface SessionPayload {
  managerId: string
  companyId: string
  isAdmin: boolean
}

export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getSecret())
  return token
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (
      typeof payload.managerId !== 'string' ||
      typeof payload.companyId !== 'string'
    ) {
      return null
    }
    return {
      managerId: payload.managerId,
      companyId: payload.companyId,
      isAdmin: payload.isAdmin === true,
    }
  } catch {
    return null
  }
}

export async function getSession(request?: Request): Promise<SessionPayload | null> {
  let token: string | undefined

  if (request) {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const match = cookieHeader
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${COOKIE_NAME}=`))
    if (match) {
      const eqIdx = match.indexOf('=')
      token = eqIdx >= 0 ? match.slice(eqIdx + 1) : undefined
    }
  }

  if (!token) {
    try {
      const cookieStore = await cookies()
      token = cookieStore.get(COOKIE_NAME)?.value
    } catch {
      // next/headers não disponível em contexto de API route
    }
  }

  if (!token) return null
  return verifySession(token)
}

export function sessionCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_DURATION,
    path: '/',
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME
