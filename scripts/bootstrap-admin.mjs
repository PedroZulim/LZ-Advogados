import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_NAME, APP_URL } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_EMAIL || !ADMIN_NAME || !APP_URL) {
  throw new Error('Configure .env.admin conforme .env.admin.example.')
}
const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const organizationId = '10000000-0000-4000-8000-000000000001'
const existing = await client
  .from('profiles')
  .select('id', { count: 'exact', head: true })
  .eq('organization_id', organizationId)
  .eq('role', 'admin')
if (existing.error)
  throw new Error('Não foi possível verificar o estado inicial. Aplique as migrations primeiro.')
if (existing.count !== 0)
  throw new Error('O escritório já possui administrador. Bootstrap interrompido.')

// Run once, from a trusted terminal. Auth invite never assigns authorization via metadata.
const invite = await client.auth.admin.inviteUserByEmail(ADMIN_EMAIL, {
  redirectTo: `${APP_URL}/auth/update-password`,
})
if (invite.error || !invite.data.user)
  throw new Error(
    'Falha ao convidar administrador. Verifique o serviço Auth e o e-mail configurado.',
  )
const result = await client.from('profiles').insert({
  id: invite.data.user.id,
  organization_id: organizationId,
  full_name: ADMIN_NAME,
  role: 'admin',
})
if (result.error) {
  const rollback = await client.auth.admin.deleteUser(invite.data.user.id)
  throw new Error(
    rollback.error
      ? 'Perfil não criado. Conta Auth sem acesso ficou pendente; remova-a no painel administrativo antes de repetir.'
      : 'Perfil não criado; conta Auth removida. Verifique o banco antes de repetir.',
  )
}
console.log('Administrador convidado. Defina a senha e configure MFA pelo link recebido.')
