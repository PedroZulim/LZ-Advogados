-- Phase 3/4: tenant-scoped calendar events and legal deadlines.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null check (length(trim(title)) between 2 and 160),
  description text check (length(description) <= 10000),
  event_type text not null check (event_type in ('hearing','meeting','call','task','appointment','other')),
  owner_user_id uuid not null,
  client_id uuid,
  case_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  recurrence_type text not null default 'none' check (recurrence_type in ('none','daily','weekly','monthly')),
  recurrence_until date,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, owner_user_id) references public.profiles(organization_id,id),
  foreign key (organization_id, created_by) references public.profiles(organization_id,id),
  foreign key (organization_id, client_id) references public.clients(organization_id,id),
  foreign key (organization_id, case_id) references public.cases(organization_id,id),
  check (ends_at is null or ends_at >= starts_at),
  check ((recurrence_type = 'none' and recurrence_until is null) or recurrence_until is not null),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index events_org_starts on public.events(organization_id, starts_at);
create index events_org_owner on public.events(organization_id, owner_user_id, starts_at);

create table public.event_participants (
  event_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  primary key (event_id,user_id),
  foreign key (organization_id,event_id) references public.events(organization_id,id) on delete cascade,
  foreign key (organization_id,user_id) references public.profiles(organization_id,id)
);
create index event_participants_user on public.event_participants(organization_id,user_id,event_id);

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  case_id uuid not null,
  title text not null check (length(trim(title)) between 2 and 160),
  description text check (length(description) <= 10000),
  start_date date not null default current_date,
  due_date date not null,
  due_time time,
  owner_user_id uuid not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled','overdue')),
  completion_note text check (length(completion_note) <= 5000),
  completed_at timestamptz,
  completed_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,case_id) references public.cases(organization_id,id),
  foreign key (organization_id,owner_user_id) references public.profiles(organization_id,id),
  foreign key (organization_id,created_by) references public.profiles(organization_id,id),
  foreign key (organization_id,completed_by) references public.profiles(organization_id,id),
  foreign key (organization_id,cancelled_by) references public.profiles(organization_id,id),
  check (due_date >= start_date),
  check ((status = 'completed') = (completed_at is not null and completed_by is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null and cancelled_by is not null))
);
create index deadlines_org_due on public.deadlines(organization_id,due_date,due_time,status);
create index deadlines_org_owner on public.deadlines(organization_id,owner_user_id,due_date);

create table public.deadline_participants (
  deadline_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  primary key (deadline_id,user_id),
  foreign key (organization_id,deadline_id) references public.deadlines(organization_id,id) on delete cascade,
  foreign key (organization_id,user_id) references public.profiles(organization_id,id)
);
create index deadline_participants_user on public.deadline_participants(organization_id,user_id,deadline_id);

alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.deadlines enable row level security;
alter table public.deadline_participants enable row level security;
revoke all on public.events,public.event_participants,public.deadlines,public.deadline_participants from public,anon,authenticated;
grant select on public.events,public.event_participants,public.deadlines,public.deadline_participants to authenticated;
create policy events_read on public.events for select to authenticated
  using (organization_id = (select private.current_user_org_id()));
create policy event_participants_read on public.event_participants for select to authenticated
  using (organization_id = (select private.current_user_org_id()));
create policy deadlines_read on public.deadlines for select to authenticated
  using (organization_id = (select private.current_user_org_id()));
create policy deadline_participants_read on public.deadline_participants for select to authenticated
  using (organization_id = (select private.current_user_org_id()));

create function private.validate_record_links(p_org uuid,p_client uuid,p_case uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_client is not null and not exists(select 1 from public.clients where id=p_client and organization_id=p_org) then
  raise exception 'invalid_client';
 end if;
 if p_case is not null and not exists(select 1 from public.cases where id=p_case and organization_id=p_org) then
  raise exception 'invalid_case';
 end if;
 if p_case is not null and p_client is not null and not exists(select 1 from public.cases where id=p_case and client_id=p_client and organization_id=p_org) then
  raise exception 'invalid_client';
 end if;
end $$;
revoke all on function private.validate_record_links(uuid,uuid,uuid) from public,anon,authenticated;

create function private.replace_event_participants(p_org uuid,p_event uuid,p_ids jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare participant uuid;
begin
 delete from public.event_participants where organization_id=p_org and event_id=p_event;
 for participant in select distinct value::uuid from jsonb_array_elements_text(coalesce(p_ids,'[]'::jsonb)) loop
  if not exists(select 1 from public.profiles where id=participant and organization_id=p_org and is_active and removed_at is null) then
   raise exception 'invalid_participant';
  end if;
  insert into public.event_participants(organization_id,event_id,user_id) values(p_org,p_event,participant);
 end loop;
end $$;
revoke all on function private.replace_event_participants(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.save_event(p_data jsonb,p_id uuid default null,p_updated_at timestamptz default null,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; old public.events; saved public.events; owner uuid; client uuid; linked_case uuid; start_at timestamptz; finish_at timestamptz; recurrence text; event_status text;
begin
 org:=private.lock_record_actor();
 if p_id is not null then
  select * into old from public.events where id=p_id and organization_id=org for update;
  if old.id is null then raise exception 'access_denied' using errcode='42501'; end if;
  if p_updated_at is distinct from old.updated_at then raise exception 'record_conflict'; end if;
 end if;
 owner := (p_data->>'owner_user_id')::uuid; client := nullif(p_data->>'client_id','')::uuid; linked_case := nullif(p_data->>'case_id','')::uuid;
 if not exists(select 1 from public.profiles where id=owner and organization_id=org and is_active and removed_at is null) then raise exception 'invalid_owner'; end if;
 perform private.validate_record_links(org,client,linked_case);
 start_at := (p_data->>'starts_at')::timestamptz; finish_at := nullif(p_data->>'ends_at','')::timestamptz;
 if finish_at is not null and finish_at < start_at then raise exception 'invalid_time'; end if;
 recurrence := coalesce(p_data->>'recurrence_type','none');
 if recurrence <> 'none' and nullif(p_data->>'recurrence_until','')::date is null then raise exception 'invalid_recurrence'; end if;
 event_status := coalesce(p_data->>'status','scheduled');
 if event_status not in ('scheduled','cancelled') then raise exception 'invalid_status'; end if;
 if p_id is null then
  insert into public.events(organization_id,title,description,event_type,owner_user_id,client_id,case_id,starts_at,ends_at,all_day,recurrence_type,recurrence_until,status,created_by,cancelled_at)
  values(org,trim(p_data->>'title'),nullif(trim(p_data->>'description'),''),p_data->>'event_type',owner,client,linked_case,start_at,finish_at,coalesce((p_data->>'all_day')::boolean,false),recurrence,nullif(p_data->>'recurrence_until','')::date,event_status,auth.uid(),case when event_status='cancelled' then clock_timestamp() end) returning * into saved;
 else
  update public.events set title=trim(p_data->>'title'),description=nullif(trim(p_data->>'description'),''),event_type=p_data->>'event_type',owner_user_id=owner,client_id=client,case_id=linked_case,starts_at=start_at,ends_at=finish_at,all_day=coalesce((p_data->>'all_day')::boolean,false),recurrence_type=recurrence,recurrence_until=nullif(p_data->>'recurrence_until','')::date,status=event_status,cancelled_at=case when event_status='cancelled' then coalesce(cancelled_at,clock_timestamp()) else null end,updated_at=clock_timestamp() where id=p_id returning * into saved;
 end if;
 perform private.replace_event_participants(org,saved.id,p_data->'participant_ids');
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,request_id)
 values(org,auth.uid(),case when p_id is null then 'event.created' else 'event.updated' end,'event',saved.id,case when p_id is null then null else to_jsonb(old) end,to_jsonb(saved),nullif(trim(p_reason),''),gen_random_uuid());
 return saved.id;
end $$;

create function public.cancel_event(p_id uuid,p_updated_at timestamptz,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid; old public.events;
begin
 org:=private.lock_record_actor();
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'invalid_reason'; end if;
 select * into old from public.events where id=p_id and organization_id=org for update;
 if old.id is null then raise exception 'access_denied' using errcode='42501'; end if;
 if old.updated_at is distinct from p_updated_at then raise exception 'record_conflict'; end if;
 if private.current_user_role() not in ('admin','lawyer') and old.owner_user_id is distinct from auth.uid() then raise exception 'access_denied' using errcode='42501'; end if;
 update public.events set status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,request_id) values(org,auth.uid(),'event.cancelled','event',p_id,to_jsonb(old),jsonb_build_object('status','cancelled'),trim(p_reason),gen_random_uuid());
end $$;

create function private.replace_deadline_participants(p_org uuid,p_deadline uuid,p_ids jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare participant uuid;
begin
 delete from public.deadline_participants where organization_id=p_org and deadline_id=p_deadline;
 for participant in select distinct value::uuid from jsonb_array_elements_text(coalesce(p_ids,'[]'::jsonb)) loop
  if not exists(select 1 from public.profiles where id=participant and organization_id=p_org and is_active and removed_at is null) then raise exception 'invalid_participant'; end if;
  insert into public.deadline_participants(organization_id,deadline_id,user_id) values(p_org,p_deadline,participant);
 end loop;
end $$;
revoke all on function private.replace_deadline_participants(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.save_deadline(p_data jsonb,p_id uuid default null,p_updated_at timestamptz default null,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; old public.deadlines; saved public.deadlines; owner uuid; linked_case uuid; due date; start_day date; due_clock time; priority text; desired_status text;
begin
 org:=private.lock_record_actor();
 if p_id is not null then select * into old from public.deadlines where id=p_id and organization_id=org for update; if old.id is null then raise exception 'access_denied' using errcode='42501'; end if; if p_updated_at is distinct from old.updated_at then raise exception 'record_conflict'; end if; end if;
 linked_case:=(p_data->>'case_id')::uuid; owner:=(p_data->>'owner_user_id')::uuid; start_day:=coalesce(nullif(p_data->>'start_date','')::date,current_date); due:=(p_data->>'due_date')::date; due_clock:=nullif(p_data->>'due_time','')::time; priority:=coalesce(p_data->>'priority','normal'); desired_status:=coalesce(p_data->>'status','pending');
 if not exists(select 1 from public.cases where id=linked_case and organization_id=org) then raise exception 'invalid_case'; end if;
 if not exists(select 1 from public.profiles where id=owner and organization_id=org and is_active and removed_at is null) then raise exception 'invalid_owner'; end if;
 if due < start_day then raise exception 'invalid_date'; end if;
 if priority not in ('low','normal','high','urgent') or desired_status not in ('pending','in_progress','overdue') then raise exception 'invalid_status'; end if;
 if p_id is not null and old.status in ('completed','cancelled') then raise exception 'invalid_transition'; end if;
 if p_id is null and desired_status='overdue' then raise exception 'invalid_status'; end if;
 if p_id is not null and desired_status='overdue' and old.status <> 'overdue' then raise exception 'invalid_status'; end if;
 if p_id is not null and old.status='overdue' and desired_status <> 'overdue' then raise exception 'invalid_transition'; end if;
 if p_id is not null and (old.due_date is distinct from due or old.due_time is distinct from due_clock) then
  if private.current_user_role() not in ('admin','lawyer') then raise exception 'access_denied' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'date_reason_required'; end if;
 end if;
 if p_id is null then
  insert into public.deadlines(organization_id,case_id,title,description,start_date,due_date,due_time,owner_user_id,priority,status,created_by)
  values(org,linked_case,trim(p_data->>'title'),nullif(trim(p_data->>'description'),''),start_day,due,due_clock,owner,priority,desired_status,auth.uid()) returning * into saved;
 else
  update public.deadlines set case_id=linked_case,title=trim(p_data->>'title'),description=nullif(trim(p_data->>'description'),''),start_date=start_day,due_date=due,due_time=due_clock,owner_user_id=owner,priority=priority,status=desired_status,updated_at=clock_timestamp() where id=p_id returning * into saved;
 end if;
 perform private.replace_deadline_participants(org,saved.id,p_data->'participant_ids');
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,request_id) values(org,auth.uid(),case when p_id is null then 'deadline.created' when old.due_date is distinct from saved.due_date or old.due_time is distinct from saved.due_time then 'deadline.due_date_changed' else 'deadline.updated' end,'deadline',saved.id,case when p_id is null then null else to_jsonb(old) end,to_jsonb(saved),nullif(trim(p_reason),''),gen_random_uuid());
 return saved.id;
end $$;

create function public.deadline_action(p_id uuid,p_action text,p_updated_at timestamptz,p_reason text default null,p_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid; old public.deadlines; next_status text;
begin
 org:=private.lock_record_actor();
 select * into old from public.deadlines where id=p_id and organization_id=org for update;
 if old.id is null then raise exception 'access_denied' using errcode='42501'; end if;
 if old.updated_at is distinct from p_updated_at then raise exception 'record_conflict'; end if;
 if private.current_user_role() not in ('admin','lawyer') then raise exception 'access_denied' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 and p_action in ('reopen','cancel') then raise exception 'invalid_reason'; end if;
 if p_action='complete' and old.status not in ('pending','in_progress','overdue') then raise exception 'invalid_transition'; end if;
 if p_action='reopen' and old.status <> 'completed' then raise exception 'invalid_transition'; end if;
 if p_action='cancel' and old.status in ('completed','cancelled') then raise exception 'invalid_transition'; end if;
 if p_action='cancel' then
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,request_id)
  values(org,auth.uid(),'deadline.deleted','deadline',p_id,to_jsonb(old),null,trim(p_reason),gen_random_uuid());
  delete from public.deadlines where id=p_id;
  return;
 end if;
 next_status:=case p_action when 'complete' then 'completed' when 'reopen' then 'pending' else '' end;
 if next_status='' then raise exception 'invalid_transition'; end if;
 update public.deadlines set status=next_status,completion_note=case when p_action='complete' then nullif(trim(p_note),'') else completion_note end,completed_at=case when p_action='complete' then clock_timestamp() else null end,completed_by=case when p_action='complete' then auth.uid() else null end,cancelled_at=case when p_action='cancel' then clock_timestamp() else null end,cancelled_by=case when p_action='cancel' then auth.uid() else null end,updated_at=clock_timestamp() where id=p_id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,request_id) values(org,auth.uid(),'deadline.'||case p_action when 'complete' then 'completed' else 'reopened' end,'deadline',p_id,to_jsonb(old),jsonb_build_object('status',next_status),nullif(trim(p_reason),''),gen_random_uuid());
end $$;

create function public.mark_overdue_deadlines()
returns integer language plpgsql security definer set search_path='' as $$
declare org uuid; changed integer;
begin
 org:=private.lock_record_actor();
 update public.deadlines set status='overdue',updated_at=clock_timestamp()
 where organization_id=org and status in ('pending','in_progress')
   and ((due_date + coalesce(due_time,'23:59:59'::time)) at time zone 'America/Sao_Paulo') < now();
 get diagnostics changed = row_count;
 return changed;
end $$;

revoke all on function public.save_event(jsonb,uuid,timestamptz,text),public.cancel_event(uuid,timestamptz,text),public.save_deadline(jsonb,uuid,timestamptz,text),public.deadline_action(uuid,text,timestamptz,text,text),public.mark_overdue_deadlines() from public,anon;
grant execute on function public.save_event(jsonb,uuid,timestamptz,text),public.cancel_event(uuid,timestamptz,text),public.save_deadline(jsonb,uuid,timestamptz,text),public.deadline_action(uuid,text,timestamptz,text,text),public.mark_overdue_deadlines() to authenticated;
