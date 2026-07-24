'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'

interface SessionData {
  iw_id: string
  status: string
  saturation_score: number
  investigation_title: string
  company_name: string
  worker_role: string
  messages: Message[]
}

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  content_type: string
}

type Phase = 'loading' | 'not-found' | 'login' | 'chat' | 'done'

export default function WorkerPortal() {
  const { token } = useParams<{ token: string }>()

  const [phase, setPhase] = useState<Phase>('loading')
  const [investigationTitle, setInvestigationTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [cpf, setCpf] = useState('')
  const [cpfInput, setCpfInput] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [session, setSession] = useState<SessionData | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [saturation, setSaturation] = useState(0)
  const [workerStatus, setWorkerStatus] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    fetch(`/api/worker/${token}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setPhase('not-found'); return }
        setInvestigationTitle(json.data.investigation_title)
        setCompanyName(json.data.company_name)
        setPhase('login')
      })
      .catch(() => setPhase('not-found'))
  }, [token])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    const cleanCpf = cpfInput.replace(/\D/g, '')
    try {
      const res = await fetch(`/api/worker/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cleanCpf }),
      })
      const json = await res.json()
      if (!res.ok) { setLoginError(json.error); setLoginLoading(false); return }
      setCpf(cleanCpf)
      setSession(json.data)
      setMessages(json.data.messages)
      setSaturation(json.data.saturation_score)
      setWorkerStatus(json.data.status)
      setPhase(json.data.status === 'saturated' ? 'done' : 'chat')
    } catch {
      setLoginError('Erro de conexão. Tente novamente.')
    }
    setLoginLoading(false)
  }

  const sendText = useCallback(async (text: string) => {
    if (!text.trim() || sending) return
    setSending(true)
    setErrorMsg('')
    const userMsg: Message = { id: crypto.randomUUID(), direction: 'inbound', content: text, content_type: 'text' }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    try {
      const res = await fetch(`/api/worker/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf, content: text }),
      })
      const json = await res.json()
      if (!res.ok) { setErrorMsg(json.error); setSending(false); return }
      if (json.data.outbound_message) {
        setMessages(prev => [...prev, json.data.outbound_message])
      }
      setSaturation(json.data.saturation_score)
      setWorkerStatus(json.data.status)
      if (json.data.status === 'saturated') setPhase('done')
    } catch {
      setErrorMsg('Erro ao enviar. Tente novamente.')
    }
    setSending(false)
  }, [token, cpf, sending])

  async function startRecording() {
    setErrorMsg('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      chunksRef.current = []
      mr.ondataavailable = e => chunksRef.current.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await sendAudio(blob)
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
    } catch {
      setErrorMsg('Não foi possível acessar o microfone.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  async function sendAudio(blob: Blob) {
    setSending(true)
    const tempMsg: Message = { id: crypto.randomUUID(), direction: 'inbound', content: '🎤 Áudio enviado — transcrevendo...', content_type: 'audio' }
    setMessages(prev => [...prev, tempMsg])

    const fd = new FormData()
    fd.append('cpf', cpf)
    fd.append('audio', blob, 'audio.webm')

    try {
      const res = await fetch(`/api/worker/${token}/audio`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
        setErrorMsg(json.error)
        setSending(false)
        return
      }
      // Substituir mensagem temporária pela transcrição real
      setMessages(prev => prev.map(m =>
        m.id === tempMsg.id
          ? { ...m, content: `🎤 "${json.data.transcript}"` }
          : m
      ))
      if (json.data.outbound_message) {
        setMessages(prev => [...prev, json.data.outbound_message])
      }
      setSaturation(json.data.saturation_score)
      setWorkerStatus(json.data.status)
      if (json.data.status === 'saturated') setPhase('done')
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
      setErrorMsg('Erro ao enviar áudio.')
    }
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendText(input)
    }
  }

  // ─── Renders ─────────────────────────────────────────────────────────────────

  if (phase === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (phase === 'not-found') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="text-center">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-xl font-semibold text-slate-800 mb-2">Link inválido ou expirado</h1>
        <p className="text-slate-500 text-sm">Peça ao seu gestor um novo link de acesso.</p>
      </div>
    </div>
  )

  if (phase === 'login') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-teal-600 rounded-xl mb-4">
            <span className="text-white text-xl font-bold">E</span>
          </div>
          <h1 className="text-lg font-semibold text-slate-800">{companyName}</h1>
          <p className="text-sm text-slate-500 mt-1">{investigationTitle}</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Seu CPF</label>
            <input
              type="text"
              inputMode="numeric"
              value={cpfInput}
              onChange={e => setCpfInput(e.target.value)}
              placeholder="000.000.000-00"
              className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            />
          </div>
          {loginError && <p className="text-red-600 text-sm">{loginError}</p>}
          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-teal-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {loginLoading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-6">Suas respostas são anônimas e confidenciais.</p>
      </div>
    </div>
  )

  if (phase === 'done') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="text-center max-w-xs">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-semibold text-slate-800 mb-2">Participação concluída!</h1>
        <p className="text-slate-500 text-sm">Obrigado por contribuir com a investigação. Suas respostas foram registradas com anonimato.</p>
      </div>
    </div>
  )

  // phase === 'chat'
  const progressPct = Math.min(saturation, 100)
  const progressLabel = progressPct < 30 ? 'Início' : progressPct < 60 ? 'Em andamento' : progressPct < 86 ? 'Quase lá' : 'Concluindo...'

  return (
    <div className="flex flex-col h-dvh bg-white max-w-lg mx-auto">
      {/* Header */}
      <div className="border-b border-slate-100 px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">E</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{session?.investigation_title}</p>
            <p className="text-xs text-slate-400">{session?.worker_role} · {companyName}</p>
          </div>
        </div>
        {/* Barra de progresso */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-slate-400">Progresso</span>
            <span className="text-xs font-medium text-teal-600">{progressLabel}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div
              className="bg-teal-500 h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              msg.direction === 'outbound'
                ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
                : 'bg-teal-600 text-white rounded-tr-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 px-4 py-3 rounded-2xl rounded-tl-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 px-4 py-3 shrink-0">
        {errorMsg && <p className="text-red-500 text-xs mb-2">{errorMsg}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua resposta..."
            rows={1}
            disabled={sending || recording}
            className="flex-1 resize-none border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          {/* Botão de áudio */}
          <button
            type="button"
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={stopRecording}
            disabled={sending}
            className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
              recording ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
            title="Segure para gravar áudio"
          >
            {recording ? (
              <span className="w-3 h-3 bg-white rounded-sm" />
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
                <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A7 7 0 0 0 19 10Z" />
              </svg>
            )}
          </button>
          {/* Botão enviar texto */}
          <button
            type="button"
            onClick={() => void sendText(input)}
            disabled={!input.trim() || sending || recording}
            className="shrink-0 w-11 h-11 bg-teal-600 text-white rounded-xl flex items-center justify-center hover:bg-teal-700 disabled:opacity-40 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
            </svg>
          </button>
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">Segure 🎤 para gravar · Enter para enviar</p>
      </div>
    </div>
  )
}
