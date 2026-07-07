-- Teacher Workspace Shell + Classroom RLS fix.
-- Keeps classrooms teacher-owned while allowing clean-schema teacher profiles
-- with default_organization_id to create classrooms.

create or replace function private.is_org_staff(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.is_super_admin()
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = target_organization_id
        and member.user_id = auth.uid()
        and member.role in ('admin', 'teacher')
        and member.status = 'active'
    )
    or exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.default_organization_id = target_organization_id
        and profile.role in ('admin', 'teacher', 'super_admin')
        and profile.status = 'active'
    );
$$;

drop policy if exists classrooms_teacher_create on public.classrooms;
create policy classrooms_teacher_create
on public.classrooms for insert
with check (
  owner_id = auth.uid()
  and created_by = auth.uid()
  and private.is_org_staff(organization_id)
);

drop policy if exists classrooms_teacher_update on public.classrooms;
create policy classrooms_teacher_update
on public.classrooms for update
using (private.can_manage_classroom(id))
with check (private.is_org_staff(organization_id));

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
  actor_id uuid := auth.uid();
  actor_profile public.profiles%rowtype;
  target_organization_id uuid;
  normalized_code text;
  teacher_code text;
  created_classroom_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into actor_profile
  from public.profiles
  where id = actor_id
    and status = 'active';

  if actor_profile.id is null or actor_profile.role not in ('teacher', 'admin', 'super_admin') then
    raise exception 'Teacher access required';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Classroom name is required';
  end if;

  target_organization_id := p_organization_id;

  if target_organization_id is null then
    target_organization_id := actor_profile.default_organization_id;
  end if;

  if target_organization_id is null then
    select member.organization_id
    into target_organization_id
    from public.organization_members member
    where member.user_id = actor_id
      and member.role in ('admin', 'teacher')
      and member.status = 'active'
    order by member.created_at asc
    limit 1;
  end if;

  if target_organization_id is null then
    raise exception 'No teacher organization is available';
  end if;

  if not private.is_org_staff(target_organization_id) then
    raise exception 'Teacher is not active in this organization';
  end if;

  normalized_code := private.normalize_classroom_join_code(coalesce(p_join_code, ''));

  if length(normalized_code) <> 8 then
    raise exception 'Classroom join code must normalize to 8 characters';
  end if;

  teacher_code := substring(normalized_code from 1 for 4) || '-' || substring(normalized_code from 5 for 4);

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
    target_organization_id,
    actor_id,
    trim(p_name),
    nullif(trim(p_subject), ''),
    nullif(trim(p_description), ''),
    'active',
    actor_id
  )
  returning id into created_classroom_id;

  insert into public.classroom_members (
    classroom_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    created_classroom_id,
    actor_id,
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
    created_classroom_id,
    private.classroom_join_code_hash(normalized_code),
    right(normalized_code, 4),
    teacher_code,
    'active',
    actor_id
  )
  on conflict (code_hash) do nothing;

  classroom_id := created_classroom_id;
  display_code := teacher_code;
  return next;
end;
$$;

revoke all on function public.create_teacher_classroom(text, text, text, uuid, text) from public, anon;
grant execute on function public.create_teacher_classroom(text, text, text, uuid, text) to authenticated;

comment on function public.create_teacher_classroom(text, text, text, uuid, text) is
  'Teacher-only classroom creation RPC. Creates classroom, teacher owner membership, and persistent display join code in one transaction.';
