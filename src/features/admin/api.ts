import { getSupabase } from '@/lib/supabase'
import type { AdminRequest } from '../../../supabase/functions/_shared/admin-contract'

const messages: Record<string, string> = {
  member_must_be_inactive:
    'Desative o integrante antes de removê-lo. Atualize a lista e tente novamente.',
  unauthorized: 'Entre novamente para continuar.',
  access_denied: 'Seu acesso não permite esta operação. Confirme sua sessão e o MFA.',
  last_admin: 'O escritório precisa manter pelo menos um administrador ativo.',
  rate_limited: 'Muitas solicitações. Aguarde um minuto e tente novamente.',
  invite_unavailable:
    'Não é possível convidar esse e-mail. Verifique se já existe um convite ou uma conta.',
  invite_failed: 'O convite não foi enviado. Verifique o serviço de e-mail e tente novamente.',
  invite_incomplete:
    'O e-mail foi enviado, mas o acesso não foi concedido. Peça à administração técnica para verificar o convite pendente.',
  invalid_request: 'Confira os campos. Informe uma justificativa com pelo menos 3 caracteres.',
}
export async function administration<T>(request: AdminRequest): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('admin-users', { body: request })
  if (error) {
    let code = ''
    if (error.context instanceof Response) {
      try {
        code = (await error.context.json()).error
      } catch {
        /* No JSON on gateway failures. */
      }
    }
    throw new Error(
      messages[code] ?? 'Não foi possível concluir. Verifique sua conexão e tente novamente.',
    )
  }
  return data as T
}
export type TeamUser = {
  id: string
  full_name: string
  email: string
  role: 'admin' | 'lawyer' | 'assistant'
  is_active: boolean
  email_confirmed_at: string | null
  last_sign_in_at: string | null
}
export const roleNames = { admin: 'Administrador', lawyer: 'Advogado', assistant: 'Assistente' }
