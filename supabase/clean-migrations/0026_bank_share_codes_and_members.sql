-- Bank Share Code / Members / Roles
-- Adds hashed bank share codes and owner-controlled bank membership management.

create table if not exists public.bank_share_codes (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  code_hash text not null unique check (length(code_hash) = 64),
  code_hint text check (code_hint is null or length(code_hint) <= 16),
  role_granted text not null default 'viewer'
    check (role_granted in ('viewer', 'editor')),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_share_codes_bank_id_idx
  on public.bank_share_codes(bank_id);
create index if not exists bank_share_codes_status_idx
  on public.bank_share_codes(status);

drop trigger if exists bank_share_codes_set_updated_at on public.bank_share_codes;
create trigger bank_share_codes_set_updated_at
before update on public.bank_share_codes
for each row execute function private.set_updated_at();

create or replace function private.normalize_bank_share_code(code_value text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(code_value, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function private.bank_share_code_hash(code_value text)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(
      convert_to(private.normalize_bank_share_code(code_value), 'UTF8'),
      'sha256'::text
    ),
    'hex'
  );
$$;

create or replace function private.bank_share_code_hint(code_value text)
returns text
language sql
immutable
as $$
  select case
    when length(private.normalize_bank_share_code(code_value)) >= 4
      then '...' || right(private.normalize_bank_share_code(code_value), 4)
    else null
  end;
$$;

create or replace function private.generate_bank_share_code()
returns text
language sql
volatile
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
$$;

create or replace function private.can_own_question_bank(target_bank_id uuid)
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
        and member.role = 'owner'
    )
    or exists (
      select 1
      from public.question_banks bank
      where bank.id = target_bank_id
        and private.is_org_admin(bank.organization_id)
    );
$$;

create or replace function private.active_bank_owner_count(target_bank_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, private
as $$
  select count(*)::integer
  from public.bank_members member
  where member.bank_id = target_bank_id
    and member.role = 'owner'
    and member.status = 'active';
$$;

create or replace function public.create_bank_share_code(
  target_bank_id uuid,
  granted_role text default 'viewer',
  expires_at timestamptz default null
)
returns table (
  share_code_id uuid,
  raw_share_code text,
  role_granted text,
  share_code_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  normalized_role text := coalesce(granted_role, 'viewer');
  generated_code text;
  generated_hash text;
  created_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if normalized_role not in ('viewer', 'editor') then
    raise exception 'Bank share codes can only grant viewer or editor access';
  end if;

  if not private.can_own_question_bank(target_bank_id) then
    raise exception 'Only bank owners can create share codes';
  end if;

  loop
    generated_code := private.generate_bank_share_code();
    generated_hash := private.bank_share_code_hash(generated_code);
    exit when not exists (
      select 1 from public.bank_share_codes where code_hash = generated_hash
    );
  end loop;

  insert into public.bank_share_codes (
    bank_id,
    code_hash,
    code_hint,
    role_granted,
    status,
    created_by,
    expires_at
  )
  values (
    target_bank_id,
    generated_hash,
    private.bank_share_code_hint(generated_code),
    normalized_role,
    'active',
    auth.uid(),
    $3
  )
  returning id into created_id;

  return query
  select
    created_id,
    generated_code,
    normalized_role,
    $3;
end;
$$;

create or replace function public.revoke_bank_share_code(target_share_code_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_bank_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select bank_id into target_bank_id
  from public.bank_share_codes
  where id = target_share_code_id;

  if target_bank_id is null then
    raise exception 'Share code not found';
  end if;

  if not private.can_own_question_bank(target_bank_id) then
    raise exception 'Only bank owners can revoke share codes';
  end if;

  update public.bank_share_codes
  set status = 'revoked',
      updated_at = now()
  where id = target_share_code_id;

  return true;
end;
$$;

create or replace function public.join_question_bank_by_code(raw_share_code text)
returns table (
  bank_id uuid,
  bank_name text,
  granted_role text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  joining_user_id uuid := auth.uid();
  normalized_code text := private.normalize_bank_share_code(raw_share_code);
  resolved_hash text;
  code_row public.bank_share_codes%rowtype;
  bank_row public.question_banks%rowtype;
  existing_member public.bank_members%rowtype;
  current_profile public.profiles%rowtype;
begin
  if joining_user_id is null then
    raise exception 'Authentication required';
  end if;

  if length(normalized_code) < 6 then
    raise exception 'Invalid or expired bank share code';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = joining_user_id
    and status = 'active';

  if current_profile.id is null then
    raise exception 'Active profile required';
  end if;

  if current_profile.role not in ('teacher', 'admin', 'super_admin') then
    raise exception 'Only teacher or admin accounts can join banks by share code';
  end if;

  resolved_hash := private.bank_share_code_hash(normalized_code);

  select *
  into code_row
  from public.bank_share_codes code
  where code.code_hash = resolved_hash
    and code.status = 'active'
    and (code.expires_at is null or code.expires_at > now())
  limit 1;

  if code_row.id is null then
    raise exception 'Invalid or expired bank share code';
  end if;

  select *
  into bank_row
  from public.question_banks bank
  where bank.id = code_row.bank_id
    and bank.status = 'active';

  if bank_row.id is null then
    raise exception 'Invalid or expired bank share code';
  end if;

  select *
  into existing_member
  from public.bank_members member
  where member.bank_id = bank_row.id
    and member.user_id = joining_user_id;

  if existing_member.id is null then
    insert into public.bank_members (
      bank_id,
      user_id,
      role,
      status,
      invited_by,
      joined_at
    )
    values (
      bank_row.id,
      joining_user_id,
      code_row.role_granted,
      'active',
      code_row.created_by,
      now()
    );
  elsif existing_member.role = 'owner' then
    update public.bank_members
    set status = 'active',
        joined_at = coalesce(joined_at, now()),
        updated_at = now()
    where id = existing_member.id;
  else
    update public.bank_members
    set role = case
          when existing_member.role = 'editor' then 'editor'
          when code_row.role_granted = 'editor' then 'editor'
          else 'viewer'
        end,
        status = 'active',
        invited_by = code_row.created_by,
        joined_at = coalesce(joined_at, now()),
        updated_at = now()
    where id = existing_member.id;
  end if;

  update public.bank_share_codes
  set last_used_at = now(),
      updated_at = now()
  where id = code_row.id;

  return query
  select bank_row.id, bank_row.name, code_row.role_granted;
end;
$$;

create or replace function public.update_bank_member_role(
  target_bank_id uuid,
  target_user_id uuid,
  new_role text
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  member_row public.bank_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if new_role not in ('viewer', 'editor') then
    raise exception 'Bank members can only be changed to viewer or editor';
  end if;

  if not private.can_own_question_bank(target_bank_id) then
    raise exception 'Only bank owners can update member roles';
  end if;

  select *
  into member_row
  from public.bank_members
  where bank_id = target_bank_id
    and user_id = target_user_id;

  if member_row.id is null then
    raise exception 'Bank member not found';
  end if;

  if member_row.role = 'owner' then
    if private.active_bank_owner_count(target_bank_id) <= 1 then
      raise exception 'Cannot demote the last active bank owner';
    end if;
  end if;

  update public.bank_members
  set role = new_role,
      status = 'active',
      updated_at = now()
  where id = member_row.id;

  return true;
end;
$$;

create or replace function public.remove_bank_member(
  target_bank_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  member_row public.bank_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_own_question_bank(target_bank_id) then
    raise exception 'Only bank owners can remove members';
  end if;

  select *
  into member_row
  from public.bank_members
  where bank_id = target_bank_id
    and user_id = target_user_id;

  if member_row.id is null then
    raise exception 'Bank member not found';
  end if;

  if member_row.role = 'owner' and private.active_bank_owner_count(target_bank_id) <= 1 then
    raise exception 'Cannot remove the last active bank owner';
  end if;

  update public.bank_members
  set status = 'removed',
      updated_at = now()
  where id = member_row.id;

  return true;
end;
$$;

alter table public.bank_share_codes enable row level security;

drop policy if exists bank_members_write_managers on public.bank_members;
drop policy if exists bank_members_owner_write on public.bank_members;
create policy bank_members_owner_write
on public.bank_members for all
using (private.can_own_question_bank(bank_id))
with check (private.can_own_question_bank(bank_id));

drop policy if exists bank_share_codes_owner_read on public.bank_share_codes;
create policy bank_share_codes_owner_read
on public.bank_share_codes for select
using (private.can_own_question_bank(bank_id));

drop policy if exists bank_share_codes_owner_write on public.bank_share_codes;
create policy bank_share_codes_owner_write
on public.bank_share_codes for all
using (private.can_own_question_bank(bank_id))
with check (private.can_own_question_bank(bank_id));

drop policy if exists profiles_bank_member_read on public.profiles;
create policy profiles_bank_member_read
on public.profiles for select
using (
  private.is_super_admin()
  or exists (
    select 1
    from public.bank_members requester
    join public.bank_members target
      on target.bank_id = requester.bank_id
    where requester.user_id = auth.uid()
      and requester.status = 'active'
      and target.user_id = profiles.id
      and target.status = 'active'
  )
);

comment on table public.bank_share_codes is
  'Bank share-code registry stores only normalized SHA-256 hashes and hints; raw codes are returned only by create_bank_share_code.';

comment on function public.join_question_bank_by_code(text) is
  'Controlled teacher bank collaboration RPC. Accepts a raw code, hashes it server-side, and creates/reactivates explicit bank membership.';

revoke all on function private.normalize_bank_share_code(text) from public;
revoke all on function private.bank_share_code_hash(text) from public;
revoke all on function private.bank_share_code_hint(text) from public;
revoke all on function private.generate_bank_share_code() from public;
revoke all on function private.can_own_question_bank(uuid) from public;
revoke all on function private.active_bank_owner_count(uuid) from public;
revoke all on function public.create_bank_share_code(uuid, text, timestamptz) from public, anon;
revoke all on function public.revoke_bank_share_code(uuid) from public, anon;
revoke all on function public.join_question_bank_by_code(text) from public, anon;
revoke all on function public.update_bank_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_bank_member(uuid, uuid) from public, anon;

grant execute on function private.can_own_question_bank(uuid) to anon, authenticated;
grant execute on function public.create_bank_share_code(uuid, text, timestamptz) to authenticated;
grant execute on function public.revoke_bank_share_code(uuid) to authenticated;
grant execute on function public.join_question_bank_by_code(text) to authenticated;
grant execute on function public.update_bank_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_bank_member(uuid, uuid) to authenticated;
