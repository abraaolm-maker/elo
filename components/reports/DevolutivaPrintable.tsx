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

      <div className="dv-page">
        <header className="dv-head">
          <div className="dv-marca">
            <span className="dv-marca-icone">E</span>
            <span className="dv-marca-nome">Elo</span>
          </div>
          <span className="dv-head-emp">{companyName}</span>
        </header>

        <div className="dv-eyebrow">Retorno da investigação · para quem participou</div>
        <h1 className="dv-titulo">{titulo}</h1>
        <p className="dv-resumo">{resumo_do_problema}</p>

        {o_que_encontramos.length > 0 && (
          <section className="dv-sec">
            <h2 className="dv-h2">O que encontramos</h2>
            <ul className="dv-lista">
              {o_que_encontramos.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </section>
        )}

        <section className="dv-conclusao">
          <div className="dv-conclusao-lbl">Conclusão</div>
          <p>{conclusao}</p>
        </section>

        {o_que_vai_mudar.length > 0 && (
          <section className="dv-sec">
            <h2 className="dv-h2">O que vai mudar</h2>
            <div className="dv-acoes">
              {o_que_vai_mudar.map((x, i) => (
                <div key={i} className="dv-acao">
                  <div className="dv-acao-txt">{x.acao}</div>
                  <div className="dv-acao-prazo">{x.prazo}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {o_que_pedimos.length > 0 && (
          <section className="dv-sec">
            <h2 className="dv-h2">O que pedimos ao time</h2>
            <ul className="dv-lista dv-lista-seta">
              {o_que_pedimos.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </section>
        )}

        {mensagem_final && <p className="dv-final">{mensagem_final}</p>}

        <footer className="dv-foot">
          <span>{companyName} · {fmtDataExtenso(generatedAt)}</span>
          <span>Suas respostas foram tratadas de forma anônima</span>
        </footer>
      </div>
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

  @page { size: A4; margin: 16mm 18mm 15mm; }

  p, li { orphans: 3; widows: 3; }
  h1, h2 { break-after: avoid; page-break-after: avoid; }

  .dv-head {
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: 4mm; margin-bottom: 9mm;
    border-bottom: .5pt solid #E2E8F0;
  }
  .dv-marca { display: flex; align-items: center; gap: 2.5mm; }
  .dv-marca-icone {
    width: 6.5mm; height: 6.5mm; border-radius: 1.5mm;
    background: #F0FDFA; border: .5pt solid #99F6E4; color: #0D9488;
    font-weight: 800; font-size: 9pt;
    display: flex; align-items: center; justify-content: center;
  }
  .dv-marca-nome { font-size: 11pt; font-weight: 700; }
  .dv-head-emp {
    font-size: 7pt; letter-spacing: .14em; text-transform: uppercase; color: #64748B;
  }

  .dv-eyebrow {
    font-size: 7pt; font-weight: 700; letter-spacing: .18em;
    text-transform: uppercase; color: #0D9488; margin-bottom: 3mm;
  }
  .dv-titulo {
    font-size: 20pt; font-weight: 800; line-height: 1.15;
    letter-spacing: -.015em; margin: 0 0 5mm;
  }
  .dv-resumo {
    font-size: 10pt; line-height: 1.65; color: #334155;
    margin: 0 0 8mm; padding-bottom: 6mm;
    border-bottom: .5pt solid #F1F5F9;
  }

  .dv-sec { margin-bottom: 8mm; break-inside: avoid; }
  .dv-h2 {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .16em;
    text-transform: uppercase; color: #64748B; margin: 0 0 3.5mm;
  }

  .dv-lista { margin: 0; padding: 0; list-style: none; }
  .dv-lista li {
    font-size: 9.5pt; line-height: 1.65; color: #1E293B;
    padding-left: 6mm; margin-bottom: 3mm; position: relative;
    break-inside: avoid;
  }
  .dv-lista li::before {
    content: ''; position: absolute; left: 1mm; top: 2mm;
    width: 1.8mm; height: 1.8mm; border-radius: 50%; background: #0D9488;
  }
  .dv-lista-seta li::before {
    content: '\\2192'; background: none; color: #94A3B8;
    width: auto; height: auto; top: 0; left: 0; font-size: 9pt;
  }

  .dv-conclusao {
    background: #F0FDFA; border-left: 2pt solid #0D9488; border-radius: 0 2mm 2mm 0;
    padding: 5mm; margin-bottom: 8mm; break-inside: avoid;
  }
  .dv-conclusao-lbl {
    font-size: 7pt; font-weight: 700; letter-spacing: .16em;
    text-transform: uppercase; color: #0F766E; margin-bottom: 2.5mm;
  }
  .dv-conclusao p { font-size: 10pt; line-height: 1.65; color: #0F172A; margin: 0; }

  .dv-acoes { display: flex; flex-direction: column; gap: 3mm; }
  .dv-acao {
    border: .5pt solid #E2E8F0; border-radius: 2mm; padding: 4mm;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm;
    break-inside: avoid;
  }
  .dv-acao-txt { font-size: 9.5pt; line-height: 1.6; color: #1E293B; flex: 1; }
  .dv-acao-prazo {
    font-size: 6.5pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
    color: #0F766E; background: #CCFBF1; padding: 1.2mm 2.5mm; border-radius: 3mm;
    white-space: nowrap; flex-shrink: 0;
  }

  .dv-final {
    font-size: 9.5pt; line-height: 1.7; color: #475569; font-style: italic;
    border-top: .5pt solid #E2E8F0; padding-top: 5mm; margin: 9mm 0 0;
    break-inside: avoid;
  }

  .dv-foot {
    display: flex; justify-content: space-between;
    font-size: 6.5pt; color: #94A3B8; letter-spacing: .04em;
    border-top: .5pt solid #E2E8F0; padding-top: 4mm; margin-top: 9mm;
  }
}
`
