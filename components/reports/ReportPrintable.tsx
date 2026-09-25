'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ActionPlanTimeframe } from '@/lib/ai/types'
import { fmtDataExtenso, fmtMesAno } from '@/lib/utils/date'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PrintableActionItem {
  what: string
  why: string
  how_to: string
  who_role: string | null
  where_scope: string | null
  how_much_estimate: string | null
  impact_score: number
  effort_score: number
  timeframe: ActionPlanTimeframe
  is_recurring_pattern: boolean
}

export interface ReportPrintableProps {
  investigationTitle: string
  problemDescription: string
  companyName: string
  generatedAt: string
  rootCause: string
  confidenceScore: number
  confidenceJustification: string | null
  ishikawa: Partial<Record<IshikawaKey, string | null>>
  sources: { alias: string; role: string; key_points: string[] }[]
  recommendations: string[]
  actionItems?: PrintableActionItem[]
}

type IshikawaKey = 'mao_de_obra' | 'maquina' | 'metodo' | 'material' | 'meio_ambiente' | 'medicao'

const ISHIKAWA_LABELS: Record<IshikawaKey, string> = {
  mao_de_obra:   'Mão de obra',
  maquina:       'Máquina',
  metodo:        'Método',
  material:      'Material',
  meio_ambiente: 'Meio ambiente',
  medicao:       'Medição',
}

const ISHIKAWA_KEYS: IshikawaKey[] = [
  'mao_de_obra', 'maquina', 'metodo', 'material', 'meio_ambiente', 'medicao',
]

const TIMEFRAME_CFG: Record<ActionPlanTimeframe, { label: string; window: string }> = {
  curto_prazo: { label: 'Curto',  window: '0–90 dias'   },
  medio_prazo: { label: 'Médio',  window: '90–180 dias' },
  longo_prazo: { label: 'Longo',  window: '180+ dias'   },
}

const TIMEFRAME_ORDER: ActionPlanTimeframe[] = ['curto_prazo', 'medio_prazo', 'longo_prazo']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confidenceBand(score: number): { label: string; reading: string } {
  if (score >= 70) return { label: 'Alta',     reading: 'Convergência consistente entre fontes independentes.' }
  if (score >= 40) return { label: 'Moderada', reading: 'Convergência parcial — recomenda-se validação complementar.' }
  return { label: 'Baixa', reading: 'Evidências limitadas — tratar como hipótese a confirmar.' }
}

const fmtDate = fmtDataExtenso
const fmtMonthYear = fmtMesAno

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Renderiza a versão para impressão do relatório.
 *
 * O conteúdo é montado via portal diretamente em document.body — o CSS de
 * impressão esconde todos os filhos diretos de body exceto este, garantindo
 * que sidebar, breadcrumbs e botões não apareçam no PDF.
 */
export function ReportPrintable(props: ReportPrintableProps) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'rp-portal'
    document.body.appendChild(el)
    setHost(el)
    return () => { document.body.removeChild(el) }
  }, [])

  if (!host) return null
  return createPortal(<ReportPrintableContent {...props} />, host)
}

function ReportPrintableContent(props: ReportPrintableProps) {
  const {
    investigationTitle, problemDescription, companyName, generatedAt,
    rootCause, confidenceScore, confidenceJustification,
    ishikawa, sources, recommendations, actionItems = [],
  } = props

  const band = confidenceBand(confidenceScore)
  const dimensoesTocadas = ISHIKAWA_KEYS.filter(k => ishikawa[k]).length
  const totalKeyPoints = sources.reduce((acc, s) => acc + s.key_points.length, 0)

  const grouped = TIMEFRAME_ORDER.map(tf => ({
    tf,
    cfg: TIMEFRAME_CFG[tf],
    items: actionItems.filter(i => i.timeframe === tf),
  })).filter(g => g.items.length > 0)

  const Footer = ({ n }: { n: string }) => (
    <div className="rp-foot">
      <span>Elo · Relatório de Causa Raiz · {companyName}</span>
      <span>{n}</span>
    </div>
  )

  const Head = ({ section }: { section: string }) => (
    <div className="rp-head">
      <span>ELO · INTELIGÊNCIA OPERACIONAL</span>
      <span>{section}</span>
    </div>
  )

  return (
    <div className="rp-root" aria-hidden="true">
      <style>{PRINT_CSS}</style>

      {/* ═══ CAPA ═══ */}
      <section className="rp-page rp-cover">
        <div className="rp-cover-brand">
          <span className="rp-cover-mark">E</span>
          <div>
            <div className="rp-cover-brand-name">Elo</div>
            <div className="rp-cover-brand-sub">Inteligência Operacional</div>
          </div>
        </div>

        <div className="rp-cover-body">
          <div className="rp-cover-eyebrow">Relatório técnico · Investigação de causa raiz</div>
          <h1 className="rp-cover-title">{investigationTitle}</h1>
          <p className="rp-cover-desc">
            Diagnóstico estruturado sobre a causa raiz do problema operacional relatado, construído
            a partir de entrevistas conduzidas por IA com as fontes diretamente envolvidas, com
            validação cruzada anônima e recomendações práticas de intervenção.
          </p>
          <div className="rp-cover-for">Preparado para {companyName}</div>
        </div>

        <div className="rp-cover-meta">
          <div className="rp-cover-meta-row">
            <span>Emissão · {fmtMonthYear(generatedAt)}</span>
            <span className="rp-conf">CONFIDENCIAL</span>
          </div>
          <div className="rp-cover-meta-row">
            <span>Confiança · {confidenceScore}% ({band.label})</span>
          </div>
          <div className="rp-cover-meta-row">
            <span>Fontes consultadas · {sources.length}</span>
          </div>
        </div>
      </section>

      {/* ═══ 01 — PANORAMA ═══ */}
      <section className="rp-page">
        <Head section="PANORAMA GERAL" />

        <div className="rp-sec-num">01 — PANORAMA</div>
        <h2 className="rp-sec-title">O que a investigação encontrou.</h2>
        <p className="rp-sec-lead">
          Esta página resume o resultado consolidado da investigação: o problema originalmente
          relatado, a causa raiz identificada e o grau de confiança técnico atribuído ao diagnóstico.
        </p>

        <div className="rp-kpis">
          <div className="rp-kpi">
            <div className="rp-kpi-val">{confidenceScore}<span className="rp-kpi-unit">/100</span></div>
            <div className="rp-kpi-lbl">Confiança</div>
            <div className="rp-kpi-sub">{band.label}</div>
          </div>
          <div className="rp-kpi">
            <div className="rp-kpi-val">{sources.length}</div>
            <div className="rp-kpi-lbl">Fontes</div>
            <div className="rp-kpi-sub">Entrevistadas</div>
          </div>
          <div className="rp-kpi">
            <div className="rp-kpi-val">{dimensoesTocadas}<span className="rp-kpi-unit">/6</span></div>
            <div className="rp-kpi-lbl">Dimensões</div>
            <div className="rp-kpi-sub">Ishikawa 6M</div>
          </div>
          <div className="rp-kpi">
            <div className="rp-kpi-val">{actionItems.length || recommendations.length}</div>
            <div className="rp-kpi-lbl">Ações</div>
            <div className="rp-kpi-sub">Recomendadas</div>
          </div>
        </div>

        <div className="rp-block">
          <div className="rp-block-lbl">Problema investigado</div>
          <p className="rp-block-txt">{problemDescription}</p>
        </div>

        <div className="rp-block rp-block-accent">
          <div className="rp-block-lbl">Causa raiz identificada</div>
          <p className="rp-root-cause">{rootCause}</p>
          {confidenceJustification && (
            <p className="rp-just">{confidenceJustification}</p>
          )}
        </div>

        <div className="rp-band">
          <div className="rp-band-track">
            <div className="rp-band-fill" style={{ width: `${confidenceScore}%` }} />
          </div>
          <div className="rp-band-note">
            <strong>{confidenceScore}% de confiança — {band.label}.</strong> {band.reading}
          </div>
        </div>

        <Footer n="02" />
      </section>

      {/* ═══ 02 — METODOLOGIA ═══ */}
      <section className="rp-page">
        <Head section="METODOLOGIA" />

        <div className="rp-sec-num">02 — COMO FOI FEITO</div>
        <h2 className="rp-sec-title">Base técnica e protocolo de leitura.</h2>
        <p className="rp-sec-lead">
          A investigação segue metodologias consolidadas de análise de causa raiz e pesquisa
          qualitativa, automatizadas pelo Elo. A coleta ocorre diretamente com quem executa o
          trabalho, preservando o anonimato das fontes em todas as etapas.
        </p>

        <div className="rp-steps">
          <div className="rp-step">
            <div className="rp-step-num">01 — COLETA</div>
            <div className="rp-step-t">Entrevista adaptada por cargo</div>
            <p className="rp-step-d">
              A IA formula perguntas calibradas às responsabilidades de cada função, enviadas
              individualmente. Respostas por texto ou áudio, sem instalação de aplicativo.
            </p>
          </div>
          <div className="rp-step">
            <div className="rp-step-num">02 — APROFUNDAMENTO</div>
            <div className="rp-step-t">Saturação teórica</div>
            <p className="rp-step-d">
              Novas perguntas são feitas enquanto acrescentarem informação. A entrevista encerra
              por qualidade da informação, não por número fixo de perguntas.
            </p>
          </div>
          <div className="rp-step">
            <div className="rp-step-num">03 — VALIDAÇÃO</div>
            <div className="rp-step-t">Triangulação anônima</div>
            <p className="rp-step-d">
              Pontos levantados por uma fonte são verificados indiretamente com as demais, sem
              revelar origem. A convergência independente eleva a confiança.
            </p>
          </div>
        </div>

        <div className="rp-sub">Referências metodológicas</div>
        <ul className="rp-refs">
          <li><strong>Diagrama de Ishikawa (Kaoru Ishikawa)</strong> — estruturação das causas nas seis dimensões: mão de obra, máquina, método, material, meio ambiente e medição.</li>
          <li><strong>5 Porquês (Toyota / Taiichi Ohno)</strong> — aprofundamento sucessivo até alcançar a causa raiz, além dos sintomas aparentes.</li>
          <li><strong>Método Delphi (RAND Corporation)</strong> — consulta a múltiplas fontes de forma anônima e iterativa, buscando convergência sem contaminação entre respondentes.</li>
          <li><strong>Saturação teórica (Glaser &amp; Strauss)</strong> — critério de encerramento: para-se quando novas respostas deixam de acrescentar informação.</li>
          <li><strong>Triangulação de dados (Denzin)</strong> — o grau de confiança reflete a convergência entre fontes independentes que não se comunicaram entre si.</li>
        </ul>

        <div className="rp-sub">Faixas de confiança</div>
        <table className="rp-table">
          <thead>
            <tr><th>Faixa</th><th>Escore</th><th>Leitura técnica</th></tr>
          </thead>
          <tbody>
            <tr><td>Alta</td><td>70 a 100</td><td>Convergência consistente entre fontes independentes. Base sólida para ação.</td></tr>
            <tr><td>Moderada</td><td>40 a 69</td><td>Convergência parcial. Recomenda-se validação complementar antes de intervenções estruturais.</td></tr>
            <tr><td>Baixa</td><td>abaixo de 40</td><td>Evidências limitadas. Tratar o diagnóstico como hipótese a ser confirmada.</td></tr>
          </tbody>
        </table>

        <div className="rp-note">
          <strong>Sobre anonimato.</strong> As fontes são identificadas exclusivamente por alias
          (Colaborador A, B, C…) e cargo. Nomes, números de telefone e qualquer dado que permita
          identificação individual não constam deste documento nem são acessíveis na plataforma.
        </div>

        <Footer n="03" />
      </section>

      {/* ═══ 03 — ISHIKAWA ═══ */}
      <section className="rp-page">
        <Head section="ANÁLISE POR DIMENSÃO" />

        <div className="rp-sec-num">03 — DIMENSÕES</div>
        <h2 className="rp-sec-title">Seis dimensões, uma leitura.</h2>
        <p className="rp-sec-lead">
          As causas identificadas, organizadas pelas seis dimensões do diagrama de Ishikawa.
          Dimensões sem registro não foram apontadas pelas fontes nesta investigação —
          ausência de evidência, não evidência de ausência.
        </p>

        <div className="rp-dims">
          {ISHIKAWA_KEYS.map(key => {
            const val = ishikawa[key]
            return (
              <div key={key} className={`rp-dim ${val ? '' : 'rp-dim-empty'}`}>
                <div className="rp-dim-head">
                  <span className="rp-dim-lbl">{ISHIKAWA_LABELS[key]}</span>
                  <span className={`rp-dim-tag ${val ? 'rp-tag-on' : 'rp-tag-off'}`}>
                    {val ? 'IDENTIFICADO' : 'SEM REGISTRO'}
                  </span>
                </div>
                <p className="rp-dim-txt">{val ?? 'Não apontado pelas fontes nesta investigação.'}</p>
              </div>
            )
          })}
        </div>

        <div className="rp-note">
          <strong>Síntese.</strong> {dimensoesTocadas} de 6 dimensões apresentaram registro nesta
          investigação. Concentração em poucas dimensões costuma indicar causa bem delimitada;
          dispersão entre muitas sugere problema sistêmico, que exige intervenção mais ampla.
        </div>

        <Footer n="04" />
      </section>

      {/* ═══ 04 — FONTES ═══ */}
      {sources.length > 0 && (
        <section className="rp-page">
          <Head section="FONTES CONSULTADAS" />

          <div className="rp-sec-num">04 — FONTES</div>
          <h2 className="rp-sec-title">Quem foi ouvido e o que foi dito.</h2>
          <p className="rp-sec-lead">
            Pontos-chave extraídos de cada fonte ao longo da investigação, apresentados de forma
            anonimizada. {sources.length} fonte(s) consultada(s), {totalKeyPoints} ponto(s)
            relevante(s) registrado(s).
          </p>

          <table className="rp-table rp-table-tight">
            <thead>
              <tr><th>Fonte</th><th>Cargo</th><th>Pontos</th></tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={i}>
                  <td><strong>{s.alias}</strong></td>
                  <td>{s.role}</td>
                  <td>{s.key_points.length}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="rp-sources">
            {sources.map((s, i) => (
              <div key={i} className="rp-source">
                <div className="rp-source-head">
                  <span className="rp-source-alias">{s.alias}</span>
                  <span className="rp-source-role">{s.role}</span>
                </div>
                {s.key_points.length > 0 ? (
                  <ul className="rp-source-pts">
                    {s.key_points.map((kp, j) => <li key={j}>{kp}</li>)}
                  </ul>
                ) : (
                  <p className="rp-dim-txt">Sem pontos registrados.</p>
                )}
              </div>
            ))}
          </div>

          <Footer n="05" />
        </section>
      )}

      {/* ═══ 05 — PLANO DE AÇÃO ═══ */}
      {(grouped.length > 0 || recommendations.length > 0) && (
        <section className="rp-page">
          <Head section="PLANO DE AÇÃO" />

          <div className="rp-sec-num">05 — RECOMENDAÇÕES</div>
          <h2 className="rp-sec-title">O que fazer com isso.</h2>
          <p className="rp-sec-lead">
            Frentes de trabalho organizadas por horizonte de execução, priorizando ações de maior
            efeito sobre a causa raiz identificada.
          </p>

          {grouped.map(({ tf, cfg, items }) => (
            <div key={tf} className="rp-tf">
              <div className="rp-tf-side">
                <div className="rp-tf-lbl">{cfg.label}</div>
                <div className="rp-tf-win">{cfg.window}</div>
              </div>
              <div className="rp-tf-body">
                {items.map((it, i) => (
                  <div key={i} className="rp-action">
                    <div className="rp-action-what">
                      {it.what}
                      {it.is_recurring_pattern && <span className="rp-recur">PADRÃO RECORRENTE</span>}
                    </div>
                    <p className="rp-action-why">{it.why}</p>
                    <p className="rp-action-how"><strong>Como executar.</strong> {it.how_to}</p>
                    <div className="rp-action-meta">
                      {it.who_role && <span>Responsável: {it.who_role}</span>}
                      {it.where_scope && <span>Escopo: {it.where_scope}</span>}
                      {it.how_much_estimate && <span>Estimativa: {it.how_much_estimate}</span>}
                      <span>Impacto {it.impact_score}/100</span>
                      <span>Esforço {it.effort_score}/100</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {recommendations.length > 0 && (
            <>
              <div className="rp-sub">Recomendações gerais</div>
              <ol className="rp-recs">
                {recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ol>
            </>
          )}

          <Footer n="06" />
        </section>
      )}

      {/* ═══ 06 — ENCERRAMENTO ═══ */}
      <section className="rp-page">
        <Head section="ENCERRAMENTO" />

        <div className="rp-sec-num">06 — CONSIDERAÇÕES FINAIS</div>
        <h2 className="rp-sec-title">Próximos passos.</h2>
        <p className="rp-sec-lead">
          Este relatório é um instantâneo técnico: captura a causa raiz de um problema específico
          no momento em que foi investigado. Seu valor maior está em transformar percepção difusa
          em diagnóstico acionável — e em servir de base de comparação para investigações futuras.
        </p>

        <div className="rp-sub">O que esperar da implementação</div>
        <ul className="rp-refs">
          <li>Execução das ações de curto prazo tende a produzir sinal observável em 30 a 90 dias, especialmente nas dimensões de método e mão de obra.</li>
          <li>Reinvestigar o mesmo tema após a intervenção permite medir efeito real e identificar causas residuais que não estavam visíveis neste ciclo.</li>
          <li>Padrões que reaparecem em investigações distintas indicam causa sistêmica — nesses casos, a intervenção pontual tende a não sustentar o resultado.</li>
        </ul>

        <div className="rp-callout">
          <div className="rp-callout-lbl">Observação central</div>
          <p>
            A causa raiz descrita neste relatório emergiu da convergência entre fontes que não se
            comunicaram entre si, cada uma respondendo a partir da própria posição na operação.
            É justamente essa independência que sustenta o grau de confiança atribuído.
          </p>
        </div>

        <div className="rp-note">
          <strong>Sigilo.</strong> Este documento é confidencial e destinado exclusivamente à
          liderança de {companyName}. Contém informações operacionais sensíveis obtidas sob
          garantia de anonimato às fontes. A reprodução ou redistribuição depende de autorização
          expressa. As respostas originais permanecem em ambiente seguro da plataforma Elo.
        </div>

        <div className="rp-sign">
          <div className="rp-sign-col">
            <div className="rp-sign-lbl">Relatório gerado por</div>
            <div className="rp-sign-line" />
            <div className="rp-sign-name">Elo · Inteligência Operacional</div>
            <div className="rp-sign-sub">Análise assistida por IA · {fmtDate(generatedAt)}</div>
          </div>
          <div className="rp-sign-col">
            <div className="rp-sign-lbl">Ciência da liderança</div>
            <div className="rp-sign-line" />
            <div className="rp-sign-name">{companyName}</div>
            <div className="rp-sign-sub">Nome e cargo do responsável</div>
          </div>
        </div>

        <Footer n="07" />
      </section>
    </div>
  )
}

// ─── CSS de impressão ─────────────────────────────────────────────────────────
// Mantido como string para conter as regras de @page/page-break em um só lugar,
// fora do alcance do purge do Tailwind.

const PRINT_CSS = `
.rp-root { display: none; }

@media print {
  /* Esconde toda a aplicação. O documento a imprimir é escolhido pelo
     data-imprimir no body — o relatório gerencial e a devolutiva convivem na
     mesma tela, e sem isso os dois sairiam juntos no mesmo PDF. */
  body > * { display: none !important; }
  body[data-imprimir="relatorio"] > .rp-portal { display: block !important; }

  html, body {
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .rp-root {
    display: block !important;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #0F172A;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* As margens ficam no @page, não no padding do bloco. Quando uma seção é mais
     alta que uma folha, o navegador continua na folha seguinte respeitando a
     margem da página — antes o conteúdo transbordado encostava no topo do
     papel, porque o recuo existia só dentro do bloco. */
  @page { size: A4; margin: 16mm 18mm 15mm; }

  .rp-page {
    box-sizing: border-box;
    page-break-after: always;
    break-after: page;
    display: flex;
    flex-direction: column;
    min-height: 267mm;   /* 297 menos as margens — mantém o rodapé embaixo */
    position: relative;
  }
  .rp-page:last-child { page-break-after: auto; break-after: auto; }

  /* Nunca deixar uma ou duas linhas soltas na virada */
  p, li { orphans: 3; widows: 3; }
  h2, h3, .rp-sec-num, .rp-sub { break-after: avoid; page-break-after: avoid; }

  /* ── Header / Footer correntes ── */
  .rp-head {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 6.5pt; font-weight: 700; letter-spacing: .14em;
    color: #94A3B8; text-transform: uppercase;
    padding-bottom: 5mm; margin-bottom: 8mm;
    border-bottom: .5pt solid #E2E8F0;
  }
  .rp-foot {
    margin-top: auto; padding-top: 5mm;
    border-top: .5pt solid #E2E8F0;
    display: flex; justify-content: space-between;
    font-size: 6.5pt; color: #94A3B8; letter-spacing: .04em;
  }

  /* ── Capa ── */
  /* Puxa a capa para fora das margens da página e devolve o recuo por dentro,
     para o fundo escuro chegar até a borda do papel */
  .rp-cover {
    background: #0F172A;
    color: #fff;
    justify-content: space-between;
    margin: -16mm -18mm -15mm;
    padding: 16mm 18mm 15mm;
    min-height: 297mm;
  }
  .rp-cover-brand { display: flex; align-items: center; gap: 3mm; }
  .rp-cover-mark {
    width: 9mm; height: 9mm; border-radius: 2mm;
    background: rgba(13,148,136,.16); border: .5pt solid rgba(45,212,191,.35);
    color: #5EEAD4; font-weight: 800; font-size: 13pt;
    display: flex; align-items: center; justify-content: center;
  }
  .rp-cover-brand-name { font-size: 13pt; font-weight: 700; letter-spacing: -.01em; }
  .rp-cover-brand-sub {
    font-size: 6.5pt; letter-spacing: .18em; text-transform: uppercase; color: #64748B;
  }
  .rp-cover-body { padding-bottom: 8mm; }
  .rp-cover-eyebrow {
    font-size: 7pt; font-weight: 700; letter-spacing: .2em;
    text-transform: uppercase; color: #5EEAD4; margin-bottom: 6mm;
  }
  .rp-cover-title {
    font-size: 30pt; font-weight: 800; line-height: 1.08;
    letter-spacing: -.02em; margin: 0 0 7mm; color: #fff;
  }
  .rp-cover-desc {
    font-size: 9.5pt; line-height: 1.65; color: #CBD5E1;
    max-width: 125mm; margin: 0 0 9mm;
  }
  .rp-cover-for {
    font-size: 9pt; color: #94A3B8;
    border-left: 1.5pt solid #0D9488; padding-left: 4mm;
  }
  .rp-cover-meta {
    border-top: .5pt solid rgba(255,255,255,.14); padding-top: 5mm;
    display: flex; flex-direction: column; gap: 1.8mm;
  }
  .rp-cover-meta-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 7.5pt; color: #94A3B8; letter-spacing: .03em;
  }
  .rp-conf {
    font-size: 6.5pt; font-weight: 700; letter-spacing: .18em;
    color: #FCA5A5; border: .5pt solid rgba(248,113,113,.4);
    padding: 1mm 2.5mm; border-radius: 1mm;
  }

  /* ── Seções ── */
  .rp-sec-num {
    font-size: 7pt; font-weight: 700; letter-spacing: .2em;
    text-transform: uppercase; color: #0D9488; margin-bottom: 3mm;
  }
  .rp-sec-title {
    font-size: 19pt; font-weight: 700; letter-spacing: -.015em;
    margin: 0 0 4mm; color: #0F172A;
  }
  .rp-sec-lead {
    font-size: 8.5pt; line-height: 1.6; color: #475569;
    max-width: 150mm; margin: 0 0 8mm;
  }
  .rp-sub {
    font-size: 7pt; font-weight: 700; letter-spacing: .16em;
    text-transform: uppercase; color: #64748B;
    margin: 7mm 0 3mm; padding-bottom: 1.5mm;
    border-bottom: .5pt solid #E2E8F0;
  }

  /* ── KPIs ── */
  .rp-kpis {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 4mm; margin-bottom: 8mm;
  }
  .rp-kpi {
    border: .5pt solid #E2E8F0; border-radius: 2mm;
    padding: 4mm; background: #F8FAFC;
  }
  .rp-kpi-val {
    font-size: 21pt; font-weight: 800; line-height: 1;
    color: #0F172A; letter-spacing: -.02em;
  }
  .rp-kpi-unit { font-size: 10pt; font-weight: 600; color: #94A3B8; }
  .rp-kpi-lbl {
    font-size: 6.5pt; font-weight: 700; letter-spacing: .14em;
    text-transform: uppercase; color: #64748B; margin-top: 2.5mm;
  }
  .rp-kpi-sub { font-size: 6.5pt; color: #94A3B8; margin-top: .8mm; }

  /* ── Blocos ── */
  .rp-block {
    border: .5pt solid #E2E8F0; border-radius: 2mm;
    padding: 5mm; margin-bottom: 5mm;
    page-break-inside: avoid; break-inside: avoid;
  }
  .rp-block-accent { border-left: 2pt solid #0D9488; background: #F0FDFA; }
  .rp-block-lbl {
    font-size: 6.5pt; font-weight: 700; letter-spacing: .16em;
    text-transform: uppercase; color: #64748B; margin-bottom: 2.5mm;
  }
  .rp-block-txt { font-size: 8.5pt; line-height: 1.65; color: #334155; margin: 0; }
  .rp-root-cause {
    font-size: 10.5pt; font-weight: 600; line-height: 1.5;
    color: #0F172A; margin: 0;
  }
  .rp-just {
    font-size: 8pt; line-height: 1.6; color: #475569;
    margin: 3mm 0 0; padding-left: 3.5mm;
    border-left: 1pt solid #99F6E4; font-style: italic;
  }

  /* ── Barra de confiança ── */
  .rp-band { margin-bottom: 6mm; page-break-inside: avoid; }
  .rp-band-track {
    height: 2.2mm; background: #E2E8F0; border-radius: 2mm;
    overflow: hidden; margin-bottom: 2.5mm;
  }
  .rp-band-fill { height: 100%; background: #0D9488; border-radius: 2mm; }
  .rp-band-note { font-size: 7.5pt; color: #475569; line-height: 1.55; }

  /* ── Etapas ── */
  .rp-steps {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 4mm; margin-bottom: 3mm;
  }
  .rp-step { border-top: 1.5pt solid #0F172A; padding-top: 3mm; }
  .rp-step-num {
    font-size: 6.5pt; font-weight: 700; letter-spacing: .14em;
    color: #0D9488; margin-bottom: 2mm;
  }
  .rp-step-t { font-size: 8.5pt; font-weight: 700; color: #0F172A; margin-bottom: 2mm; }
  .rp-step-d { font-size: 7.5pt; line-height: 1.55; color: #475569; margin: 0; }

  /* ── Listas de referência ── */
  .rp-refs { margin: 0; padding: 0; list-style: none; }
  .rp-refs li {
    font-size: 8pt; line-height: 1.6; color: #334155;
    padding-left: 5mm; margin-bottom: 2.5mm; position: relative;
  }
  .rp-refs li::before {
    content: ''; position: absolute; left: 0; top: 1.7mm;
    width: 1.6mm; height: 1.6mm; border-radius: 50%; background: #0D9488;
  }

  /* ── Tabelas ── */
  .rp-table {
    width: 100%; border-collapse: collapse; margin-bottom: 5mm;
    page-break-inside: avoid; break-inside: avoid;
  }
  .rp-table th {
    font-size: 6.5pt; font-weight: 700; letter-spacing: .14em;
    text-transform: uppercase; color: #64748B; text-align: left;
    padding: 2.5mm 3mm; border-bottom: 1pt solid #0F172A;
  }
  .rp-table td {
    font-size: 8pt; color: #334155; padding: 2.5mm 3mm;
    border-bottom: .5pt solid #E2E8F0; line-height: 1.5; vertical-align: top;
  }
  .rp-table-tight td, .rp-table-tight th { padding: 2mm 3mm; }

  /* ── Dimensões Ishikawa ── */
  .rp-dims { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 6mm; }
  .rp-dim {
    border: .5pt solid #CCFBF1; background: #F0FDFA; border-radius: 2mm;
    padding: 4mm; page-break-inside: avoid; break-inside: avoid;
    /* Afasta do topo quando o card abre uma página nova */
    margin-top: 1mm;
  }
  .rp-dim-empty { border-color: #E2E8F0; background: #F8FAFC; }
  .rp-dim-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 2.5mm; gap: 2mm;
  }
  .rp-dim-lbl {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .1em;
    text-transform: uppercase; color: #0F172A;
  }
  .rp-dim-tag {
    font-size: 5.5pt; font-weight: 700; letter-spacing: .1em;
    padding: .8mm 1.8mm; border-radius: 3mm; white-space: nowrap;
  }
  .rp-tag-on  { background: #CCFBF1; color: #0F766E; }
  .rp-tag-off { background: #E2E8F0; color: #94A3B8; }
  .rp-dim-txt { font-size: 8pt; line-height: 1.6; color: #334155; margin: 0; }
  .rp-dim-empty .rp-dim-txt { color: #94A3B8; font-style: italic; }

  /* ── Fontes ── */
  .rp-sources { display: flex; flex-direction: column; gap: 4mm; }
  .rp-source {
    border: .5pt solid #E2E8F0; border-radius: 2mm; padding: 4mm;
    page-break-inside: avoid; break-inside: avoid;
  }
  .rp-source-head {
    display: flex; align-items: baseline; gap: 3mm;
    padding-bottom: 2.5mm; margin-bottom: 2.5mm;
    border-bottom: .5pt solid #F1F5F9;
  }
  .rp-source-alias { font-size: 9pt; font-weight: 700; color: #0F172A; }
  .rp-source-role {
    font-size: 7pt; letter-spacing: .1em; text-transform: uppercase; color: #64748B;
  }
  .rp-source-pts { margin: 0; padding: 0; list-style: none; }
  .rp-source-pts li {
    font-size: 8pt; line-height: 1.6; color: #334155;
    padding-left: 4.5mm; margin-bottom: 2mm; position: relative;
  }
  .rp-source-pts li::before {
    content: ''; position: absolute; left: 0; top: 1.7mm;
    width: 1.4mm; height: 1.4mm; border-radius: 50%; background: #5EEAD4;
  }

  /* ── Plano de ação ── */
  /* Prazo como faixa horizontal em vez de coluna lateral: a coluna consumia
     28mm dos 174mm úteis em toda a extensão da seção, espremendo o texto das
     ações sem necessidade */
  .rp-tf {
    padding-top: 3mm; margin-bottom: 5mm;
    border-top: 1pt solid #0F172A;
  }
  .rp-tf-side {
    display: flex; align-items: baseline; gap: 2.5mm;
    margin-bottom: 3mm;
  }
  .rp-tf-lbl {
    font-size: 8pt; font-weight: 800; letter-spacing: .14em;
    text-transform: uppercase; color: #0F172A;
  }
  .rp-tf-win {
    font-size: 6.5pt; color: #64748B;
    border-left: .5pt solid #CBD5E1; padding-left: 2.5mm;
  }
  .rp-tf-body { display: flex; flex-direction: column; gap: 3.5mm; }
  .rp-action { page-break-inside: avoid; break-inside: avoid; }
  .rp-action-what {
    font-size: 8.5pt; font-weight: 700; color: #0F172A;
    line-height: 1.45; margin-bottom: 1.5mm;
  }
  .rp-recur {
    font-size: 5.5pt; font-weight: 700; letter-spacing: .1em;
    background: #FEE2E2; color: #B91C1C;
    padding: .6mm 1.6mm; border-radius: 3mm; margin-left: 2mm;
    white-space: nowrap;
  }
  .rp-action-why { font-size: 7.5pt; line-height: 1.55; color: #475569; margin: 0 0 1.5mm; }
  .rp-action-how { font-size: 7.5pt; line-height: 1.55; color: #334155; margin: 0 0 2mm; }
  .rp-action-meta { display: flex; flex-wrap: wrap; gap: 1.5mm; }
  .rp-action-meta span {
    font-size: 6pt; letter-spacing: .06em; text-transform: uppercase;
    background: #F1F5F9; color: #475569;
    padding: .8mm 1.8mm; border-radius: 1mm;
  }

  /* ── Recomendações ── */
  .rp-recs { margin: 0; padding: 0; list-style: none; counter-reset: rec; }
  .rp-recs li {
    counter-increment: rec; font-size: 8pt; line-height: 1.6; color: #334155;
    padding-left: 7mm; margin-bottom: 3mm; position: relative;
    page-break-inside: avoid; break-inside: avoid;
  }
  .rp-recs li::before {
    content: counter(rec); position: absolute; left: 0; top: 0;
    width: 4.5mm; height: 4.5mm; border-radius: 1mm;
    background: #0F172A; color: #fff;
    font-size: 6pt; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }

  /* ── Nota / Callout ── */
  .rp-note {
    font-size: 7.5pt; line-height: 1.6; color: #475569;
    background: #F8FAFC; border: .5pt solid #E2E8F0; border-radius: 2mm;
    padding: 4mm; margin-top: 5mm;
    page-break-inside: avoid; break-inside: avoid;
  }
  .rp-callout {
    background: #0F172A; color: #fff; border-radius: 2mm;
    padding: 5mm; margin: 6mm 0;
    page-break-inside: avoid; break-inside: avoid;
  }
  .rp-callout-lbl {
    font-size: 6.5pt; font-weight: 700; letter-spacing: .18em;
    text-transform: uppercase; color: #5EEAD4; margin-bottom: 2.5mm;
  }
  .rp-callout p { font-size: 8.5pt; line-height: 1.65; color: #E2E8F0; margin: 0; }

  /* ── Assinaturas ── */
  .rp-sign {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10mm;
    margin-top: 10mm; page-break-inside: avoid; break-inside: avoid;
  }
  .rp-sign-lbl {
    font-size: 6.5pt; font-weight: 700; letter-spacing: .16em;
    text-transform: uppercase; color: #64748B; margin-bottom: 9mm;
  }
  .rp-sign-line { border-top: .5pt solid #94A3B8; margin-bottom: 2.5mm; }
  .rp-sign-name { font-size: 8.5pt; font-weight: 600; color: #0F172A; }
  .rp-sign-sub { font-size: 7pt; color: #64748B; margin-top: .8mm; }
}
`
