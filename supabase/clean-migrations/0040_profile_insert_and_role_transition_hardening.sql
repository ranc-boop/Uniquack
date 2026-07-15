-- SEC-P0 follow-up: profile creation and role-transition hardening.
--
-- The canonical clean-Supabase bootstrap creates auth users and profile rows
-- with the service role. Browser clients have no supported direct profile
-- creation path, so direct INSERT remains unavailable even for a least-
-- privileged student profile. This avoids caller-controlled identity and
-- timestamp fields during creation.

-- 0039 narrowed UPDATE but left the original authenticated INSERT grant and
-- policy in place. Remove both rather than relying on the policy shape.
revoke insert on table public.profiles from anon, authenticated;
revoke insert on table public.user_profiles from anon, authenticated;

drop policy if exists profiles_super_admin_insert on public.profiles;

-- Defense in depth: a later accidental INSERT grant must not recreate a
-- browser-controlled profile creation path. Canonical bootstrap and test
-- fixtures run with the service-role JWT, which remains the sole approved
-- profile-creation path. Do not add generic nested-trigger exceptions here.
create or replace function private.enforce_profile_insert_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  jwt_role text := coalesce(
    nullif(auth.role()::text, ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
begin
  if jwt_role = 'service_role' then
    return new;
  end if;

  raise exception 'Profiles are server-managed and cannot be created by clients.'
    using errcode = '42501';
end;
$$;

revoke all on function private.enforce_profile_insert_immutability() from public;

drop trigger if exists profiles_enforce_insert_immutability on public.profiles;
create trigger profiles_enforce_insert_immutability
before insert on public.profiles
for each row execute function private.enforce_profile_insert_immutability();

-- Replace the 0039 update trigger to remove its generic pg_trigger_depth()
-- exception. Google account linking is not live; a future audited Google flow
-- must use a separate explicit mutation context after verified OAuth/OIDC.
create or replace function private.enforce_profile_privileged_field_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  safe_self_edit_keys constant text[] := array[
    'full_name',
    'avatar_url',
    'display_name',
    'updated_at'
  ];
  protected_old jsonb := to_jsonb(old) - safe_self_edit_keys;
  protected_new jsonb := to_jsonb(new) - safe_self_edit_keys;
  jwt_role text := coalesce(
    nullif(auth.role()::text, ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
  only_role_changed boolean;
begin
  if protected_old is not distinct from protected_new then
    return new;
  end if;

  if jwt_role = 'service_role' then
    return new;
  end if;

  only_role_changed :=
    (protected_old - array['role']) is not distinct from
      (protected_new - array['role'])
    and old.role is distinct from new.role;

  -- The RPC below sets this transaction-local marker only after proving the
  -- caller was already an active super-admin. OLD role state prevents a
  -- caller from authorizing itself by changing role in the same statement.
  if only_role_changed
    and current_setting('app.profile_privileged_mutation', true) =
      'super_admin_role_transition'
    and private.is_super_admin() then
    return new;
  end if;

  raise exception 'Profile privileged fields are server-managed.'
    using errcode = '42501';
end;
$$;

-- Serialize every guarded role transition before reading, counting, or
-- changing super-admin state. This prevents two concurrent demotions from
-- both observing the same pre-transition active-super-admin count.
create or replace function public.transition_profile_role_as_super_admin(
  p_target_profile_id uuid,
  p_next_role text
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  active_super_admin_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(7340040::bigint);

  select *
    into actor_profile
  from public.profiles
  where id = auth.uid()
  for key share;

  if not found
    or actor_profile.role <> 'super_admin'
    or actor_profile.status <> 'active' then
    raise exception 'Active super-admin access is required.'
      using errcode = '42501';
  end if;

  if p_next_role not in ('super_admin', 'admin', 'teacher', 'student') then
    raise exception 'Invalid target role.' using errcode = '22023';
  end if;

  select *
    into target_profile
  from public.profiles
  where id = p_target_profile_id
  for update;

  if not found then
    raise exception 'Target profile was not found.' using errcode = 'P0002';
  end if;

  if p_target_profile_id = actor_profile.id
    and p_next_role is distinct from actor_profile.role then
    raise exception 'Super-admins cannot change their own role through this path.'
      using errcode = '42501';
  end if;

  if target_profile.role is not distinct from p_next_role then
    return;
  end if;

  if target_profile.role = 'super_admin'
    and target_profile.status = 'active'
    and p_next_role <> 'super_admin' then
    select count(*)::integer
      into active_super_admin_count
    from public.profiles
    where role = 'super_admin'
      and status = 'active';

    if active_super_admin_count <= 1 then
      raise exception 'Refusing to demote the only active super-admin profile.'
        using errcode = '22023';
    end if;
  end if;

  perform set_config(
    'app.profile_privileged_mutation',
    'super_admin_role_transition',
    true
  );

  update public.profiles
  set role = p_next_role
  where id = target_profile.id;

  insert into private.profile_privileged_change_audit_log (
    actor_profile_id,
    target_profile_id,
    previous_role,
    next_role
  )
  values (
    actor_profile.id,
    target_profile.id,
    target_profile.role,
    p_next_role
  );
end;
$$;

revoke all on function public.transition_profile_role_as_super_admin(uuid, text)
  from public, anon;
grant execute on function public.transition_profile_role_as_super_admin(uuid, text)
  to authenticated;
