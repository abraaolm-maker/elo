import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import { env } from '@/lib/utils/env'
import path from 'path'
import fs from 'fs'

interface TranscriptionSegment {
  no_speech_prob?: number
}

interface VerboseTranscription {
  text: string
  segments?: TranscriptionSegment[]
}

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'audio')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function downloadAudio(url: string, authToken?: string): Promise<Buffer> {
  const headers: Record<string, string> = {}
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`Failed to download audio: HTTP ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Salva o buffer de áudio no filesystem local.
 * Retorna o path relativo salvo no banco (ex: "invId/workerId/msgId.ogg").
 */
export async function uploadAudioToStorage(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const fullPath = path.join(STORAGE_DIR, fileName)
  ensureDir(path.dirname(fullPath))
  fs.writeFileSync(fullPath, buffer)
  return fileName
}

export function isTranscriptionReliable(transcription: VerboseTranscription): boolean {
  const text = transcription.text.trim()

  if (text.length < 5) return false

  const hasMinimumWords = text.split(' ').filter((w: string) => w.length > 1).length >= 2
  if (!hasMinimumWords) return false

  const segments = transcription.segments ?? []
  const avgNoSpeechProb =
    segments.length > 0
      ? segments.reduce((sum, s) => sum + (s.no_speech_prob ?? 0), 0) / segments.length
      : 0
  if (avgNoSpeechProb > 0.6) return false

  return true
}

export async function transcribeAudio(
  buffer: Buffer
): Promise<{ text: string; reliable: boolean }> {
  const openai = new OpenAI({ apiKey: env('OPENAI_API_KEY') })

  const raw = await openai.audio.transcriptions.create({
    file: await toFile(buffer, 'audio.ogg', { type: 'audio/ogg' }),
    model: 'whisper-1',
    language: 'pt',
    response_format: 'verbose_json',
  })

  // verbose_json retorna objeto com text + segments no runtime; cast necessário
  const transcription = raw as unknown as VerboseTranscription

  const reliable = isTranscriptionReliable(transcription)
  return { text: transcription.text ?? '', reliable }
}
