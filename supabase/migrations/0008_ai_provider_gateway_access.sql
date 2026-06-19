create extension if not exists pgcrypto with schema extensions;

create table if not exists private.ai_provider_gateway_token_hashes (
  token_hash text primary key,
  created_at timestamptz not null default now()
);

comment on table private.ai_provider_gateway_token_hashes is
  'SHA-256 hashes for dedicated backend AI provider gateway tokens. Tokens grant only AI provider RPC access when paired with a super-admin user session.';

revoke all on table private.ai_provider_gateway_token_hashes from public;
revoke all on table private.ai_provider_gateway_token_hashes from anon;
revoke all on table private.ai_provider_gateway_token_hashes from authenticated;

create or replace function private.verify_ai_provider_gateway(gateway_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.is_super_admin())
    and exists (
      select 1
      from private.ai_provider_gateway_token_hashes t
      where t.token_hash = encode(
        extensions.digest(convert_to(coalesce(gateway_token, ''), 'UTF8'), 'sha256'),
        'hex'
      )
    );
$$;

drop function if exists public.list_ai_provider_profiles_for_gateway(text);

create or replace function public.list_ai_provider_profiles_for_gateway(
  gateway_token text
)
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
  where private.verify_ai_provider_gateway(gateway_token)
  order by p.name asc
  limit 100;
$$;

drop function if exists public.list_enabled_ai_provider_profiles_for_gateway(text);

create or replace function public.list_enabled_ai_provider_profiles_for_gateway(
  gateway_token text
)
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
    private.verify_ai_provider_gateway(gateway_token)
    and p.enabled = true
    and p.api_key_last4 is not null
  order by p.is_default desc, p.name asc
  limit 100;
$$;

drop function if exists public.get_ai_provider_profile_for_gateway(uuid, text);

create or replace function public.get_ai_provider_profile_for_gateway(
  profile_id uuid,
  gateway_token text
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
    private.verify_ai_provider_gateway(gateway_token)
    and p.id = profile_id
    and p.api_key_ciphertext is not null
    and p.api_key_iv is not null
    and p.api_key_tag is not null
  limit 1;
$$;

drop function if exists public.create_ai_provider_profile_for_gateway(
  text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
);

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
set search_path = ''
as $$
declare
  inserted_id uuid;
  actor_id uuid := auth.uid();
begin
  if not private.verify_ai_provider_gateway(gateway_token) then
    raise exception 'AI provider gateway access denied.';
  end if;

  if profile_is_default then
    update public.ai_provider_profiles set is_default = false where is_default = true;
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

drop function if exists public.update_ai_provider_profile_for_gateway(
  text, uuid, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
);

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
set search_path = ''
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
    where is_default = true and id <> profile_id;
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
    updated_by = actor_id
  where id = profile_id;
end;
$$;

drop function if exists public.delete_ai_provider_profile_for_gateway(text, uuid);

create or replace function public.delete_ai_provider_profile_for_gateway(
  gateway_token text,
  profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.verify_ai_provider_gateway(gateway_token) then
    raise exception 'AI provider gateway access denied.';
  end if;

  delete from public.ai_provider_profiles where id = profile_id;
end;
$$;

revoke all on table public.ai_provider_profiles from anon;
revoke all on table public.ai_provider_profiles from authenticated;

revoke all on function public.list_enabled_ai_provider_profiles() from public;
revoke all on function public.list_enabled_ai_provider_profiles() from anon;
revoke all on function public.list_enabled_ai_provider_profiles() from authenticated;

revoke all on function public.list_ai_provider_profiles_for_gateway(text) from public;
revoke all on function public.list_enabled_ai_provider_profiles_for_gateway(text) from public;
revoke all on function public.get_ai_provider_profile_for_gateway(uuid, text) from public;
revoke all on function public.create_ai_provider_profile_for_gateway(
  text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) from public;
revoke all on function public.update_ai_provider_profile_for_gateway(
  text, uuid, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) from public;
revoke all on function public.delete_ai_provider_profile_for_gateway(text, uuid) from public;

grant execute on function public.list_ai_provider_profiles_for_gateway(text) to authenticated;
grant execute on function public.list_enabled_ai_provider_profiles_for_gateway(text) to authenticated;
grant execute on function public.get_ai_provider_profile_for_gateway(uuid, text) to authenticated;
grant execute on function public.create_ai_provider_profile_for_gateway(
  text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) to authenticated;
grant execute on function public.update_ai_provider_profile_for_gateway(
  text, uuid, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) to authenticated;
grant execute on function public.delete_ai_provider_profile_for_gateway(text, uuid) to authenticated;
