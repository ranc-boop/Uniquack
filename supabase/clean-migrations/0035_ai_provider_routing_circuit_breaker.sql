-- Durable, administrator-configured provider routing and shared circuit state.
-- This is intentionally forward-only and leaves the 0033 durable queue and
-- 0034 worker-role repair untouched.

create table if not exists public.ai_provider_routing_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  operation_kind text not null check (operation_kind in (
    'ai_pdf_extract',
    'blueprint_generate_questions',
    'blueprint_observe_pdf',
    'blueprint_analyze_text'
  )),
  enabled boolean not null default true,
  max_profiles_per_execution integer not null default 2
    check (max_profiles_per_execution between 1 and 3),
  policy_version integer not null default 1 check (policy_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_provider_routing_policies is
  'Admin-only ordered provider routing policy. It stores profile references only; provider keys, prompts, responses, and raw errors are never stored here.';

create unique index if not exists ai_provider_routing_policies_scope_operation_key
  on public.ai_provider_routing_policies (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    operation_kind
  );

create table if not exists public.ai_provider_routing_policy_members (
  policy_id uuid not null references public.ai_provider_routing_policies(id) on delete cascade,
  provider_profile_id uuid not null references public.ai_provider_profiles(id) on delete restrict,
  route_order integer not null check (route_order between 0 and 8),
  created_at timestamptz not null default now(),
  primary key (policy_id, provider_profile_id),
  unique (policy_id, route_order)
);

comment on table public.ai_provider_routing_policy_members is
  'Ordered, admin-configured provider references for an AI operation. Position zero is primary; later positions are explicit fallbacks.';

create index if not exists ai_provider_routing_policy_members_profile_idx
  on public.ai_provider_routing_policy_members(provider_profile_id);

create table if not exists private.ai_provider_runtime_states (
  provider_profile_id uuid not null references public.ai_provider_profiles(id) on delete cascade,
  operation_kind text not null check (operation_kind in (
    'ai_pdf_extract',
    'blueprint_generate_questions',
    'blueprint_observe_pdf',
    'blueprint_analyze_text'
  )),
  circuit_state text not null default 'closed'
    check (circuit_state in ('closed', 'open', 'half_open')),
  consecutive_failure_count integer not null default 0
    check (consecutive_failure_count >= 0),
  rolling_failure_count integer not null default 0
    check (rolling_failure_count >= 0),
  rolling_success_count integer not null default 0
    check (rolling_success_count >= 0),
  window_started_at timestamptz not null default now(),
  opened_at timestamptz,
  open_until timestamptz,
  half_open_lease_owner text,
  half_open_lease_expires_at timestamptz,
  last_safe_error_code text,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (provider_profile_id, operation_kind),
  check (
    (circuit_state = 'open' and open_until is not null)
    or circuit_state in ('closed', 'half_open')
  )
);

comment on table private.ai_provider_runtime_states is
  'Service-role-only shared provider health. Stores only bounded safe error codes and circuit metadata, never provider credentials, prompts, source material, or raw responses.';

create index if not exists ai_provider_runtime_states_open_idx
  on private.ai_provider_runtime_states(operation_kind, open_until)
  where circuit_state in ('open', 'half_open');

drop trigger if exists ai_provider_routing_policies_set_updated_at on public.ai_provider_routing_policies;
create trigger ai_provider_routing_policies_set_updated_at
before update on public.ai_provider_routing_policies
for each row execute function private.set_updated_at();

drop trigger if exists ai_provider_runtime_states_set_updated_at on private.ai_provider_runtime_states;
create trigger ai_provider_runtime_states_set_updated_at
before update on private.ai_provider_runtime_states
for each row execute function private.set_updated_at();

alter table public.ai_provider_routing_policies enable row level security;
alter table public.ai_provider_routing_policy_members enable row level security;
alter table private.ai_provider_runtime_states enable row level security;

drop policy if exists ai_provider_routing_policies_super_admin on public.ai_provider_routing_policies;
create policy ai_provider_routing_policies_super_admin
on public.ai_provider_routing_policies for all
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists ai_provider_routing_policy_members_super_admin on public.ai_provider_routing_policy_members;
create policy ai_provider_routing_policy_members_super_admin
on public.ai_provider_routing_policy_members for all
using (private.is_super_admin())
with check (private.is_super_admin());

create or replace function private.is_trusted_ai_provider_worker()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    nullif(auth.role()::text, ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  ) = 'service_role';
$$;

create or replace function public.list_ai_provider_routing_policies_for_gateway(
  gateway_token text
)
returns table (
  id uuid,
  organization_id uuid,
  operation_kind text,
  enabled boolean,
  max_profiles_per_execution integer,
  policy_version integer,
  provider_profile_ids uuid[],
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.verify_ai_provider_gateway(gateway_token) then
    raise exception 'AI provider gateway access denied.';
  end if;

  return query
  select
    policy.id,
    policy.organization_id,
    policy.operation_kind,
    policy.enabled,
    policy.max_profiles_per_execution,
    policy.policy_version,
    coalesce(
      array_agg(member.provider_profile_id order by member.route_order)
        filter (where member.provider_profile_id is not null),
      '{}'::uuid[]
    ) as provider_profile_ids,
    policy.updated_at
  from public.ai_provider_routing_policies policy
  left join public.ai_provider_routing_policy_members member
    on member.policy_id = policy.id
  group by policy.id
  order by policy.organization_id nulls first, policy.operation_kind;
end;
$$;

create or replace function public.upsert_ai_provider_routing_policy_for_gateway(
  gateway_token text,
  p_organization_id uuid,
  p_operation_kind text,
  p_enabled boolean,
  p_max_profiles_per_execution integer,
  p_provider_profile_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  normalized_profile_ids uuid[] := coalesce(p_provider_profile_ids, '{}'::uuid[]);
  normalized_max_profiles integer := greatest(1, least(coalesce(p_max_profiles_per_execution, 2), 3));
  selected_profile_count integer;
  distinct_profile_count integer;
  routing_policy_id uuid;
begin
  if not private.verify_ai_provider_gateway(gateway_token) then
    raise exception 'AI provider gateway access denied.';
  end if;

  if p_operation_kind not in (
    'ai_pdf_extract',
    'blueprint_generate_questions',
    'blueprint_observe_pdf',
    'blueprint_analyze_text'
  ) then
    raise exception 'Unsupported AI provider routing operation.';
  end if;

  if cardinality(normalized_profile_ids) > 3 then
    raise exception 'A routing policy can contain at most three ordered provider profiles.';
  end if;

  if p_enabled and cardinality(normalized_profile_ids) = 0 then
    raise exception 'An enabled routing policy requires a primary provider profile.';
  end if;

  if cardinality(normalized_profile_ids) > normalized_max_profiles then
    raise exception 'The provider route contains more profiles than its execution limit.';
  end if;

  select count(*) into distinct_profile_count
  from (select distinct unnest(normalized_profile_ids) as id) profile_ids;
  if distinct_profile_count <> cardinality(normalized_profile_ids) then
    raise exception 'A provider profile can appear only once in a routing policy.';
  end if;

  if cardinality(normalized_profile_ids) > 0 then
    select count(*) into selected_profile_count
    from public.ai_provider_profiles profile
    where profile.id = any(normalized_profile_ids)
      and profile.enabled = true
      and profile.api_key_last4 is not null
      and profile.deleted_at is null
      and (
        profile.organization_id is null
        or profile.organization_id is not distinct from p_organization_id
      );

    if selected_profile_count <> cardinality(normalized_profile_ids) then
      raise exception 'Routing policies may contain only enabled compatible-scope provider profiles with saved key metadata.';
    end if;
  end if;

  select policy.id into routing_policy_id
  from public.ai_provider_routing_policies policy
  where policy.organization_id is not distinct from p_organization_id
    and policy.operation_kind = p_operation_kind
  for update;

  if routing_policy_id is null then
    insert into public.ai_provider_routing_policies (
      organization_id,
      operation_kind,
      enabled,
      max_profiles_per_execution,
      created_by,
      updated_by
    ) values (
      p_organization_id,
      p_operation_kind,
      coalesce(p_enabled, false),
      normalized_max_profiles,
      auth.uid(),
      auth.uid()
    ) returning id into routing_policy_id;
  else
    update public.ai_provider_routing_policies
    set enabled = coalesce(p_enabled, false),
        max_profiles_per_execution = normalized_max_profiles,
        policy_version = policy_version + 1,
        updated_by = auth.uid()
    where id = routing_policy_id;
  end if;

  delete from public.ai_provider_routing_policy_members
  where policy_id = routing_policy_id;

  insert into public.ai_provider_routing_policy_members (
    policy_id,
    provider_profile_id,
    route_order
  )
  select routing_policy_id, profile_id, ordinal_position - 1
  from unnest(normalized_profile_ids) with ordinality as route(profile_id, ordinal_position);

  return routing_policy_id;
end;
$$;

create or replace function public.list_ai_provider_runtime_states_for_worker(
  p_provider_profile_ids uuid[],
  p_operation_kind text
)
returns table (
  provider_profile_id uuid,
  circuit_state text,
  consecutive_failure_count integer,
  open_until timestamptz,
  half_open_lease_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_trusted_ai_provider_worker() then
    raise exception 'Trusted worker role required.';
  end if;

  if p_operation_kind not in (
    'ai_pdf_extract',
    'blueprint_generate_questions',
    'blueprint_observe_pdf',
    'blueprint_analyze_text'
  ) then
    raise exception 'Unsupported AI provider routing operation.';
  end if;

  return query
  select
    state.provider_profile_id,
    state.circuit_state,
    state.consecutive_failure_count,
    state.open_until,
    state.half_open_lease_expires_at
  from private.ai_provider_runtime_states state
  where state.provider_profile_id = any(coalesce(p_provider_profile_ids, '{}'::uuid[]))
    and state.operation_kind = p_operation_kind;
end;
$$;

create or replace function public.acquire_ai_provider_half_open_probe(
  p_provider_profile_id uuid,
  p_operation_kind text,
  p_lease_owner text
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_trusted_ai_provider_worker() then
    raise exception 'Trusted worker role required.';
  end if;

  if nullif(btrim(coalesce(p_lease_owner, '')), '') is null
    or length(p_lease_owner) > 160 then
    raise exception 'A bounded provider probe lease owner is required.';
  end if;

  update private.ai_provider_runtime_states state
  set circuit_state = 'half_open',
      half_open_lease_owner = p_lease_owner,
      half_open_lease_expires_at = now() + interval '90 seconds'
  where state.provider_profile_id = p_provider_profile_id
    and state.operation_kind = p_operation_kind
    and state.circuit_state in ('open', 'half_open')
    and coalesce(state.open_until, now()) <= now()
    and (
      state.half_open_lease_owner is null
      or state.half_open_lease_expires_at is null
      or state.half_open_lease_expires_at <= now()
    );

  return found;
end;
$$;

create or replace function public.record_ai_provider_route_outcome(
  p_provider_profile_id uuid,
  p_operation_kind text,
  p_success boolean,
  p_circuit_eligible boolean default false,
  p_safe_error_code text default null,
  p_probe_lease_owner text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  existing_state private.ai_provider_runtime_states%rowtype;
  reset_window boolean;
  next_consecutive_failures integer;
  should_open boolean;
begin
  if not private.is_trusted_ai_provider_worker() then
    raise exception 'Trusted worker role required.';
  end if;

  if p_operation_kind not in (
    'ai_pdf_extract',
    'blueprint_generate_questions',
    'blueprint_observe_pdf',
    'blueprint_analyze_text'
  ) then
    raise exception 'Unsupported AI provider routing operation.';
  end if;

  if p_safe_error_code is not null and length(p_safe_error_code) > 80 then
    raise exception 'Provider routing error codes must be bounded.';
  end if;

  select * into existing_state
  from private.ai_provider_runtime_states
  where provider_profile_id = p_provider_profile_id
    and operation_kind = p_operation_kind
  for update;

  if existing_state.provider_profile_id is null then
    if p_probe_lease_owner is not null then
      return false;
    end if;

    insert into private.ai_provider_runtime_states (
      provider_profile_id,
      operation_kind,
      circuit_state,
      consecutive_failure_count,
      rolling_failure_count,
      rolling_success_count,
      window_started_at,
      last_safe_error_code,
      last_failure_at,
      last_success_at
    ) values (
      p_provider_profile_id,
      p_operation_kind,
      'closed',
      case when p_success or not p_circuit_eligible then 0 else 1 end,
      case when p_success or not p_circuit_eligible then 0 else 1 end,
      case when p_success then 1 else 0 end,
      now(),
      case when p_success then null else nullif(btrim(coalesce(p_safe_error_code, '')), '') end,
      case when p_success then null else now() end,
      case when p_success then now() else null end
    );
    return true;
  end if;

  if p_probe_lease_owner is not null and (
    existing_state.circuit_state <> 'half_open'
    or existing_state.half_open_lease_owner <> p_probe_lease_owner
    or existing_state.half_open_lease_expires_at is null
    or existing_state.half_open_lease_expires_at < now()
  ) then
    return false;
  end if;

  reset_window := existing_state.window_started_at < now() - interval '15 minutes';
  next_consecutive_failures := case
    when p_success or not p_circuit_eligible then 0
    else existing_state.consecutive_failure_count + 1
  end;
  should_open := not p_success
    and p_circuit_eligible
    and (
      existing_state.circuit_state = 'half_open'
      or next_consecutive_failures >= 2
    );

  update private.ai_provider_runtime_states
  set circuit_state = case
        when p_success then 'closed'
        when should_open then 'open'
        else 'closed'
      end,
      consecutive_failure_count = next_consecutive_failures,
      rolling_failure_count = case
        when reset_window then case when p_success or not p_circuit_eligible then 0 else 1 end
        when p_success or not p_circuit_eligible then existing_state.rolling_failure_count
        else existing_state.rolling_failure_count + 1
      end,
      rolling_success_count = case
        when reset_window then case when p_success then 1 else 0 end
        when p_success then existing_state.rolling_success_count + 1
        else existing_state.rolling_success_count
      end,
      window_started_at = case when reset_window then now() else existing_state.window_started_at end,
      opened_at = case when should_open then now() else null end,
      open_until = case when should_open then now() + interval '5 minutes' else null end,
      half_open_lease_owner = null,
      half_open_lease_expires_at = null,
      last_safe_error_code = case
        when p_success then null
        else nullif(btrim(coalesce(p_safe_error_code, '')), '')
      end,
      last_failure_at = case when p_success then existing_state.last_failure_at else now() end,
      last_success_at = case when p_success then now() else existing_state.last_success_at end
  where provider_profile_id = p_provider_profile_id
    and operation_kind = p_operation_kind;

  return true;
end;
$$;

revoke all on function public.list_ai_provider_routing_policies_for_gateway(text) from public;
revoke all on function public.upsert_ai_provider_routing_policy_for_gateway(text, uuid, text, boolean, integer, uuid[]) from public;
revoke all on function public.list_ai_provider_runtime_states_for_worker(uuid[], text) from public, anon, authenticated;
revoke all on function public.acquire_ai_provider_half_open_probe(uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_ai_provider_route_outcome(uuid, text, boolean, boolean, text, text) from public, anon, authenticated;

grant execute on function public.list_ai_provider_routing_policies_for_gateway(text) to authenticated;
grant execute on function public.upsert_ai_provider_routing_policy_for_gateway(text, uuid, text, boolean, integer, uuid[]) to authenticated;
grant execute on function public.list_ai_provider_runtime_states_for_worker(uuid[], text) to service_role;
grant execute on function public.acquire_ai_provider_half_open_probe(uuid, text, text) to service_role;
grant execute on function public.record_ai_provider_route_outcome(uuid, text, boolean, boolean, text, text) to service_role;
