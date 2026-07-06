-- Question Bank / Library Foundation
-- Bank-first content ownership layer for teachers. Classrooms remain delivery layers.

create table if not exists public.question_banks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0 and length(btrim(name)) <= 120),
  description text,
  visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'organization', 'public')),
  status text not null default 'active'
    check (status in ('active', 'archived', 'disabled')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_members (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'editor', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'removed')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_id, user_id)
);

create table if not exists public.bank_questions (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'archived', 'removed')),
  source_kind text not null default 'manual'
    check (source_kind in ('manual', 'review_draft', 'import', 'public_pull', 'course_builder')),
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (bank_id, question_id)
);

create index if not exists question_banks_organization_id_idx
  on public.question_banks(organization_id);
create index if not exists question_banks_owner_id_idx
  on public.question_banks(owner_id);
create index if not exists question_banks_visibility_status_idx
  on public.question_banks(visibility, status);
create index if not exists bank_members_bank_id_idx
  on public.bank_members(bank_id);
create index if not exists bank_members_user_id_idx
  on public.bank_members(user_id);
create index if not exists bank_questions_bank_id_idx
  on public.bank_questions(bank_id);
create index if not exists bank_questions_question_id_idx
  on public.bank_questions(question_id);

drop trigger if exists question_banks_set_updated_at on public.question_banks;
create trigger question_banks_set_updated_at
before update on public.question_banks
for each row execute function private.set_updated_at();

drop trigger if exists bank_members_set_updated_at on public.bank_members;
create trigger bank_members_set_updated_at
before update on public.bank_members
for each row execute function private.set_updated_at();

create or replace function private.can_read_question_bank(target_bank_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.is_super_admin()
    or exists (
      select 1
      from public.bank_members member
      where member.bank_id = target_bank_id
        and member.user_id = auth.uid()
        and member.status = 'active'
    )
    or exists (
      select 1
      from public.question_banks bank
      where bank.id = target_bank_id
        and bank.status = 'active'
        and bank.visibility in ('organization', 'public')
        and private.is_org_staff(bank.organization_id)
    );
$$;

create or replace function private.can_manage_question_bank(target_bank_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.is_super_admin()
    or exists (
      select 1
      from public.bank_members member
      where member.bank_id = target_bank_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role in ('owner', 'editor')
    )
    or exists (
      select 1
      from public.question_banks bank
      where bank.id = target_bank_id
        and private.is_org_admin(bank.organization_id)
    );
$$;

create or replace function public.create_question_bank(
  bank_name text,
  bank_description text default null,
  bank_visibility text default 'private'
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  current_profile public.profiles%rowtype;
  resolved_organization_id uuid;
  created_bank_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = auth.uid()
    and status = 'active';

  if current_profile.id is null then
    raise exception 'Active profile required';
  end if;

  if current_profile.role not in ('teacher', 'admin', 'super_admin') then
    raise exception 'Question banks can only be created by teachers or admins';
  end if;

  if btrim(coalesce(bank_name, '')) = '' or length(btrim(bank_name)) > 120 then
    raise exception 'Question bank name must be 1-120 characters';
  end if;

  if coalesce(bank_visibility, 'private') not in ('private', 'shared', 'organization', 'public') then
    raise exception 'Invalid question bank visibility';
  end if;

  resolved_organization_id := current_profile.default_organization_id;

  if resolved_organization_id is null then
    select organization_id
    into resolved_organization_id
    from public.organization_members
    where user_id = auth.uid()
      and status = 'active'
      and role in ('admin', 'teacher')
    order by created_at asc
    limit 1;
  end if;

  if resolved_organization_id is null then
    raise exception 'No active organization membership was found for this bank action';
  end if;

  insert into public.question_banks (
    organization_id,
    owner_id,
    name,
    description,
    visibility,
    status,
    created_by,
    updated_by
  )
  values (
    resolved_organization_id,
    auth.uid(),
    btrim(bank_name),
    nullif(btrim(coalesce(bank_description, '')), ''),
    coalesce(bank_visibility, 'private'),
    'active',
    auth.uid(),
    auth.uid()
  )
  returning id into created_bank_id;

  insert into public.bank_members (
    bank_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at
  )
  values (
    created_bank_id,
    auth.uid(),
    'owner',
    'active',
    auth.uid(),
    now()
  );

  return created_bank_id;
end;
$$;

alter table public.question_banks enable row level security;
alter table public.bank_members enable row level security;
alter table public.bank_questions enable row level security;

drop policy if exists question_banks_read_scoped on public.question_banks;
create policy question_banks_read_scoped
on public.question_banks for select
using (private.can_read_question_bank(id));

drop policy if exists question_banks_update_managers on public.question_banks;
create policy question_banks_update_managers
on public.question_banks for update
using (private.can_manage_question_bank(id))
with check (private.can_manage_question_bank(id));

drop policy if exists bank_members_read_scoped on public.bank_members;
create policy bank_members_read_scoped
on public.bank_members for select
using (private.can_read_question_bank(bank_id));

drop policy if exists bank_members_write_managers on public.bank_members;
create policy bank_members_write_managers
on public.bank_members for all
using (private.can_manage_question_bank(bank_id))
with check (private.can_manage_question_bank(bank_id));

drop policy if exists bank_questions_read_scoped on public.bank_questions;
create policy bank_questions_read_scoped
on public.bank_questions for select
using (private.can_read_question_bank(bank_id));

drop policy if exists bank_questions_write_managers on public.bank_questions;
create policy bank_questions_write_managers
on public.bank_questions for all
using (private.can_manage_question_bank(bank_id))
with check (private.can_manage_question_bank(bank_id));

revoke all on function public.create_question_bank(text, text, text) from public, anon;
grant execute on function public.create_question_bank(text, text, text) to authenticated;
