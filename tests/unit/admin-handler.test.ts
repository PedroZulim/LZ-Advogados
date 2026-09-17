import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHandler, type Dependencies } from '../../supabase/functions/admin-users/handler'

const identity = {
  id: '30000000-0000-4000-8000-000000000001',
  session: '40000000-0000-4000-8000-000000000001',
  aal: 'aal2',
}
let deps: Dependencies
beforeEach(() => {
  deps = {
    appUrl: 'https://app.example.test',
    authenticate: vi.fn(async () => identity),
    rpc: vi.fn(async () => ({ data: { users: [] }, error: null })),
    invite: vi.fn(async () => ({ userId: '30000000-0000-4000-8000-000000000002', error: false })),
  }
})
const request = (body: unknown = { action: 'list' }, headers: Record<string, string> = {}) =>
  new Request('https://api.example.test/functions/v1/admin-users', {
    method: 'POST',
    headers: {
      authorization: 'Bearer signed-user-token',
      'content-type': 'application/json',
      origin: 'https://app.example.test',
      ...headers,
    },
    body: JSON.stringify(body),
  })
describe('Admin Edge Function HTTP boundary', () => {
  it('rejects missing or invalid JWTs before any privileged call', async () => {
    const handler = createHandler(deps)
    expect((await handler(request({}, { authorization: '' }))).status).toBe(401)
    vi.mocked(deps.authenticate).mockResolvedValue(null)
    expect((await handler(request())).status).toBe(401)
    expect(deps.rpc).not.toHaveBeenCalled()
    expect(deps.invite).not.toHaveBeenCalled()
  })
  it('denies sessions without MFA', async () => {
    vi.mocked(deps.authenticate).mockResolvedValue({ ...identity, aal: 'aal1' })
    expect((await createHandler(deps)(request())).status).toBe(403)
    expect(deps.rpc).not.toHaveBeenCalled()
  })
  it('validates CORS and supports preflight without granting authorization', async () => {
    const handler = createHandler(deps)
    expect((await handler(request({}, { origin: 'https://evil.test' }))).status).toBe(403)
    const response = await handler(
      new Request('https://api.test', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.test' },
      }),
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.test')
    expect(deps.rpc).not.toHaveBeenCalled()
  })
  it.each([
    { action: 'list', organization_id: 'forged' },
    { action: 'prepare_invite', email: 'attacker@test.com' },
    { action: 'complete_invite', user_id: identity.id },
    { action: 'change_role', user_id: identity.id, role: 'owner', reason: 'test' },
    {
      action: 'invite',
      email: 'person@test.com',
      full_name: 'Someone',
      role: 'admin',
      redirectTo: 'https://evil.test',
    },
    { action: 'set_active', user_id: identity.id, is_active: 'false', reason: 'test' },
  ])('rejects forged or invalid inputs: %j', async (body) => {
    expect((await createHandler(deps)(request(body))).status).toBe(400)
    expect(deps.rpc).not.toHaveBeenCalled()
  })
  it('bounds the request body and rejects malformed JSON', async () => {
    expect((await createHandler(deps)(request({ text: 'a'.repeat(9000) }))).status).toBe(413)
    const malformed = new Request('https://api.test', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: '{',
    })
    expect((await createHandler(deps)(malformed)).status).toBe(400)
  })
  it('uses only verified identity for the RPC', async () => {
    const response = await createHandler(deps)(request())
    expect(response.status).toBe(200)
    expect(deps.rpc).toHaveBeenCalledWith(identity, 'list', {}, expect.any(String))
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it.each([
    ['access_denied', 403],
    ['last_admin', 409],
    ['rate_limited', 429],
  ])('returns controlled errors for %s', async (error, status) => {
    vi.mocked(deps.rpc).mockResolvedValue({ data: { error }, error: null })
    expect((await createHandler(deps)(request())).status).toBe(status)
  })
  it('does not send an invite when database authorization rejects it', async () => {
    vi.mocked(deps.rpc).mockResolvedValue({
      data: null,
      error: { message: 'access_denied', code: '42501' },
    })
    expect(
      (
        await createHandler(deps)(
          request({
            action: 'invite',
            full_name: 'New person',
            email: 'new@example.test',
            role: 'assistant',
          }),
        )
      ).status,
    ).toBe(403)
    expect(deps.invite).not.toHaveBeenCalled()
  })
  it('reserves before sending, fixes redirect server-side, and finalizes access', async () => {
    vi.mocked(deps.rpc)
      .mockResolvedValueOnce({ data: { invitation_id: 'invitation' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true }, error: null })
    expect(
      (
        await createHandler(deps)(
          request({
            action: 'invite',
            full_name: 'New person',
            email: 'new@example.test',
            role: 'assistant',
          }),
        )
      ).status,
    ).toBe(200)
    expect(deps.invite).toHaveBeenCalledWith(
      'new@example.test',
      'https://app.example.test/auth/update-password',
    )
    expect(vi.mocked(deps.rpc).mock.calls.map((c) => c[1])).toEqual([
      'prepare_invite',
      'complete_invite',
    ])
  })
  it('records mail failure without granting access', async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ data: { invitation_id: 'invitation' }, error: null })
    vi.mocked(deps.invite).mockResolvedValue({ userId: null, error: true })
    expect(
      (
        await createHandler(deps)(
          request({
            action: 'invite',
            full_name: 'New person',
            email: 'new@example.test',
            role: 'assistant',
          }),
        )
      ).status,
    ).toBe(502)
    expect(vi.mocked(deps.rpc).mock.calls.map((c) => c[1])).toEqual([
      'prepare_invite',
      'fail_invite',
    ])
  })
  it('reports partial invite failure without deleting any account or claiming success', async () => {
    vi.mocked(deps.rpc)
      .mockResolvedValueOnce({ data: { invitation_id: 'invitation' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'access_denied' } })
    const response = await createHandler(deps)(
      request({
        action: 'invite',
        full_name: 'New person',
        email: 'new@example.test',
        role: 'assistant',
      }),
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('invite_incomplete')
  })
})
