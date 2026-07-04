create or replace function public.join_classroom_by_code(join_code text)
returns table (
  classroom_id uuid,
  classroom_name text,
  membership_id uuid
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  joining_user_id uuid := auth.uid();
  normalized_code text := private.normalize_classroom_join_code(join_code);
  resolved_code_hash text;
  classroom_row public.classrooms%rowtype;
  profile_row public.profiles%rowtype;
  existing_member public.classroom_members%rowtype;
begin
  if joining_user_id is null then
    raise exception 'Join code requires an authenticated student.';
  end if;

  if length(normalized_code) < 6 then
    raise exception 'Enter a valid classroom join code.';
  end if;

  select *
  into profile_row
  from public.profiles
  where id = joining_user_id
    and status = 'active';

  if profile_row.id is null or profile_row.role <> 'student' then
    raise exception 'Only active student accounts can join classrooms by code.';
  end if;

  resolved_code_hash := private.classroom_join_code_hash(normalized_code);

  select classroom.*
  into classroom_row
  from public.classroom_join_codes code
  join public.classrooms classroom
    on classroom.id = code.classroom_id
  where code.code_hash = resolved_code_hash
    and code.status = 'active'
    and classroom.status = 'active'
    and (code.expires_at is null or code.expires_at > now())
  limit 1;

  if classroom_row.id is null then
    raise exception 'Classroom join code was not found or is no longer active.';
  end if;

  if not (
    profile_row.default_organization_id = classroom_row.organization_id
    or exists (
      select 1
      from public.organization_members org_member
      where org_member.organization_id = classroom_row.organization_id
        and org_member.user_id = joining_user_id
        and org_member.status = 'active'
    )
  ) then
    raise exception 'Student account is not in this classroom organization.';
  end if;

  select *
  into existing_member
  from public.classroom_members member
  where member.classroom_id = classroom_row.id
    and member.user_id = joining_user_id
  limit 1;

  if existing_member.id is not null and existing_member.status = 'removed' then
    raise exception 'Classroom access was removed by the teacher.';
  end if;

  if existing_member.id is not null then
    update public.classroom_members
    set
      role = 'student',
      status = 'active',
      joined_at = coalesce(existing_member.joined_at, now())
    where id = existing_member.id
    returning id into membership_id;
  else
    insert into public.classroom_members (
      classroom_id,
      user_id,
      role,
      status,
      joined_at
    )
    values (
      classroom_row.id,
      joining_user_id,
      'student',
      'active',
      now()
    )
    returning id into membership_id;
  end if;

  classroom_id := classroom_row.id;
  classroom_name := classroom_row.name;
  return next;
end;
$$;

comment on function public.join_classroom_by_code(text) is
  'Controlled student enrollment RPC. Accepts a raw join code, hashes it server-side, activates eligible classroom membership, and blocks teacher-removed memberships from self-reactivating.';

revoke all on function public.join_classroom_by_code(text) from public, anon;
grant execute on function public.join_classroom_by_code(text) to authenticated;
