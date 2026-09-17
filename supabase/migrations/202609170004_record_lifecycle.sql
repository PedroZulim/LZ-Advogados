-- Administrative correction of records, with tenant/MFA checks and stale-write protection.
create function public.delete_record(p_kind text,p_id uuid,p_updated_at timestamptz,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid; previous jsonb;
begin
 org := private.lock_record_actor();
 if private.current_user_role() is distinct from 'admin' then raise exception 'access_denied' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'invalid_reason'; end if;
 if p_kind='client' then
  select to_jsonb(c) into previous from public.clients c where id=p_id and organization_id=org for update;
 elsif p_kind='case' then
  select to_jsonb(c) into previous from public.cases c where id=p_id and organization_id=org for update;
 else raise exception 'invalid_request'; end if;
 if previous is null then raise exception 'access_denied' using errcode='42501'; end if;
 if p_updated_at is distinct from (previous->>'updated_at')::timestamptz then raise exception 'record_conflict'; end if;
 if p_kind='client' then
  if exists(select 1 from public.cases where client_id=p_id and organization_id=org) then raise exception 'client_has_cases'; end if;
  delete from public.clients where id=p_id and organization_id=org;
 else
  delete from public.cases where id=p_id and organization_id=org;
 end if;
 -- Keep accountability, without making an extra copy of the deleted record.
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,reason,request_id)
 values(org,auth.uid(),p_kind||'.deleted',p_kind,p_id,trim(p_reason),gen_random_uuid());
end $$;

create function public.reactivate_client(p_id uuid,p_updated_at timestamptz,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid; previous public.clients;
begin
 org := private.lock_record_actor();
 if private.current_user_role() is distinct from 'admin' then raise exception 'access_denied' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'invalid_reason'; end if;
 select * into previous from public.clients where id=p_id and organization_id=org for update;
 if previous.id is null then raise exception 'access_denied' using errcode='42501'; end if;
 if p_updated_at is distinct from previous.updated_at then raise exception 'record_conflict'; end if;
 if previous.status <> 'archived' then raise exception 'client_not_archived'; end if;
 update public.clients set status='active',archived_at=null,updated_at=clock_timestamp() where id=p_id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,request_id)
 values(org,auth.uid(),'client.reactivated','client',p_id,jsonb_build_object('status','archived'),jsonb_build_object('status','active'),trim(p_reason),gen_random_uuid());
end $$;

revoke all on function public.delete_record(text,uuid,timestamptz,text), public.reactivate_client(uuid,timestamptz,text) from public,anon;
grant execute on function public.delete_record(text,uuid,timestamptz,text), public.reactivate_client(uuid,timestamptz,text) to authenticated;
