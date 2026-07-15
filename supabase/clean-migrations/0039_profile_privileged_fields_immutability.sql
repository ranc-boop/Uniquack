-- SEC-P0: profile privileged-field immutability.
--
-- Normal authenticated users may update only presentation fields. Role,
-- status, organization selection, identity, timestamps, and any future profile
-- columns remain server-managed. Service-role bootstrap remains available.

create table if not exists private.profile_privileged_change_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null,
  target_profile_id uuid not null,
  previous_role text not null
    check (previous_role in ('super_admin', 'admin', 'teacher', 'student')),
  next_role text not null
    check (next_role in ('super_admin', 'admin', 'teacher', 'student')),
  action_kind text not null default 'role_transition'
    check (action_kind = 'role_transition'),
  created_at timestamptz not null default now()
);

create index if not exists profile_privileged_change_audit_target_created_idx
  on private.profile_privileged_change_audit_log(target_profile_id, created_at desc);

alter table private.profile_privileged_change_audit_log enable row level security;
revoke all on table private.profile_privileged_change_audit_log
  from public, anon, authenticated;

-- Remove the table-wide UPDATE grant before giving authenticated callers only
-- the three non-privileged presentation columns that exist in the canonical
-- profile schema.
revoke update on table public.profiles from anon, authenticated;
grant update (full_name, avatar_url, display_name) on table public.profiles
  to authenticated;

-- The view exposes role and organization state. Do not leave an updatable view
-- as an alternate privileged-field write path.
revoke insert, update, delete on table public.user_profiles from anon, authenticated;

drop policy if exists profiles_self_update on public.profiles;
drop policy if exists profiles_self_safe_update on public.profiles;
create policy profiles_self_safe_update
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- A self-created profile must start in the least-privileged state. Privileged
-- bootstrap and identity-provider functions execute with their trusted path.
drop policy if exists profiles_super_admin_insert on public.profiles;
create policy profiles_super_admin_insert
on public.profiles
for insert
to authenticated
with check (
  private.is_super_admin()
  or (
    id = auth.uid()
    and role = 'student'
    and status = 'active'
    and default_organization_id is null
  )
);

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
  google_identity_keys constant text[] := array[
    'google_sub',
    'google_email_at_link',
    'google_linked_at'
  ];
  protected_old jsonb := to_jsonb(old) - safe_self_edit_keys;
  protected_new jsonb := to_jsonb(new) - safe_self_edit_keys;
  non_google_old jsonb;
  non_google_new jsonb;
  jwt_role text := coalesce(
    nullif(auth.role()::text, ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
  only_role_changed boolean;
  only_google_identity_changed boolean;
begin
  if protected_old is not distinct from protected_new then
    return new;
  end if;

  if jwt_role = 'service_role' then
    return new;
  end if;

  non_google_old := protected_old - google_identity_keys;
  non_google_new := protected_new - google_identity_keys;
  only_google_identity_changed :=
    non_google_old is not distinct from non_google_new
    and protected_old is distinct from protected_new;

  -- Google identity synchronization is performed by a trusted nested trigger.
  -- Direct clients do not receive UPDATE grants for these columns.
  if only_google_identity_changed and pg_trigger_depth() > 1 then
    return new;
  end if;

  only_role_changed :=
    (protected_old - array['role']) is not distinct from
      (protected_new - array['role'])
    and old.role is distinct from new.role;

  -- The RPC below sets this transaction-local marker only after proving the
  -- caller was already an active super-admin. The trigger sees OLD role state,
  -- so a caller cannot authorize itself by changing role in the same statement.
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

revoke all on function private.enforce_profile_privileged_field_immutability()
  from public;

drop trigger if exists profiles_enforce_privileged_field_immutability
  on public.profiles;
create trigger profiles_enforce_privileged_field_immutability
before update on public.profiles
for each row execute function private.enforce_profile_privileged_field_immutability();

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
