'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Mensagem {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface Participante {
  name: string
  whatsapp_number: string
  role: string
  role_description: string
  manager_notes: string
}

interface Draft {
  fase: 'problema' | 'participantes' | 'pronto'
  titulo: string | null
  descricao_problema: string | null
  participantes: Participante[]
}

interface ChatRespostaAPI {
  message: string
  updates: {
    fase?: 'problema' | 'participantes' | 'pronto'
    titulo?: string | null
    descricao_problema?: string | null
    adicionar_participante?: Omit<Participante, 'manager_notes'> | null
    investigacao_pronta?: boolean
  }
  investigation_id?: string | null
}

// ─── Indicador de digitando ───────────────────────────────────────────────────

function IndicadorDigitando() {
  return (
    <div className="flex items-end gap-2.5">
      <AvatarIA />
      <div className="bg-white border border-slate-200 rounded-sm rounded-bl-none px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function AvatarIA() {
  return (
    <div className="w-8 h-8 rounded-sm bg-teal-600 flex items-center justify-center shrink-0 border border-teal-700">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
      </svg>
    </div>
  )
}

// ─── Bolha de mensagem ────────────────────────────────────────────────────────

function BolhaMensagem({ msg }: { msg: Mensagem }) {
  const ehIA = msg.role === 'assistant'

  function renderTexto(texto: string) {
    return texto.split('\n').map((linha, i) => {
      if (linha.startsWith('• ') || linha.startsWith('- ')) {
        const conteudo = linha.slice(2)
        return (
          <li key={i} className="ml-4 list-none flex gap-2">
            <span className="text-teal-400 shrink-0">•</span>
            <span dangerouslySetInnerHTML={{ __html: formatarNegrito(conteudo) }} />
          </li>
        )
      }
      if (!linha.trim()) return <br key={i} />
      return <p key={i} dangerouslySetInnerHTML={{ __html: formatarNegrito(linha) }} />
    })
  }

  function formatarNegrito(texto: string) {
    return texto.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  }

  if (ehIA) {
    return (
      <div className="flex items-end gap-2.5">
        <AvatarIA />
        <div className="max-w-[78%] bg-white border border-slate-200 rounded-sm rounded-bl-none px-4 py-3 text-sm text-slate-800 space-y-1 shadow-sm leading-relaxed">
          {renderTexto(msg.content)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[72%] bg-slate-900 text-white rounded-sm rounded-br-none px-4 py-3 text-sm shadow-sm">
        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
      </div>
    </div>
  )
}

// ─── Formulário de participante ───────────────────────────────────────────────

interface FormParticipanteProps {
  onAdicionar: (p: Participante) => void
}

function FormParticipante({ onAdicionar }: FormParticipanteProps) {
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [role, setRole] = useState('')
  const [roleDesc, setRoleDesc] = useState('')
  const [notes, setNotes] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!name.trim()) { setErro('Nome é obrigatório'); return }
    if (!whatsapp.trim()) { setErro('WhatsApp é obrigatório'); return }
    if (!role.trim()) { setErro('Cargo é obrigatório'); return }

    const num = whatsapp.replace(/\D/g, '')
    if (num.length < 10) { setErro('Número de WhatsApp inválido (inclua DDD)'); return }

    onAdicionar({
      name: name.trim(),
      whatsapp_number: whatsapp.trim(),
      role: role.trim(),
      role_description: roleDesc.trim(),
      manager_notes: notes.trim(),
    })

    setName(''); setWhatsapp(''); setRole(''); setRoleDesc(''); setNotes('')
  }

  const inputClass = "w-full border border-slate-200 rounded-sm px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white transition-all"
  const labelClass = "block text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5"

  return (
    <form onSubmit={handleSubmit} className="border border-slate-200 rounded-sm bg-white overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-700" style={{ fontFamily: 'var(--font-jakarta)' }}>Novo participante</p>
        <p className="text-xs text-slate-400 mt-0.5">Preencha os dados de quem será consultado pela IA</p>
      </div>

      <div className="p-5 space-y-4">
        {/* Linha 1: Nome + WhatsApp */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              Nome completo <span className="text-red-400">*</span>
            </label>
            <input id="p-name" value={name} onChange={e => setName(e.target.value)} placeholder="João da Silva" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>
              WhatsApp <span className="text-red-400">*</span>
            </label>
            <input id="p-wa" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="55 11 99999-9999" className={inputClass} />
          </div>
        </div>

        {/* Cargo */}
        <div>
          <label className={labelClass}>
            Cargo <span className="text-red-400">*</span>
          </label>
          <input id="p-role" value={role} onChange={e => setRole(e.target.value)} placeholder="Ex: Mestre de obras, Supervisor de linha, Operador…" className={inputClass} />
        </div>

        {/* Responsabilidades */}
        <div>
          <label className={labelClass}>Responsabilidades do cargo</label>
          <textarea
            id="p-desc"
            value={roleDesc}
            onChange={e => setRoleDesc(e.target.value)}
            placeholder="O que essa pessoa faz no dia a dia? Quanto mais detalhado, melhor a qualidade das perguntas da IA."
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Observações */}
        <div>
          <label className={labelClass}>
            Observações para a IA <span className="text-slate-300 font-normal normal-case tracking-normal">(opcional)</span>
          </label>
          <textarea
            id="p-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="O que você quer que a IA explore com essa pessoa em específico?"
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-sm px-3 py-2">
            <p className="text-xs text-red-700">{erro}</p>
          </div>
        )}

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-2.5 rounded-sm hover:bg-slate-800 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Adicionar participante
        </button>
      </div>
    </form>
  )
}

// ─── Card de participante adicionado ──────────────────────────────────────────

function CardParticipante({ p, onRemover }: { p: Participante; onRemover: () => void }) {
  return (
    <div className="flex items-center justify-between border border-slate-200 rounded-sm bg-white px-4 py-3 hover:border-slate-300 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-sm bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 border border-teal-100">
          <span className="text-xs font-bold">{p.name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
          <p className="text-xs text-slate-400 font-mono truncate">{p.role}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemover}
        className="text-slate-300 hover:text-red-500 transition-colors ml-3 shrink-0 p-1"
        title="Remover"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Painel de participantes ──────────────────────────────────────────────────

interface PainelParticipantesProps {
  draft: Draft
  onAdicionar: (p: Participante) => void
  onRemover: (idx: number) => void
  onCriar: () => void
  criando: boolean
}

function PainelParticipantes({ draft, onAdicionar, onRemover, onCriar, criando }: PainelParticipantesProps) {
  return (
    <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4 overflow-y-auto" style={{ maxHeight: '70vh' }}>
      {/* Resumo */}
      {draft.titulo && (
        <div className="bg-white border border-slate-200 rounded-sm px-4 py-3">
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5">Investigação definida</p>
          <p className="text-sm font-semibold text-slate-900">{draft.titulo}</p>
          {draft.descricao_problema && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{draft.descricao_problema}</p>
          )}
        </div>
      )}

      {/* Lista de participantes */}
      {draft.participantes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
            Participantes ({draft.participantes.length})
          </p>
          {draft.participantes.map((p, i) => (
            <CardParticipante key={i} p={p} onRemover={() => onRemover(i)} />
          ))}
        </div>
      )}

      {/* Formulário */}
      <FormParticipante onAdicionar={onAdicionar} />

      {/* Botão criar */}
      {draft.participantes.length > 0 && (
        <button
          onClick={onCriar}
          disabled={criando}
          className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white text-xs font-semibold uppercase tracking-wider py-3 rounded-sm hover:bg-teal-700 transition-all shadow-sm disabled:opacity-50"
        >
          {criando ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Criando investigação…
            </>
          ) : `Criar investigação com ${draft.participantes.length} participante${draft.participantes.length !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ChatInvestigacao({ managerName, mensagemInicial }: { managerName: string; mensagemInicial: string }) {
  const router = useRouter()
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    { id: 'init', role: 'assistant', content: mensagemInicial },
  ])
  const [input, setInput] = useState('')
  const [digitando, setDigitando] = useState(false)
  const [criando, setCriando] = useState(false)
  const [draft, setDraft] = useState<Draft>({
    fase: 'problema',
    titulo: null,
    descricao_problema: null,
    participantes: [],
  })
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, digitando, draft.fase])

  function ajustarAltura() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  async function enviarMensagem() {
    const texto = input.trim()
    if (!texto || digitando || criando) return

    const novaMsgUsuario: Mensagem = { id: crypto.randomUUID(), role: 'user', content: texto }
    const historico = [...mensagens, novaMsgUsuario]
    setMensagens(historico)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setDigitando(true)

    try {
      const res = await fetch('/api/investigations/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historico.map(m => ({ role: m.role, content: m.content })),
          draft,
          managerName,
        }),
      })

      const data = await res.json() as ChatRespostaAPI

      const newDraft = { ...draft }
      if (data.updates.fase) newDraft.fase = data.updates.fase
      if (data.updates.titulo !== undefined) newDraft.titulo = data.updates.titulo ?? draft.titulo
      if (data.updates.descricao_problema !== undefined) newDraft.descricao_problema = data.updates.descricao_problema ?? draft.descricao_problema
      if (data.updates.adicionar_participante) {
        newDraft.participantes = [...newDraft.participantes, { ...data.updates.adicionar_participante, manager_notes: '' }]
      }
      setDraft(newDraft)
      setMensagens(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.message }])
    } catch {
      setMensagens(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Ops, problema de conexão. Pode repetir?',
      }])
    } finally {
      setDigitando(false)
    }
  }

  function adicionarParticipante(p: Participante) {
    setDraft(prev => ({ ...prev, participantes: [...prev.participantes, p] }))
  }

  function removerParticipante(idx: number) {
    setDraft(prev => ({
      ...prev,
      participantes: prev.participantes.filter((_, i) => i !== idx),
    }))
  }

  async function criarInvestigacao() {
    if (!draft.titulo || !draft.descricao_problema || draft.participantes.length === 0) return
    setCriando(true)
    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.titulo,
          problem_description: draft.descricao_problema,
          participantes: draft.participantes.map(p => ({
            name: p.name,
            role: p.role,
            role_description: p.role_description || undefined,
            whatsapp_number: p.whatsapp_number,
            manager_notes: p.manager_notes || undefined,
          })),
        }),
      })
      const result = await res.json() as { data?: { id: string }; error?: string }
      if (result.data?.id) {
        router.push(`/investigations/${result.data.id}`)
      } else {
        alert(result.error ?? 'Erro ao criar investigação')
        setCriando(false)
      }
    } catch {
      alert('Erro de conexão')
      setCriando(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void enviarMensagem()
    }
  }

  const naFaseParticipantes = draft.fase === 'participantes' || draft.fase === 'pronto'

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Cabeçalho */}
      <div className="border-b border-slate-100 bg-white px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <AvatarIA />
          <div>
            <p className="text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-jakarta)' }}>Assistente Elo</p>
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              {naFaseParticipantes ? 'Definindo participantes' : 'Entendendo o problema'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Steps */}
          <div className="flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase">
            <span className={`flex items-center gap-1.5 ${draft.fase === 'problema' ? 'text-teal-600' : 'text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${draft.fase === 'problema' ? 'bg-teal-500' : 'bg-emerald-400'}`} />
              Problema
            </span>
            <span className="text-slate-200">—</span>
            <span className={`flex items-center gap-1.5 ${naFaseParticipantes ? 'text-teal-600' : 'text-slate-300'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${naFaseParticipantes ? 'bg-teal-500' : 'bg-slate-200'}`} />
              Participantes
            </span>
          </div>

          <button
            onClick={() => router.push('/')}
            className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* Conversa */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 min-h-0 bg-slate-50/30">
        {mensagens.map(msg => <BolhaMensagem key={msg.id} msg={msg} />)}
        {digitando && <IndicadorDigitando />}
        <div ref={bottomRef} />
      </div>

      {/* Input ou painel de participantes */}
      {naFaseParticipantes ? (
        <PainelParticipantes
          draft={draft}
          onAdicionar={adicionarParticipante}
          onRemover={removerParticipante}
          onCriar={() => void criarInvestigacao()}
          criando={criando}
        />
      ) : (
        <div className="border-t border-slate-100 bg-white px-5 py-4 shrink-0">
          <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-sm px-4 py-3 focus-within:border-teal-400 focus-within:bg-white transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); ajustarAltura() }}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua resposta… (Enter para enviar)"
              rows={1}
              disabled={digitando}
              className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
              style={{ maxHeight: '160px' }}
            />
            <button
              type="button"
              onClick={() => void enviarMensagem()}
              disabled={!input.trim() || digitando}
              className="w-8 h-8 rounded-sm bg-slate-900 flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-teal-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
              </svg>
            </button>
          </div>
          <p className="text-center text-[10px] text-slate-300 mt-1.5 font-mono">
            Enter para enviar · Shift+Enter para nova linha
          </p>
        </div>
      )}
    </div>
  )
}
