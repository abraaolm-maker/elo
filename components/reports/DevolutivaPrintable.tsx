'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtDataExtenso } from '@/lib/utils/date'
import type { WorkerReportOutput } from '@/lib/ai/types'

export interface DevolutivaPrintableProps extends WorkerReportOutput {
  companyName: string
  generatedAt: string
}

/**
 * Versão impressa da devolutiva aos participantes.
 *
 * Documento propositalmente distinto do relatório gerencial: mais claro, mais
 * curto e sem nenhuma marcação de confidencialidade — este é feito para
 * circular. A diferença visual também reduz a chance de alguém imprimir um e
 * entregar o outro.
 */
export function DevolutivaPrintable(props: DevolutivaPrintableProps) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'dv-portal'
    document.body.appendChild(el)
    setHost(el)
    return () => { document.body.removeChild(el) }
  }, [])

  if (!host) return null
  return createPortal(<Conteudo {...props} />, host)
}

function Conteudo({
  titulo, resumo_do_problema, o_que_encontramos, conclusao,
  o_que_vai_mudar, o_que_pedimos, mensagem_final,
  companyName, generatedAt,
}: DevolutivaPrintableProps) {
  return (
    <div className="dv-root" aria-hidden="true">
      <style>{CSS}</style>

      {/* ═══ CAPA ═══ */}
      <section className="dv-capa">
        <div className="dv-capa-marca">
          <span className="dv-capa-icone">E</span>
          <div>
            <div className="dv-capa-nome">Elo</div>
            <div className="dv-capa-sub">Inteligência Operacional</div>
          </div>
        </div>

        <div className="dv-capa-corpo">
          <div className="dv-capa-eyebrow">Retorno da investigação · para quem participou</div>
          <h1 className="dv-capa-titulo">{titulo}</h1>
          <p className="dv-capa-desc">{resumo_do_problema}</p>
        </div>

        <div className="dv-capa-rodape">
          <div className="dv-capa-selo">
            Suas respostas foram tratadas de forma anônima.
          </div>
          <div className="dv-capa-meta">
            <span>{companyName}</span>
            <span>{fmtDataExtenso(generatedAt)}</span>
          </div>
        </div>
      </section>

      {/* ═══ CONTEÚDO ═══ */}
      <section className="dv-page">
        <header className="dv-head">
          <span>ELO · RETORNO DA INVESTIGAÇÃO</span>
          <span>{companyName}</span>
        </header>

        {o_que_encontramos.length > 0 && (
          <section className="dv-sec">
            <div className="dv-num">01</div>
            <h2 className="dv-h2">O que encontramos</h2>
            <div className="dv-achados">
              {o_que_encontramos.map((x, i) => (
                <div key={i} className="dv-achado">
                  <span className="dv-achado-n">{i + 1}</span>
                  <p>{x}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="dv-conclusao">
          <div className="dv-conclusao-lbl">Conclusão</div>
          <p>{conclusao}</p>
        </section>

        {o_que_vai_mudar.length > 0 && (
          <section className="dv-sec">
            <div className="dv-num">02</div>
            <h2 className="dv-h2">O que vai mudar</h2>
            <p className="dv-h2-lead">
              Compromissos assumidos a partir do que foi apurado nesta investigação.
            </p>
            <div className="dv-acoes">
              {o_que_vai_mudar.map((x, i) => (
                <div key={i} className="dv-acao">
                  <div className="dv-acao-check">✓</div>
                  <div className="dv-acao-corpo">
                    <p className="dv-acao-txt">{x.acao}</p>
                    <span className="dv-acao-prazo">{x.prazo}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {o_que_pedimos.length > 0 && (
          <section className="dv-sec">
            <div className="dv-num">03</div>
            <h2 className="dv-h2">O que pedimos ao time</h2>
            <div className="dv-pedidos">
              {o_que_pedimos.map((x, i) => (
                <div key={i} className="dv-pedido"><p>{x}</p></div>
              ))}
            </div>
          </section>
        )}

        {mensagem_final && (
          <div className="dv-final">
            <p>{mensagem_final}</p>
          </div>
        )}

        <footer className="dv-foot">
          <span>{companyName} · {fmtDataExtenso(generatedAt)}</span>
          <span>Elo · Inteligência Operacional</span>
        </footer>
      </section>
    </div>
  )
}

const CSS = `
.dv-root { display: none; }

@media print {
  body > * { display: none !important; }
  /* Só sai quando a impressão foi disparada pelo botão da devolutiva */
  body[data-imprimir="devolutiva"] > .dv-portal { display: block !important; }

  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }

  .dv-root {
    display: block !important;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #0F172A;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Margem uniforme zero; o recuo vem do padding do bloco e se repete em cada
     folha via box-decoration-break. Usar @page :first com margem diferente
     fazia o Chrome cortar o conteúdo nas laterais. */
  @page { size: A4; margin: 0; }

  p, li { orphans: 3; widows: 3; }
  h1, h2 { break-after: avoid; page-break-after: avoid; }

  /* ── Capa ──
     Clara e acolhedora, em oposição à capa escura do relatório gerencial. A
     diferença é proposital: são documentos para públicos distintos e não podem
     ser confundidos ao imprimir. */
  .dv-capa {
    width: 210mm; height: 297mm; min-height: 297mm;
    padding: 22mm 20mm 16mm;
    box-sizing: border-box;
    background: #F0FDFA;
    border-top: 6mm solid #0D9488;
    display: flex; flex-direction: column; justify-content: space-between;
    page-break-after: always; break-after: page;
  }
  .dv-capa-marca { display: flex; align-items: center; gap: 3mm; }
  .dv-capa-icone {
    width: 9mm; height: 9mm; border-radius: 2mm;
    background: #0D9488; color: #fff; font-weight: 800; font-size: 13pt;
    display: flex; align-items: center; justify-content: center;
  }
  .dv-capa-nome { font-size: 13pt; font-weight: 700; color: #0F172A; }
  .dv-capa-sub {
    font-size: 6.5pt; letter-spacing: .18em; text-transform: uppercase; color: #0F766E;
  }
  .dv-capa-corpo { padding-bottom: 10mm; }
  .dv-capa-eyebrow {
    font-size: 7pt; font-weight: 700; letter-spacing: .2em;
    text-transform: uppercase; color: #0D9488; margin-bottom: 6mm;
  }
  .dv-capa-titulo {
    font-size: 26pt; font-weight: 800; line-height: 1.12;
    letter-spacing: -.02em; margin: 0 0 7mm; color: #0F172A;
  }
  .dv-capa-desc {
    font-size: 10.5pt; line-height: 1.7; color: #334155;
    max-width: 130mm; margin: 0;
  }
  .dv-capa-rodape { border-top: .5pt solid #99F6E4; padding-top: 5mm; }
  .dv-capa-selo {
    background: #fff; border: .5pt solid #99F6E4; border-radius: 2mm;
    padding: 3.5mm 4mm; font-size: 8pt; color: #0F766E; line-height: 1.55;
    margin-bottom: 4mm; text-align: center;
  }
  .dv-capa-meta {
    display: flex; justify-content: space-between;
    font-size: 7.5pt; color: #64748B; letter-spacing: .03em;
  }

  /* ── Conteúdo ── */
  .dv-head {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 6.5pt; font-weight: 700; letter-spacing: .14em;
    color: #94A3B8; text-transform: uppercase;
    padding-bottom: 5mm; margin-bottom: 9mm;
    border-bottom: .5pt solid #E2E8F0;
  }

  .dv-sec { margin-bottom: 9mm; }
  .dv-num {
    font-size: 7pt; font-weight: 800; letter-spacing: .2em;
    color: #0D9488; margin-bottom: 1.5mm;
  }
  .dv-h2 {
    font-size: 15pt; font-weight: 700; letter-spacing: -.015em;
    color: #0F172A; margin: 0 0 2mm;
  }
  .dv-h2-lead { font-size: 8.5pt; color: #64748B; line-height: 1.55; margin: 0 0 4mm; }

  /* Achados numerados em cartão */
  .dv-achados { display: flex; flex-direction: column; gap: 2.5mm; }
  .dv-achado {
    display: flex; gap: 3.5mm; align-items: flex-start;
    border: .5pt solid #E2E8F0; border-radius: 2mm; padding: 3.5mm 4mm;
    break-inside: avoid;
  }
  .dv-achado-n {
    width: 5mm; height: 5mm; border-radius: 50%; flex-shrink: 0;
    background: #CCFBF1; color: #0F766E;
    font-size: 7pt; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
  }
  .dv-achado p { font-size: 9.5pt; line-height: 1.6; color: #1E293B; margin: 0; }

  /* Conclusão em destaque */
  .dv-conclusao {
    background: #0F172A; border-radius: 2mm;
    padding: 6mm; margin-bottom: 9mm; break-inside: avoid;
  }
  .dv-conclusao-lbl {
    font-size: 6.5pt; font-weight: 700; letter-spacing: .18em;
    text-transform: uppercase; color: #5EEAD4; margin-bottom: 3mm;
  }
  .dv-conclusao p { font-size: 10.5pt; line-height: 1.7; color: #E2E8F0; margin: 0; }

  /* Compromissos */
  .dv-acoes { display: flex; flex-direction: column; gap: 3mm; }
  .dv-acao {
    display: flex; gap: 3.5mm; align-items: flex-start;
    border: .5pt solid #CCFBF1; background: #F0FDFA; border-radius: 2mm;
    padding: 4mm; break-inside: avoid;
  }
  .dv-acao-check {
    width: 5mm; height: 5mm; border-radius: 50%; flex-shrink: 0;
    background: #0D9488; color: #fff; font-size: 7.5pt; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .dv-acao-corpo { flex: 1; }
  .dv-acao-txt { font-size: 9.5pt; line-height: 1.6; color: #0F172A; margin: 0 0 1.5mm; }
  .dv-acao-prazo {
    display: inline-block;
    font-size: 6pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
    color: #0F766E; background: #CCFBF1; padding: 1mm 2.5mm; border-radius: 3mm;
  }

  /* Pedidos ao time */
  .dv-pedidos { display: flex; flex-direction: column; gap: 2.5mm; }
  .dv-pedido {
    border-left: 2pt solid #CBD5E1; padding: 1mm 0 1mm 4mm;
    break-inside: avoid;
  }
  .dv-pedido p { font-size: 9.5pt; line-height: 1.6; color: #334155; margin: 0; }

  /* Mensagem final */
  .dv-final {
    background: #F8FAFC; border: .5pt solid #E2E8F0; border-radius: 2mm;
    padding: 5mm; margin-top: 9mm; break-inside: avoid;
  }
  .dv-final p {
    font-size: 9.5pt; line-height: 1.7; color: #475569; margin: 0; font-style: italic;
  }

  .dv-foot {
    display: flex; justify-content: space-between;
    font-size: 6.5pt; color: #94A3B8; letter-spacing: .04em;
    border-top: .5pt solid #E2E8F0; padding-top: 4mm; margin-top: 6mm;
    break-inside: avoid;
    break-before: avoid; page-break-before: avoid;
  }

  /* Sem min-height: 297mm exatos numa folha de 297mm faziam transbordar uma
     fatia, gerando página em branco com só o rodapé */
  .dv-page {
    width: 210mm; box-sizing: border-box;
    padding: 16mm 18mm 15mm;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
}
`
