import { adminRequest } from '../_shared/admin-contract.ts'

export type Identity = { id: string; session: string; aal: string }
type Result = {
  data: Record<string, unknown> | null
  error: { message: string; code?: string } | null
}
export type Dependencies = {
  appUrl: string
  authenticate: (token: string) => Promise<Identity | null>
  rpc: (
    identity: Identity,
    action: string,
    payload: Record<string, unknown>,
    requestId: string,
  ) => Promise<Result>
  invite: (email: string, redirect: string) => Promise<{ userId: string | null; error: boolean }>
}

export function createHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID()
    const origin = request.headers.get('origin')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
    const appOrigin = new URL(deps.appUrl).origin
    if (origin === appOrigin) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status: number, error: string, extra = {}) =>
      new Response(JSON.stringify({ error, request_id: requestId, ...extra }), { status, headers })
    if (origin && origin !== appOrigin) return reply(403, 'origin_denied')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, 'method_not_allowed')
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return reply(415, 'invalid_request')
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ')) return reply(401, 'unauthorized')
    try {
      const identity = await deps.authenticate(authorization.slice(7))
      if (!identity) return reply(401, 'unauthorized')
      if (identity.aal !== 'aal2') return reply(403, 'access_denied')
      // Read with a strict bound instead of buffering an arbitrarily large request.
      const reader = request.body?.getReader()
      if (!reader) return reply(400, 'invalid_request')
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 8192) {
          await reader.cancel()
          return reply(413, 'invalid_request')
        }
        chunks.push(value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      let body: unknown
      try {
        body = JSON.parse(new TextDecoder().decode(bytes))
      } catch {
        return reply(400, 'invalid_request')
      }
      const parsed = adminRequest.safeParse(body)
      if (!parsed.success) return reply(400, 'invalid_request')
      const { action, ...payload } = parsed.data
      const call = (name: string, data: Record<string, unknown>) =>
        deps.rpc(identity, name, data, requestId)
      const failure = (r: Result) => {
        const code = r.data?.error ?? r.error?.message
        if (code === 'rate_limited') return reply(429, 'rate_limited')
        if (code === 'last_admin') return reply(409, 'last_admin')
        if (code === 'member_must_be_inactive') return reply(409, 'member_must_be_inactive')
        if (code === 'invite_unavailable') return reply(409, 'invite_unavailable')
        if (code === 'access_denied' || r.error?.code === '42501')
          return reply(403, 'access_denied')
        return reply(500, 'operation_failed')
      }
      if (action === 'invite' && 'email' in payload) {
        const prepared = await call('prepare_invite', payload)
        if (prepared.error || prepared.data?.error || !prepared.data?.invitation_id)
          return failure(prepared)
        const invitation_id = prepared.data.invitation_id
        let invitation: { userId: string | null; error: boolean }
        try {
          invitation = await deps.invite(payload.email, `${appOrigin}/auth/update-password`)
        } catch {
          invitation = { userId: null, error: true }
        }
        if (invitation.error || !invitation.userId) {
          await call('fail_invite', { invitation_id })
          return reply(502, 'invite_failed')
        }
        const completed = await call('complete_invite', {
          invitation_id,
          user_id: invitation.userId,
        })
        // Never delete an Auth user here: an ambiguous response must not remove an existing account.
        if (completed.error || completed.data?.error) return reply(409, 'invite_incomplete')
        return new Response(JSON.stringify({ ok: true, request_id: requestId }), { headers })
      }
      const result = await call(
        action,
        action === 'audit' && 'action_filter' in payload
          ? { ...payload, action: payload.action_filter }
          : payload,
      )
      if (result.error || result.data?.error) return failure(result)
      return new Response(JSON.stringify({ ...result.data, request_id: requestId }), { headers })
    } catch {
      return reply(500, 'operation_failed')
    }
  }
}
