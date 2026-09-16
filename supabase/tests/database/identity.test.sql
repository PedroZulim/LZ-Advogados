begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, aud, role, email) values
  ('50000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin.alpha@example.test'),
  ('50000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'lawyer.beta@example.test');
insert into auth.sessions (id, user_id) values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001');
insert into public.profiles (id, organization_id, full_name, role) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Admin Alpha', 'admin'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Lawyer Beta', 'lawyer');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","aal":"aal2","session_id":"60000000-0000-4000-8000-000000000001"}', true);
select is((select count(*)::int from public.organizations), 1, 'Only own organization');
select is((select count(*)::int from public.profiles), 1, 'Only own tenant profiles');
select is((select count(*)::int from public.profiles where id = '50000000-0000-4000-8000-000000000002'), 0, 'Known Beta UUID is hidden');
select throws_ok($$update public.profiles set role = 'admin'$$, '42501', 'permission denied for table profiles', 'Cannot mutate roles');
select throws_ok($$delete from public.profiles$$, '42501', 'permission denied for table profiles', 'Cannot delete profiles');
select throws_ok($$insert into public.organizations(name) values ('Injected')$$, '42501', 'permission denied for table organizations', 'Cannot create organizations');
select throws_ok($$update public.organizations set name = 'Injected'$$, '42501', 'permission denied for table organizations', 'Cannot modify organizations');

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","aal":"aal1","session_id":"60000000-0000-4000-8000-000000000001"}', true);
select is((select count(*)::int from public.profiles), 0, 'MFA is mandatory');
reset role;
delete from auth.sessions where id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","aal":"aal2","session_id":"60000000-0000-4000-8000-000000000001"}', true);
select is((select count(*)::int from public.profiles), 0, 'Revoked session is denied');
reset role;
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', 'permission denied for table profiles', 'Anonymous profiles denied');
select throws_ok($$select * from public.organizations$$, '42501', 'permission denied for table organizations', 'Anonymous organizations denied');
reset role;
select * from finish();
rollback;
