import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Actual PostgreSQL policies; auth schema stubbed because GoTrue is external.
// Supabase CLI integration remains a separate gate, documented in docs/implementation.md.
let db: PGlite
const alpha = '20000000-0000-4000-8000-000000000001'
const beta = '20000000-0000-4000-8000-000000000002'
const user = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const session = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`
async function asUser(n: number, aal = 'aal2', overrides = {}) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: user(n), aal, session_id: session(n), ...overrides }),
  ])
  await db.exec('set role authenticated')
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid(), auth.jwt() to authenticated, anon;
  `)
  await db.exec(readFileSync('supabase/migrations/202609160001_identity.sql', 'utf8'))
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'))
  const roles = ['admin', 'lawyer', 'assistant', 'admin', 'lawyer']
  for (let n = 1; n <= 5; n++) {
    await db.query('insert into auth.users values ($1)', [user(n)])
    await db.query('insert into auth.sessions (id, user_id) values ($1, $2)', [session(n), user(n)])
    await db.query(
      'insert into public.profiles (id, organization_id, full_name, role) values ($1, $2, $3, $4)',
      [user(n), n <= 3 ? alpha : beta, `Pessoa fictícia ${n}`, roles[n - 1]],
    )
  }
})
afterAll(async () => {
  await db?.close()
})

describe('PostgreSQL identity RLS', { concurrent: false }, () => {
  it.each([1, 2, 3, 4, 5])('user %i only sees their own tenant', async (n) => {
    await asUser(n)
    const own = n <= 3 ? alpha : beta
    const foreign = n <= 3 ? beta : alpha
    const organizations = await db.query<{ id: string }>('select id from public.organizations')
    expect(organizations.rows.map((row) => row.id)).toEqual([own])
    expect(
      (await db.query('select id from public.profiles where organization_id = $1', [foreign])).rows,
    ).toHaveLength(0)
    expect((await db.query('select id from public.profiles')).rows).toHaveLength(n <= 3 ? 3 : 2)
  })
  it('rejects anonymous reads and writes', async () => {
    await db.exec('reset role; set role anon')
    await expect(db.query('select * from public.profiles')).rejects.toThrow(/permission denied/)
    await expect(
      db.query("insert into public.organizations(name) values ('Attack')"),
    ).rejects.toThrow(/permission denied/)
  })
  it('returns no private rows without MFA', async () => {
    await asUser(1, 'aal1')
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(0)
    expect((await db.query('select * from public.organizations')).rows).toHaveLength(0)
  })
  it('ignores forged tenant and role claims', async () => {
    await asUser(3, 'aal2', {
      organization_id: beta,
      user_role: 'admin',
      user_metadata: { role: 'admin' },
    })
    const result = await db.query<{ org: string; role: string }>(
      'select private.current_user_org_id() as org, private.current_user_role() as role',
    )
    expect(result.rows[0]).toEqual({ org: alpha, role: 'assistant' })
  })
  it.each([1, 2, 3])(
    'blocks direct privilege/tenant changes, inserts and deletes by user %i',
    async (n) => {
      await asUser(n)
      await expect(
        db.query("update public.profiles set role = 'admin' where id = $1", [user(3)]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        db.query('update public.profiles set organization_id = $1 where id = $2', [beta, user(n)]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        db.query('delete from public.profiles where id = $1', [user(4)]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        db.query(
          "insert into public.profiles(id, organization_id, full_name) values ($1, $2, 'Attack')",
          [user(8), beta],
        ),
      ).rejects.toThrow(/permission denied/)
      await expect(
        db.query("update public.organizations set name = 'Attack' where id = $1", [beta]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        db.query('delete from public.organizations where id = $1', [beta]),
      ).rejects.toThrow(/permission denied/)
    },
  )
  it('denies inactive profiles despite a live MFA session', async () => {
    await db.exec('reset role')
    await db.query('update public.profiles set is_active = false where id = $1', [user(5)])
    await asUser(5)
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(0)
  })
  it('denies a revoked session before JWT expiration', async () => {
    await db.exec('reset role')
    await db.query('delete from auth.sessions where id = $1', [session(2)])
    await asUser(2)
    expect((await db.query('select * from public.organizations')).rows).toHaveLength(0)
  })
  it('denies missing, foreign and expired sessions', async () => {
    for (const id of ['', 'invalid', session(4)]) {
      await asUser(1, 'aal2', { session_id: id })
      expect((await db.query('select * from public.profiles')).rows).toHaveLength(0)
    }
    await db.exec('reset role')
    await db.query(
      "update auth.sessions set not_after = now() - interval '1 minute' where id = $1",
      [session(1)],
    )
    await asUser(1)
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(0)
  })
})
