import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import type { Database } from '../supabase/types'

interface TranscriptionSegment {
  no_speech_prob?: number
}

interface VerboseTranscription {
  text: string
  segments?: TranscriptionSegment[]
}

export async function downloadAudio(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download audio: HTTP ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function uploadAudioToStorage(buffer: Buffer, fileName: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase env vars not configured')
  }

  const adminClient = createSupabaseAdminClient<Database>(supabaseUrl, serviceRoleKey)

  const { error } = await adminClient.storage
    .from('audio-messages')
    .upload(fileName, buffer, { contentType: 'audio/ogg', upsert: false })

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`)
  }

  const { data } = adminClient.storage.from('audio-messages').getPublicUrl(fileName)
  return data.publicUrl
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
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
