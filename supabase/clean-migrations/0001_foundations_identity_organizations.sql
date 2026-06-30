-- Clean Supabase MVP v1 draft migration.
-- Foundations: private helpers, organizations, profiles, and memberships.
-- Draft only: review before applying to any database.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
comment on schema private is
  'Internal helper schema. Keep it out of exposed API schemas; grant only narrow helper execution.';

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username is null or length(btrim(username)) > 0),
  email text unique,
  full_name text,
  avatar_url text,
  display_name text,
  role text not null default 'student'
    check (role in ('super_admin', 'admin', 'teacher', 'student')),
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  default_organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Canonical MVP user profile table. Keeps the current app-facing profiles contract while organization_members carries tenancy.';

create or replace view public.user_profiles as
select
  id as user_id,
  display_name,
  role,
  status,
  default_organization_id,
  created_at,
  updated_at
from public.profiles;

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher', 'student')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'disabled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members(user_id, status);

create index if not exists organization_members_org_role_idx
  on public.organization_members(organization_id, role, status);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function private.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function private.set_updated_at();

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and status = 'active'
  );
$$;

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(private.current_user_role() in ('admin', 'super_admin'), false);
$$;

create or replace function private.is_teacher_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(private.current_user_role() in ('teacher', 'admin', 'super_admin'), false);
$$;

create or replace function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.is_super_admin()
    or exists (
      select 1
      from public.organization_members
      where organization_id = target_organization_id
        and user_id = auth.uid()
        and status = 'active'
    );
$$;

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
      from public.organization_members
      where organization_id = target_organization_id
        and user_id = auth.uid()
        and role in ('admin', 'teacher')
        and status = 'active'
    );
$$;

create or replace function private.is_org_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.is_super_admin()
    or exists (
      select 1
      from public.organization_members
      where organization_id = target_organization_id
        and user_id = auth.uid()
        and role = 'admin'
        and status = 'active'
    );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read
on public.organizations for select
using (private.is_org_member(id));

drop policy if exists organizations_super_admin_write on public.organizations;
create policy organizations_super_admin_write
on public.organizations for all
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read
on public.profiles for select
using (id = auth.uid() or private.is_super_admin());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update
on public.profiles for update
using (id = auth.uid() or private.is_super_admin())
with check (id = auth.uid() or private.is_super_admin());

drop policy if exists profiles_super_admin_insert on public.profiles;
create policy profiles_super_admin_insert
on public.profiles for insert
with check (
  private.is_super_admin()
  or (
    id = auth.uid()
    and role = 'student'
    and status = 'active'
  )
);

drop policy if exists organization_members_member_read on public.organization_members;
create policy organization_members_member_read
on public.organization_members for select
using (private.is_org_member(organization_id));

drop policy if exists organization_members_admin_write on public.organization_members;
create policy organization_members_admin_write
on public.organization_members for all
using (private.is_org_admin(organization_id))
with check (private.is_org_admin(organization_id));

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

revoke all on function private.set_updated_at() from public;
revoke all on function private.current_user_role() from public;
revoke all on function private.is_super_admin() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.is_teacher_or_admin() from public;
revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.is_org_staff(uuid) from public;
revoke all on function private.is_org_admin(uuid) from public;

grant execute on function private.current_user_role() to anon, authenticated;
grant execute on function private.is_super_admin() to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.is_teacher_or_admin() to anon, authenticated;
grant execute on function private.is_org_member(uuid) to anon, authenticated;
grant execute on function private.is_org_staff(uuid) to anon, authenticated;
grant execute on function private.is_org_admin(uuid) to anon, authenticated;

comment on table public.organization_members is
  'Bootstrap is service-role seeded: create the first organization, super-admin profile, and membership before normal app use.';
