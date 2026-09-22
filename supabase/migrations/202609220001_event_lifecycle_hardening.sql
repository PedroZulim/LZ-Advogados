-- Keep already-initialized projects on the same event lifecycle rules as new
-- installations. Generic saves cannot change lifecycle state or self-assign
-- cancellation authority.
create or replace function public.save_event(p_data jsonb,p_id uuid default null,p_updated_at timestamptz default null,p_reason text default null)
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
 if p_id is not null and old.owner_user_id is distinct from owner
   and private.current_user_role() not in ('admin','lawyer')
   and old.owner_user_id is distinct from auth.uid() then
  raise exception 'access_denied' using errcode='42501';
 end if;
 if not exists(select 1 from public.profiles where id=owner and organization_id=org and is_active and removed_at is null) then raise exception 'invalid_owner'; end if;
 perform private.validate_record_links(org,client,linked_case);
 start_at := (p_data->>'starts_at')::timestamptz; finish_at := nullif(p_data->>'ends_at','')::timestamptz;
 if finish_at is not null and finish_at < start_at then raise exception 'invalid_time'; end if;
 recurrence := coalesce(p_data->>'recurrence_type','none');
 if recurrence <> 'none' and nullif(p_data->>'recurrence_until','')::date is null then raise exception 'invalid_recurrence'; end if;
 if p_id is null then
  event_status := 'scheduled';
  insert into public.events(organization_id,title,description,event_type,owner_user_id,client_id,case_id,starts_at,ends_at,all_day,recurrence_type,recurrence_until,status,created_by,cancelled_at)
  values(org,trim(p_data->>'title'),nullif(trim(p_data->>'description'),''),p_data->>'event_type',owner,client,linked_case,start_at,finish_at,coalesce((p_data->>'all_day')::boolean,false),recurrence,nullif(p_data->>'recurrence_until','')::date,event_status,auth.uid(),null) returning * into saved;
 else
  event_status := old.status;
  update public.events set title=trim(p_data->>'title'),description=nullif(trim(p_data->>'description'),''),event_type=p_data->>'event_type',owner_user_id=owner,client_id=client,case_id=linked_case,starts_at=start_at,ends_at=finish_at,all_day=coalesce((p_data->>'all_day')::boolean,false),recurrence_type=recurrence,recurrence_until=nullif(p_data->>'recurrence_until','')::date,status=event_status,cancelled_at=old.cancelled_at,updated_at=clock_timestamp() where id=p_id returning * into saved;
 end if;
 perform private.replace_event_participants(org,saved.id,p_data->'participant_ids');
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,request_id)
 values(org,auth.uid(),case when p_id is null then 'event.created' else 'event.updated' end,'event',saved.id,case when p_id is null then null else to_jsonb(old) end,to_jsonb(saved),nullif(trim(p_reason),''),gen_random_uuid());
 return saved.id;
end $$;

revoke all on function public.save_event(jsonb,uuid,timestamptz,text) from public,anon;
grant execute on function public.save_event(jsonb,uuid,timestamptz,text) to authenticated;
