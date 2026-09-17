-- Readmission preserves the same identity and audit history; authorization is rechecked.
create or replace function public.manage_users(
  p_actor uuid, p_session uuid, p_aal text, p_action text,
  p_payload jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  target public.profiles;
  invitation private.user_invitations;
  organization uuid;
  target_id uuid;
  requested_role public.app_role;
  requested_active boolean;
  result jsonb;
  previous jsonb;
  event text;
  request_count integer;
  affected integer;
begin
  if p_aal is distinct from 'aal2' or p_actor is null or p_session is null then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  select organization_id into organization from public.profiles where id = p_actor;
  -- Serialize changes within a tenant, then re-read authorization under the lock.
  perform 1 from public.organizations where id = organization for update;
  select * into actor from public.profiles where id = p_actor;
  if actor.id is null or not actor.is_active or not exists (
    select 1 from auth.sessions where id = p_session and user_id = p_actor
      and (not_after is null or not_after > now())
  ) then raise exception 'access_denied' using errcode = '42501'; end if;
  if p_action not in ('sessions', 'revoke_own_sessions') and actor.role <> 'admin' then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  insert into private.admin_rate_limits values (p_actor, now(), 1)
  on conflict (actor_id) do update set
    requests = case when private.admin_rate_limits.window_start < now() - interval '1 minute'
      then 1 else private.admin_rate_limits.requests + 1 end,
    window_start = case when private.admin_rate_limits.window_start < now() - interval '1 minute'
      then now() else private.admin_rate_limits.window_start end
  returning requests into request_count;
  if request_count > 60 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  if p_action in ('list', 'list_removed') then
    select coalesce(jsonb_agg(to_jsonb(u) order by u.full_name, u.id), '[]') into result
    from (select p.id, p.full_name, p.role, p.is_active, a.email, a.invited_at,
      a.email_confirmed_at, a.last_sign_in_at, p.removed_at
      from public.profiles p join auth.users a on a.id = p.id
      where p.organization_id = organization
        and ((p_action = 'list' and p.removed_at is null)
          or (p_action = 'list_removed' and p.removed_at is not null))) u;
    return jsonb_build_object('users', result);
  elsif p_action = 'readmit_member' then
    target_id := (p_payload->>'user_id')::uuid;
    select * into target from public.profiles where id = target_id
      and organization_id = organization and removed_at is not null and not is_active for update;
    if target.id is null then raise exception 'access_denied' using errcode = '42501'; end if;
    if coalesce(p_payload->>'role', '') not in ('admin', 'lawyer', 'assistant')
      or length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 500 then
      raise exception 'invalid_request';
    end if;
    previous := jsonb_build_object('role', target.role, 'is_active', false, 'removed_at', target.removed_at);
    -- An Auth session may have been created while the profile was removed.
    -- Remove every such session before reinstating access; never restore old tokens.
    delete from auth.sessions where user_id = target_id;
    update public.profiles set removed_at = null, is_active = true,
      role = (p_payload->>'role')::public.app_role, updated_at = now() where id = target_id;
    event := 'user.readmitted';
    result := jsonb_build_object('role', p_payload->>'role', 'is_active', true, 'removed_at', null);
  elsif p_action = 'audit' then
    select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc, a.id), '[]') into result
    from (select l.*, p.full_name as actor_name from public.audit_logs l
      left join public.profiles p on p.id = l.actor_user_id
      where l.organization_id = organization
        and (coalesce(p_payload->>'action', '') = '' or l.action = p_payload->>'action')
        and (coalesce(p_payload->>'actor', '') = '' or l.actor_user_id::text = p_payload->>'actor')
        and (coalesce(p_payload->>'before', '') = '' or l.created_at < (p_payload->>'before')::timestamptz)
      order by l.created_at desc, l.id limit 100) a;
    return jsonb_build_object('events', result);
  elsif p_action = 'sessions' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'created_at', created_at,
      'updated_at', updated_at, 'is_current', id = p_session) order by created_at desc), '[]')
    into result from auth.sessions where user_id = p_actor
      and (not_after is null or not_after > now());
    return jsonb_build_object('sessions', result);
  elsif p_action = 'revoke_own_sessions' then
    if coalesce(p_payload->>'scope', '') not in ('others', 'all', 'current') then
      raise exception 'invalid_request';
    end if;
    delete from auth.sessions where user_id = p_actor and (
      p_payload->>'scope' = 'all' or
      (p_payload->>'scope' = 'others' and id <> p_session) or
      (p_payload->>'scope' = 'current' and id = p_session));
    get diagnostics affected = row_count;
    event := 'user.sessions_revoked'; target_id := p_actor;
    result := jsonb_build_object('scope', p_payload->>'scope', 'count', affected);
  elsif p_action = 'prepare_invite' then
    if length(trim(coalesce(p_payload->>'full_name', ''))) not between 2 and 160
      or length(coalesce(p_payload->>'email', '')) not between 3 and 254
      or coalesce(p_payload->>'role', '') not in ('admin', 'lawyer', 'assistant') then
      raise exception 'invalid_request';
    end if;
    -- Never attach an existing account, including an account in another tenant.
    if exists (select 1 from auth.users where lower(email) = lower(trim(p_payload->>'email'))) then
      return jsonb_build_object('error', 'invite_unavailable');
    end if;
    insert into private.user_invitations(organization_id, actor_id, email, full_name, role, status)
      values (organization, p_actor, lower(trim(p_payload->>'email')), trim(p_payload->>'full_name'),
        (p_payload->>'role')::public.app_role, 'pending')
    on conflict(email) do update set id = gen_random_uuid(), actor_id = excluded.actor_id,
      full_name = excluded.full_name, role = excluded.role, status = 'pending', created_at = now()
      where private.user_invitations.organization_id = excluded.organization_id
        and (private.user_invitations.status = 'failed'
          or private.user_invitations.created_at < now() - interval '10 minutes')
    returning * into invitation;
    if invitation.id is null then return jsonb_build_object('error', 'invite_unavailable'); end if;
    return jsonb_build_object('invitation_id', invitation.id);
  elsif p_action in ('complete_invite', 'fail_invite') then
    select * into invitation from private.user_invitations
      where id = (p_payload->>'invitation_id')::uuid and organization_id = organization
        and actor_id = p_actor and status = 'pending' for update;
    if invitation.id is null then raise exception 'invite_unavailable'; end if;
    if p_action = 'fail_invite' then
      update private.user_invitations set status = 'failed' where id = invitation.id;
      event := 'user.invite_failed'; target_id := invitation.id;
      result := jsonb_build_object('status', 'failed');
    else
      target_id := (p_payload->>'user_id')::uuid;
      if not exists (select 1 from auth.users where id = target_id
        and lower(email) = invitation.email and invited_at is not null
        and created_at >= invitation.created_at - interval '5 seconds')
        or exists (select 1 from public.profiles where id = target_id) then
        raise exception 'invite_unavailable';
      end if;
      insert into public.profiles(id, organization_id, full_name, role)
        values (target_id, organization, invitation.full_name, invitation.role);
      update private.user_invitations set status = 'completed' where id = invitation.id;
      event := 'user.invited'; result := jsonb_build_object('role', invitation.role);
    end if;
  elsif p_action in ('change_role', 'set_active', 'revoke_sessions', 'remove_member') then
    target_id := (p_payload->>'user_id')::uuid;
    select * into target from public.profiles where id = target_id and organization_id = organization and removed_at is null for update;
    if target.id is null then raise exception 'access_denied' using errcode = '42501'; end if;
    previous := jsonb_build_object('role', target.role, 'is_active', target.is_active);
    requested_role := target.role; requested_active := target.is_active;
    if p_action = 'change_role' then
      if coalesce(p_payload->>'role', '') not in ('admin', 'lawyer', 'assistant') then raise exception 'invalid_request'; end if;
      requested_role := (p_payload->>'role')::public.app_role;
    elsif p_action = 'set_active' then
      if jsonb_typeof(p_payload->'is_active') is distinct from 'boolean' then raise exception 'invalid_request'; end if;
      requested_active := (p_payload->>'is_active')::boolean;
    end if;
    if target.role = 'admin' and target.is_active and (requested_role <> 'admin' or not requested_active)
      and not exists (select 1 from public.profiles where organization_id = organization
        and id <> target_id and role = 'admin' and is_active) then
      raise exception 'last_admin';
    end if;
    if p_action = 'remove_member' then
      if target.is_active then raise exception 'member_must_be_inactive'; end if;
      delete from auth.sessions where user_id = target_id;
      update public.profiles set removed_at = now(), updated_at = now() where id = target_id;
      event := 'user.removed';
      result := jsonb_build_object('is_active', false, 'removed', true);
    elsif p_action = 'revoke_sessions' then
      delete from auth.sessions where user_id = target_id;
      get diagnostics affected = row_count;
      event := 'user.sessions_revoked'; result := jsonb_build_object('count', affected);
    else
      update public.profiles set role = requested_role, is_active = requested_active, updated_at = now()
        where id = target_id;
      -- Role changes and deactivation invalidate existing MFA sessions immediately.
      if requested_role <> target.role or not requested_active then
        delete from auth.sessions where user_id = target_id;
      end if;
      event := case when p_action = 'change_role' then 'user.role_changed'
        when requested_active then 'user.reactivated' else 'user.deactivated' end;
      result := jsonb_build_object('role', requested_role, 'is_active', requested_active);
    end if;
  else raise exception 'invalid_request';
  end if;

  insert into public.audit_logs(organization_id, actor_user_id, action, entity_id,
    before_data, after_data, reason, request_id)
  values (organization, p_actor, event, target_id, previous, result,
    nullif(left(trim(p_payload->>'reason'), 500), ''), p_request_id);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.manage_users(uuid, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.manage_users(uuid, uuid, text, text, jsonb, uuid) to service_role;
