-- Phase 2: tenant-scoped legal records. Mutations are exclusively transactional RPCs.
create table public.legal_areas (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null check (length(trim(name)) between 2 and 80),
 unique (organization_id, id)
);
create unique index legal_areas_name on public.legal_areas(organization_id, lower(trim(name)));
create function private.seed_legal_areas() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.legal_areas(organization_id,name)
 select new.id, unnest(array['Trabalhista','Cível','Previdenciário','Família','Consumidor','Empresarial','Tributário','Criminal','Outros']);
 return new;
end $$;
revoke all on function private.seed_legal_areas() from public, anon, authenticated;
create trigger organization_legal_areas after insert on public.organizations
 for each row execute function private.seed_legal_areas();
insert into public.legal_areas(organization_id,name)
 select id, unnest(array['Trabalhista','Cível','Previdenciário','Família','Consumidor','Empresarial','Tributário','Criminal','Outros']) from public.organizations;

create table public.clients (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 person_type text not null check (person_type in ('individual','company')),
 name text not null check (length(trim(name)) between 2 and 160),
 cpf_cnpj text check (length(cpf_cnpj) <= 30),
 email text check (email is null or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 phone text check (length(phone) <= 40),
 address text check (length(address) <= 500),
 responsible_user_id uuid,
 notes text check (length(notes) <= 10000),
 status text not null default 'active' check (status in ('active','archived')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(organization_id,id),
 foreign key (organization_id,responsible_user_id) references public.profiles(organization_id,id),
 check ((status = 'archived') = (archived_at is not null))
);
create index clients_org_name on public.clients(organization_id,name);

create function private.normalize_case_number(value text) returns text
language sql immutable set search_path = '' as $$
 select upper(regexp_replace(trim(value), '[^[:alnum:]]', '', 'g'));
$$;
revoke all on function private.normalize_case_number(text) from public, anon, authenticated;
grant execute on function private.normalize_case_number(text) to authenticated;

create table public.cases (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 responsible_user_id uuid not null,
 case_number text not null check (length(trim(case_number)) between 1 and 100),
 case_number_normalized text generated always as (private.normalize_case_number(case_number)) stored,
 tribunal text check (length(tribunal) <= 160),
 court_unit text check (length(court_unit) <= 160),
 legal_area_id uuid not null,
 client_side text not null check (client_side in ('claimant','defendant','other')),
 opposing_party text check (length(opposing_party) <= 200),
 status text not null default 'active' check (status in ('active','suspended','closed','archived')),
 notes text check (length(notes) <= 10000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(organization_id,id),
 foreign key (organization_id,client_id) references public.clients(organization_id,id),
 foreign key (organization_id,responsible_user_id) references public.profiles(organization_id,id),
 foreign key (organization_id,legal_area_id) references public.legal_areas(organization_id,id),
 check (length(case_number_normalized) > 0),
 check ((status = 'archived') = (archived_at is not null))
);
create index cases_org_number on public.cases(organization_id,case_number_normalized);
create index cases_org_client on public.cases(organization_id,client_id);
create index cases_org_opposing on public.cases(organization_id,opposing_party);

alter table public.clients enable row level security;
alter table public.cases enable row level security;
alter table public.legal_areas enable row level security;
revoke all on public.clients, public.cases, public.legal_areas from public, anon, authenticated;
grant select on public.clients, public.cases, public.legal_areas to authenticated;
create policy clients_read on public.clients for select to authenticated
 using (organization_id = (select private.current_user_org_id()));
create policy cases_read on public.cases for select to authenticated
 using (organization_id = (select private.current_user_org_id()));
create policy legal_areas_read on public.legal_areas for select to authenticated
 using (organization_id = (select private.current_user_org_id()));

-- Same tenant lock as user administration: authorization changes and writes serialize.
create function private.lock_record_actor() returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
 select organization_id into org from public.profiles where id = auth.uid();
 perform 1 from public.organizations where id = org for update;
 if org is null or private.current_user_org_id() is distinct from org then
  raise exception 'access_denied' using errcode = '42501';
 end if;
 return org;
end $$;
revoke all on function private.lock_record_actor() from public, anon, authenticated;

create function public.save_client(p_data jsonb, p_id uuid default null, p_updated_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid; old public.clients; saved public.clients; responsible uuid;
begin
 org := private.lock_record_actor();
 if p_id is not null then
  select * into old from public.clients where id = p_id and organization_id = org for update;
  if old.id is null then raise exception 'access_denied' using errcode = '42501'; end if;
  if old.status = 'archived' then raise exception 'record_archived'; end if;
  if p_updated_at is distinct from old.updated_at then raise exception 'record_conflict'; end if;
 end if;
 responsible := nullif(p_data->>'responsible_user_id','')::uuid;
 if responsible is not null and (p_id is null or responsible is distinct from old.responsible_user_id)
  and not exists(select 1 from public.profiles where id=responsible and organization_id=org and is_active and removed_at is null)
 then raise exception 'invalid_responsible'; end if;
 if p_id is null then
  insert into public.clients(organization_id,person_type,name,cpf_cnpj,email,phone,address,responsible_user_id,notes)
  values(org,p_data->>'person_type',trim(p_data->>'name'),nullif(trim(p_data->>'cpf_cnpj'),''),
    nullif(trim(p_data->>'email'),''),nullif(trim(p_data->>'phone'),''),nullif(trim(p_data->>'address'),''),responsible,nullif(trim(p_data->>'notes'),'')) returning * into saved;
 else
  update public.clients set person_type=p_data->>'person_type',name=trim(p_data->>'name'),cpf_cnpj=nullif(trim(p_data->>'cpf_cnpj'),''),
   email=nullif(trim(p_data->>'email'),''),phone=nullif(trim(p_data->>'phone'),''),address=nullif(trim(p_data->>'address'),''),
   responsible_user_id=responsible,notes=nullif(trim(p_data->>'notes'),''),updated_at=clock_timestamp()
   where id=p_id returning * into saved;
 end if;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
 values(org,auth.uid(),case when p_id is null then 'client.created' else 'client.updated' end,'client',saved.id,
   case when p_id is null then null else to_jsonb(old) - 'cpf_cnpj' end,to_jsonb(saved) - 'cpf_cnpj',gen_random_uuid());
 return saved.id;
end $$;

create function public.save_case(p_data jsonb, p_id uuid default null, p_updated_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid; old public.cases; saved public.cases; responsible uuid; client uuid; area uuid; number text;
begin
 org := private.lock_record_actor();
 if p_id is not null then
  select * into old from public.cases where id=p_id and organization_id=org for update;
  if old.id is null then raise exception 'access_denied' using errcode = '42501'; end if;
  if old.status='archived' then raise exception 'record_archived'; end if;
  if p_updated_at is distinct from old.updated_at then raise exception 'record_conflict'; end if;
 end if;
 responsible := (p_data->>'responsible_user_id')::uuid;
 client := (p_data->>'client_id')::uuid; area := (p_data->>'legal_area_id')::uuid;
 if p_id is null or responsible is distinct from old.responsible_user_id then
  if not exists(select 1 from public.profiles where id=responsible and organization_id=org and is_active and removed_at is null and role in ('admin','lawyer')) then raise exception 'invalid_responsible'; end if;
 end if;
 if not exists(select 1 from public.clients where id=client and organization_id=org
   and (status='active' or (p_id is not null and client=old.client_id))) then raise exception 'invalid_client'; end if;
 if not exists(select 1 from public.legal_areas where id=area and organization_id=org) then raise exception 'invalid_area'; end if;
 if coalesce(p_data->>'status','') not in ('active','suspended','closed') then raise exception 'invalid_status'; end if;
 number := trim(p_data->>'case_number');
 if number ~ '^[0-9]{20}$' then
  number := substr(number,1,7)||'-'||substr(number,8,2)||'.'||substr(number,10,4)||'.'||substr(number,14,1)||'.'||substr(number,15,2)||'.'||substr(number,17,4);
 end if;
 if p_id is null then
  insert into public.cases(organization_id,client_id,responsible_user_id,case_number,tribunal,court_unit,legal_area_id,client_side,opposing_party,status,notes)
  values(org,client,responsible,number,nullif(trim(p_data->>'tribunal'),''),nullif(trim(p_data->>'court_unit'),''),area,
    p_data->>'client_side',nullif(trim(p_data->>'opposing_party'),''),p_data->>'status',nullif(trim(p_data->>'notes'),'')) returning * into saved;
 else
  update public.cases set client_id=client,responsible_user_id=responsible,case_number=number,
   tribunal=nullif(trim(p_data->>'tribunal'),''),court_unit=nullif(trim(p_data->>'court_unit'),''),legal_area_id=area,
   client_side=p_data->>'client_side',opposing_party=nullif(trim(p_data->>'opposing_party'),''),status=p_data->>'status',
   notes=nullif(trim(p_data->>'notes'),''),updated_at=clock_timestamp() where id=p_id returning * into saved;
 end if;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
 values(org,auth.uid(),case when p_id is null then 'case.created' else 'case.updated' end,'case',saved.id,
   case when p_id is null then null else to_jsonb(old) end,to_jsonb(saved),gen_random_uuid());
 return saved.id;
end $$;

create function public.archive_record(p_kind text,p_id uuid,p_updated_at timestamptz,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid; previous jsonb; updated jsonb;
begin
 org:=private.lock_record_actor();
 if private.current_user_role() not in ('admin','lawyer') then raise exception 'access_denied' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'invalid_reason'; end if;
 if p_kind='client' then
  select to_jsonb(c) into previous from public.clients c where id=p_id and organization_id=org for update;
 elsif p_kind='case' then
  select to_jsonb(c) into previous from public.cases c where id=p_id and organization_id=org for update;
 else raise exception 'invalid_request'; end if;
 if previous is null then raise exception 'access_denied' using errcode='42501'; end if;
 if previous->>'status'='archived' then raise exception 'record_archived'; end if;
 if p_updated_at is distinct from (previous->>'updated_at')::timestamptz then raise exception 'record_conflict'; end if;
 if p_kind='client' then
  update public.clients set status='archived',archived_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id returning to_jsonb(clients) into updated;
 else
  update public.cases set status='archived',archived_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id returning to_jsonb(cases) into updated;
 end if;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,request_id)
 values(org,auth.uid(),p_kind||'.archived',p_kind,p_id,previous-'cpf_cnpj',updated-'cpf_cnpj',trim(p_reason),gen_random_uuid());
end $$;

create function public.create_legal_area(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; area uuid;
begin
 org:=private.lock_record_actor();
 if private.current_user_role()<>'admin' then raise exception 'access_denied' using errcode='42501'; end if;
 insert into public.legal_areas(organization_id,name) values(org,trim(p_name)) returning id into area;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,after_data,request_id)
 values(org,auth.uid(),'legal_area.created','legal_area',area,jsonb_build_object('name',trim(p_name)),gen_random_uuid());
 return area;
end $$;

-- Security-invoker searches preserve table RLS. Parameters never become SQL syntax.
create function public.search_clients(p_query text default '',p_status text default 'active',p_offset integer default 0)
returns setof public.clients language sql stable security invoker set search_path='' as $$
 select * from public.clients where (p_status='' or status=p_status)
 and (position(lower(left(p_query,160)) in lower(name))>0
   or position(lower(left(p_query,160)) in lower(coalesce(email,'')))>0
   or position(lower(left(p_query,160)) in lower(coalesce(cpf_cnpj,'')))>0)
 order by name,id limit 21 offset greatest(0,least(p_offset,100000));
$$;
create function public.search_cases(p_query text default '',p_status text default 'active',p_offset integer default 0,p_client uuid default null)
returns setof public.cases language sql stable security invoker set search_path='' as $$
 select * from public.cases where (p_status='' or status=p_status) and (p_client is null or client_id=p_client)
 and (position(lower(left(p_query,160)) in lower(case_number))>0
   or (private.normalize_case_number(p_query)<>'' and position(private.normalize_case_number(left(p_query,160)) in case_number_normalized)>0)
   or position(lower(left(p_query,160)) in lower(coalesce(opposing_party,'')))>0)
 order by created_at desc,id limit 21 offset greatest(0,least(p_offset,100000));
$$;

revoke all on function public.save_client(jsonb,uuid,timestamptz), public.save_case(jsonb,uuid,timestamptz),
 public.archive_record(text,uuid,timestamptz,text), public.create_legal_area(text),
 public.search_clients(text,text,integer), public.search_cases(text,text,integer,uuid) from public,anon;
grant execute on function public.save_client(jsonb,uuid,timestamptz), public.save_case(jsonb,uuid,timestamptz),
 public.archive_record(text,uuid,timestamptz,text), public.create_legal_area(text),
 public.search_clients(text,text,integer), public.search_cases(text,text,integer,uuid) to authenticated;
