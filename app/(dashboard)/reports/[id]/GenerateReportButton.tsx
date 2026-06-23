'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface GenerateReportButtonProps {
  investigationId: string
  investigationTitle: string
}

export function GenerateReportButton({ investigationId }: GenerateReportButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/reports/${investigationId}`, { method: 'POST' })
      const json = await res.json() as { data?: unknown; error?: string }

      if (!res.ok) {
        setError(json.error ?? 'Erro ao gerar relatório')
        return
      }

      router.refresh()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Gerando relatório…' : 'Gerar relatório'}
      </Button>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
      )}
    </div>
  )
}
