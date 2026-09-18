-- Cancelling a deadline removes its operational record permanently.
-- The audit row keeps the before-image and reason for accountability.
create or replace function public.deadline_action(p_id uuid,p_action text,p_updated_at timestamptz,p_reason text default null,p_note text default null)
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
 update public.deadlines set status=next_status,completion_note=case when p_action='complete' then nullif(trim(p_note),'') else completion_note end,completed_at=case when p_action='complete' then clock_timestamp() else null end,completed_by=case when p_action='complete' then auth.uid() else null end,updated_at=clock_timestamp() where id=p_id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,request_id)
 values(org,auth.uid(),'deadline.'||case p_action when 'complete' then 'completed' else 'reopened' end,'deadline',p_id,to_jsonb(old),jsonb_build_object('status',next_status),nullif(trim(p_reason),''),gen_random_uuid());
end $$;

revoke all on function public.deadline_action(uuid,text,timestamptz,text,text) from public,anon;
grant execute on function public.deadline_action(uuid,text,timestamptz,text,text) to authenticated;

-- Remove operational rows left by the previous soft-cancel behavior.
delete from public.deadlines where status='cancelled';
