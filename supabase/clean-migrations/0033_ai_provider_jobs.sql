-- Durable multi-user queue for provider-backed AI PDF extraction and
-- teacher Blueprint Review Draft generation. This migration is forward-only.
-- Apply to the clean Supabase project only after reviewing the companion guide.

create table if not exists public.ai_provider_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  job_kind text not null check (job_kind in ('ai_pdf_extract', 'blueprint_generate_questions')),
  resource_type text not null check (resource_type in ('import_batch', 'question_blueprint')),
  resource_id uuid not null,
  target_bank_id uuid references public.question_banks(id) on delete restrict,
  provider_profile_id uuid references public.ai_provider_profiles(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'leased', 'processing', 'retry_wait', 'completed', 'failed', 'cancelled')),
  priority integer not null default 0 check (priority between 0 and 10),
  fairness_key text not null check (length(btrim(fairness_key)) between 1 and 160),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 240),
  retry_generation integer not null default 0 check (retry_generation >= 0 and retry_generation <= 20),
  payload jsonb not null default '{}'::jsonb,
  safe_result jsonb not null default '{}'::jsonb,
  safe_error_code text,
  safe_message text,
  retryable boolean not null default false,
  provider_attempt_count integer not null default 0 check (provider_attempt_count >= 0),
  execution_attempt_count integer not null default 0 check (execution_attempt_count >= 0),
  max_execution_attempts integer not null default 4 check (max_execution_attempts between 1 and 4),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  cancellation_requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_provider_jobs_resource_kind_check check (
    (job_kind = 'ai_pdf_extract' and resource_type = 'import_batch')
    or (job_kind = 'blueprint_generate_questions' and resource_type = 'question_blueprint')
  ),
  constraint ai_provider_jobs_lease_check check (
    (status in ('leased', 'processing') and lease_owner is not null and lease_expires_at is not null)
    or (status not in ('leased', 'processing'))
  ),
  unique (job_kind, resource_type, resource_id, idempotency_key)
);

comment on table public.ai_provider_jobs is
  'Durable, server-executed AI work. Payload and results contain only bounded resource references and safe status metadata; never provider credentials, PDF bytes, signed URLs, prompts, or raw provider responses.';

create table if not exists private.ai_provider_job_fairness_state (
  scope text not null check (scope in ('organization', 'user')),
  fairness_key text not null check (length(btrim(fairness_key)) between 1 and 160),
  last_claimed_at timestamptz not null default now(),
  primary key (scope, fairness_key)
);

comment on table private.ai_provider_job_fairness_state is
  'Trusted-worker-only scheduling state. It supports bounded round-robin fairness and contains no content, credentials, or user-visible diagnostics.';

create index if not exists ai_provider_jobs_claim_idx
  on public.ai_provider_jobs(status, available_at, priority desc, created_at)
  where status in ('queued', 'retry_wait');

create index if not exists ai_provider_jobs_org_status_idx
  on public.ai_provider_jobs(organization_id, status, created_at desc);

create index if not exists ai_provider_jobs_creator_status_idx
  on public.ai_provider_jobs(created_by, status, created_at desc);

create index if not exists ai_provider_jobs_resource_idx
  on public.ai_provider_jobs(resource_type, resource_id, created_at desc);

drop trigger if exists ai_provider_jobs_set_updated_at on public.ai_provider_jobs;
create trigger ai_provider_jobs_set_updated_at
before update on public.ai_provider_jobs
for each row execute function private.set_updated_at();

create or replace function private.can_read_ai_provider_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.ai_provider_jobs job
    join public.profiles profile on profile.id = auth.uid()
    where job.id = target_job_id
      and profile.status = 'active'
      and profile.role in ('teacher', 'admin', 'super_admin')
      and (
        private.is_super_admin()
        or (
          job.target_bank_id is not null
          and private.can_manage_question_bank(job.target_bank_id)
        )
        or (
          job.job_kind = 'blueprint_generate_questions'
          and private.can_manage_question_blueprint(job.resource_id)
        )
        or (
          job.target_bank_id is null
          and job.created_by = auth.uid()
          and private.is_super_admin()
        )
      )
  );
$$;

create or replace function private.can_enqueue_ai_provider_job(
  p_job_kind text,
  p_resource_type text,
  p_resource_id uuid,
  p_target_bank_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  current_profile public.profiles%rowtype;
  resource_org_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select * into current_profile
  from public.profiles
  where id = auth.uid() and status = 'active';

  if current_profile.id is null or current_profile.role not in ('teacher', 'admin', 'super_admin') then
    return false;
  end if;

  if p_target_bank_id is null then
    if not private.is_super_admin() or p_job_kind <> 'ai_pdf_extract' then
      return false;
    end if;
  elsif not private.can_manage_question_bank(p_target_bank_id) then
    return false;
  end if;

  if p_job_kind = 'ai_pdf_extract' and p_resource_type = 'import_batch' then
    select organization_id into resource_org_id
    from public.import_batches
    where id = p_resource_id
      and source_type = 'ai_pdf'
      and (p_target_bank_id is null or target_bank_id = p_target_bank_id);
  elsif p_job_kind = 'blueprint_generate_questions' and p_resource_type = 'question_blueprint' then
    select organization_id into resource_org_id
    from public.question_blueprints
    where id = p_resource_id
      and generation_ready = true
      and (
        source_bank_id = p_target_bank_id
        or exists (
          select 1 from public.bank_blueprints link
          where link.blueprint_id = p_resource_id
            and link.bank_id = p_target_bank_id
            and link.status = 'active'
        )
      );
  else
    return false;
  end if;

  return resource_org_id is not null;
end;
$$;

create or replace function public.enqueue_ai_provider_job(
  p_job_kind text,
  p_resource_type text,
  p_resource_id uuid,
  p_target_bank_id uuid,
  p_provider_profile_id uuid default null,
  p_idempotency_key text default null,
  p_payload jsonb default '{}'::jsonb
)
returns public.ai_provider_jobs
language plpgsql
security definer
set search_path = public, private
as $$
declare
  normalized_key text;
  resolved_organization_id uuid;
  existing_job public.ai_provider_jobs%rowtype;
  created_job public.ai_provider_jobs%rowtype;
  queued_by_user integer;
  queued_by_org integer;
begin
  if not private.can_enqueue_ai_provider_job(
    p_job_kind, p_resource_type, p_resource_id, p_target_bank_id
  ) then
    raise exception 'You are not allowed to queue AI work for this resource.';
  end if;

  if p_job_kind not in ('ai_pdf_extract', 'blueprint_generate_questions')
    or p_resource_type not in ('import_batch', 'question_blueprint') then
    raise exception 'Unsupported AI job kind.';
  end if;

  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 4096 then
    raise exception 'AI job payload must be a small object of safe execution references.';
  end if;

  normalized_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  if normalized_key is null or length(normalized_key) > 240 then
    raise exception 'A bounded server-generated AI job idempotency key is required.';
  end if;

  if p_target_bank_id is not null then
    select organization_id into resolved_organization_id
    from public.question_banks where id = p_target_bank_id and status = 'active';
  elsif p_job_kind = 'ai_pdf_extract' then
    select organization_id into resolved_organization_id
    from public.import_batches
    where id = p_resource_id and source_type = 'ai_pdf';
  end if;

  if resolved_organization_id is null then
    raise exception 'Target Library or import organization is not active.';
  end if;

  -- Serialize per-user and per-organization enqueue counts so rapid browser
  -- clicks cannot race past the closed-beta queue bounds.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 33));
  perform pg_advisory_xact_lock(hashtextextended(resolved_organization_id::text, 34));

  select * into existing_job
  from public.ai_provider_jobs
  where job_kind = p_job_kind
    and resource_type = p_resource_type
    and resource_id = p_resource_id
    and idempotency_key = normalized_key;

  if existing_job.id is not null then
    return existing_job;
  end if;

  select count(*) into queued_by_user
  from public.ai_provider_jobs
  where created_by = auth.uid()
    and status in ('queued', 'leased', 'processing', 'retry_wait');

  if queued_by_user >= 5 then
    raise exception 'You already have the maximum number of AI jobs in progress. Wait for one to finish before starting another.';
  end if;

  select count(*) into queued_by_org
  from public.ai_provider_jobs
  where organization_id = resolved_organization_id
    and status in ('queued', 'leased', 'processing', 'retry_wait');

  if queued_by_org >= 12 then
    raise exception 'This organization has reached its temporary AI queue limit. Try again after current work finishes.';
  end if;

  insert into public.ai_provider_jobs (
    organization_id, created_by, job_kind, resource_type, resource_id,
    target_bank_id, provider_profile_id, status, fairness_key, idempotency_key,
    retry_generation, payload, available_at
  ) values (
    resolved_organization_id, auth.uid(), p_job_kind, p_resource_type, p_resource_id,
    p_target_bank_id, p_provider_profile_id, 'queued',
    concat(resolved_organization_id::text, ':', auth.uid()::text), normalized_key,
    case
      when coalesce(p_payload ->> 'retryGeneration', '') ~ '^[0-9]{1,2}$'
        then least((p_payload ->> 'retryGeneration')::integer, 20)
      else 0
    end,
    coalesce(p_payload, '{}'::jsonb), now()
  )
  on conflict (job_kind, resource_type, resource_id, idempotency_key)
  do update set updated_at = public.ai_provider_jobs.updated_at
  returning * into created_job;

  return created_job;
end;
$$;

-- The claim function is service-role-only. It locks an eligible row before
-- changing state, reclaims expired leases, and favors organizations with fewer
-- active jobs before oldest work within that group.
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
  safe_limit integer := greatest(1, least(coalesce(p_limit, 1), 3));
  safe_lease_seconds integer := greatest(120, least(coalesce(p_lease_seconds, 900), 1800));
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role' then
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
      -- Inspect more than one candidate so a saturated job kind does not
      -- leave a different eligible kind idle for this worker invocation.
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
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role' then
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
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role' then
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

create or replace function public.cancel_ai_provider_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.can_read_ai_provider_job(p_job_id) then
    raise exception 'You are not allowed to cancel this AI job.';
  end if;

  update public.ai_provider_jobs
  set status = 'cancelled',
      cancelled_at = now(),
      safe_message = 'This queued run was cancelled. Your source and target Library were preserved.',
      retryable = false
  where id = p_job_id
    and status in ('queued', 'retry_wait');

  return found;
end;
$$;

alter table public.ai_provider_jobs enable row level security;
alter table private.ai_provider_job_fairness_state enable row level security;

drop policy if exists ai_provider_jobs_teacher_read on public.ai_provider_jobs;
create policy ai_provider_jobs_teacher_read
on public.ai_provider_jobs for select
using (private.can_read_ai_provider_job(id));

-- No insert/update/delete policies: browser clients cannot create, claim,
-- complete, or mutate queue rows. Authenticated enqueue/cancel occurs only
-- through narrowly scoped security-definer RPCs.

revoke all on function public.enqueue_ai_provider_job(text, text, uuid, uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.claim_ai_provider_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_ai_provider_job(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.finish_ai_provider_job(uuid, text, text, jsonb, text, text, boolean, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.cancel_ai_provider_job(uuid) from public, anon;

grant execute on function public.enqueue_ai_provider_job(text, text, uuid, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.cancel_ai_provider_job(uuid) to authenticated;
grant execute on function public.claim_ai_provider_jobs(text, integer, integer) to service_role;
grant execute on function public.heartbeat_ai_provider_job(uuid, text, integer) to service_role;
grant execute on function public.finish_ai_provider_job(uuid, text, text, jsonb, text, text, boolean, timestamptz, integer) to service_role;
