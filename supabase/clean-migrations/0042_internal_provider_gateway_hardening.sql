-- Forward-only provider gateway hardening.
--
-- The supported control plane remains:
-- authenticated Admin Server Action -> super-admin verification ->
-- server-only gateway token -> narrow safe-metadata or mutation RPC.
--
-- No provider rows or encrypted values are changed by this migration.

-- Retire the historical request-header authorization alias. It has no current
-- source caller and must not remain as an alternate full-row read path.
drop policy if exists ai_provider_profiles_ai_router_read on public.ai_provider_profiles;
drop function if exists private.has_ai_router_provider_access();

-- Provider credentials are never browser-readable. Gateway functions are
-- security-definer functions with a super-admin plus token check; trusted
-- execution resolves credentials through service_role only.
drop policy if exists ai_provider_profiles_staff_read on public.ai_provider_profiles;
drop policy if exists ai_provider_profiles_admin_write on public.ai_provider_profiles;
revoke all privileges on table public.ai_provider_profiles from public, anon, authenticated;
grant all privileges on table public.ai_provider_profiles to service_role;

-- Replace both Admin-facing list RPCs with explicit safe projections so a
-- stale live definition cannot return encrypted key material or credential refs.
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

-- The old credential-returning gateway read is no longer part of the public
-- RPC surface. Saved-key tests and workers resolve credentials server-side
-- with service_role after their own application-level authorization checks.
drop function if exists public.get_ai_provider_profile_for_gateway(text, uuid);

-- Re-state the only browser-session RPC grants the supported Admin gateway
-- needs. Every one of these functions validates a super-admin session plus the
-- server-only gateway token and returns either safe metadata, an identifier,
-- or no row data.
revoke all on function private.verify_ai_provider_gateway(text) from public, anon, authenticated;
revoke all on function public.list_ai_provider_profiles_for_gateway(text) from public, anon, authenticated;
revoke all on function public.list_enabled_ai_provider_profiles_for_gateway(text) from public, anon, authenticated;
revoke all on function public.create_ai_provider_profile_for_gateway(
  text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) from public, anon, authenticated;
revoke all on function public.update_ai_provider_profile_for_gateway(
  text, uuid, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) from public, anon, authenticated;
revoke all on function public.delete_ai_provider_profile_for_gateway(text, uuid) from public, anon, authenticated;
revoke all on function public.list_ai_provider_routing_policies_for_gateway(text) from public, anon, authenticated;
revoke all on function public.upsert_ai_provider_routing_policy_for_gateway(
  text, uuid, text, boolean, integer, uuid[]
) from public, anon, authenticated;

grant execute on function public.list_ai_provider_profiles_for_gateway(text) to authenticated;
grant execute on function public.list_enabled_ai_provider_profiles_for_gateway(text) to authenticated;
grant execute on function public.create_ai_provider_profile_for_gateway(
  text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) to authenticated;
grant execute on function public.update_ai_provider_profile_for_gateway(
  text, uuid, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) to authenticated;
grant execute on function public.delete_ai_provider_profile_for_gateway(text, uuid) to authenticated;
grant execute on function public.list_ai_provider_routing_policies_for_gateway(text) to authenticated;
grant execute on function public.upsert_ai_provider_routing_policy_for_gateway(
  text, uuid, text, boolean, integer, uuid[]
) to authenticated;
