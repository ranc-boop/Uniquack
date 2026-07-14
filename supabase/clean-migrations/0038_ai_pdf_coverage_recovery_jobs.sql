-- Forward-only support for bounded AI PDF coverage-recovery jobs.
-- Recovery reuses the durable provider queue and may only reference an
-- existing AI-PDF import batch plus a safe, server-derived recovery plan.

alter table public.ai_provider_jobs
  drop constraint if exists ai_provider_jobs_job_kind_check;

alter table public.ai_provider_jobs
  add constraint ai_provider_jobs_job_kind_check
  check (job_kind in (
    'ai_pdf_extract',
    'ai_pdf_coverage_recovery',
    'blueprint_generate_questions'
  ));

alter table public.ai_provider_jobs
  drop constraint if exists ai_provider_jobs_resource_kind_check;

alter table public.ai_provider_jobs
  add constraint ai_provider_jobs_resource_kind_check check (
    (job_kind in ('ai_pdf_extract', 'ai_pdf_coverage_recovery') and resource_type = 'import_batch')
    or (job_kind = 'blueprint_generate_questions' and resource_type = 'question_blueprint')
  );

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
  if auth.uid() is null then return false; end if;

  select * into current_profile
  from public.profiles
  where id = auth.uid() and status = 'active';

  if current_profile.id is null
    or current_profile.role not in ('teacher', 'admin', 'super_admin') then
    return false;
  end if;

  if p_target_bank_id is null then
    if not private.is_super_admin() or p_job_kind <> 'ai_pdf_extract' then
      return false;
    end if;
  elsif not private.can_manage_question_bank(p_target_bank_id) then
    return false;
  end if;

  if p_job_kind in ('ai_pdf_extract', 'ai_pdf_coverage_recovery')
    and p_resource_type = 'import_batch' then
    select organization_id into resource_org_id
    from public.import_batches
    where id = p_resource_id
      and source_type = 'ai_pdf'
      and (p_target_bank_id is null or target_bank_id = p_target_bank_id);
  elsif p_job_kind = 'blueprint_generate_questions'
    and p_resource_type = 'question_blueprint' then
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

  if p_job_kind not in (
      'ai_pdf_extract', 'ai_pdf_coverage_recovery', 'blueprint_generate_questions'
    )
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
    from public.import_batches where id = p_resource_id and source_type = 'ai_pdf';
  end if;

  if resolved_organization_id is null then
    raise exception 'Target Library or import organization is not active.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 33));
  perform pg_advisory_xact_lock(hashtextextended(resolved_organization_id::text, 34));

  select * into existing_job from public.ai_provider_jobs
  where job_kind = p_job_kind and resource_type = p_resource_type
    and resource_id = p_resource_id and idempotency_key = normalized_key;
  if existing_job.id is not null then return existing_job; end if;

  select count(*) into queued_by_user from public.ai_provider_jobs
  where created_by = auth.uid() and status in ('queued', 'leased', 'processing', 'retry_wait');
  if queued_by_user >= 5 then
    raise exception 'You already have the maximum number of AI jobs in progress. Wait for one to finish before starting another.';
  end if;

  select count(*) into queued_by_org from public.ai_provider_jobs
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
    case when coalesce(p_payload ->> 'retryGeneration', '') ~ '^[0-9]{1,2}$'
      then least((p_payload ->> 'retryGeneration')::integer, 20) else 0 end,
    coalesce(p_payload, '{}'::jsonb), now()
  ) on conflict (job_kind, resource_type, resource_id, idempotency_key)
  do update set updated_at = public.ai_provider_jobs.updated_at
  returning * into created_job;

  return created_job;
end;
$$;

-- 0034 fixed service-role detection. Preserve that repair while adding a
-- one-at-a-time recovery budget so recovery cannot crowd out normal imports.
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
  active_recovery integer;
  active_blueprint integer;
  active_org integer;
  jwt_role text := coalesce(nullif(auth.role()::text, ''), nullif(current_setting('request.jwt.claim.role', true), ''), '');
  safe_limit integer := greatest(1, least(coalesce(p_limit, 1), 3));
  safe_lease_seconds integer := greatest(120, least(coalesce(p_lease_seconds, 900), 1800));
begin
  if jwt_role <> 'service_role' then raise exception 'Trusted worker role required.'; end if;
  if nullif(btrim(coalesce(p_lease_owner, '')), '') is null or length(p_lease_owner) > 120 then
    raise exception 'A bounded worker lease owner is required.';
  end if;

  update public.ai_provider_jobs
  set status = case when execution_attempt_count >= max_execution_attempts then 'failed' else 'queued' end,
      lease_owner = null, lease_acquired_at = null, lease_expires_at = null, last_heartbeat_at = null,
      safe_error_code = case when execution_attempt_count >= max_execution_attempts then 'lease_expired' else safe_error_code end,
      safe_message = case when execution_attempt_count >= max_execution_attempts then 'This run could not be completed after a worker interruption. Nothing was published or assigned.' else safe_message end,
      failed_at = case when execution_attempt_count >= max_execution_attempts then now() else failed_at end,
      available_at = case when execution_attempt_count >= max_execution_attempts then available_at else now() end
  where status in ('leased', 'processing') and lease_expires_at < now();

  for claimed_job in
    with eligible as (
      select job.* from public.ai_provider_jobs job
      where job.status in ('queued', 'retry_wait') and job.available_at <= now()
        and job.execution_attempt_count < job.max_execution_attempts
    ), user_heads as (
      select eligible.*, row_number() over (partition by eligible.fairness_key order by eligible.priority desc, eligible.created_at asc) as user_rank
      from eligible
    ), organization_heads as (
      select user_head.id, user_head.organization_id, user_head.priority, user_head.created_at,
        row_number() over (partition by user_head.organization_id order by user_state.last_claimed_at nulls first, user_head.priority desc, user_head.created_at asc) as organization_rank
      from user_heads user_head
      left join private.ai_provider_job_fairness_state user_state on user_state.scope = 'user' and user_state.fairness_key = user_head.fairness_key
      where user_head.user_rank = 1
    ), candidates as (
      select organization_head.id,
        (select count(*) from public.ai_provider_jobs active_job where active_job.organization_id = organization_head.organization_id and active_job.status in ('leased', 'processing')) as organization_active_count,
        organization_state.last_claimed_at
      from organization_heads organization_head
      left join private.ai_provider_job_fairness_state organization_state on organization_state.scope = 'organization' and organization_state.fairness_key = organization_head.organization_id::text
      where organization_head.organization_rank = 1
      order by organization_active_count asc, organization_state.last_claimed_at nulls first, organization_head.priority desc, organization_head.created_at asc
      limit safe_limit * 12
    )
    select job.* from public.ai_provider_jobs job join candidates on candidates.id = job.id
    order by candidates.organization_active_count asc, job.priority desc, job.created_at asc
    for update of job skip locked
  loop
    select count(*) into active_global from public.ai_provider_jobs where status in ('leased', 'processing');
    exit when active_global >= 3;
    select count(*) into active_pdf from public.ai_provider_jobs where status in ('leased', 'processing') and job_kind = 'ai_pdf_extract';
    if claimed_job.job_kind = 'ai_pdf_extract' and active_pdf >= 1 then continue; end if;
    select count(*) into active_recovery from public.ai_provider_jobs where status in ('leased', 'processing') and job_kind = 'ai_pdf_coverage_recovery';
    if claimed_job.job_kind = 'ai_pdf_coverage_recovery' and active_recovery >= 1 then continue; end if;
    select count(*) into active_blueprint from public.ai_provider_jobs where status in ('leased', 'processing') and job_kind = 'blueprint_generate_questions';
    if claimed_job.job_kind = 'blueprint_generate_questions' and active_blueprint >= 2 then continue; end if;
    select count(*) into active_org from public.ai_provider_jobs where status in ('leased', 'processing') and organization_id = claimed_job.organization_id;
    if active_org >= 1 then continue; end if;

    update public.ai_provider_jobs set status = 'leased', lease_owner = p_lease_owner,
      lease_acquired_at = now(), lease_expires_at = now() + make_interval(secs => safe_lease_seconds),
      last_heartbeat_at = now(), execution_attempt_count = execution_attempt_count + 1,
      started_at = coalesce(started_at, now()), safe_error_code = null, safe_message = null, retryable = false
    where id = claimed_job.id and status in ('queued', 'retry_wait') returning * into claimed_job;

    insert into private.ai_provider_job_fairness_state (scope, fairness_key, last_claimed_at)
    values ('organization', claimed_job.organization_id::text, now())
    on conflict (scope, fairness_key) do update set last_claimed_at = excluded.last_claimed_at;
    insert into private.ai_provider_job_fairness_state (scope, fairness_key, last_claimed_at)
    values ('user', claimed_job.fairness_key, now())
    on conflict (scope, fairness_key) do update set last_claimed_at = excluded.last_claimed_at;
    return next claimed_job;
  end loop;
end;
$$;

revoke all on function public.enqueue_ai_provider_job(text, text, uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.enqueue_ai_provider_job(text, text, uuid, uuid, uuid, text, jsonb) to authenticated;
revoke all on function public.claim_ai_provider_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_provider_jobs(text, integer, integer) to service_role;
