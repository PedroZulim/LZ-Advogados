begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.organizations(id, name) values
 ('71000000-0000-4000-8000-000000000001', 'Admin test Alpha'),
 ('71000000-0000-4000-8000-000000000002', 'Admin test Beta');
insert into auth.users(id, aud, role, email) values
 ('72000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-test-alpha@example.test'),
 ('72000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'lawyer-test-alpha@example.test'),
 ('72000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin-test-beta@example.test');
insert into auth.sessions(id, user_id) values
 ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001'),
 ('73000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002'),
 ('73000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003');
insert into public.profiles(id, organization_id, full_name, role) values
 ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Test admin', 'admin'),
 ('72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'Test lawyer', 'lawyer'),
 ('72000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002', 'Other admin', 'admin');
insert into auth.refresh_tokens(token, user_id, session_id) values
 ('synthetic-administration-pgtap-token', '72000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000002');

create function pg_temp.op(actor integer, action text, payload jsonb default '{}', aal text default 'aal2')
returns jsonb language sql as $$
 select public.manage_users(
 ('72000000-0000-4000-8000-' || lpad(actor::text,12,'0'))::uuid,
 ('73000000-0000-4000-8000-' || lpad(actor::text,12,'0'))::uuid,
 aal, action, payload, gen_random_uuid());
$$;

select is(jsonb_array_length(pg_temp.op(1,'list')->'users'), 2, 'Admin only sees own tenant');
select throws_ok($$select pg_temp.op(2,'list')$$, '42501', 'access_denied', 'Lawyer cannot list administrative data');
select throws_ok($$select pg_temp.op(1,'list','{}','aal1')$$, '42501', 'access_denied', 'MFA required');
select throws_ok($$select pg_temp.op(1,'set_active','{"user_id":"72000000-0000-4000-8000-000000000003","is_active":false}')$$, '42501', 'access_denied', 'Cross-tenant mutation denied');
select throws_ok($$select pg_temp.op(1,'set_active','{"user_id":"72000000-0000-4000-8000-000000000001","is_active":false}')$$, 'P0001', 'last_admin', 'Last admin cannot deactivate self');
select throws_ok($$select pg_temp.op(1,'change_role','{"user_id":"72000000-0000-4000-8000-000000000001","role":"lawyer"}')$$, 'P0001', 'last_admin', 'Last admin cannot demote self');
select lives_ok($$select pg_temp.op(1,'change_role','{"user_id":"72000000-0000-4000-8000-000000000002","role":"assistant","reason":"Test role change"}')$$, 'Role update succeeds');
select is((select role::text from public.profiles where id='72000000-0000-4000-8000-000000000002'), 'assistant', 'Role persisted');
select is((select count(*)::int from auth.sessions where user_id='72000000-0000-4000-8000-000000000002'),0,'Sessions removed');
select is((select count(*)::int from auth.refresh_tokens where token='synthetic-administration-pgtap-token'),0,'Refresh tokens cascade on session revocation');
select is((select count(*)::int from public.audit_logs where organization_id='71000000-0000-4000-8000-000000000001'),1,'Mutation and audit committed together');
select throws_ok($$select pg_temp.op(2,'sessions')$$, '42501', 'access_denied', 'Revoked token identity rejected');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"72000000-0000-4000-8000-000000000001","session_id":"73000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select throws_ok($$select public.manage_users(null,null,'aal2','list','{}',gen_random_uuid())$$, '42501', 'permission denied for function manage_users', 'Browser cannot call privileged RPC');
select is((select count(*)::int from public.audit_logs),1,'Admin can read own audit');
select throws_ok($$delete from public.audit_logs$$, '42501', 'permission denied for table audit_logs', 'Admin cannot delete audit');
select set_config('request.jwt.claims','{"sub":"72000000-0000-4000-8000-000000000003","session_id":"73000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select is((select count(*)::int from public.audit_logs),0,'Foreign audit is hidden');
reset role;
select * from finish();
rollback;
