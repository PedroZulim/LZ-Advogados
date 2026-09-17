// Local-only integration: real Auth, signed JWTs, TOTP and the running Edge Function.
import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.API_URL
assert.equal(
  url,
  'http://127.0.0.1:54321',
  'This test runs only against the local Supabase instance.',
)
assert.equal(process.env.VITE_SUPABASE_URL ?? process.env.API_URL, url)
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.PUBLISHABLE_KEY
const admin = createClient(
  url,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const nonce = randomBytes(8).toString('hex')
const orgs = [randomUUID(), randomUUID()]
const email = (n) => `admin-e2e-${nonce}-${n}@example.test`
const cleanupPath = join(tmpdir(), `lz-admin-test-${nonce}.sql`)
const cleanupSql = `do $$ begin
delete from private.user_invitations where organization_id in ('${orgs[0]}','${orgs[1]}');
delete from public.audit_logs where organization_id in ('${orgs[0]}','${orgs[1]}');
delete from public.cases where organization_id in ('${orgs[0]}','${orgs[1]}');
delete from public.clients where organization_id in ('${orgs[0]}','${orgs[1]}');
delete from public.legal_areas where organization_id in ('${orgs[0]}','${orgs[1]}');
delete from public.profiles where organization_id in ('${orgs[0]}','${orgs[1]}');
delete from public.organizations where id in ('${orgs[0]}','${orgs[1]}');
delete from auth.users where email like 'admin-e2e-${nonce}-%@example.test';
end $$;`
writeFileSync(cleanupPath, cleanupSql)

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of secret.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(character).toString(2).padStart(5, '0')
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest()
  return String((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1000000).padStart(6, '0')
}
function ok(result) {
  assert.equal(result.error, null, result.error?.message)
  return result.data
}
async function edge(token, body, expected = 200) {
  const response = await fetch(`${url}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      apikey: publicKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  const data = await response.json()
  assert.equal(response.status, expected, `${body.action}: ${JSON.stringify(data)}`)
  return data
}
async function account(n, role, organization) {
  const password = randomBytes(24).toString('base64url')
  const user = ok(
    await admin.auth.admin.createUser({ email: email(n), password, email_confirm: true }),
  ).user
  ok(
    await admin.from('profiles').insert({
      id: user.id,
      organization_id: organization,
      full_name: `Teste integração ${n}`,
      role,
    }),
  )
  const client = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const login = ok(await client.auth.signInWithPassword({ email: email(n), password }))
  const aal1 = login.session.access_token
  const factor = ok(
    await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Teste ${nonce}` }),
  )
  ok(
    await client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: totp(factor.totp.secret),
    }),
  )
  const session = ok(await client.auth.getSession()).session
  return {
    client,
    id: user.id,
    aal1,
    token: session.access_token,
    refreshToken: session.refresh_token,
  }
}
try {
  let ready = false
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const probe = await fetch(`${url}/functions/v1/admin-users`, {
        method: 'POST',
        headers: { apikey: publicKey, 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(2000),
      })
      if (probe.status === 401) {
        ready = true
        break
      }
    } catch {
      /* Function runtime can still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  assert(ready, 'Start admin-users with APP_URL before running this integration test.')
  ok(
    await admin
      .from('organizations')
      .insert(orgs.map((id, n) => ({ id, name: `Teste integração ${nonce} ${n}` }))),
  )
  const first = await account(1, 'admin', orgs[0])
  const lawyer = await account(2, 'lawyer', orgs[0])
  const assistant = await account(3, 'assistant', orgs[0])
  const foreign = await account(4, 'admin', orgs[1])
  const second = await account(5, 'admin', orgs[0])
  await edge('invalid.jwt.token', { action: 'list' }, 401)
  await edge(first.aal1, { action: 'list' }, 403)
  for (const user of [lawyer, assistant]) await edge(user.token, { action: 'list' }, 403)
  const users = await edge(first.token, { action: 'list' })
  assert.equal(users.users.length, 4)
  assert(!users.users.some((u) => u.id === foreign.id))
  await edge(
    first.token,
    { action: 'set_active', user_id: foreign.id, is_active: false, reason: 'Negative test' },
    403,
  )
  const direct = await first.client.rpc('manage_users', {
    p_actor: first.id,
    p_session: randomUUID(),
    p_aal: 'aal2',
    p_action: 'list',
    p_payload: {},
    p_request_id: randomUUID(),
  })
  assert(direct.error, 'Authenticated browser must not execute privileged RPC')
  // Exercise record RPCs through PostgREST with real JWTs, not a privileged client.
  const clientFields = {
    person_type: 'individual',
    name: 'Cliente de integração',
    email: '',
    cpf_cnpj: '',
    phone: '',
    address: '',
    notes: '',
    responsible_user_id: first.id,
  }
  const clientId = ok(await assistant.client.rpc('save_client', { p_data: clientFields }))
  const clientRow = ok(
    await assistant.client.from('clients').select('*').eq('id', clientId).single(),
  )
  assert.equal(ok(await foreign.client.from('clients').select('id').eq('id', clientId)).length, 0)
  assert(
    (await assistant.client.from('clients').update({ name: 'Bypass' }).eq('id', clientId)).error,
  )
  const area = ok(await assistant.client.from('legal_areas').select('id').limit(1).single())
  const caseFields = {
    client_id: clientId,
    responsible_user_id: first.id,
    case_number: 'ADM/2026-15',
    tribunal: '',
    court_unit: '',
    legal_area_id: area.id,
    client_side: 'claimant',
    opposing_party: 'Parte fictícia',
    status: 'active',
    notes: '',
  }
  const caseId = ok(await assistant.client.rpc('save_case', { p_data: caseFields }))
  const caseRow = ok(await assistant.client.from('cases').select('*').eq('id', caseId).single())
  assert.equal(caseRow.case_number_normalized, 'ADM202615')
  assert.equal(ok(await assistant.client.rpc('search_cases', { p_query: 'ADM202615' })).length, 1)
  assert.equal(ok(await foreign.client.rpc('search_cases', { p_query: 'ADM202615' })).length, 0)
  assert(
    (
      await assistant.client.rpc('archive_record', {
        p_kind: 'case',
        p_id: caseId,
        p_updated_at: caseRow.updated_at,
        p_reason: 'Negative archive test',
      })
    ).error,
  )
  ok(
    await assistant.client.rpc('save_client', {
      p_data: { ...clientFields, name: 'Cliente atualizado' },
      p_id: clientId,
      p_updated_at: clientRow.updated_at,
    }),
  )
  assert(
    (
      await assistant.client.rpc('save_client', {
        p_data: clientFields,
        p_id: clientId,
        p_updated_at: clientRow.updated_at,
      })
    ).error,
    'Stale edit rejected',
  )
  ok(
    await lawyer.client.rpc('archive_record', {
      p_kind: 'case',
      p_id: caseId,
      p_updated_at: caseRow.updated_at,
      p_reason: 'Arquivamento de teste',
    }),
  )
  assert.equal(
    ok(await assistant.client.rpc('search_cases', { p_query: 'ADM202615', p_status: 'archived' }))
      .length,
    1,
  )
  // Lifecycle RPCs must enforce admin-only hard deletion and reactivation on the server.
  let lifecycleClient = ok(
    await first.client.from('clients').select('*').eq('id', clientId).single(),
  )
  const deletion = {
    p_kind: 'client',
    p_id: clientId,
    p_updated_at: lifecycleClient.updated_at,
    p_reason: 'Cadastro incorreto de teste',
  }
  for (const user of [lawyer, assistant, foreign]) {
    assert.equal((await user.client.rpc('delete_record', deletion)).error?.message, 'access_denied')
  }
  assert.equal(
    (await first.client.rpc('delete_record', deletion)).error?.message,
    'client_has_cases',
  )
  ok(await first.client.rpc('archive_record', deletion))
  lifecycleClient = ok(await first.client.from('clients').select('*').eq('id', clientId).single())
  const reactivation = {
    p_id: clientId,
    p_updated_at: lifecycleClient.updated_at,
    p_reason: 'Reativação de teste',
  }
  for (const user of [lawyer, assistant, foreign]) {
    assert.equal(
      (await user.client.rpc('reactivate_client', reactivation)).error?.message,
      'access_denied',
    )
  }
  ok(await first.client.rpc('reactivate_client', reactivation))
  lifecycleClient = ok(await first.client.from('clients').select('*').eq('id', clientId).single())
  assert.equal(lifecycleClient.status, 'active')
  assert.equal(lifecycleClient.archived_at, null)
  const archivedCase = ok(await first.client.from('cases').select('*').eq('id', caseId).single())
  assert.equal(archivedCase.status, 'archived')
  ok(
    await first.client.rpc('delete_record', {
      ...deletion,
      p_kind: 'case',
      p_id: caseId,
      p_updated_at: archivedCase.updated_at,
    }),
  )
  assert.equal(ok(await first.client.from('cases').select('id').eq('id', caseId)).length, 0)
  ok(
    await first.client.rpc('delete_record', {
      ...deletion,
      p_updated_at: lifecycleClient.updated_at,
    }),
  )
  assert.equal(ok(await first.client.from('clients').select('id').eq('id', clientId)).length, 0)
  const replacementClient = ok(await first.client.rpc('save_client', { p_data: clientFields }))
  ok(
    await first.client.rpc('save_case', {
      p_data: { ...caseFields, client_id: replacementClient },
    }),
  )
  const lowAssurance = await fetch(`${url}/rest/v1/rpc/save_client`, {
    method: 'POST',
    headers: {
      apikey: publicKey,
      authorization: `Bearer ${first.aal1}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_data: clientFields }),
  })
  assert.equal(lowAssurance.status, 403, 'AAL1 cannot create client')
  await edge(first.token, {
    action: 'invite',
    email: email(6),
    full_name: 'Convite fictício',
    role: 'assistant',
  })
  const invited = (await edge(first.token, { action: 'list' })).users.find(
    (u) => u.email === email(6),
  )
  assert(invited, 'Invited user profile must be present')
  // A recovery link must work even if an invitation was never accepted.
  const recoveryClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  ok(
    await recoveryClient.auth.resetPasswordForEmail(email(6), {
      redirectTo: 'http://127.0.0.1:5173/auth/update-password',
    }),
  )
  const recoveryLink = ok(
    await admin.auth.admin.generateLink({ type: 'recovery', email: email(6) }),
  )
  ok(
    await recoveryClient.auth.verifyOtp({
      token_hash: recoveryLink.properties.hashed_token,
      type: 'recovery',
    }),
  )
  ok(await recoveryClient.auth.updateUser({ password: randomBytes(24).toString('base64url') }))
  assert(
    (
      await recoveryClient.auth.verifyOtp({
        token_hash: recoveryLink.properties.hashed_token,
        type: 'recovery',
      })
    ).error,
    'Used link rejected',
  )
  await edge(
    first.token,
    { action: 'invite', email: email(4), full_name: 'Foreign identity', role: 'admin' },
    409,
  )
  await edge(first.token, {
    action: 'change_role',
    user_id: lawyer.id,
    role: 'assistant',
    reason: 'Integration test',
  })
  assert.equal(
    ok(await lawyer.client.from('profiles').select('id')).length,
    0,
    'Old signed JWT must lose data access',
  )
  const refresh = await lawyer.client.auth.refreshSession({ refresh_token: lawyer.refreshToken })
  assert(refresh.error, 'Revoked refresh token must not create a session')
  await edge(first.token, {
    action: 'set_active',
    user_id: assistant.id,
    is_active: false,
    reason: 'Integration test',
  })
  await edge(assistant.token, { action: 'sessions' }, 401)
  await edge(
    first.token,
    { action: 'remove_member', user_id: first.id, reason: 'Active member test' },
    409,
  )
  await edge(first.token, {
    action: 'remove_member',
    user_id: assistant.id,
    reason: 'Member removal test',
  })
  assert(
    !(await edge(first.token, { action: 'list' })).users.some((user) => user.id === assistant.id),
  )
  await edge(
    first.token,
    { action: 'set_active', user_id: assistant.id, is_active: true, reason: 'Removed member test' },
    403,
  )
  const audit = await edge(first.token, { action: 'audit' })
  assert(audit.events.some((e) => e.action === 'user.removed'))
  assert(
    (await edge(first.token, { action: 'list_removed' })).users.some(
      (user) => user.id === assistant.id,
    ),
  )
  await edge(
    foreign.token,
    { action: 'readmit_member', user_id: assistant.id, role: 'lawyer', reason: 'Foreign tenant' },
    403,
  )
  await edge(first.token, {
    action: 'readmit_member',
    user_id: assistant.id,
    role: 'lawyer',
    reason: 'Recontratação de teste',
  })
  const readmitted = (await edge(first.token, { action: 'list' })).users.find(
    (user) => user.id === assistant.id,
  )
  assert.equal(readmitted.role, 'lawyer')
  assert.equal(readmitted.is_active, true)
  assert.equal((await edge(first.token, { action: 'list_removed' })).users.length, 0)
  await edge(assistant.token, { action: 'sessions' }, 401)
  assert(audit.events.some((e) => e.action === 'user.invited'))
  assert(audit.events.some((e) => e.action === 'user.role_changed'))
  assert(audit.events.some((e) => e.action === 'client.created'))
  assert(audit.events.some((e) => e.action === 'case.archived'))
  assert.equal((await edge(foreign.token, { action: 'audit' })).events.length, 0)
  await edge(first.token, { action: 'sessions' })
  // Two independent requests race to demote the final pair of admins.
  const raced = await Promise.all(
    [first, second].map((user) =>
      fetch(`${url}/functions/v1/admin-users`, {
        method: 'POST',
        headers: {
          apikey: publicKey,
          authorization: `Bearer ${user.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'change_role',
          user_id: user.id,
          role: 'lawyer',
          reason: 'Concurrent test',
        }),
      }).then(async (r) => ({ status: r.status, body: await r.json() })),
    ),
  )
  assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409], JSON.stringify(raced))
  assert.equal(raced.find((r) => r.status === 409).body.error, 'last_admin')
  console.log(
    'PASS: real JWT/MFA, tenant isolation, client/case CRUD and archive permissions, invite, audit, revocation, refresh token invalidation and concurrent last-admin protection.',
  )
} finally {
  // Only this run's random tenant IDs and synthetic e-mail prefix are removed.
  execFileSync(
    process.execPath,
    ['node_modules/supabase/dist/supabase.js', 'db', 'query', '--local', '--file', cleanupPath],
    { stdio: 'pipe' },
  )
  unlinkSync(cleanupPath)
  console.log('Synthetic integration fixtures removed.')
}
