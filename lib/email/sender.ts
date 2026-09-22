/**
 * Envio de email.
 *
 * Hoje o MVP não tem provedor contratado. Esta camada existe para que o fluxo
 * de recuperação de senha já funcione ponta a ponta: quando RESEND_API_KEY for
 * configurada, o envio passa a acontecer sem nenhuma outra mudança de código.
 *
 * Sem provedor, retorna false e quem chamou decide o fallback (registrar o
 * link para repasse manual).
 */

export interface ResultadoEnvio {
  enviado: boolean
  erro?: string
}

function provedorConfigurado(): boolean {
  return Boolean((process.env.RESEND_API_KEY ?? '').trim())
}

async function enviarViaResend(para: string, assunto: string, html: string): Promise<ResultadoEnvio> {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim()
  const remetente = (process.env.EMAIL_FROM ?? '').trim() || 'Elo <nao-responda@resend.dev>'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: remetente, to: [para], subject: assunto, html }),
    })

    if (!res.ok) {
      return { enviado: false, erro: `Resend HTTP ${res.status}` }
    }
    return { enviado: true }
  } catch (err) {
    return { enviado: false, erro: err instanceof Error ? err.message : 'erro desconhecido' }
  }
}

/** Envia o email de recuperação. Retorna false se não houver provedor configurado. */
export async function enviarEmailRecuperacao(
  para: string,
  nome: string,
  link: string,
  validadeMin: number
): Promise<boolean> {
  if (!provedorConfigurado()) return false

  const html = `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0F172A">
  <div style="font-size:18px;font-weight:700;margin-bottom:24px">Elo</div>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Olá, ${nome}.</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 24px">
    Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.
  </p>
  <a href="${link}" style="display:inline-block;background:#0F172A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600">
    Redefinir minha senha
  </a>
  <p style="font-size:13px;line-height:1.6;color:#64748B;margin:24px 0 0">
    Este link vale por ${validadeMin} minutos e só pode ser usado uma vez.
    Se você não pediu isso, ignore este email — sua senha continua a mesma.
  </p>
</div>`.trim()

  const r = await enviarViaResend(para, 'Redefinir sua senha — Elo', html)
  return r.enviado
}
