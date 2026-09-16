import { createClient } from '@supabase/supabase-js'
import { createHandler } from './handler.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}
const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing server configuration: ${name}`)
  return value
}
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(
  createHandler({
    appUrl: env('APP_URL'),
    async authenticate(token) {
      const { data: user, error: userError } = await admin.auth.getUser(token)
      if (userError || !user.user) return null
      const { data, error } = await admin.auth.getClaims(token)
      if (
        error ||
        !data ||
        data.claims.sub !== user.user.id ||
        data.claims.role !== 'authenticated'
      )
        return null
      const session = data.claims.session_id
      if (typeof session !== 'string' || !/^[0-9a-f-]{36}$/i.test(session)) return null
      return { id: user.user.id, session, aal: String(data.claims.aal) }
    },
    async rpc(identity, action, payload, requestId) {
      return await admin.rpc('manage_users', {
        p_actor: identity.id,
        p_session: identity.session,
        p_aal: identity.aal,
        p_action: action,
        p_payload: payload,
        p_request_id: requestId,
      })
    },
    async invite(email, redirectTo) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
      return { userId: data.user?.id ?? null, error: Boolean(error) }
    },
  }),
)
