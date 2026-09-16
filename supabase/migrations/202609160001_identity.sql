-- Phase 1: deny-by-default identity boundary. No legal modules yet.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.app_role as enum ('admin', 'lawyer', 'assistant');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  timezone text not null default 'America/Sao_Paulo' check (timezone = 'America/Sao_Paulo'),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  role public.app_role not null default 'assistant',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index profiles_organization_id_idx on public.profiles (organization_id);

-- A valid JWT alone is insufficient after a session has been explicitly revoked.
create function private.current_user_has_mfa() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal' = 'aal2', false)
    and exists (
      select 1 from auth.sessions s
      where s.id::text = auth.jwt() ->> 'session_id'
        and s.user_id = auth.uid()
        and (s.not_after is null or s.not_after > now())
    );
$$;

create function private.current_user_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.organization_id from public.profiles p
  where p.id = auth.uid() and p.is_active and private.current_user_has_mfa();
$$;

create function private.current_user_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.is_active and private.current_user_has_mfa();
$$;

revoke all on function private.current_user_has_mfa() from public, anon;
revoke all on function private.current_user_org_id() from public, anon;
revoke all on function private.current_user_role() from public, anon;
grant execute on function private.current_user_has_mfa() to authenticated;
grant execute on function private.current_user_org_id() to authenticated;
grant execute on function private.current_user_role() to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
revoke all on public.organizations, public.profiles from anon, authenticated;
grant select on public.organizations, public.profiles to authenticated;
grant all on public.organizations, public.profiles to service_role;

create policy organizations_read_own on public.organizations for select to authenticated
  using (id = (select private.current_user_org_id()));
create policy profiles_read_own_organization on public.profiles for select to authenticated
  using (organization_id = (select private.current_user_org_id()));

-- No client write grants/policies, even for administrators. Membership and role
-- mutations require a dedicated, validated server-side operation in phase 1b.

-- Initial organization is reproducible; no real user or credential in migrations.
insert into public.organizations (id, name)
values ('10000000-0000-4000-8000-000000000001', 'LZ Advogados');
