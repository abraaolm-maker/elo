import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import path from 'path'
import fs from 'fs'

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'audio')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { path: pathSegments } = await params
  const relativePath = pathSegments.join('/')
  const fullPath = path.join(STORAGE_DIR, relativePath)

  // Prevenir path traversal
  if (!fullPath.startsWith(STORAGE_DIR)) {
    return new Response('Forbidden', { status: 403 })
  }

  if (!fs.existsSync(fullPath)) {
    return new Response('Not found', { status: 404 })
  }

  const buffer = fs.readFileSync(fullPath)
  return new Response(buffer, {
    headers: {
      'Content-Type': 'audio/ogg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
