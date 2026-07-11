-- Repair the trusted-worker role detection used by the durable AI queue.
-- 0033 used only the legacy request.jwt.claim.role setting, which is absent
-- for the clean project's service-role PostgREST requests. Keep this
-- forward-only: re-define only the worker-only queue RPCs.

create or replace function public.claim_ai_provider_jobs(
  p_lease_owner text,
  p_limit integer default 1,
  p_lease_seconds integer default 900
)
returns setof public.ai_provider_jobs
language plpgsql
security definer
set search_path = public, private
as $$
declare
  claimed_job public.ai_provider_jobs%rowtype;
  active_global integer;
  active_pdf integer;
  active_blueprint integer;
  active_org integer;
  jwt_role text := coalesce(
    nullif(auth.role()::text, ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
  safe_limit integer := greatest(1, least(coalesce(p_limit, 1), 3));
  safe_lease_seconds integer := greatest(120, least(coalesce(p_lease_seconds, 900), 1800));
begin
  if jwt_role <> 'service_role' then
    raise exception 'Trusted worker role required.';
  end if;

  if nullif(btrim(coalesce(p_lease_owner, '')), '') is null or length(p_lease_owner) > 120 then
    raise exception 'A bounded worker lease owner is required.';
  end if;

  update public.ai_provider_jobs
  set status = case when execution_attempt_count >= max_execution_attempts then 'failed' else 'queued' end,
      lease_owner = null,
      lease_acquired_at = null,
      lease_expires_at = null,
      last_heartbeat_at = null,
      safe_error_code = case when execution_attempt_count >= max_execution_attempts then 'lease_expired' else safe_error_code end,
      safe_message = case when execution_attempt_count >= max_execution_attempts then 'This run could not be completed after a worker interruption. Nothing was published or assigned.' else safe_message end,
      failed_at = case when execution_attempt_count >= max_execution_attempts then now() else failed_at end,
      available_at = case when execution_attempt_count >= max_execution_attempts then available_at else now() end
  where status in ('leased', 'processing')
    and lease_expires_at < now();

  for claimed_job in
    with eligible as (
      select job.*
      from public.ai_provider_jobs job
      where job.status in ('queued', 'retry_wait')
        and job.available_at <= now()
        and job.execution_attempt_count < job.max_execution_attempts
    ), user_heads as (
      select eligible.*,
        row_number() over (
          partition by eligible.fairness_key
          order by eligible.priority desc, eligible.created_at asc
        ) as user_rank
      from eligible
    ), organization_heads as (
      select user_head.id,
        user_head.organization_id,
        user_head.priority,
        user_head.created_at,
        row_number() over (
          partition by user_head.organization_id
          order by user_state.last_claimed_at nulls first,
            user_head.priority desc,
            user_head.created_at asc
        ) as organization_rank
      from user_heads user_head
      left join private.ai_provider_job_fairness_state user_state
        on user_state.scope = 'user'
        and user_state.fairness_key = user_head.fairness_key
      where user_head.user_rank = 1
    ), candidates as (
      select organization_head.id,
        (
          select count(*)
          from public.ai_provider_jobs active_job
          where active_job.organization_id = organization_head.organization_id
            and active_job.status in ('leased', 'processing')
        ) as organization_active_count,
        organization_state.last_claimed_at
      from organization_heads organization_head
      left join private.ai_provider_job_fairness_state organization_state
        on organization_state.scope = 'organization'
        and organization_state.fairness_key = organization_head.organization_id::text
      where organization_head.organization_rank = 1
      order by organization_active_count asc,
        organization_state.last_claimed_at nulls first,
        organization_head.priority desc,
        organization_head.created_at asc
      limit safe_limit * 12
    )
    select job.*
    from public.ai_provider_jobs job
    join candidates on candidates.id = job.id
    order by candidates.organization_active_count asc, job.priority desc, job.created_at asc
    for update of job skip locked
  loop
    select count(*) into active_global
    from public.ai_provider_jobs where status in ('leased', 'processing');
    exit when active_global >= 3;

    select count(*) into active_pdf
    from public.ai_provider_jobs where status in ('leased', 'processing') and job_kind = 'ai_pdf_extract';
    if claimed_job.job_kind = 'ai_pdf_extract' and active_pdf >= 1 then
      continue;
    end if;

    select count(*) into active_blueprint
    from public.ai_provider_jobs where status in ('leased', 'processing') and job_kind = 'blueprint_generate_questions';
    if claimed_job.job_kind = 'blueprint_generate_questions' and active_blueprint >= 2 then
      continue;
    end if;

    select count(*) into active_org
    from public.ai_provider_jobs
    where status in ('leased', 'processing') and organization_id = claimed_job.organization_id;
    if active_org >= 1 then
      continue;
    end if;

    update public.ai_provider_jobs
    set status = 'leased',
        lease_owner = p_lease_owner,
        lease_acquired_at = now(),
        lease_expires_at = now() + make_interval(secs => safe_lease_seconds),
        last_heartbeat_at = now(),
        execution_attempt_count = execution_attempt_count + 1,
        started_at = coalesce(started_at, now()),
        safe_error_code = null,
        safe_message = null,
        retryable = false
    where id = claimed_job.id
      and status in ('queued', 'retry_wait')
    returning * into claimed_job;

    insert into private.ai_provider_job_fairness_state (scope, fairness_key, last_claimed_at)
    values ('organization', claimed_job.organization_id::text, now())
    on conflict (scope, fairness_key)
    do update set last_claimed_at = excluded.last_claimed_at;

    insert into private.ai_provider_job_fairness_state (scope, fairness_key, last_claimed_at)
    values ('user', claimed_job.fairness_key, now())
    on conflict (scope, fairness_key)
    do update set last_claimed_at = excluded.last_claimed_at;

    return next claimed_job;
  end loop;
end;
$$;

create or replace function public.heartbeat_ai_provider_job(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  jwt_role text := coalesce(
    nullif(auth.role()::text, ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
begin
  if jwt_role <> 'service_role' then
    raise exception 'Trusted worker role required.';
  end if;

  update public.ai_provider_jobs
  set status = 'processing',
      last_heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(120, least(coalesce(p_lease_seconds, 900), 1800)))
  where id = p_job_id
    and lease_owner = p_lease_owner
    and status in ('leased', 'processing')
    and lease_expires_at >= now();

  return found;
end;
$$;

create or replace function public.finish_ai_provider_job(
  p_job_id uuid,
  p_lease_owner text,
  p_status text,
  p_safe_result jsonb default '{}'::jsonb,
  p_safe_error_code text default null,
  p_safe_message text default null,
  p_retryable boolean default false,
  p_available_at timestamptz default null,
  p_provider_attempt_count integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  next_status text;
  jwt_role text := coalesce(
    nullif(auth.role()::text, ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
begin
  if jwt_role <> 'service_role' then
    raise exception 'Trusted worker role required.';
  end if;

  if p_status not in ('completed', 'retry_wait', 'failed') then
    raise exception 'Invalid final AI job status.';
  end if;

  next_status := p_status;
  if p_status = 'retry_wait' and p_available_at is null then
    raise exception 'Retry wait requires a future availability time.';
  end if;

  update public.ai_provider_jobs
  set status = next_status,
      safe_result = coalesce(p_safe_result, '{}'::jsonb),
      safe_error_code = nullif(btrim(coalesce(p_safe_error_code, '')), ''),
      safe_message = nullif(left(btrim(coalesce(p_safe_message, '')), 500), ''),
      retryable = coalesce(p_retryable, false),
      available_at = case when next_status = 'retry_wait' then p_available_at else available_at end,
      provider_attempt_count = greatest(provider_attempt_count, greatest(coalesce(p_provider_attempt_count, 0), 0)),
      lease_owner = null,
      lease_acquired_at = null,
      lease_expires_at = null,
      last_heartbeat_at = null,
      completed_at = case when next_status = 'completed' then now() else completed_at end,
      failed_at = case when next_status = 'failed' then now() else failed_at end
  where id = p_job_id
    and lease_owner = p_lease_owner
    and status in ('leased', 'processing')
    and lease_expires_at >= now();

  return found;
end;
$$;
