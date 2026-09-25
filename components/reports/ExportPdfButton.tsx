'use client'

/**
 * Normaliza um pedaço do nome do arquivo.
 *
 * O navegador usa o <title> da página como nome sugerido do PDF, e alguns
 * caracteres (barra, dois-pontos) quebram o salvamento no Windows.
 */
function pedaco(texto: string, maxPalavras = 8): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // remove acento
    .replace(/[^\w\s-]/g, ' ')                          // tira pontuação e barras
    .trim()
    .split(/\s+/)
    .slice(0, maxPalavras)
    .join(' ')
}

/** `devolutiva_Construtora Boa Vista_25_09` */
export function nomeDevolutiva(empresa: string, data = new Date()): string {
  const dd = String(data.getDate()).padStart(2, '0')
  const mm = String(data.getMonth() + 1).padStart(2, '0')
  return ['devolutiva', pedaco(empresa), dd, mm].filter(Boolean).join('_')
}

/** `relatorio_Manutencao Corretiva_Construtora Boa Vista_25_09_2026_elo inteligencia operacional` */
export function nomeRelatorioGerencial(titulo: string, empresa: string, data = new Date()): string {
  const dd = String(data.getDate()).padStart(2, '0')
  const mm = String(data.getMonth() + 1).padStart(2, '0')
  const aaaa = data.getFullYear()
  return [
    'relatorio',
    pedaco(titulo),
    pedaco(empresa),
    dd, mm, String(aaaa),
    'elo inteligencia operacional',
  ].filter(Boolean).join('_')
}

interface Props {
  className?: string
  /** Nome sugerido do arquivo, sem extensão */
  nomeArquivo?: string
  rotulo?: string
  /**
   * Qual documento imprimir. Os dois ficam montados na mesma tela; sem isto,
   * o relatório gerencial e a devolutiva sairiam juntos no mesmo PDF — e o
   * gerencial contém as observações sensíveis que não podem circular.
   */
  modo?: 'relatorio' | 'devolutiva'
}

/**
 * Dispara o diálogo de impressão do navegador. O usuário escolhe
 * "Salvar como PDF" como destino. O layout impresso vem dos componentes
 * *Printable.
 */
export function ExportPdfButton({
  className = '', nomeArquivo, rotulo = 'Exportar PDF', modo = 'relatorio',
}: Props) {
  function imprimir() {
    // O nome sugerido do arquivo vem do <title>; o documento a sair vem do
    // data-imprimir. Ambos são restaurados depois para a tela não ficar
    // alterada.
    const tituloOriginal = document.title
    if (nomeArquivo) document.title = nomeArquivo
    document.body.dataset.imprimir = modo

    const restaurar = () => {
      document.title = tituloOriginal
      delete document.body.dataset.imprimir
    }
    window.addEventListener('afterprint', restaurar, { once: true })

    window.print()

    // Rede de segurança: alguns navegadores não disparam afterprint
    setTimeout(restaurar, 60_000)
  }

  return (
    <button
      onClick={imprimir}
      className={`no-print inline-flex items-center gap-2 bg-slate-900 text-white text-[10px] font-semibold uppercase tracking-wider py-2.5 px-4 rounded-sm hover:bg-slate-800 transition-colors shadow-sm ${className}`}
      title="Abre o diálogo de impressão — escolha 'Salvar como PDF'"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
      </svg>
      {rotulo}
    </button>
  )
}
