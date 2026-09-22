import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let db: PGlite
const uid = (n = 1) => `81000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sid = (n = 1) => `82000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org = (n = 1) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const clientData = {
  person_type: 'individual',
  name: 'Cliente fictício',
  cpf_cnpj: 'Documento de teste',
  email: 'client@example.test',
  phone: '',
  address: '',
  responsible_user_id: '',
  notes: 'Observação',
}
async function actor(n = 1, aal = 'aal2') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: uid(n), session_id: sid(n), aal }),
  ])
  await db.exec('set role authenticated')
}
async function saveClient(data = {}, id: string | null = null, stamp: string | null = null) {
  return (
    await db.query<{ id: string }>('select public.save_client($1,$2,$3) as id', [
      JSON.stringify({ ...clientData, ...data }),
      id,
      stamp,
    ])
  ).rows[0].id
}
async function caseData(client: string) {
  const area = (
    await db.query<{ id: string }>('select id from public.legal_areas order by name limit 1')
  ).rows[0].id
  return {
    client_id: client,
    responsible_user_id: uid(),
    case_number: '00012345620258260001',
    tribunal: 'Tribunal fictício',
    court_unit: 'Unidade fictícia',
    legal_area_id: area,
    client_side: 'claimant',
    opposing_party: 'Parte fictícia',
    status: 'active',
    notes: '',
  }
}
async function saveCase(data: object, id: string | null = null, stamp: string | null = null) {
  return (
    await db.query<{ id: string }>('select public.save_case($1,$2,$3) as id', [
      JSON.stringify(data),
      id,
      stamp,
    ])
  ).rows[0].id
}
async function stamp(table: 'clients' | 'cases' | 'events' | 'deadlines', id: string) {
  return (
    await db.query<{ stamp: string }>(
      `select updated_at::text as stamp from public.${table} where id=$1`,
      [id],
    )
  ).rows[0].stamp
}
async function archive(kind: string, id: string, timestamp: string) {
  return db.query('select public.archive_record($1,$2,$3,$4)', [
    kind,
    id,
    timestamp,
    'Encerramento do atendimento',
  ])
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),invited_at timestamptz,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,not_after timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.jwt(),auth.uid() to authenticated,anon;`)
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'))
})
beforeEach(async () => {
  await db.exec('reset role; truncate auth.users cascade')
  for (let n = 1; n <= 4; n++) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [
      uid(n),
      `records${n}@example.test`,
    ])
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sid(n), uid(n)])
    await db.query(
      'insert into public.profiles(id,organization_id,full_name,role) values($1,$2,$3,$4)',
      [
        uid(n),
        org(n === 4 ? 2 : 1),
        `Test ${n}`,
        n === 2 ? 'lawyer' : n === 3 ? 'assistant' : 'admin',
      ],
    )
  }
  await actor()
})
afterAll(async () => {
  await db?.close()
})
describe('Clients and cases database boundaries', { concurrent: false }, () => {
  async function remove(
    kind: string,
    id: string,
    timestamp: string,
    reason = 'Cadastro incorreto',
  ) {
    return db.query('select public.delete_record($1,$2,$3,$4)', [kind, id, timestamp, reason])
  }
  async function reactivate(id: string, timestamp: string, reason = 'Retorno do cliente') {
    return db.query('select public.reactivate_client($1,$2,$3)', [id, timestamp, reason])
  }
  it('hard deletes cases and clients, permits reuse of identifiers and records the action', async () => {
    const client = await saveClient()
    const data = await caseData(client)
    const caseId = await saveCase(data)
    await remove('case', caseId, await stamp('cases', caseId))
    expect((await db.query('select * from public.cases where id=$1', [caseId])).rows).toHaveLength(
      0,
    )
    const recreatedCase = await saveCase(data)
    expect(recreatedCase).not.toBe(caseId)
    await remove('case', recreatedCase, await stamp('cases', recreatedCase))
    await remove('client', client, await stamp('clients', client))
    expect(
      (await db.query('select * from public.clients where id=$1', [client])).rows,
    ).toHaveLength(0)
    expect(await saveClient()).not.toBe(client)
    expect(
      (
        await db.query(
          "select * from public.audit_logs where action in ('client.deleted','case.deleted')",
        )
      ).rows,
    ).toHaveLength(3)
  })
  it('blocks deletion of clients with active or archived cases without cascading', async () => {
    const client = await saveClient()
    const caseId = await saveCase(await caseData(client))
    await expect(remove('client', client, await stamp('clients', client))).rejects.toThrow(
      'client_has_cases',
    )
    await archive('case', caseId, await stamp('cases', caseId))
    await expect(remove('client', client, await stamp('clients', client))).rejects.toThrow(
      'client_has_cases',
    )
    expect((await db.query('select * from public.clients')).rows).toHaveLength(1)
    expect((await db.query('select * from public.cases')).rows).toHaveLength(1)
    expect(
      (await db.query("select * from public.audit_logs where action='client.deleted'")).rows,
    ).toHaveLength(0)
  })
  it('reactivates the same client without changing existing cases', async () => {
    const client = await saveClient()
    const caseId = await saveCase(await caseData(client))
    await archive('client', client, await stamp('clients', client))
    await reactivate(client, await stamp('clients', client))
    expect(
      (await db.query('select status,archived_at from public.clients where id=$1', [client]))
        .rows[0],
    ).toEqual({ status: 'active', archived_at: null })
    expect(
      (await db.query('select status from public.cases where id=$1', [caseId])).rows[0],
    ).toEqual({ status: 'active' })
    await saveClient({ name: 'Cliente reativado' }, client, await stamp('clients', client))
    await saveCase(await caseData(client))
    await expect(reactivate(client, await stamp('clients', client))).rejects.toThrow(
      'client_not_archived',
    )
    expect(
      (await db.query("select * from public.audit_logs where action='client.reactivated'")).rows,
    ).toHaveLength(1)
  })
  it.each([2, 3, 4])('denies lifecycle mutations to unauthorized user %i', async (n) => {
    const client = await saveClient()
    const caseId = await saveCase(await caseData(client))
    await archive('client', client, await stamp('clients', client))
    const cstamp = await stamp('clients', client),
      pstamp = await stamp('cases', caseId)
    await actor(n)
    await expect(remove('case', caseId, pstamp)).rejects.toThrow('access_denied')
    await expect(remove('client', client, cstamp)).rejects.toThrow('access_denied')
    await expect(reactivate(client, cstamp)).rejects.toThrow('access_denied')
  })
  it('rejects stale or invalid lifecycle requests, AAL1 and revoked sessions', async () => {
    const client = await saveClient(),
      old = await stamp('clients', client)
    await archive('client', client, old)
    const current = await stamp('clients', client)
    await expect(remove('client', client, old)).rejects.toThrow('record_conflict')
    await expect(reactivate(client, old)).rejects.toThrow('record_conflict')
    await expect(remove('client', client, current, ' ')).rejects.toThrow('invalid_reason')
    await expect(reactivate(client, current, ' ')).rejects.toThrow('invalid_reason')
    await actor(1, 'aal1')
    await expect(remove('client', client, current)).rejects.toThrow('access_denied')
    await expect(reactivate(client, current)).rejects.toThrow('access_denied')
    await db.exec('reset role')
    await db.query('delete from auth.sessions where id=$1', [sid()])
    await actor()
    await expect(remove('client', client, current)).rejects.toThrow('access_denied')
    await expect(reactivate(client, current)).rejects.toThrow('access_denied')
  })
  it.each([1, 2, 3])(
    'allows user %i to create and edit with server-derived tenant and audit',
    async (n) => {
      await actor(n)
      const id = await saveClient({ organization_id: org(2) })
      const timestamp = await stamp('clients', id)
      await saveClient({ name: 'Nome atualizado' }, id, timestamp)
      expect(
        (
          await db.query<{ organization_id: string }>(
            'select organization_id from public.clients where id=$1',
            [id],
          )
        ).rows[0].organization_id,
      ).toBe(org())
      await db.exec('reset role')
      const logs = await db.query<{ action: string; after_data: Record<string, unknown> }>(
        'select action,after_data from public.audit_logs order by created_at',
      )
      expect(logs.rows.map((row) => row.action)).toEqual(['client.created', 'client.updated'])
      expect(logs.rows[0].after_data).not.toHaveProperty('cpf_cnpj')
    },
  )
  it('requires live MFA and active membership for reads and writes', async () => {
    await saveClient()
    await actor(1, 'aal1')
    expect((await db.query('select * from public.clients')).rows).toHaveLength(0)
    await expect(saveClient()).rejects.toThrow('access_denied')
    await db.exec('reset role')
    await db.query('delete from auth.sessions where id=$1', [sid()])
    await actor()
    await expect(saveClient()).rejects.toThrow('access_denied')
    await db.exec('reset role')
    await db.query('update public.profiles set is_active=false where id=$1', [uid(2)])
    await actor(2)
    await expect(saveClient()).rejects.toThrow('access_denied')
  })
  it('blocks foreign reads, edits and links', async () => {
    const local = await saveClient()
    const localCase = await caseData(local)
    await actor(4)
    const foreign = await saveClient()
    const foreignData = await caseData(foreign)
    expect((await db.query('select * from public.clients where id=$1', [local])).rows).toHaveLength(
      0,
    )
    await expect(saveClient({}, local, new Date().toISOString())).rejects.toThrow('access_denied')
    await actor()
    await expect(saveCase({ ...localCase, client_id: foreign })).rejects.toThrow('invalid_client')
    await expect(
      saveCase({ ...localCase, legal_area_id: foreignData.legal_area_id }),
    ).rejects.toThrow('invalid_area')
    await expect(saveCase({ ...localCase, responsible_user_id: uid(4) })).rejects.toThrow(
      'invalid_responsible',
    )
    await expect(saveClient({ responsible_user_id: uid(4) })).rejects.toThrow('invalid_responsible')
  })
  it('normalizes CNJ structure, accepts internal identifiers and searches numbers/opponents', async () => {
    const client = await saveClient()
    const data = await caseData(client)
    const id = await saveCase(data)
    const record = (
      await db.query<{ case_number: string; case_number_normalized: string }>(
        'select * from public.cases where id=$1',
        [id],
      )
    ).rows[0]
    expect(record.case_number).toBe('0001234-56.2025.8.26.0001')
    expect(record.case_number_normalized).toBe(data.case_number)
    await saveCase({ ...data, case_number: 'ADM/2026-15' })
    expect((await db.query("select * from public.search_cases('ADM202615')")).rows).toHaveLength(1)
    expect((await db.query("select * from public.search_cases('0001234-56')")).rows).toHaveLength(1)
    expect(
      (await db.query("select * from public.search_cases('Parte fictícia')")).rows,
    ).toHaveLength(2)
    expect(
      (await db.query("select * from public.search_cases('x'' OR 1=1 --')")).rows,
    ).toHaveLength(0)
  })
  it('prevents assistant archives through every entry point', async () => {
    const client = await saveClient()
    const data = await caseData(client)
    const caseId = await saveCase(data)
    const clientStamp = await stamp('clients', client)
    const caseStamp = await stamp('cases', caseId)
    await actor(3)
    await expect(archive('client', client, clientStamp)).rejects.toThrow('access_denied')
    await expect(archive('case', caseId, caseStamp)).rejects.toThrow('access_denied')
    await expect(saveCase({ ...data, status: 'archived' }, caseId, caseStamp)).rejects.toThrow(
      'invalid_status',
    )
    await expect(db.query("update public.clients set status='archived'")).rejects.toThrow(
      'permission denied',
    )
    await expect(db.query('delete from public.cases')).rejects.toThrow('permission denied')
    await saveClient({ status: 'archived' }, client, clientStamp)
    expect(
      (await db.query<{ status: string }>('select status from public.clients')).rows[0].status,
    ).toBe('active')
  })
  it('archives while keeping linked history and prevents edits to archived records', async () => {
    const client = await saveClient()
    const data = await caseData(client)
    const caseId = await saveCase(data)
    await actor(2)
    await archive('client', client, await stamp('clients', client))
    expect((await db.query('select * from public.cases')).rows).toHaveLength(1)
    await expect(saveClient({}, client, await stamp('clients', client))).rejects.toThrow(
      'record_archived',
    )
    await expect(saveCase(data)).rejects.toThrow('invalid_client')
    await saveCase({ ...data, status: 'closed' }, caseId, await stamp('cases', caseId))
    await archive('case', caseId, await stamp('cases', caseId))
    expect((await db.query("select * from public.search_cases('','archived')")).rows).toHaveLength(
      1,
    )
    await expect(saveCase(data, caseId, await stamp('cases', caseId))).rejects.toThrow(
      'record_archived',
    )
  })
  it('rejects stale updates and invalid fields atomically', async () => {
    const client = await saveClient()
    const timestamp = await stamp('clients', client)
    await saveClient({ name: 'Primeira edição' }, client, timestamp)
    await expect(saveClient({ name: 'Edição atrasada' }, client, timestamp)).rejects.toThrow(
      'record_conflict',
    )
    await expect(saveClient({ name: 'A' })).rejects.toThrow()
    await expect(saveClient({ email: 'inválido' })).rejects.toThrow()
    expect((await db.query('select * from public.clients')).rows).toHaveLength(1)
    await db.exec('reset role')
    expect((await db.query('select * from public.audit_logs')).rows).toHaveLength(2)
  })
  it('allows only administrators to create tenant-scoped areas', async () => {
    expect((await db.query('select * from public.legal_areas')).rows).toHaveLength(9)
    await db.query("select public.create_legal_area('Ambiental')")
    await expect(db.query("select public.create_legal_area(' ambiental ')")).rejects.toThrow(
      'duplicate',
    )
    await actor(3)
    await expect(db.query("select public.create_legal_area('Outra')")).rejects.toThrow(
      'access_denied',
    )
    await actor(4)
    expect(
      (await db.query("select * from public.legal_areas where name='Ambiental'")).rows,
    ).toHaveLength(0)
  })
  it('paginates consistently and prevents anonymous access', async () => {
    for (let n = 0; n < 25; n++) await saveClient({ name: `Cliente ${String(n).padStart(2, '0')}` })
    expect(
      (await db.query("select * from public.search_clients('','active',0)")).rows,
    ).toHaveLength(21)
    expect(
      (await db.query("select * from public.search_clients('','active',20)")).rows,
    ).toHaveLength(5)
    await db.exec('reset role; set role anon')
    await expect(db.query('select * from public.clients')).rejects.toThrow('permission denied')
    await expect(saveClient()).rejects.toThrow('permission denied')
  })
  it('creates tenant-scoped events and deadlines with participants', async () => {
    const client = await saveClient()
    const data = await caseData(client)
    const caseId = await saveCase(data)
    const start = new Date(Date.now() + 86400000).toISOString()
    const event = (
      await db.query<{ id: string }>('select public.save_event($1) as id', [
        JSON.stringify({
          title: 'Audiência de teste',
          event_type: 'hearing',
          owner_user_id: uid(),
          client_id: client,
          case_id: caseId,
          starts_at: start,
          ends_at: null,
          all_day: false,
          recurrence_type: 'none',
          recurrence_until: null,
          participant_ids: [uid(2)],
        }),
      ])
    ).rows[0].id
    expect(
      (await db.query('select * from public.event_participants where event_id=$1', [event])).rows,
    ).toHaveLength(1)
    const deadline = (
      await db.query<{ id: string }>('select public.save_deadline($1) as id', [
        JSON.stringify({
          title: 'Prazo de teste',
          description: '',
          case_id: caseId,
          start_date: '2020-09-18',
          due_date: '2020-09-25',
          due_time: '17:00',
          owner_user_id: uid(),
          priority: 'urgent',
          status: 'pending',
          participant_ids: [uid(2)],
        }),
      ])
    ).rows[0].id
    expect(
      (await db.query('select priority,status from public.deadlines where id=$1', [deadline]))
        .rows[0],
    ).toEqual({ priority: 'urgent', status: 'pending' })
    await db.query('select public.mark_overdue_deadlines()')
    expect(
      (
        await db.query<{ status: string }>('select status from public.deadlines where id=$1', [
          deadline,
        ])
      ).rows[0].status,
    ).toBe('overdue')
    await actor(4)
    expect((await db.query('select * from public.events where id=$1', [event])).rows).toHaveLength(
      0,
    )
    expect(
      (await db.query('select * from public.deadlines where id=$1', [deadline])).rows,
    ).toHaveLength(0)
  })
  it('keeps event lifecycle changes behind the cancellation authorization', async () => {
    const client = await saveClient()
    const caseId = await saveCase(await caseData(client))
    const start = new Date(Date.now() + 86400000).toISOString()
    const eventData = {
      title: 'Evento protegido',
      event_type: 'hearing',
      owner_user_id: uid(),
      client_id: client,
      case_id: caseId,
      starts_at: start,
      ends_at: null,
      all_day: false,
      recurrence_type: 'none',
      recurrence_until: null,
      participant_ids: [],
    }
    const event = (
      await db.query<{ id: string }>('select public.save_event($1) as id', [
        JSON.stringify(eventData),
      ])
    ).rows[0].id
    const eventStamp = await stamp('events', event)

    await actor(3)
    await db.query('select public.save_event($1,$2,$3,$4)', [
      JSON.stringify({ ...eventData, status: 'cancelled' }),
      event,
      eventStamp,
      '',
    ])
    const unchangedStamp = await stamp('events', event)
    expect(
      (await db.query<{ status: string }>('select status from public.events where id=$1', [event]))
        .rows[0].status,
    ).toBe('scheduled')

    await expect(
      db.query('select public.save_event($1,$2,$3,$4)', [
        JSON.stringify({ ...eventData, owner_user_id: uid(3) }),
        event,
        unchangedStamp,
        '',
      ]),
    ).rejects.toThrow('access_denied')

    expect(
      (await db.query('select status,owner_user_id from public.events where id=$1', [event]))
        .rows[0],
    ).toEqual({
      status: 'scheduled',
      owner_user_id: uid(),
    })

    await actor(1)
    await db.query('select public.cancel_event($1,$2,$3)', [
      event,
      unchangedStamp,
      'Audiência cancelada pelo escritório',
    ])
    const cancelledStamp = await stamp('events', event)
    await actor(3)
    await db.query('select public.save_event($1,$2,$3,$4)', [
      JSON.stringify({ ...eventData, title: 'Edição após cancelamento', status: 'scheduled' }),
      event,
      cancelledStamp,
      '',
    ])
    expect(
      (
        await db.query<{ status: string; cancelled_at: string | null }>(
          'select status,cancelled_at from public.events where id=$1',
          [event],
        )
      ).rows[0].status,
    ).toBe('cancelled')
  })
  it('requires a reason to move a deadline and blocks assistant transitions', async () => {
    const client = await saveClient()
    const deadline = await saveCase(await caseData(client))
    const row = (
      await db.query<{ id: string }>('select public.save_deadline($1) as id', [
        JSON.stringify({
          title: 'Prazo de segurança',
          description: '',
          case_id: deadline,
          start_date: '2026-09-18',
          due_date: '2026-09-25',
          due_time: '',
          owner_user_id: uid(),
          priority: 'normal',
          status: 'pending',
          participant_ids: [],
        }),
      ])
    ).rows[0].id
    const stampValue = await stamp('deadlines', row)
    await expect(
      db.query('select public.save_deadline($1,$2,$3,$4)', [
        JSON.stringify({
          title: 'Alterado',
          description: '',
          case_id: deadline,
          start_date: '2026-09-18',
          due_date: '2026-09-26',
          due_time: '',
          owner_user_id: uid(),
          priority: 'normal',
          status: 'pending',
          participant_ids: [],
        }),
        row,
        stampValue,
        '',
      ]),
    ).rejects.toThrow('date_reason_required')
    await actor(3)
    await expect(
      db.query('select public.save_deadline($1,$2,$3,$4)', [
        JSON.stringify({
          title: 'Alterado',
          description: '',
          case_id: deadline,
          start_date: '2026-09-18',
          due_date: '2026-09-26',
          due_time: '',
          owner_user_id: uid(),
          priority: 'normal',
          status: 'pending',
          participant_ids: [],
        }),
        row,
        stampValue,
        'Motivo informado',
      ]),
    ).rejects.toThrow('access_denied')
    await expect(
      db.query('select public.deadline_action($1,$2,$3,$4,$5)', [
        row,
        'complete',
        stampValue,
        '',
        '',
      ]),
    ).rejects.toThrow('access_denied')
    await actor(2)
    await db.query('select public.deadline_action($1,$2,$3,$4,$5)', [
      row,
      'complete',
      stampValue,
      '',
      'Concluído',
    ])
    const completed = await stamp('deadlines', row)
    expect(
      (
        await db.query<{ status: string; completed_by: string | null }>(
          'select status,completed_by from public.deadlines where id=$1',
          [row],
        )
      ).rows[0].status,
    ).toBe('completed')
    await db.query('select public.deadline_action($1,$2,$3,$4,$5)', [
      row,
      'reopen',
      completed,
      'Retomado pelo escritório',
      '',
    ])
    expect(
      (await db.query<{ status: string }>('select status from public.deadlines where id=$1', [row]))
        .rows[0].status,
    ).toBe('pending')
    const cancellable = (
      await db.query<{ id: string }>('select public.save_deadline($1) as id', [
        JSON.stringify({
          title: 'Prazo cancelável',
          description: '',
          case_id: deadline,
          start_date: '2026-09-18',
          due_date: '2026-09-30',
          due_time: '',
          owner_user_id: uid(),
          priority: 'normal',
          status: 'pending',
          participant_ids: [uid(2)],
        }),
      ])
    ).rows[0].id
    const cancellableStamp = await stamp('deadlines', cancellable)
    await db.query('select public.deadline_action($1,$2,$3,$4,$5)', [
      cancellable,
      'cancel',
      cancellableStamp,
      'Cadastro duplicado',
      '',
    ])
    expect(
      (await db.query('select * from public.deadlines where id=$1', [cancellable])).rows,
    ).toHaveLength(0)
    expect(
      (
        await db.query('select * from public.deadline_participants where deadline_id=$1', [
          cancellable,
        ])
      ).rows,
    ).toHaveLength(0)
  })
})
