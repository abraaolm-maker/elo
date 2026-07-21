'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Participante {
  _key: string // chave local para React
  name: string
  role: string
  role_description: string
  whatsapp_number: string
  manager_notes: string
}

function novoParticipante(): Participante {
  return {
    _key: Math.random().toString(36).slice(2),
    name: '',
    role: '',
    role_description: '',
    whatsapp_number: '',
    manager_notes: '',
  }
}

interface Props {
  onSuccess: (investigationId: string) => void
  onCancel: () => void
}

export function InvestigationForm({ onSuccess, onCancel }: Props) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [participantes, setParticipantes] = useState<Participante[]>([novoParticipante()])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  function atualizarParticipante(key: string, campo: keyof Omit<Participante, '_key'>, valor: string) {
    setParticipantes(prev => prev.map(p => p._key === key ? { ...p, [campo]: valor } : p))
  }

  function adicionarParticipante() {
    setParticipantes(prev => [...prev, novoParticipante()])
  }

  function removerParticipante(key: string) {
    setParticipantes(prev => prev.filter(p => p._key !== key))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!titulo.trim()) { setErro('O título é obrigatório.'); return }
    if (descricao.trim().length < 20) { setErro('A descrição deve ter pelo menos 20 caracteres.'); return }
    if (participantes.length === 0) { setErro('Adicione pelo menos um participante.'); return }

    for (const p of participantes) {
      if (!p.name.trim()) { setErro('Nome de todos os participantes é obrigatório.'); return }
      if (!p.role.trim()) { setErro('Cargo de todos os participantes é obrigatório.'); return }
      if (!p.whatsapp_number.trim()) { setErro('WhatsApp de todos os participantes é obrigatório.'); return }
    }

    setCarregando(true)
    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titulo.trim(),
          problem_description: descricao.trim(),
          participantes: participantes.map(p => ({
            name: p.name.trim(),
            role: p.role.trim(),
            role_description: p.role_description.trim() || undefined,
            whatsapp_number: p.whatsapp_number.trim(),
            manager_notes: p.manager_notes.trim() || undefined,
          })),
        }),
      })

      const result = await res.json() as { data?: { id: string }; error?: string }
      if (!res.ok) { setErro(result.error ?? 'Erro ao criar investigação.'); return }
      onSuccess(result.data!.id)
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 mb-1">Nova investigação</h1>
        <p className="text-sm text-zinc-500">Descreva o problema e adicione os colaboradores que serão consultados pela IA.</p>
      </div>

      {/* Problema */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">Problema</h2>

        <div className="space-y-1.5">
          <Label htmlFor="titulo">Título</Label>
          <Input
            id="titulo"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder="Ex: Alta taxa de defeitos na linha 3"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="descricao">Descrição do problema</Label>
          <Textarea
            id="descricao"
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Descreva o problema com o máximo de contexto: quando começou, frequência, impacto, o que já foi tentado…"
            rows={4}
          />
          <p className="text-xs text-zinc-400">Mínimo 20 caracteres. Quanto mais contexto, melhor a qualidade das perguntas da IA.</p>
        </div>
      </div>

      {/* Participantes */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
            Participantes ({participantes.length})
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={adicionarParticipante} className="h-7 text-xs">
            + Adicionar participante
          </Button>
        </div>

        {participantes.map((p, idx) => (
          <div key={p._key} className="border border-zinc-100 rounded-lg p-4 space-y-3 bg-zinc-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Participante {idx + 1}
              </span>
              {participantes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removerParticipante(p._key)}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Remover
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome completo *</Label>
                <Input
                  value={p.name}
                  onChange={e => atualizarParticipante(p._key, 'name', e.target.value)}
                  placeholder="João da Silva"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">WhatsApp *</Label>
                <Input
                  value={p.whatsapp_number}
                  onChange={e => atualizarParticipante(p._key, 'whatsapp_number', e.target.value)}
                  placeholder="5511999999999"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Cargo *</Label>
              <Input
                value={p.role}
                onChange={e => atualizarParticipante(p._key, 'role', e.target.value)}
                placeholder="Ex: Mestre de obras, Supervisor de linha, Operador…"
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Responsabilidades do cargo</Label>
              <Textarea
                value={p.role_description}
                onChange={e => atualizarParticipante(p._key, 'role_description', e.target.value)}
                placeholder="Descreva o que essa pessoa faz no dia a dia — isso ajuda a IA a fazer as perguntas certas para o cargo dela."
                rows={2}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Observações do gestor para este participante</Label>
              <Textarea
                value={p.manager_notes}
                onChange={e => atualizarParticipante(p._key, 'manager_notes', e.target.value)}
                placeholder="O que você quer que a IA explore especificamente com essa pessoa? (opcional)"
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      {erro && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{erro}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={carregando} className="bg-zinc-900 text-white hover:bg-zinc-700">
          {carregando ? 'Criando…' : 'Criar investigação'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={carregando}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
