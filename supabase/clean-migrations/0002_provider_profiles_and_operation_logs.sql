-- Clean Supabase MVP v1 draft migration.
-- Provider profile metadata, private gateway verifier material, and operation logs.
-- Draft only: review before applying to any database.

create table if not exists public.ai_provider_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  provider text not null check (provider in ('gemini', 'openai', 'deepseek', 'compatible')),
  base_url text,
  model text not null,
  mode text not null default 'standard'
    check (mode in ('standard', 'thinking', 'fast', 'quality', 'multimodal')),
  credential_ref text,
  api_key_ciphertext text,
  api_key_iv text,
  api_key_tag text,
  api_key_last4 text,
  enabled boolean not null default false,
  is_default boolean not null default false,
  supports_pdf_input boolean not null default true,
  supports_vision_images boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.ai_provider_profiles is
  'Provider configuration metadata plus encrypted key material for server-only gateway RPCs. Client list RPCs expose safe metadata only.';

create table if not exists private.ai_provider_gateway_token_hashes (
  token_hash text primary key,
  label text,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'rotated')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table if not exists public.ai_provider_operation_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider_profile_id uuid references public.ai_provider_profiles(id) on delete set null,
  operation_kind text not null,
  provider text,
  model text,
  mode text,
  status text not null default 'planned'
    check (status in ('planned', 'running', 'succeeded', 'failed', 'skipped')),
  route_decision jsonb not null default '{}'::jsonb,
  token_counts jsonb not null default '{}'::jsonb,
  cost_estimate jsonb not null default '{}'::jsonb,
  retry_count integer not null default 0 check (retry_count >= 0),
  redacted_error text,
  redacted_error_kind text,
  related_record_kind text,
  related_record_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_provider_operation_logs is
  'Provider operation metadata, cost, token counts, status, and redacted errors only. Do not store provider credentials, unbounded prompts, or provider bodies here.';

create index if not exists ai_provider_profiles_org_enabled_idx
  on public.ai_provider_profiles(organization_id, enabled)
  where deleted_at is null;

create unique index if not exists ai_provider_profiles_default_unique
  on public.ai_provider_profiles(is_default)
  where is_default and deleted_at is null;

create index if not exists ai_provider_operation_logs_org_kind_idx
  on public.ai_provider_operation_logs(organization_id, operation_kind, created_at desc);

drop trigger if exists ai_provider_profiles_set_updated_at on public.ai_provider_profiles;
create trigger ai_provider_profiles_set_updated_at
before update on public.ai_provider_profiles
for each row execute function private.set_updated_at();

drop trigger if exists ai_provider_operation_logs_set_updated_at on public.ai_provider_operation_logs;
create trigger ai_provider_operation_logs_set_updated_at
before update on public.ai_provider_operation_logs
for each row execute function private.set_updated_at();

alter table public.ai_provider_profiles enable row level security;
alter table private.ai_provider_gateway_token_hashes enable row level security;
alter table public.ai_provider_operation_logs enable row level security;

drop policy if exists ai_provider_profiles_staff_read on public.ai_provider_profiles;
create policy ai_provider_profiles_staff_read
on public.ai_provider_profiles for select
using (
  private.is_super_admin()
  or (organization_id is not null and private.is_org_staff(organization_id))
);

drop policy if exists ai_provider_profiles_admin_write on public.ai_provider_profiles;
create policy ai_provider_profiles_admin_write
on public.ai_provider_profiles for all
using (
  private.is_super_admin()
  or (organization_id is not null and private.is_org_admin(organization_id))
)
with check (
  private.is_super_admin()
  or (organization_id is not null and private.is_org_admin(organization_id))
);

drop policy if exists ai_provider_gateway_hashes_super_admin on private.ai_provider_gateway_token_hashes;
create policy ai_provider_gateway_hashes_super_admin
on private.ai_provider_gateway_token_hashes for all
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists ai_provider_operation_logs_staff_read on public.ai_provider_operation_logs;
create policy ai_provider_operation_logs_staff_read
on public.ai_provider_operation_logs for select
using (
  private.is_super_admin()
  or (organization_id is not null and private.is_org_staff(organization_id))
);

drop policy if exists ai_provider_operation_logs_staff_insert on public.ai_provider_operation_logs;
create policy ai_provider_operation_logs_staff_insert
on public.ai_provider_operation_logs for insert
with check (
  private.is_super_admin()
  or (organization_id is not null and private.is_org_staff(organization_id))
);

create or replace function private.verify_ai_provider_gateway(gateway_token text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    private.is_super_admin()
    and exists (
      select 1
      from private.ai_provider_gateway_token_hashes token
      where token.status = 'active'
        and token.token_hash = encode(extensions.digest(convert_to(coalesce(gateway_token, ''), 'UTF8'), 'sha256'::text), 'hex')
    );
$$;

create or replace function public.list_ai_provider_profiles_for_gateway(gateway_token text)
returns table (
  id uuid,
  name text,
  provider text,
  base_url text,
  model text,
  enabled boolean,
  is_default boolean,
  supports_pdf_input boolean,
  supports_vision_images boolean,
  api_key_last4 text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    profile.id,
    profile.name,
    profile.provider,
    profile.base_url,
    profile.model,
    profile.enabled,
    profile.is_default,
    profile.supports_pdf_input,
    profile.supports_vision_images,
    profile.api_key_last4,
    profile.created_at,
    profile.updated_at
  from public.ai_provider_profiles profile
  where private.verify_ai_provider_gateway(gateway_token)
    and profile.deleted_at is null
  order by profile.name asc
  limit 100;
$$;

create or replace function public.list_enabled_ai_provider_profiles_for_gateway(gateway_token text)
returns table (
  id uuid,
  name text,
  provider text,
  base_url text,
  model text,
  enabled boolean,
  is_default boolean,
  supports_pdf_input boolean,
  supports_vision_images boolean,
  api_key_last4 text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    profile.id,
    profile.name,
    profile.provider,
    profile.base_url,
    profile.model,
    profile.enabled,
    profile.is_default,
    profile.supports_pdf_input,
    profile.supports_vision_images,
    profile.api_key_last4,
    profile.created_at,
    profile.updated_at
  from public.ai_provider_profiles profile
  where private.verify_ai_provider_gateway(gateway_token)
    and profile.enabled = true
    and profile.deleted_at is null
    and profile.api_key_last4 is not null
  order by profile.is_default desc, profile.name asc
  limit 100;
$$;

create or replace function public.get_ai_provider_profile_for_gateway(
  gateway_token text,
  profile_id uuid
)
returns table (
  id uuid,
  name text,
  provider text,
  base_url text,
  model text,
  api_key_ciphertext text,
  api_key_iv text,
  api_key_tag text,
  api_key_last4 text,
  enabled boolean,
  is_default boolean,
  supports_pdf_input boolean,
  supports_vision_images boolean,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    profile.id,
    profile.name,
    profile.provider,
    profile.base_url,
    profile.model,
    profile.api_key_ciphertext,
    profile.api_key_iv,
    profile.api_key_tag,
    profile.api_key_last4,
    profile.enabled,
    profile.is_default,
    profile.supports_pdf_input,
    profile.supports_vision_images,
    profile.created_by,
    profile.updated_by,
    profile.created_at,
    profile.updated_at
  from public.ai_provider_profiles profile
  where private.verify_ai_provider_gateway(gateway_token)
    and profile.id = profile_id
    and profile.deleted_at is null
    and profile.api_key_ciphertext is not null
    and profile.api_key_iv is not null
    and profile.api_key_tag is not null
  limit 1;
$$;

create or replace function public.create_ai_provider_profile_for_gateway(
  gateway_token text,
  profile_name text,
  profile_provider text,
  profile_base_url text,
  profile_model text,
  profile_api_key_ciphertext text,
  profile_api_key_iv text,
  profile_api_key_tag text,
  profile_api_key_last4 text,
  profile_enabled boolean,
  profile_is_default boolean,
  profile_supports_pdf_input boolean,
  profile_supports_vision_images boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  inserted_id uuid;
  actor_id uuid := auth.uid();
begin
  if not private.verify_ai_provider_gateway(gateway_token) then
    raise exception 'AI provider gateway access denied.';
  end if;

  if profile_is_default then
    update public.ai_provider_profiles
    set is_default = false
    where is_default = true
      and deleted_at is null;
  end if;

  insert into public.ai_provider_profiles (
    name,
    provider,
    base_url,
    model,
    api_key_ciphertext,
    api_key_iv,
    api_key_tag,
    api_key_last4,
    enabled,
    is_default,
    supports_pdf_input,
    supports_vision_images,
    created_by,
    updated_by
  )
  values (
    profile_name,
    profile_provider,
    profile_base_url,
    profile_model,
    profile_api_key_ciphertext,
    profile_api_key_iv,
    profile_api_key_tag,
    profile_api_key_last4,
    profile_enabled,
    profile_is_default,
    profile_supports_pdf_input,
    profile_supports_vision_images,
    actor_id,
    actor_id
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.update_ai_provider_profile_for_gateway(
  gateway_token text,
  profile_id uuid,
  profile_name text,
  profile_provider text,
  profile_base_url text,
  profile_model text,
  profile_api_key_ciphertext text,
  profile_api_key_iv text,
  profile_api_key_tag text,
  profile_api_key_last4 text,
  profile_enabled boolean,
  profile_is_default boolean,
  profile_supports_pdf_input boolean,
  profile_supports_vision_images boolean
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid := auth.uid();
begin
  if not private.verify_ai_provider_gateway(gateway_token) then
    raise exception 'AI provider gateway access denied.';
  end if;

  if profile_is_default then
    update public.ai_provider_profiles
    set is_default = false
    where is_default = true
      and id <> profile_id
      and deleted_at is null;
  end if;

  update public.ai_provider_profiles
  set
    name = profile_name,
    provider = profile_provider,
    base_url = profile_base_url,
    model = profile_model,
    api_key_ciphertext = coalesce(profile_api_key_ciphertext, api_key_ciphertext),
    api_key_iv = coalesce(profile_api_key_iv, api_key_iv),
    api_key_tag = coalesce(profile_api_key_tag, api_key_tag),
    api_key_last4 = coalesce(profile_api_key_last4, api_key_last4),
    enabled = profile_enabled,
    is_default = profile_is_default,
    supports_pdf_input = profile_supports_pdf_input,
    supports_vision_images = profile_supports_vision_images,
    updated_by = actor_id,
    deleted_at = null
  where id = profile_id;
end;
$$;

create or replace function public.delete_ai_provider_profile_for_gateway(
  gateway_token text,
  profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.verify_ai_provider_gateway(gateway_token) then
    raise exception 'AI provider gateway access denied.';
  end if;

  update public.ai_provider_profiles
  set
    enabled = false,
    is_default = false,
    deleted_at = now()
  where id = profile_id;
end;
$$;

revoke all on table private.ai_provider_gateway_token_hashes from public, anon, authenticated;
revoke all on function private.verify_ai_provider_gateway(text) from public;

revoke all on function public.list_ai_provider_profiles_for_gateway(text) from public;
revoke all on function public.list_enabled_ai_provider_profiles_for_gateway(text) from public;
revoke all on function public.get_ai_provider_profile_for_gateway(text, uuid) from public;
revoke all on function public.create_ai_provider_profile_for_gateway(
  text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) from public;
revoke all on function public.update_ai_provider_profile_for_gateway(
  text, uuid, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) from public;
revoke all on function public.delete_ai_provider_profile_for_gateway(text, uuid) from public;

grant execute on function public.list_ai_provider_profiles_for_gateway(text) to authenticated;
grant execute on function public.list_enabled_ai_provider_profiles_for_gateway(text) to authenticated;
grant execute on function public.get_ai_provider_profile_for_gateway(text, uuid) to authenticated;
grant execute on function public.create_ai_provider_profile_for_gateway(
  text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) to authenticated;
grant execute on function public.update_ai_provider_profile_for_gateway(
  text, uuid, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) to authenticated;
grant execute on function public.delete_ai_provider_profile_for_gateway(text, uuid) to authenticated;
