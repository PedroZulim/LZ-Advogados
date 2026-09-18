-- Keep already initialized local projects in sync with the deadline transition rules.
create or replace function public.save_deadline(p_data jsonb,p_id uuid default null,p_updated_at timestamptz default null,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; old public.deadlines; saved public.deadlines; owner uuid; linked_case uuid; due date; start_day date; due_clock time; priority text; desired_status text;
begin
 org:=private.lock_record_actor();
 if p_id is not null then
  select * into old from public.deadlines where id=p_id and organization_id=org for update;
  if old.id is null then raise exception 'access_denied' using errcode='42501'; end if;
  if p_updated_at is distinct from old.updated_at then raise exception 'record_conflict'; end if;
 end if;
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

create or replace function public.mark_overdue_deadlines()
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
revoke all on function public.save_deadline(jsonb,uuid,timestamptz,text),public.mark_overdue_deadlines() from public,anon;
grant execute on function public.save_deadline(jsonb,uuid,timestamptz,text),public.mark_overdue_deadlines() to authenticated;
