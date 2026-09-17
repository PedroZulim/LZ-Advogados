import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let db: PGlite
const org = (n = 1) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const uid = (n = 1) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sid = (n = 1) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`
async function operation(
  action: string,
  payload = {},
  actor = 1,
  aal = 'aal2',
  session = sid(actor),
) {
  await db.exec('reset role; set role service_role')
  const result = await db.query<{ result: Record<string, unknown> }>(
    'select public.manage_users($1, $2, $3, $4, $5, $6) as result',
    [uid(actor), session, aal, action, JSON.stringify(payload), crypto.randomUUID()],
  )
  return result.rows[0].result
}
async function owner(sql: string) {
  await db.exec('reset role')
  return db.query<Record<string, unknown>>(sql)
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), invited_at timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz);
    create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, not_after timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid(), auth.jwt() to authenticated, anon;
  `)
  for (const file of [
    '202609160001_identity.sql',
    '202609160002_user_administration.sql',
    '202609170001_remove_member.sql',
    '202609170003_readmit_member.sql',
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'))
})
beforeEach(async () => {
  await db.exec('reset role; truncate auth.users cascade')
  for (let n = 1; n <= 5; n++) {
    await db.query('insert into auth.users(id, email) values ($1, $2)', [
      uid(n),
      `user${n}@example.test`,
    ])
    await db.query('insert into auth.sessions(id, user_id) values ($1, $2)', [sid(n), uid(n)])
    await db.query(
      'insert into public.profiles(id, organization_id, full_name, role) values ($1, $2, $3, $4)',
      [
        uid(n),
        org(n === 4 ? 2 : 1),
        `Person ${n}`,
        n === 2 ? 'lawyer' : n === 3 ? 'assistant' : 'admin',
      ],
    )
  }
})
afterAll(async () => {
  await db?.close()
})
describe('Privileged user administration', { concurrent: false }, () => {
  it('readmits with an explicitly selected role and destroys every old session', async () => {
    await operation('set_active', { user_id: uid(2), is_active: false })
    await operation('remove_member', { user_id: uid(2), reason: 'Desligamento' })
    expect((await operation('list_removed')).users).toHaveLength(1)
    await owner(`insert into auth.sessions(id,user_id) values ('${sid(9)}','${uid(2)}')`)
    await operation('readmit_member', {
      user_id: uid(2),
      role: 'assistant',
      reason: 'Nova contratação',
    })
    expect((await operation('list_removed')).users).toHaveLength(0)
    expect((await operation('list')).users).toHaveLength(4)
    const profile = (
      await owner(`select role,is_active,removed_at from public.profiles where id='${uid(2)}'`)
    ).rows[0]
    expect(profile).toEqual({ role: 'assistant', is_active: true, removed_at: null })
    expect(
      (await owner(`select * from auth.sessions where user_id='${uid(2)}'`)).rows,
    ).toHaveLength(0)
    expect(
      (await owner("select * from public.audit_logs where action='user.readmitted'")).rows,
    ).toHaveLength(1)
    await expect(
      operation('readmit_member', { user_id: uid(2), role: 'admin', reason: 'Repeated request' }),
    ).rejects.toThrow('access_denied')
  })
  it('limits readmission to same-tenant admins with live MFA and a valid role', async () => {
    await operation('set_active', { user_id: uid(2), is_active: false })
    await operation('remove_member', { user_id: uid(2), reason: 'Desligamento' })
    const payload = { user_id: uid(2), role: 'lawyer', reason: 'Nova contratação' }
    await expect(operation('readmit_member', payload, 3)).rejects.toThrow('access_denied')
    await expect(operation('list_removed', {}, 3)).rejects.toThrow('access_denied')
    await expect(operation('readmit_member', payload, 4)).rejects.toThrow('access_denied')
    await expect(operation('readmit_member', payload, 1, 'aal1')).rejects.toThrow('access_denied')
    await expect(operation('readmit_member', { ...payload, role: 'owner' })).rejects.toThrow(
      'invalid_request',
    )
    await expect(operation('readmit_member', { ...payload, reason: '' })).rejects.toThrow(
      'invalid_request',
    )
  })
  it('removes only inactive members, hides them and preserves the audit history', async () => {
    await expect(operation('remove_member', { user_id: uid(2) })).rejects.toThrow(
      'member_must_be_inactive',
    )
    await operation('set_active', { user_id: uid(2), is_active: false })
    await operation('remove_member', { user_id: uid(2), reason: 'Saída da equipe' })
    expect((await operation('list')).users).toHaveLength(3)
    expect(
      (await owner(`select removed_at from public.profiles where id = '${uid(2)}'`)).rows[0]
        .removed_at,
    ).not.toBeNull()
    expect((await owner(`select * from auth.users where id = '${uid(2)}'`)).rows).toHaveLength(1)
    expect(
      (await owner('select action from public.audit_logs order by created_at')).rows.map(
        (row) => row.action,
      ),
    ).toEqual(['user.deactivated', 'user.removed'])
    await expect(operation('set_active', { user_id: uid(2), is_active: true })).rejects.toThrow(
      'access_denied',
    )
    await expect(operation('remove_member', { user_id: uid(2) })).rejects.toThrow('access_denied')
  })
  it('rechecks active state and denies foreign or non-admin removal', async () => {
    await operation('set_active', { user_id: uid(2), is_active: false })
    await operation('set_active', { user_id: uid(2), is_active: true })
    await expect(operation('remove_member', { user_id: uid(2) })).rejects.toThrow(
      'member_must_be_inactive',
    )
    await expect(operation('remove_member', { user_id: uid(4) })).rejects.toThrow('access_denied')
    await expect(operation('remove_member', { user_id: uid(2) }, 3)).rejects.toThrow(
      'access_denied',
    )
  })
  it.each([2, 3])('rejects admin actions for role of user %i', async (n) => {
    for (const action of [
      'list',
      'audit',
      'prepare_invite',
      'change_role',
      'set_active',
      'revoke_sessions',
    ])
      await expect(operation(action, { user_id: uid(1) }, n)).rejects.toThrow('access_denied')
  })
  it('denies aal1, missing, foreign, expired and revoked sessions', async () => {
    await expect(operation('list', {}, 1, 'aal1')).rejects.toThrow('access_denied')
    await expect(operation('list', {}, 1, 'aal2', sid(4))).rejects.toThrow('access_denied')
    await owner(
      `update auth.sessions set not_after = now() - interval '1 second' where id = '${sid()}'`,
    )
    await expect(operation('list')).rejects.toThrow('access_denied')
    await owner(`delete from auth.sessions where id = '${sid()}'`)
    await expect(operation('list')).rejects.toThrow('access_denied')
  })
  it('denies inactive actors and cross-tenant mutations', async () => {
    await expect(operation('set_active', { user_id: uid(4), is_active: false })).rejects.toThrow(
      'access_denied',
    )
    await expect(operation('revoke_sessions', { user_id: uid(4) })).rejects.toThrow('access_denied')
    await owner(`update public.profiles set is_active = false where id = '${uid()}'`)
    await expect(operation('list')).rejects.toThrow('access_denied')
  })
  it('lists only own tenant users', async () => {
    const result = await operation('list')
    expect((result.users as { id: string }[]).map((u) => u.id)).not.toContain(uid(4))
    expect(result.users).toHaveLength(4)
  })
  it('protects the last active admin and rolls back audit and revocation', async () => {
    await owner(`update public.profiles set is_active = false where id = '${uid(5)}'`)
    await expect(operation('set_active', { user_id: uid(1), is_active: false })).rejects.toThrow(
      'last_admin',
    )
    await expect(operation('change_role', { user_id: uid(1), role: 'lawyer' })).rejects.toThrow(
      'last_admin',
    )
    expect((await owner('select * from public.audit_logs')).rows).toHaveLength(0)
    expect((await owner(`select * from auth.sessions where id = '${sid()}'`)).rows).toHaveLength(1)
  })
  it('changes roles, revokes sessions, and records before/after without credentials', async () => {
    await operation('change_role', {
      user_id: uid(2),
      role: 'assistant',
      reason: 'Mudança da equipe',
    })
    expect(
      (await owner(`select * from auth.sessions where user_id = '${uid(2)}'`)).rows,
    ).toHaveLength(0)
    const audit = (await owner('select * from public.audit_logs')).rows[0]
    expect(audit.action).toBe('user.role_changed')
    expect(audit.before_data).toEqual({ role: 'lawyer', is_active: true })
    expect(audit.after_data).toEqual({ role: 'assistant', is_active: true })
  })
  it('deactivates and reactivates without restoring old sessions', async () => {
    await operation('set_active', { user_id: uid(2), is_active: false })
    await expect(operation('sessions', {}, 2)).rejects.toThrow('access_denied')
    await operation('set_active', { user_id: uid(2), is_active: true })
    await expect(operation('sessions', {}, 2)).rejects.toThrow('access_denied')
  })
  it('allows own session management for non-admins without exposing others', async () => {
    await owner(`insert into auth.sessions(id, user_id) values ('${sid(8)}', '${uid(2)}')`)
    expect((await operation('sessions', {}, 2)).sessions).toHaveLength(2)
    await operation('revoke_own_sessions', { scope: 'others' }, 2)
    expect((await operation('sessions', {}, 2)).sessions).toHaveLength(1)
    await operation('revoke_own_sessions', { scope: 'all' }, 2)
    await expect(operation('sessions', {}, 2)).rejects.toThrow('access_denied')
  })
  it('blocks direct RPC and audit edits even for authenticated admins', async () => {
    await db.exec('set role authenticated')
    await expect(
      db.query('select public.manage_users($1,$2,$3,$4,$5,$6)', [
        uid(),
        sid(),
        'aal2',
        'list',
        '{}',
        crypto.randomUUID(),
      ]),
    ).rejects.toThrow('permission denied')
    await expect(db.query('update public.audit_logs set reason = null')).rejects.toThrow(
      'permission denied',
    )
    await expect(db.query('delete from public.audit_logs')).rejects.toThrow('permission denied')
    await expect(db.query('select * from private.user_invitations')).rejects.toThrow(
      'permission denied',
    )
  })
  it('audits are restricted to tenant administrators with live MFA sessions', async () => {
    await operation('revoke_sessions', { user_id: uid(2) })
    for (const n of [1, 3, 4]) {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: uid(n), session_id: sid(n), aal: 'aal2' }),
      ])
      await db.exec('set role authenticated')
      expect((await db.query('select * from public.audit_logs')).rows).toHaveLength(n === 1 ? 1 : 0)
    }
  })
  it('reserves invitations and refuses existing or cross-tenant identities', async () => {
    expect(
      (
        await operation('prepare_invite', {
          email: 'user4@example.test',
          full_name: 'Foreign user',
          role: 'admin',
        })
      ).error,
    ).toBe('invite_unavailable')
    const invitation = await operation('prepare_invite', {
      email: 'new@example.test',
      full_name: 'New user',
      role: 'lawyer',
    })
    await expect(
      operation('complete_invite', { invitation_id: invitation.invitation_id, user_id: uid(4) }),
    ).rejects.toThrow('invite_unavailable')
    await owner(
      `insert into auth.users(id,email,invited_at) values ('${uid(8)}','new@example.test',now())`,
    )
    await operation('complete_invite', { invitation_id: invitation.invitation_id, user_id: uid(8) })
    expect(
      (await owner(`select role from public.profiles where id = '${uid(8)}'`)).rows[0].role,
    ).toBe('lawyer')
    expect((await owner('select action from public.audit_logs')).rows[0].action).toBe(
      'user.invited',
    )
    await expect(
      operation('complete_invite', { invitation_id: invitation.invitation_id, user_id: uid(8) }),
    ).rejects.toThrow('invite_unavailable')
  })
  it('rechecks actor permission when completing a previously authorized invite', async () => {
    const invitation = await operation('prepare_invite', {
      email: 'new@example.test',
      full_name: 'New user',
      role: 'admin',
    })
    await operation('change_role', { user_id: uid(1), role: 'lawyer' }, 5)
    await expect(
      operation('complete_invite', { invitation_id: invitation.invitation_id, user_id: uid(8) }),
    ).rejects.toThrow('access_denied')
  })
  it('enforces a persistent per-actor rate limit', async () => {
    for (let n = 0; n < 60; n++) expect((await operation('list')).error).toBeUndefined()
    expect((await operation('list')).error).toBe('rate_limited')
    expect((await operation('list')).error).toBe('rate_limited')
  })
})
