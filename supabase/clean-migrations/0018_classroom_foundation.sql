-- Native Classroom Foundation.
-- Adds first-class classrooms, teacher rosters, and controlled join-code enrollment.

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 2000),
  subject text check (subject is null or length(subject) <= 120),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classroom_members (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'co_teacher', 'student')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'removed')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, user_id)
);

create table if not exists public.classroom_join_codes (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  code_hash text not null unique check (length(code_hash) = 64),
  code_hint text check (code_hint is null or length(code_hint) <= 12),
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists classrooms_org_owner_idx
  on public.classrooms(organization_id, owner_id, status);

create index if not exists classroom_members_classroom_role_idx
  on public.classroom_members(classroom_id, role, status);

create index if not exists classroom_members_user_idx
  on public.classroom_members(user_id, status);

create index if not exists classroom_join_codes_classroom_status_idx
  on public.classroom_join_codes(classroom_id, status);

drop trigger if exists classrooms_set_updated_at on public.classrooms;
create trigger classrooms_set_updated_at
before update on public.classrooms
for each row execute function private.set_updated_at();

drop trigger if exists classroom_members_set_updated_at on public.classroom_members;
create trigger classroom_members_set_updated_at
before update on public.classroom_members
for each row execute function private.set_updated_at();

drop trigger if exists classroom_join_codes_set_updated_at on public.classroom_join_codes;
create trigger classroom_join_codes_set_updated_at
before update on public.classroom_join_codes
for each row execute function private.set_updated_at();

create or replace function private.normalize_classroom_join_code(code_value text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(code_value, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function private.classroom_join_code_hash(code_value text)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(
      convert_to(private.normalize_classroom_join_code(code_value), 'UTF8'),
      'sha256'::text
    ),
    'hex'
  );
$$;

create or replace function private.can_manage_classroom(target_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.is_super_admin()
    or exists (
      select 1
      from public.classrooms classroom
      where classroom.id = target_classroom_id
        and (
          classroom.owner_id = auth.uid()
          or private.is_org_admin(classroom.organization_id)
          or exists (
            select 1
            from public.classroom_members member
            where member.classroom_id = classroom.id
              and member.user_id = auth.uid()
              and member.role in ('teacher', 'co_teacher')
              and member.status = 'active'
          )
        )
    );
$$;

create or replace function private.can_read_classroom(target_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.can_manage_classroom(target_classroom_id)
    or exists (
      select 1
      from public.classroom_members member
      where member.classroom_id = target_classroom_id
        and member.user_id = auth.uid()
        and member.status = 'active'
    );
$$;

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

alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.classroom_join_codes enable row level security;

drop policy if exists classrooms_read_scoped on public.classrooms;
create policy classrooms_read_scoped
on public.classrooms for select
using (private.can_read_classroom(id));

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

drop policy if exists classroom_members_read_scoped on public.classroom_members;
create policy classroom_members_read_scoped
on public.classroom_members for select
using (
  user_id = auth.uid()
  or private.can_manage_classroom(classroom_id)
);

drop policy if exists classroom_members_teacher_write on public.classroom_members;
create policy classroom_members_teacher_write
on public.classroom_members for insert
with check (private.can_manage_classroom(classroom_id));

drop policy if exists classroom_members_teacher_update on public.classroom_members;
create policy classroom_members_teacher_update
on public.classroom_members for update
using (private.can_manage_classroom(classroom_id))
with check (private.can_manage_classroom(classroom_id));

drop policy if exists classroom_join_codes_teacher_read on public.classroom_join_codes;
create policy classroom_join_codes_teacher_read
on public.classroom_join_codes for select
using (private.can_manage_classroom(classroom_id));

drop policy if exists classroom_join_codes_teacher_insert on public.classroom_join_codes;
create policy classroom_join_codes_teacher_insert
on public.classroom_join_codes for insert
with check (private.can_manage_classroom(classroom_id));

drop policy if exists classroom_join_codes_teacher_update on public.classroom_join_codes;
create policy classroom_join_codes_teacher_update
on public.classroom_join_codes for update
using (private.can_manage_classroom(classroom_id))
with check (private.can_manage_classroom(classroom_id));

drop policy if exists profiles_classroom_roster_read on public.profiles;
create policy profiles_classroom_roster_read
on public.profiles for select
using (
  id = auth.uid()
  or private.is_super_admin()
  or exists (
    select 1
    from public.classroom_members member
    where member.user_id = profiles.id
      and member.status = 'active'
      and private.can_manage_classroom(member.classroom_id)
  )
);

comment on table public.classrooms is
  'Native classroom MVP: teacher-owned class containers for rosters and future assignments.';

comment on table public.classroom_members is
  'Native classroom roster. Students can see only their own membership; teachers see rosters for classrooms they manage.';

comment on table public.classroom_join_codes is
  'Join-code registry stores only normalized SHA-256 hashes plus hints; raw codes are shown only at creation time by the app.';

comment on function public.join_classroom_by_code(text) is
  'Controlled student enrollment RPC. Accepts a raw join code, hashes it server-side, and activates classroom membership without allowing arbitrary client inserts.';

revoke all on function private.normalize_classroom_join_code(text) from public;
revoke all on function private.classroom_join_code_hash(text) from public;
revoke all on function private.can_manage_classroom(uuid) from public;
revoke all on function private.can_read_classroom(uuid) from public;
revoke all on function public.join_classroom_by_code(text) from public, anon;

grant execute on function private.can_manage_classroom(uuid) to anon, authenticated;
grant execute on function private.can_read_classroom(uuid) to anon, authenticated;
grant execute on function public.join_classroom_by_code(text) to authenticated;
