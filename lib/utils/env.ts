// Strip BOM (﻿) and whitespace from env vars — Vercel sometimes saves with BOM
export function env(key: string): string {
  return (process.env[key] ?? '').replace(/^﻿/, '').trim()
}
