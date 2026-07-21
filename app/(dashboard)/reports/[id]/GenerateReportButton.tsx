'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'

interface GenerateReportButtonProps {
  investigationId: string
  investigationTitle: string
}

export function GenerateReportButton({ investigationId }: GenerateReportButtonProps) {
  const router = useRouter()
  const toast  = useToast()
  const [loading, setLoading] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    try {
      const res  = await fetch(`/api/reports/${investigationId}`, { method: 'POST' })
      const json = await res.json() as { data?: unknown; error?: string }

      if (!res.ok) {
        toast.error(json.error ?? 'Erro ao gerar relatório')
        return
      }

      toast.success('Relatório gerado com sucesso!')
      router.refresh()
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={loading}
      className="flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 px-5 rounded-sm hover:bg-slate-800 transition-all shadow-sm disabled:opacity-50"
    >
      {loading ? (
        <>
          <svg className="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Gerando relatório…
        </>
      ) : 'Gerar relatório'}
    </button>
  )
}
