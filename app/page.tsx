import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-100 px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-teal-50 border border-teal-100 rounded flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <span className="text-base font-semibold tracking-tight" style={{ fontFamily: 'var(--font-jakarta)' }}>Elo</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            Entrar
          </Link>
          <Link
            href="/login"
            className="text-xs font-semibold uppercase tracking-wider bg-slate-900 text-white px-4 py-2 rounded-sm hover:bg-slate-800 transition-all"
          >
            Acessar plataforma
          </Link>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-8 pt-24 pb-20 text-center">

          <div className="inline-flex items-center gap-2 border border-teal-200 bg-teal-50 text-teal-700 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-sm mb-8 animate-reveal">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-ping" />
            Inteligência operacional para indústria
          </div>

          <h1
            className="text-5xl font-bold tracking-tight text-slate-900 leading-tight mb-6 animate-reveal delay-100"
            style={{ fontFamily: 'var(--font-jakarta)' }}
          >
            O gestor pergunta.<br />
            O trabalhador responde.<br />
            <span className="text-teal-600">A IA descobre a causa.</span>
          </h1>

          <p className="text-lg text-slate-500 leading-relaxed max-w-2xl mx-auto mb-10 animate-reveal delay-200">
            Elo envia perguntas adaptadas por cargo via WhatsApp, coleta respostas em texto ou áudio,
            cruza fontes anonimamente e entrega um relatório de causa raiz com plano de ação — sem reunião, sem politicagem.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-reveal delay-300">
            <Link
              href="/login"
              className="flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider py-3 px-7 rounded-sm hover:bg-slate-800 transition-all shadow-sm"
            >
              Acessar minha conta
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </section>

        {/* ── COMO FUNCIONA ─────────────────────────────────────────────────── */}
        <section className="border-t border-slate-100 bg-slate-50/50">
          <div className="max-w-5xl mx-auto px-8 py-20">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase text-center mb-2">Como funciona</p>
            <h2
              className="text-2xl font-bold text-slate-900 text-center mb-12 tracking-tight"
              style={{ fontFamily: 'var(--font-jakarta)' }}
            >
              Do problema ao plano de ação em horas
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                {
                  n: '01',
                  title: 'Gestor descreve o problema',
                  desc: 'Título e descrição do problema operacional. A IA determina quais categorias de Ishikawa investigar.',
                  icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  ),
                },
                {
                  n: '02',
                  title: 'IA envia perguntas adaptadas',
                  desc: 'Cada trabalhador recebe perguntas calibradas ao seu cargo via WhatsApp. Sem instalar nada.',
                  icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                  ),
                },
                {
                  n: '03',
                  title: 'Coleta respostas e valida',
                  desc: 'Áudio ou texto. Transcrição automática. Validação cruzada anônima entre fontes independentes.',
                  icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7.5 7.5 0 01-7.5 7.5A7.5 7.5 0 014 11V5.25A2.25 2.25 0 016.25 3h.5A2.25 2.25 0 019 5.25V11a3 3 0 006 0V5.25A2.25 2.25 0 0117.25 3h.5A2.25 2.25 0 0120 5.25V11z" />
                    </svg>
                  ),
                },
                {
                  n: '04',
                  title: 'Entrega relatório + plano',
                  desc: 'Causa raiz identificada, nível de confiança, análise Ishikawa e plano de ação 5W2H priorizado.',
                  icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                    </svg>
                  ),
                },
              ].map(step => (
                <div key={step.n} className="relative">
                  <div className="border border-slate-200 rounded-sm bg-white p-5 h-full hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-9 h-9 rounded-sm bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
                        {step.icon}
                      </div>
                      <span className="text-[10px] font-bold text-slate-300 font-mono">{step.n}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-2 leading-snug">{step.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── DIFERENCIAIS ─────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-8 py-20">
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase text-center mb-2">Por que o Elo funciona</p>
          <h2
            className="text-2xl font-bold text-slate-900 text-center mb-12 tracking-tight"
            style={{ fontFamily: 'var(--font-jakarta)' }}
          >
            Metodologia industrial. Escala digital.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: 'Anonimato protege a verdade',
                desc: 'Trabalhadores respondem protegidos por aliases. Sem medo de retaliação, as respostas são mais honestas. A fonte nunca é revelada — nem no relatório.',
                tag: 'Método Delphi',
              },
              {
                title: 'Perguntas adaptadas por cargo',
                desc: 'Um mestre de obras e um engenheiro recebem perguntas diferentes sobre o mesmo problema. A IA lê a descrição do cargo e calibra vocabulário e profundidade.',
                tag: 'Maiêutica + Ishikawa',
              },
              {
                title: 'Para quando há informação suficiente',
                desc: 'A investigação não encerra após N perguntas. Para quando novas respostas não acrescentam nada novo — saturação teórica, como pesquisadores fazem.',
                tag: 'Grounded Theory',
              },
              {
                title: 'Validação cruzada silenciosa',
                desc: 'Quando um trabalhador aponta a causa X, a IA pergunta indiretamente sobre X para outras fontes — sem revelar quem disse. Convergência aumenta a confiança.',
                tag: 'Triangulação de dados',
              },
              {
                title: 'Plano de ação, não só diagnóstico',
                desc: 'O relatório inclui um plano 5W2H priorizado por impacto × esforço. Curto, médio e longo prazo — cada ação específica o suficiente para ser executada amanhã.',
                tag: '8D Problem Solving',
              },
              {
                title: 'Vai onde o trabalho acontece',
                desc: 'Sem app para instalar. O trabalhador responde pelo WhatsApp que já usa. O Elo é o Gemba Walk digital — o gestor vai ao chão sem sair da mesa.',
                tag: 'Gemba Walk',
              },
            ].map(item => (
              <div key={item.title} className="border border-slate-200 rounded-sm bg-white p-5 hover:border-slate-300 hover:shadow-sm transition-all">
                <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-sm mb-3">
                  {item.tag}
                </span>
                <h3 className="text-sm font-semibold text-slate-900 mb-2 leading-snug">{item.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── SETORES ─────────────────────────────────────────────────────── */}
        <section className="border-t border-slate-100 bg-slate-50/50">
          <div className="max-w-4xl mx-auto px-8 py-16 text-center">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-3">Setores</p>
            <p className="text-sm text-slate-600 mb-8">
              Feito para empresas industriais brasileiras com operações no chão de fábrica ou obra.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {['Construção civil', 'Manufatura', 'Logística', 'Mineração', 'Alimentos e bebidas', 'Energia', 'Saneamento', 'Metalurgia'].map(s => (
                <span key={s} className="border border-slate-200 bg-white text-slate-600 text-xs font-medium px-4 py-2 rounded-sm">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA FINAL ───────────────────────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-8 py-20 text-center">
          <h2
            className="text-3xl font-bold text-slate-900 mb-4 tracking-tight"
            style={{ fontFamily: 'var(--font-jakarta)' }}
          >
            Sua próxima investigação começa em minutos.
          </h2>
          <p className="text-slate-500 mb-8">
            Acesse o dashboard, cadastre sua equipe e inicie. Sem instalação, sem treinamento para os trabalhadores.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-teal-600 text-white text-xs font-semibold uppercase tracking-wider py-3.5 px-8 rounded-sm hover:bg-teal-700 transition-all shadow-sm"
          >
            Acessar o Elo
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </section>
      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 px-8 py-8">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-teal-50 border border-teal-100 rounded flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-900">Elo</span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Inteligência operacional para indústria brasileira
            </p>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              <strong className="text-slate-500">Science Mentorship Academy</strong> é uma marca registrada de{' '}
              <strong className="text-slate-500">59.613.724 Victor Eduardo Alves da Silva Carvalho</strong> (MEI).{' '}
              Elo é um produto desenvolvido e comercializado pela Science Mentorship Academy.
              CNPJ 59.613.724/0001-00. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>

    </div>
  )
}
