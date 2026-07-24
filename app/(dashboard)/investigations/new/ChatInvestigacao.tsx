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
  full_name?: string
  cpf?: string
  whatsapp_number?: string
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

interface WorkerCadastrado {
  id: string
  anonymous_alias: string
  role: string
  role_description: string | null
  whatsapp_masked: string
  is_active: boolean
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
          <p className="text-xs text-slate-400 truncate">{p.role}</p>
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

// ─── Formulário de participante ───────────────────────────────────────────────

interface FormParticipanteProps {
  onAdicionar: (p: Participante) => void
  workersJaAdicionados: string[] // whatsapp_number dos já adicionados (para filtrar)
}

function FormParticipante({ onAdicionar, workersJaAdicionados }: FormParticipanteProps) {
  const [aba, setAba] = useState<'existente' | 'novo'>('existente')
  const [workersCadastrados, setWorkersCadastrados] = useState<WorkerCadastrado[]>([])
  const [carregandoWorkers, setCarregandoWorkers] = useState(true)

  // campos de novo worker
  const [name, setName] = useState('')
  const [cpf, setCpf] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [role, setRole] = useState('')
  const [roleDesc, setRoleDesc] = useState('')
  const [notes, setNotes] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/workers')
      .then(r => r.json())
      .then((d: { data: WorkerCadastrado[] }) => setWorkersCadastrados(d.data ?? []))
      .catch(() => {/* silencioso */})
      .finally(() => setCarregandoWorkers(false))
  }, [])

  const workersDisponiveis = workersCadastrados.filter(
    w => w.is_active
  )

  function selecionarWorkerExistente(w: WorkerCadastrado) {
    // Não temos o número real (masked), mas a API de criação vai buscar pelo ID
    // Por isso vamos adicionar com um placeholder e flag especial
    // Na verdade, precisamos passar o worker_id — mas o tipo Participante usa whatsapp_number
    // Solução: usar worker_id como whatsapp_number com prefixo especial "id:"
    onAdicionar({
      name: w.anonymous_alias,
      whatsapp_number: `__id:${w.id}`,
      role: w.role,
      role_description: w.role_description ?? '',
      manager_notes: '',
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!name.trim()) { setErro('Nome é obrigatório.'); return }
    if (!role.trim()) { setErro('Cargo é obrigatório.'); return }

    const cpfDigits = cpf.replace(/\D/g, '')
    if (cpfDigits && cpfDigits.length !== 11) { setErro('CPF inválido — deve ter 11 dígitos.'); return }

    const num = whatsapp.replace(/\D/g, '')
    if (num) {
      if (!num.startsWith('55')) { setErro('WhatsApp deve começar com 55 (código do Brasil). Exemplo: 5511999999999'); return }
      if (num.length < 12 || num.length > 13) { setErro('WhatsApp inválido. Use o formato: 5511999999999 (com DDD)'); return }
    }

    onAdicionar({
      name: name.trim(),
      full_name: name.trim(),
      cpf: cpfDigits || undefined,
      whatsapp_number: num || undefined,
      role: role.trim(),
      role_description: roleDesc.trim(),
      manager_notes: notes.trim(),
    })

    setName(''); setCpf(''); setWhatsapp(''); setRole(''); setRoleDesc(''); setNotes('')
  }

  const inputClass = "w-full border border-slate-200 rounded-sm px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white transition-all"
  const labelClass = "block text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5"

  return (
    <div className="border border-slate-200 rounded-sm bg-white overflow-hidden shadow-sm">
      {/* Abas */}
      <div className="flex border-b border-slate-100">
        <button
          type="button"
          onClick={() => setAba('existente')}
          className={`flex-1 text-xs font-semibold uppercase tracking-wider py-3 transition-colors ${
            aba === 'existente'
              ? 'bg-white text-teal-700 border-b-2 border-teal-500'
              : 'bg-slate-50 text-slate-400 hover:text-slate-600'
          }`}
        >
          Já cadastrado
        </button>
        <button
          type="button"
          onClick={() => setAba('novo')}
          className={`flex-1 text-xs font-semibold uppercase tracking-wider py-3 transition-colors ${
            aba === 'novo'
              ? 'bg-white text-teal-700 border-b-2 border-teal-500'
              : 'bg-slate-50 text-slate-400 hover:text-slate-600'
          }`}
        >
          Novo trabalhador
        </button>
      </div>

      {aba === 'existente' ? (
        <div className="p-4">
          {carregandoWorkers ? (
            <p className="text-xs text-slate-400 text-center py-4">Carregando trabalhadores…</p>
          ) : workersDisponiveis.length === 0 ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-xs text-slate-500">Nenhum trabalhador cadastrado ainda.</p>
              <button
                type="button"
                onClick={() => setAba('novo')}
                className="text-xs text-teal-600 underline underline-offset-2"
              >
                Cadastrar novo trabalhador
              </button>
            </div>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {workersDisponiveis.map(w => {
                const jaAdicionado = workersJaAdicionados.includes(`__id:${w.id}`)
                return (
                  <li key={w.id} className={`flex items-center justify-between gap-3 border rounded-sm px-3 py-2.5 transition-colors ${jaAdicionado ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{w.anonymous_alias}</p>
                      <p className="text-xs text-slate-500">{w.role} · {w.whatsapp_masked}</p>
                    </div>
                    {jaAdicionado ? (
                      <span className="text-[10px] font-semibold text-emerald-600 shrink-0">Adicionado</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => selecionarWorkerExistente(w)}
                        className="text-[10px] font-semibold uppercase tracking-wider bg-slate-900 text-white px-3 py-1.5 rounded-sm hover:bg-slate-800 shrink-0"
                      >
                        Adicionar
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Nome completo <span className="text-red-400">*</span>
              </label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="João da Silva" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>
                CPF
                <span className="text-slate-300 font-normal normal-case tracking-normal ml-1">(para acesso ao portal)</span>
              </label>
              <input
                value={cpf}
                onChange={e => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              WhatsApp
              <span className="text-slate-300 font-normal normal-case tracking-normal ml-1">(opcional)</span>
            </label>
            <input
              value={whatsapp}
              onChange={e => setWhatsapp(e.target.value)}
              placeholder="5511999999999"
              className={inputClass}
            />
            <p className="text-[10px] text-slate-400 mt-1">Com 55 + DDD. Ex: 5511999999999</p>
          </div>

          <div>
            <label className={labelClass}>
              Cargo <span className="text-red-400">*</span>
            </label>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Ex: Mestre de obras, Supervisor de linha, Operador…" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>
              Responsabilidades do cargo
              <span className="text-slate-300 font-normal normal-case tracking-normal ml-1">(opcional, mas melhora as perguntas da IA)</span>
            </label>
            <textarea
              value={roleDesc}
              onChange={e => setRoleDesc(e.target.value)}
              placeholder="O que essa pessoa faz no dia a dia?"
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label className={labelClass}>
              Observações para a IA
              <span className="text-slate-300 font-normal normal-case tracking-normal ml-1">(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="O que você quer que a IA explore com essa pessoa?"
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
        </form>
      )}
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
  onEditarDraft: (titulo: string, descricao: string) => void
}

function PainelParticipantes({ draft, onAdicionar, onRemover, onCriar, criando, onEditarDraft }: PainelParticipantesProps) {
  const whatsappsAdicionados = draft.participantes.map(p => p.whatsapp_number).filter((n): n is string => !!n)
  const [editandoResumo, setEditandoResumo] = useState(false)
  const [tituloEdit, setTituloEdit] = useState(draft.titulo ?? '')
  const [descEdit, setDescEdit] = useState(draft.descricao_problema ?? '')

  function salvarEdicao() {
    if (!tituloEdit.trim()) return
    onEditarDraft(tituloEdit.trim(), descEdit.trim())
    setEditandoResumo(false)
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/50 flex flex-col" style={{ maxHeight: '75vh' }}>
      {/* Scroll interno apenas no conteúdo, não esconde o botão de criar */}
      <div className="overflow-y-auto flex-1 p-5 space-y-4">
        {/* Resumo da investigação com edição inline */}
        {draft.titulo && (
          <div className="bg-white border border-slate-200 rounded-sm px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Investigação definida</p>
              {!editandoResumo && (
                <button
                  type="button"
                  onClick={() => { setTituloEdit(draft.titulo ?? ''); setDescEdit(draft.descricao_problema ?? ''); setEditandoResumo(true) }}
                  className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-teal-600 flex items-center gap-1 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                  Editar
                </button>
              )}
            </div>
            {editandoResumo ? (
              <div className="space-y-2 mt-1">
                <input
                  value={tituloEdit}
                  onChange={e => setTituloEdit(e.target.value)}
                  className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Título da investigação"
                />
                <textarea
                  value={descEdit}
                  onChange={e => setDescEdit(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-200 rounded-sm px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  placeholder="Descrição do problema"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={salvarEdicao}
                    disabled={!tituloEdit.trim()}
                    className="text-[10px] font-semibold uppercase tracking-wider bg-slate-900 text-white px-3 py-1.5 rounded-sm hover:bg-slate-800 disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoResumo(false)}
                    className="text-[10px] font-semibold uppercase tracking-wider border border-slate-200 text-slate-500 px-3 py-1.5 rounded-sm hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-900">{draft.titulo}</p>
                {draft.descricao_problema && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">{draft.descricao_problema}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Lista de participantes adicionados */}
        {draft.participantes.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              Adicionados ({draft.participantes.length})
            </p>
            {draft.participantes.map((p, i) => (
              <CardParticipante key={i} p={p} onRemover={() => onRemover(i)} />
            ))}
          </div>
        )}

        {/* Formulário para adicionar */}
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-2">
            Adicionar participante
          </p>
          <FormParticipante onAdicionar={onAdicionar} workersJaAdicionados={whatsappsAdicionados} />
        </div>
      </div>

      {/* Botão criar — sempre visível, fora do scroll */}
      <div className="shrink-0 px-5 pb-5 pt-3 border-t border-slate-100 bg-slate-50/50">
        {draft.participantes.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-1">Adicione pelo menos um participante para criar a investigação.</p>
        ) : (
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

      const data = await res.json() as ChatRespostaAPI & { error?: string }

      if (!res.ok) {
        const errMsg = data.error ?? `Erro ${res.status}`
        setMensagens(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Erro: ${errMsg}` }])
        return
      }

      const newDraft = { ...draft }
      if (data.updates?.fase) newDraft.fase = data.updates.fase
      if (data.updates?.titulo !== undefined) newDraft.titulo = data.updates.titulo ?? draft.titulo
      if (data.updates?.descricao_problema !== undefined) newDraft.descricao_problema = data.updates.descricao_problema ?? draft.descricao_problema
      if (data.updates?.adicionar_participante) {
        newDraft.participantes = [...newDraft.participantes, { ...data.updates.adicionar_participante, manager_notes: '' }]
      }
      setDraft(newDraft)
      setMensagens(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.message }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      setMensagens(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Ops, problema de conexão: ${msg}`,
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
      const participantes = draft.participantes.map(p => {
        // Trabalhadores já cadastrados são referenciados por "__id:uuid"
        if (p.whatsapp_number?.startsWith('__id:')) {
          return {
            worker_id: p.whatsapp_number.replace('__id:', ''),
            manager_notes: p.manager_notes || undefined,
          }
        }
        return {
          name: p.name,
          full_name: p.full_name || undefined,
          cpf: p.cpf || undefined,
          role: p.role,
          role_description: p.role_description || undefined,
          whatsapp_number: p.whatsapp_number,
          manager_notes: p.manager_notes || undefined,
        }
      })

      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.titulo,
          problem_description: draft.descricao_problema,
          participantes,
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
          {/* Etapas */}
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
            onClick={() => router.push('/investigations')}
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
          onEditarDraft={(titulo, descricao) => setDraft(prev => ({ ...prev, titulo, descricao_problema: descricao }))}
        />
      ) : (
        <div className="border-t border-slate-100 bg-white px-5 py-4 shrink-0">
          <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-sm px-4 py-3 focus-within:border-teal-400 focus-within:bg-white transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); ajustarAltura() }}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua resposta…"
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
            Tecla Enter para enviar · Shift+Enter para nova linha
          </p>
        </div>
      )}
    </div>
  )
}
