-- P0-CLS-01: Classroom creation must use one narrow, atomic, server-verified
-- path. This forward-only migration does not change existing roster, join-code,
-- archive, or assignment management behavior.

alter table public.classrooms
  add column if not exists creation_request_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'classrooms_owner_creation_request_key'
      and conrelid = 'public.classrooms'::regclass
  ) then
    alter table public.classrooms
      add constraint classrooms_owner_creation_request_key
      unique (owner_id, creation_request_id);
  end if;
end;
$$;

-- Direct browser inserts are not a supported Classroom creation contract.
drop policy if exists classrooms_teacher_create on public.classrooms;
revoke insert on table public.classrooms from anon, authenticated;
grant insert on table public.classrooms to service_role;

-- Membership rows are created only by the narrowly-scoped RPCs below or the
-- existing student join-code RPC. A Classroom manager cannot mint an arbitrary
-- membership through a table write.
drop policy if exists classroom_members_teacher_write on public.classroom_members;
drop policy if exists classroom_members_teacher_update on public.classroom_members;
revoke insert, update on table public.classroom_members from anon, authenticated;
grant insert, update on table public.classroom_members to service_role;

create or replace function private.can_create_classroom_in_organization(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.organizations organization
      on organization.id = target_organization_id
     and organization.status = 'active'
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.role in ('teacher', 'admin', 'super_admin')
      and (
        profile.role = 'super_admin'
        or profile.default_organization_id = organization.id
        or exists (
          select 1
          from public.organization_members member
          where member.organization_id = organization.id
            and member.user_id = profile.id
            and member.role in ('teacher', 'admin')
            and member.status = 'active'
        )
      )
  );
$$;

revoke all on function private.can_create_classroom_in_organization(uuid) from public;

-- Retire the 0030 RPC shape that accepted a caller-provided join code.
drop function if exists public.create_teacher_classroom(text, text, text, uuid, text);

create function public.create_teacher_classroom(
  p_name text,
  p_subject text default null,
  p_description text default null,
  p_organization_id uuid default null,
  p_request_id uuid default null
)
returns table(classroom_id uuid, display_code text)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_profile public.profiles%rowtype;
  v_target_organization_id uuid;
  v_created_classroom_id uuid;
  v_existing_classroom_id uuid;
  v_existing_display_code text;
  v_normalized_code text;
  v_display_code text;
  v_code_hash text;
  v_join_code_id uuid;
  v_random_bytes bytea;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt integer;
  v_byte_index integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if p_request_id is null then
    raise exception 'Classroom creation request is required';
  end if;

  if nullif(trim(p_name), '') is null or char_length(trim(p_name)) > 120 then
    raise exception 'Enter a classroom name up to 120 characters';
  end if;

  if p_subject is not null and char_length(trim(p_subject)) > 120 then
    raise exception 'Enter a subject up to 120 characters';
  end if;

  if p_description is not null and char_length(trim(p_description)) > 2000 then
    raise exception 'Enter a description up to 2000 characters';
  end if;

  select *
  into v_actor_profile
  from public.profiles
  where id = v_actor_id
    and status = 'active';

  if v_actor_profile.id is null
    or v_actor_profile.role not in ('teacher', 'admin', 'super_admin') then
    raise exception 'Teacher access required';
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
      and member.role in ('teacher', 'admin')
      and member.status = 'active'
    order by member.created_at asc
    limit 1;
  end if;

  if v_target_organization_id is null
    or not private.can_create_classroom_in_organization(v_target_organization_id) then
    raise exception 'You do not have access to create a classroom for this organization';
  end if;

  insert into public.classrooms (
    organization_id,
    owner_id,
    name,
    subject,
    description,
    status,
    created_by,
    creation_request_id
  )
  values (
    v_target_organization_id,
    v_actor_id,
    trim(p_name),
    nullif(trim(p_subject), ''),
    nullif(trim(p_description), ''),
    'active',
    v_actor_id,
    p_request_id
  )
  on conflict on constraint classrooms_owner_creation_request_key do nothing
  returning id into v_created_classroom_id;

  if v_created_classroom_id is null then
    select classroom.id, join_code.display_code
    into v_existing_classroom_id, v_existing_display_code
    from public.classrooms classroom
    left join lateral (
      select code.display_code
      from public.classroom_join_codes code
      where code.classroom_id = classroom.id
        and code.status = 'active'
      order by code.created_at desc
      limit 1
    ) join_code on true
    where classroom.owner_id = v_actor_id
      and classroom.creation_request_id = p_request_id
    limit 1;

    if v_existing_classroom_id is null or v_existing_display_code is null then
      raise exception 'Classroom creation could not be completed';
    end if;

    classroom_id := v_existing_classroom_id;
    display_code := v_existing_display_code;
    return next;
    return;
  end if;

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
  on conflict on constraint classroom_members_classroom_id_user_id_key do nothing;

  for v_attempt in 1..5 loop
    v_random_bytes := extensions.gen_random_bytes(8);
    v_normalized_code := '';

    for v_byte_index in 0..7 loop
      v_normalized_code := v_normalized_code || substr(
        v_alphabet,
        (get_byte(v_random_bytes, v_byte_index) % char_length(v_alphabet)) + 1,
        1
      );
    end loop;

    v_display_code := substring(v_normalized_code from 1 for 4)
      || '-'
      || substring(v_normalized_code from 5 for 4);
    v_code_hash := private.classroom_join_code_hash(v_normalized_code);
    v_join_code_id := null;

    begin
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
      returning id into v_join_code_id;
    exception
      when unique_violation then
        v_join_code_id := null;
    end;

    exit when v_join_code_id is not null;
  end loop;

  if v_join_code_id is null then
    raise exception 'Classroom creation could not be completed';
  end if;

  classroom_id := v_created_classroom_id;
  display_code := v_display_code;
  return next;
end;
$$;

revoke all on function public.create_teacher_classroom(text, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.create_teacher_classroom(text, text, text, uuid, uuid)
  to authenticated;

comment on column public.classrooms.creation_request_id is
  'Server-issued, non-privileged idempotency key for teacher classroom creation.';

comment on function public.create_teacher_classroom(text, text, text, uuid, uuid) is
  'Atomic teacher/admin classroom creation RPC. Derives actor and initial teacher membership from auth.uid(), rechecks active organization scope, generates the join code server-side, and returns safe classroom metadata only.';

create function public.add_classroom_co_teacher(
  p_classroom_id uuid,
  p_teacher_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_profile public.profiles%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if p_classroom_id is null or p_teacher_user_id is null then
    raise exception 'Classroom and teacher are required';
  end if;

  if not exists (
    select 1
    from public.classrooms classroom
    where classroom.id = p_classroom_id
      and classroom.owner_id = v_actor_id
  ) then
    raise exception 'Only the classroom owner can manage co-teachers';
  end if;

  if p_teacher_user_id = v_actor_id then
    raise exception 'The classroom owner is already a teacher';
  end if;

  select *
  into v_target_profile
  from public.profiles profile
  where profile.id = p_teacher_user_id
    and profile.status = 'active';

  if v_target_profile.id is null
    or v_target_profile.role not in ('teacher', 'admin', 'super_admin') then
    raise exception 'Only active teacher-capable accounts can be co-teachers';
  end if;

  insert into public.classroom_members (
    classroom_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    p_classroom_id,
    p_teacher_user_id,
    'co_teacher',
    'active',
    now()
  )
  on conflict on constraint classroom_members_classroom_id_user_id_key do update
  set
    role = 'co_teacher',
    status = 'active',
    joined_at = coalesce(public.classroom_members.joined_at, now());
end;
$$;

create function public.set_classroom_student_membership_status(
  p_classroom_id uuid,
  p_member_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('active', 'removed') then
    raise exception 'Unsupported classroom membership status';
  end if;

  if not private.can_manage_classroom(p_classroom_id) then
    raise exception 'You do not manage this classroom';
  end if;

  update public.classroom_members member
  set status = p_status
  where member.id = p_member_id
    and member.classroom_id = p_classroom_id
    and member.role = 'student';

  if not found then
    raise exception 'Student membership was not found';
  end if;
end;
$$;

create function public.remove_classroom_co_teacher(
  p_classroom_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.classrooms classroom
    where classroom.id = p_classroom_id
      and classroom.owner_id = auth.uid()
  ) then
    raise exception 'Only the classroom owner can manage co-teachers';
  end if;

  update public.classroom_members member
  set status = 'removed'
  where member.id = p_member_id
    and member.classroom_id = p_classroom_id
    and member.role = 'co_teacher'
    and member.user_id <> auth.uid();

  if not found then
    raise exception 'Co-teacher membership was not found';
  end if;
end;
$$;

revoke all on function public.add_classroom_co_teacher(uuid, uuid) from public, anon;
revoke all on function public.set_classroom_student_membership_status(uuid, uuid, text) from public, anon;
revoke all on function public.remove_classroom_co_teacher(uuid, uuid) from public, anon;
grant execute on function public.add_classroom_co_teacher(uuid, uuid) to authenticated;
grant execute on function public.set_classroom_student_membership_status(uuid, uuid, text) to authenticated;
grant execute on function public.remove_classroom_co_teacher(uuid, uuid) to authenticated;

comment on function public.add_classroom_co_teacher(uuid, uuid) is
  'Owner-only, server-verified co-teacher membership path. Does not grant Bank membership.';

comment on function public.set_classroom_student_membership_status(uuid, uuid, text) is
  'Teacher-managed student roster status path. It can only activate or remove an existing student membership.';

comment on function public.remove_classroom_co_teacher(uuid, uuid) is
  'Owner-only co-teacher removal path. It changes Classroom operations access only and never Bank membership.';
