begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
insert into public.organizations(id,name) values ('91000000-0000-4000-8000-000000000001','Records Alpha'),('91000000-0000-4000-8000-000000000002','Records Beta');
insert into auth.users(id,aud,role,email) values
 ('92000000-0000-4000-8000-000000000001','authenticated','authenticated','records-admin@example.test'),
 ('92000000-0000-4000-8000-000000000002','authenticated','authenticated','records-assistant@example.test'),
 ('92000000-0000-4000-8000-000000000003','authenticated','authenticated','records-foreign@example.test');
insert into auth.sessions(id,user_id) values
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001'),
 ('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002'),
 ('93000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000003');
insert into public.profiles(id,organization_id,full_name,role) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Test admin','admin'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','Test assistant','assistant'),
 ('92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002','Other admin','admin');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000002","session_id":"93000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
select is((select count(*)::int from public.legal_areas),9,'Areas seeded and isolated');
select lives_ok($$select public.save_client('{"name":"Test client","person_type":"individual","organization_id":"91000000-0000-4000-8000-000000000002"}')$$,'Assistant creates client');
select is((select organization_id::text from public.clients),'91000000-0000-4000-8000-000000000001','Tenant derived from session');
select throws_ok($$update public.clients set name='Bypass'$$,'42501','permission denied for table clients','Direct edit denied');
select throws_ok($$select public.archive_record('client',id,updated_at,'Test archive') from public.clients$$,'42501','access_denied','Assistant archive denied');
select throws_ok($$select public.create_legal_area('Not allowed')$$,'42501','access_denied','Assistant area creation denied');
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000003","session_id":"93000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select is((select count(*)::int from public.search_clients()),0,'Foreign clients hidden in search');
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000001","session_id":"93000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
select is((select count(*)::int from public.clients),0,'MFA required for reads');
select throws_ok($$select public.save_client('{"name":"Test client","person_type":"individual"}')$$,'42501','access_denied','MFA required for writes');
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000001","session_id":"93000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select lives_ok($$select public.archive_record('client',id,updated_at,'Test archive') from public.clients$$,'Admin archives client');
select is((select count(*)::int from public.search_clients('','archived')),1,'Archived client retained');
select is((select count(*)::int from public.audit_logs where entity_type='client'),2,'Create and archive audited');
reset role;
select * from finish();
rollback;
