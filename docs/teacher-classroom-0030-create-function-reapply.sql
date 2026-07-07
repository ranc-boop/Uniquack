-- Manual reapply for migration 0030 after earlier function bodies drifted
-- from the clean classroom schema.
-- This only replaces public.create_teacher_classroom and does not mutate data.

create or replace function public.create_teacher_classroom(
  p_name text,
  p_subject text default null,
  p_description text default null,
  p_organization_id uuid default null,
  p_join_code text default null
)
returns table(classroom_id uuid, display_code text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_profile public.profiles%rowtype;
  v_target_organization_id uuid;
  v_normalized_code text;
  v_display_code text;
  v_code_hash text;
  v_created_classroom_id uuid;
  v_join_code_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_actor_profile
  from public.profiles
  where id = v_actor_id
    and status = 'active';

  if v_actor_profile.id is null or v_actor_profile.role not in ('teacher', 'admin', 'super_admin') then
    raise exception 'Teacher access required';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Classroom name is required';
  end if;

  v_target_organization_id := p_organization_id;

  if v_target_organization_id is null then
    v_target_organization_id := v_actor_profile.default_organization_id;
  end if;

  if v_target_organization_id is null then
    select member.organization_id
    into v_target_organization_id
    from public.organization_members member
    where member.user_id = v_actor_id
      and member.role in ('admin', 'teacher')
      and member.status = 'active'
    order by member.created_at asc
    limit 1;
  end if;

  if v_target_organization_id is null then
    raise exception 'No teacher organization is available';
  end if;

  if not private.is_org_staff(v_target_organization_id) then
    raise exception 'Teacher is not active in this organization';
  end if;

  v_normalized_code := private.normalize_classroom_join_code(coalesce(p_join_code, ''));

  if length(v_normalized_code) <> 8 then
    raise exception 'Classroom join code must normalize to 8 characters';
  end if;

  v_display_code := substring(v_normalized_code from 1 for 4) || '-' || substring(v_normalized_code from 5 for 4);
  v_code_hash := private.classroom_join_code_hash(v_normalized_code);

  insert into public.classrooms (
    organization_id,
    owner_id,
    name,
    subject,
    description,
    status,
    created_by
  )
  values (
    v_target_organization_id,
    v_actor_id,
    trim(p_name),
    nullif(trim(p_subject), ''),
    nullif(trim(p_description), ''),
    'active',
    v_actor_id
  )
  returning id into v_created_classroom_id;

  insert into public.classroom_members (
    classroom_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    v_created_classroom_id,
    v_actor_id,
    'teacher',
    'active',
    now()
  )
  on conflict on constraint classroom_members_classroom_id_user_id_key do update
  set role = 'teacher',
      status = 'active',
      updated_at = now();

  insert into public.classroom_join_codes (
    classroom_id,
    code_hash,
    code_hint,
    display_code,
    status,
    created_by
  )
  values (
    v_created_classroom_id,
    v_code_hash,
    right(v_normalized_code, 4),
    v_display_code,
    'active',
    v_actor_id
  )
  on conflict (code_hash) do nothing
  returning id into v_join_code_id;

  if v_join_code_id is null then
    raise exception 'Classroom join code is already in use';
  end if;

  classroom_id := v_created_classroom_id;
  display_code := v_display_code;
  return next;
end;
$$;
