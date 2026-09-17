export type EmailLink =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'verify'; tokenHash: string; type: 'invite' | 'recovery' }

// Read before the Auth SDK consumes/cleans the callback URL. Never display provider text.
export function parseEmailLink(url: string): EmailLink {
  const parsed = new URL(url)
  const fragment = new URLSearchParams(parsed.hash.slice(1))
  const get = (name: string) => fragment.get(name) ?? parsed.searchParams.get(name)
  if (get('error') || get('error_code'))
    return {
      kind: 'error',
      message:
        get('error_code') === 'otp_expired'
          ? 'Este link expirou, já foi utilizado ou não é mais válido. Solicite um novo link para definir sua senha.'
          : 'Não foi possível validar o link de acesso. Solicite um novo link e abra a mensagem mais recente.',
    }
  const tokenHash = get('token_hash')
  const type = get('type')
  if (tokenHash) {
    if ((type !== 'invite' && type !== 'recovery') || tokenHash.length > 2048)
      return { kind: 'error', message: 'Este link de acesso é inválido. Solicite um novo link.' }
    return { kind: 'verify', tokenHash, type }
  }
  return { kind: 'none' }
}

export function recoveryFeedback(error: { code?: string; status?: number } | null) {
  if (error?.code === 'over_email_send_rate_limit' || error?.status === 429)
    return 'Aguarde um minuto antes de solicitar outro e-mail. Se o limite continuar, fale com a administração.'
  if (error?.code === 'email_provider_disabled' || (error?.status ?? 0) >= 500)
    return 'O serviço de e-mail está indisponível. Peça à administração para verificar a configuração de envio.'
  if (error && !error.status)
    return 'Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.'
  // Do not distinguish unknown addresses from registered users.
  return 'Se houver uma conta para este e-mail, você receberá um novo link. Abra a mensagem mais recente e confira também o spam.'
}
