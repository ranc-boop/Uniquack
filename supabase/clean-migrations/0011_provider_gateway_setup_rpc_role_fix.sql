-- Patch the clean provider gateway setup RPC role check for Supabase JS
-- service-role calls. Migration 0010 introduced the RPC; this migration
-- keeps the same public contract and corrects role detection without exposing
-- the private gateway token hash table.

create or replace function public.setup_ai_provider_gateway_token_hash(
  token_hash text,
  token_label text default 'clean provider gateway setup'
)
returns table (
  action text,
  rows_affected integer
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  existing_hash text;
  jwt_role text := coalesce(
    nullif(auth.role()::text, ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
begin
  if jwt_role <> 'service_role' then
    raise exception 'AI provider gateway setup requires service_role access.';
  end if;

  if token_hash is null or token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'AI provider gateway setup requires a lowercase SHA-256 token hash.';
  end if;

  select gateway_hash.token_hash
  into existing_hash
  from private.ai_provider_gateway_token_hashes gateway_hash
  where gateway_hash.token_hash = setup_ai_provider_gateway_token_hash.token_hash;

  insert into private.ai_provider_gateway_token_hashes (
    token_hash,
    label,
    status,
    disabled_at
  )
  values (
    setup_ai_provider_gateway_token_hash.token_hash,
    nullif(trim(coalesce(setup_ai_provider_gateway_token_hash.token_label, 'clean provider gateway setup')), ''),
    'active',
    null
  )
  on conflict on constraint ai_provider_gateway_token_hashes_pkey do update
    set
      label = excluded.label,
      status = 'active',
      disabled_at = null;

  return query
  select
    case
      when existing_hash is null then 'inserted_hash_row'
      else 'updated_existing_hash_row'
    end,
    1;
end;
$$;

comment on function public.setup_ai_provider_gateway_token_hash(text, text) is
  'Service-role-only clean setup RPC. Accepts a SHA-256 hash of AI_PROVIDER_GATEWAY_TOKEN and upserts it into the private provider gateway token table without exposing raw token material.';

revoke all on function public.setup_ai_provider_gateway_token_hash(text, text)
from public, anon, authenticated;

grant execute on function public.setup_ai_provider_gateway_token_hash(text, text)
to service_role;
