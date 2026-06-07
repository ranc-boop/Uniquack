insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ai-import-sources',
  'ai-import-sources',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ai_provider_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  provider text not null check (length(btrim(provider)) > 0),
  base_url text not null check (length(btrim(base_url)) > 0),
  model text not null check (length(btrim(model)) > 0),
  api_key_ciphertext text,
  api_key_iv text,
  api_key_tag text,
  api_key_last4 text,
  enabled boolean not null default true,
  is_default boolean not null default false,
  supports_pdf_input boolean not null default true,
  supports_vision_images boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_provider_profiles is
  'Super-admin managed AI model provider profiles for PDF import. API keys are encrypted by the application before saving.';

create unique index if not exists ai_provider_profiles_default_unique
  on public.ai_provider_profiles(is_default)
  where is_default;

create index if not exists ai_provider_profiles_enabled_idx
  on public.ai_provider_profiles(enabled, name);

drop trigger if exists ai_provider_profiles_set_updated_at
on public.ai_provider_profiles;

create trigger ai_provider_profiles_set_updated_at
before update on public.ai_provider_profiles
for each row execute function private.set_updated_at();

alter table public.ai_provider_profiles enable row level security;

grant select, insert, update, delete on table public.ai_provider_profiles
to authenticated;

drop policy if exists ai_provider_profiles_admin_read
on public.ai_provider_profiles;

create policy ai_provider_profiles_admin_read
on public.ai_provider_profiles for select
to authenticated
using ((select private.is_super_admin()));

drop policy if exists ai_provider_profiles_super_admin_manage
on public.ai_provider_profiles;

create policy ai_provider_profiles_super_admin_manage
on public.ai_provider_profiles for all
to authenticated
using ((select private.is_super_admin()))
with check ((select private.is_super_admin()));

drop policy if exists ai_import_sources_admin_upload
on storage.objects;

create policy ai_import_sources_admin_upload
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'ai-import-sources'
  and (select private.is_admin())
);

drop policy if exists ai_import_sources_admin_read
on storage.objects;

create policy ai_import_sources_admin_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'ai-import-sources'
  and (select private.is_admin())
);

drop policy if exists ai_import_sources_admin_delete
on storage.objects;

create policy ai_import_sources_admin_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'ai-import-sources'
  and (select private.is_admin())
);

create table if not exists public.import_batch_assets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  asset_role text not null
    check (asset_role in ('source_pdf', 'ai_crop_candidate', 'unmatched', 'other')),
  object_path text not null unique check (length(btrim(object_path)) > 0),
  mime_type text not null check (length(btrim(mime_type)) > 0),
  size_bytes bigint not null check (size_bytes > 0),
  original_filename text not null check (length(btrim(original_filename)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.import_batch_assets is
  'Private import-level source and working assets. These assets are not attached to individual questions until import processing creates question-specific assets.';

create index if not exists import_batch_assets_batch_id_idx
  on public.import_batch_assets(batch_id);

create index if not exists import_batch_assets_role_status_idx
  on public.import_batch_assets(asset_role, status);

drop trigger if exists import_batch_assets_set_updated_at
on public.import_batch_assets;

create trigger import_batch_assets_set_updated_at
before update on public.import_batch_assets
for each row execute function private.set_updated_at();

alter table public.import_batch_assets enable row level security;

grant select, insert, update, delete on table public.import_batch_assets
to authenticated;

drop policy if exists import_batch_assets_admin_crud
on public.import_batch_assets;

create policy import_batch_assets_admin_crud
on public.import_batch_assets for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop function if exists public.list_enabled_ai_provider_profiles();

create or replace function public.list_enabled_ai_provider_profiles()
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
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.provider,
    p.base_url,
    p.model,
    p.enabled,
    p.is_default,
    p.supports_pdf_input,
    p.supports_vision_images,
    p.api_key_last4,
    p.created_at,
    p.updated_at
  from public.ai_provider_profiles p
  where
    (select private.is_admin())
    and p.enabled = true
    and p.api_key_last4 is not null
  order by p.is_default desc, p.name asc
  limit 100;
$$;

revoke all on function public.list_enabled_ai_provider_profiles() from public;
grant execute on function public.list_enabled_ai_provider_profiles() to authenticated;

drop function if exists public.get_ai_provider_profile_for_import(uuid);

create or replace function public.get_ai_provider_profile_for_import(
  provider_profile_id uuid
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
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.provider,
    p.base_url,
    p.model,
    p.api_key_ciphertext,
    p.api_key_iv,
    p.api_key_tag,
    p.api_key_last4,
    p.enabled,
    p.is_default,
    p.supports_pdf_input,
    p.supports_vision_images,
    p.created_by,
    p.updated_by,
    p.created_at,
    p.updated_at
  from public.ai_provider_profiles p
  where
    (select private.is_admin())
    and p.id = provider_profile_id
    and p.enabled = true
    and p.api_key_ciphertext is not null
    and p.api_key_iv is not null
    and p.api_key_tag is not null
  limit 1;
$$;

revoke all on function public.get_ai_provider_profile_for_import(uuid) from public;
grant execute on function public.get_ai_provider_profile_for_import(uuid)
to authenticated;
