-- AI operations launch readiness.
-- Forward-only operational controls and privacy-safe execution telemetry.
-- This intentionally does not modify the durable queue or routing migrations.

create table if not exists public.ai_operations_controls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  operation_kind text check (operation_kind is null or operation_kind in (
    'ai_pdf_extract',
    'blueprint_generate_questions',
    'blueprint_observe_pdf',
    'blueprint_analyze_text'
  )),
  pause_new_enqueues boolean not null default false,
  pause_worker_claims boolean not null default false,
  daily_estimated_cost_micros bigint not null default 10000000
    check (daily_estimated_cost_micros >= 0),
  monthly_estimated_cost_micros bigint not null default 50000000
    check (monthly_estimated_cost_micros >= 0),
  queue_cost_reservation_micros bigint not null default 100000
    check (queue_cost_reservation_micros >= 0),
  max_jobs_per_invocation integer not null default 2
    check (max_jobs_per_invocation between 1 and 2),
  max_provider_calls_per_execution integer not null default 4
    check (max_provider_calls_per_execution between 1 and 4),
  alert_queue_depth integer not null default 10
    check (alert_queue_depth >= 1),
  alert_oldest_queue_seconds integer not null default 900
    check (alert_oldest_queue_seconds >= 60),
  alert_worker_stale_seconds integer not null default 600
    check (alert_worker_stale_seconds >= 60),
  alert_circuit_open_seconds integer not null default 900
    check (alert_circuit_open_seconds >= 60),
  alert_fallback_rate_basis_points integer not null default 2500
    check (alert_fallback_rate_basis_points between 0 and 10000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_operations_controls is
  'Admin-only closed-beta operational controls. Amounts are USD microdollars and never exposed to teachers or students.';

create unique index if not exists ai_operations_controls_scope_operation_key
  on public.ai_operations_controls (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(operation_kind, '')
  );

create table if not exists public.ai_operation_telemetry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  queue_job_id uuid references public.ai_provider_jobs(id) on delete set null,
  operation_kind text not null check (operation_kind in (
    'ai_pdf_extract',
    'blueprint_generate_questions',
    'blueprint_observe_pdf',
    'blueprint_analyze_text'
  )),
  provider_profile_id uuid references public.ai_provider_profiles(id) on delete set null,
  provider text,
  model text,
  route_policy_version integer check (route_policy_version is null or route_policy_version > 0),
  route_position integer check (route_position is null or route_position between 0 and 8),
  fallback_used boolean not null default false,
  provider_call_count integer not null default 0 check (provider_call_count between 0 and 16),
  provider_retry_attempts integer not null default 0 check (provider_retry_attempts between 0 and 16),
  queue_execution_attempt integer not null default 0 check (queue_execution_attempt between 0 and 32),
  actual_input_tokens integer check (actual_input_tokens is null or actual_input_tokens >= 0),
  actual_cached_input_tokens integer check (actual_cached_input_tokens is null or actual_cached_input_tokens >= 0),
  actual_output_tokens integer check (actual_output_tokens is null or actual_output_tokens >= 0),
  actual_total_tokens integer check (actual_total_tokens is null or actual_total_tokens >= 0),
  estimated_input_tokens integer check (estimated_input_tokens is null or estimated_input_tokens >= 0),
  estimated_output_tokens integer check (estimated_output_tokens is null or estimated_output_tokens >= 0),
  estimated_total_tokens integer check (estimated_total_tokens is null or estimated_total_tokens >= 0),
  estimated_input_cost_micros bigint check (estimated_input_cost_micros is null or estimated_input_cost_micros >= 0),
  estimated_cached_input_cost_micros bigint check (estimated_cached_input_cost_micros is null or estimated_cached_input_cost_micros >= 0),
  estimated_output_cost_micros bigint check (estimated_output_cost_micros is null or estimated_output_cost_micros >= 0),
  estimated_total_cost_micros bigint check (estimated_total_cost_micros is null or estimated_total_cost_micros >= 0),
  queue_wait_ms integer check (queue_wait_ms is null or queue_wait_ms >= 0),
  provider_latency_ms integer check (provider_latency_ms is null or provider_latency_ms >= 0),
  execution_latency_ms integer check (execution_latency_ms is null or execution_latency_ms >= 0),
  drafts_created integer not null default 0 check (drafts_created >= 0),
  final_status text not null check (final_status in ('completed', 'retry_wait', 'failed', 'cancelled', 'skipped')),
  safe_error_code text check (safe_error_code is null or length(safe_error_code) <= 80),
  circuit_outcome text not null default 'closed'
    check (circuit_outcome in ('closed', 'fallback', 'half_open_probe', 'open', 'unavailable')),
  created_at timestamptz not null default now()
);

comment on table public.ai_operation_telemetry is
  'Admin-only aggregate AI operation telemetry. It must never contain prompts, provider responses, source content, assets, signed URLs, credentials, student answers, or teacher notes.';

create index if not exists ai_operation_telemetry_org_created_idx
  on public.ai_operation_telemetry(organization_id, created_at desc);
create index if not exists ai_operation_telemetry_job_idx
  on public.ai_operation_telemetry(queue_job_id, created_at desc)
  where queue_job_id is not null;
create index if not exists ai_operation_telemetry_operation_created_idx
  on public.ai_operation_telemetry(operation_kind, created_at desc);

drop trigger if exists ai_operations_controls_set_updated_at on public.ai_operations_controls;
create trigger ai_operations_controls_set_updated_at
before update on public.ai_operations_controls
for each row execute function private.set_updated_at();

alter table public.ai_operations_controls enable row level security;
alter table public.ai_operation_telemetry enable row level security;

drop policy if exists ai_operations_controls_super_admin on public.ai_operations_controls;
create policy ai_operations_controls_super_admin
on public.ai_operations_controls for all
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists ai_operation_telemetry_super_admin_read on public.ai_operation_telemetry;
create policy ai_operation_telemetry_super_admin_read
on public.ai_operation_telemetry for select
using (private.is_super_admin());

-- Enqueue budget enforcement is attached to the durable queue insert so a
-- browser client cannot bypass it by calling the existing enqueue RPC directly.
create or replace function private.enforce_ai_operations_enqueue_limits()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  control public.ai_operations_controls%rowtype;
  daily_spend bigint := 0;
  monthly_spend bigint := 0;
  queued_reservation bigint := 0;
  operation_paused boolean := false;
begin
  select * into control
  from public.ai_operations_controls
  where organization_id is null and operation_kind is null
  order by updated_at desc
  limit 1;

  if control.id is null then
    return new;
  end if;

  select coalesce(pause_new_enqueues, false) into operation_paused
  from public.ai_operations_controls
  where organization_id is null and operation_kind = new.job_kind
  order by updated_at desc
  limit 1;

  if control.pause_new_enqueues or coalesce(operation_paused, false) then
    raise exception 'AI processing is temporarily unavailable for this workspace. Your source and Library are safe.';
  end if;

  select coalesce(sum(estimated_total_cost_micros), 0) into daily_spend
  from public.ai_operation_telemetry
  where organization_id = new.organization_id
    and created_at >= date_trunc('day', now());

  select coalesce(sum(estimated_total_cost_micros), 0) into monthly_spend
  from public.ai_operation_telemetry
  where organization_id = new.organization_id
    and created_at >= date_trunc('month', now());

  select count(*) * control.queue_cost_reservation_micros into queued_reservation
  from public.ai_provider_jobs
  where organization_id = new.organization_id
    and status in ('queued', 'leased', 'processing', 'retry_wait');

  if (control.daily_estimated_cost_micros > 0 and
      daily_spend + queued_reservation + control.queue_cost_reservation_micros > control.daily_estimated_cost_micros)
    or (control.monthly_estimated_cost_micros > 0 and
      monthly_spend + queued_reservation + control.queue_cost_reservation_micros > control.monthly_estimated_cost_micros) then
    raise exception 'AI processing is temporarily unavailable for this workspace. Your source and Library are safe.';
  end if;

  return new;
end;
$$;

drop trigger if exists ai_provider_jobs_enforce_operations_limits on public.ai_provider_jobs;
create trigger ai_provider_jobs_enforce_operations_limits
before insert on public.ai_provider_jobs
for each row execute function private.enforce_ai_operations_enqueue_limits();

create or replace function public.get_ai_operations_worker_control()
returns table (
  pause_worker_claims boolean,
  max_jobs_per_invocation integer,
  max_provider_calls_per_execution integer
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  control public.ai_operations_controls%rowtype;
begin
  if not private.is_trusted_ai_provider_worker() then
    raise exception 'Trusted worker role required.';
  end if;

  select * into control
  from public.ai_operations_controls
  where organization_id is null and operation_kind is null
  order by updated_at desc
  limit 1;

  return query
  select
    coalesce(control.pause_worker_claims, false),
    coalesce(control.max_jobs_per_invocation, 2),
    coalesce(control.max_provider_calls_per_execution, 4);
end;
$$;

create or replace function public.record_ai_operation_telemetry(
  p_organization_id uuid,
  p_queue_job_id uuid,
  p_operation_kind text,
  p_provider_profile_id uuid,
  p_provider text,
  p_model text,
  p_route_policy_version integer,
  p_route_position integer,
  p_fallback_used boolean,
  p_provider_call_count integer,
  p_provider_retry_attempts integer,
  p_queue_execution_attempt integer,
  p_actual_input_tokens integer,
  p_actual_cached_input_tokens integer,
  p_actual_output_tokens integer,
  p_actual_total_tokens integer,
  p_estimated_input_tokens integer,
  p_estimated_output_tokens integer,
  p_estimated_total_tokens integer,
  p_estimated_input_cost_micros bigint,
  p_estimated_cached_input_cost_micros bigint,
  p_estimated_output_cost_micros bigint,
  p_estimated_total_cost_micros bigint,
  p_queue_wait_ms integer,
  p_provider_latency_ms integer,
  p_execution_latency_ms integer,
  p_drafts_created integer,
  p_final_status text,
  p_safe_error_code text,
  p_circuit_outcome text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  telemetry_id uuid;
begin
  if not private.is_trusted_ai_provider_worker() then
    raise exception 'Trusted worker role required.';
  end if;

  if p_operation_kind not in (
    'ai_pdf_extract', 'blueprint_generate_questions',
    'blueprint_observe_pdf', 'blueprint_analyze_text'
  ) or p_final_status not in ('completed', 'retry_wait', 'failed', 'cancelled', 'skipped')
    or p_circuit_outcome not in ('closed', 'fallback', 'half_open_probe', 'open', 'unavailable') then
    raise exception 'Invalid safe AI operations telemetry value.';
  end if;

  if length(coalesce(p_provider, '')) > 80
    or length(coalesce(p_model, '')) > 160
    or length(coalesce(p_safe_error_code, '')) > 80 then
    raise exception 'AI operations telemetry text must remain bounded.';
  end if;

  insert into public.ai_operation_telemetry (
    organization_id, queue_job_id, operation_kind, provider_profile_id, provider, model,
    route_policy_version, route_position, fallback_used, provider_call_count,
    provider_retry_attempts, queue_execution_attempt, actual_input_tokens,
    actual_cached_input_tokens, actual_output_tokens, actual_total_tokens,
    estimated_input_tokens, estimated_output_tokens, estimated_total_tokens,
    estimated_input_cost_micros, estimated_cached_input_cost_micros,
    estimated_output_cost_micros, estimated_total_cost_micros, queue_wait_ms,
    provider_latency_ms, execution_latency_ms, drafts_created, final_status,
    safe_error_code, circuit_outcome
  ) values (
    p_organization_id, p_queue_job_id, p_operation_kind, p_provider_profile_id,
    nullif(left(btrim(coalesce(p_provider, '')), 80), ''),
    nullif(left(btrim(coalesce(p_model, '')), 160), ''),
    p_route_policy_version, p_route_position, coalesce(p_fallback_used, false),
    greatest(0, least(coalesce(p_provider_call_count, 0), 16)),
    greatest(0, least(coalesce(p_provider_retry_attempts, 0), 16)),
    greatest(0, least(coalesce(p_queue_execution_attempt, 0), 32)),
    p_actual_input_tokens, p_actual_cached_input_tokens, p_actual_output_tokens,
    p_actual_total_tokens, p_estimated_input_tokens, p_estimated_output_tokens,
    p_estimated_total_tokens, p_estimated_input_cost_micros,
    p_estimated_cached_input_cost_micros, p_estimated_output_cost_micros,
    p_estimated_total_cost_micros, p_queue_wait_ms, p_provider_latency_ms,
    p_execution_latency_ms, greatest(0, coalesce(p_drafts_created, 0)),
    p_final_status, nullif(left(btrim(coalesce(p_safe_error_code, '')), 80), ''),
    p_circuit_outcome
  ) returning id into telemetry_id;

  return telemetry_id;
end;
$$;

create or replace function public.list_ai_provider_runtime_states_for_admin()
returns table (
  provider_profile_id uuid,
  operation_kind text,
  circuit_state text,
  consecutive_failure_count integer,
  open_until timestamptz,
  last_safe_error_code text,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Super admin access required.';
  end if;

  return query
  select
    state.provider_profile_id, state.operation_kind, state.circuit_state,
    state.consecutive_failure_count, state.open_until, state.last_safe_error_code,
    state.last_failure_at, state.last_success_at, state.updated_at
  from private.ai_provider_runtime_states state
  order by state.updated_at desc;
end;
$$;

create or replace function public.reset_ai_provider_runtime_state_for_admin(
  p_provider_profile_id uuid,
  p_operation_kind text
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Super admin access required.';
  end if;

  update private.ai_provider_runtime_states
  set circuit_state = 'closed',
      consecutive_failure_count = 0,
      rolling_failure_count = 0,
      rolling_success_count = 0,
      opened_at = null,
      open_until = null,
      half_open_lease_owner = null,
      half_open_lease_expires_at = null,
      last_safe_error_code = null,
      updated_at = now()
  where provider_profile_id = p_provider_profile_id
    and operation_kind = p_operation_kind;

  return found;
end;
$$;

insert into public.ai_operations_controls (
  organization_id,
  operation_kind,
  created_by,
  updated_by
)
select null, null, auth.uid(), auth.uid()
where not exists (
  select 1
  from public.ai_operations_controls
  where organization_id is null and operation_kind is null
);

revoke all on function public.get_ai_operations_worker_control() from public, anon, authenticated;
revoke all on function public.record_ai_operation_telemetry(
  uuid, uuid, text, uuid, text, text, integer, integer, boolean, integer, integer,
  integer, integer, integer, integer, integer, integer, integer, integer, bigint,
  bigint, bigint, bigint, integer, integer, integer, integer, text, text, text
) from public, anon, authenticated;
revoke all on function public.list_ai_provider_runtime_states_for_admin() from public, anon;
revoke all on function public.reset_ai_provider_runtime_state_for_admin(uuid, text) from public, anon;

grant execute on function public.get_ai_operations_worker_control() to service_role;
grant execute on function public.record_ai_operation_telemetry(
  uuid, uuid, text, uuid, text, text, integer, integer, boolean, integer, integer,
  integer, integer, integer, integer, integer, integer, integer, integer, bigint,
  bigint, bigint, bigint, integer, integer, integer, integer, text, text, text
) to service_role;
grant execute on function public.list_ai_provider_runtime_states_for_admin() to authenticated;
grant execute on function public.reset_ai_provider_runtime_state_for_admin(uuid, text) to authenticated;
