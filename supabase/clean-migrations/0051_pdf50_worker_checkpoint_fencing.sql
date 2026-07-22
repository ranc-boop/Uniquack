-- PDF50-2: durable worker stages, immutable lease fences, and private
-- provider-result checkpoints. This is forward-only and intentionally leaves
-- historical migrations 0001-0050 unchanged.

alter table public.ai_provider_jobs
  add column if not exists execution_fence_token uuid,
  add column if not exists lease_generation integer not null default 0,
  add column if not exists checkpoint_stage text not null default 'queued',
  add column if not exists checkpoint_version integer not null default 0,
  add column if not exists checkpointed_at timestamptz,
  add column if not exists checkpoint_metadata jsonb not null default '{}'::jsonb,
  add column if not exists persisted_output_lineage jsonb not null default '{}'::jsonb;

alter table public.import_batch_items
  add column if not exists persistence_lineage_key text;

create unique index if not exists import_batch_items_persistence_lineage_key_idx
  on public.import_batch_items(batch_id, persistence_lineage_key)
  where persistence_lineage_key is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_provider_jobs_checkpoint_stage_check'
      and conrelid = 'public.ai_provider_jobs'::regclass
  ) then
    alter table public.ai_provider_jobs
      add constraint ai_provider_jobs_checkpoint_stage_check
      check (checkpoint_stage in (
        'queued',
        'claimed',
        'source_validated',
        'provider_request_started',
        'provider_result_checkpointed',
        'normalized',
        'drafts_persisted',
        'completed'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_provider_jobs_checkpoint_metadata_size_check'
      and conrelid = 'public.ai_provider_jobs'::regclass
  ) then
    alter table public.ai_provider_jobs
      add constraint ai_provider_jobs_checkpoint_metadata_size_check
      check (octet_length(checkpoint_metadata::text) <= 4096);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_provider_jobs_persisted_output_lineage_size_check'
      and conrelid = 'public.ai_provider_jobs'::regclass
  ) then
    alter table public.ai_provider_jobs
      add constraint ai_provider_jobs_persisted_output_lineage_size_check
      check (octet_length(persisted_output_lineage::text) <= 4096);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'import_batch_items_persistence_lineage_key_check'
      and conrelid = 'public.import_batch_items'::regclass
  ) then
    alter table public.import_batch_items
      add constraint import_batch_items_persistence_lineage_key_check
      check (
        persistence_lineage_key is null
        or persistence_lineage_key ~ '^[a-z0-9:_-]{16,240}$'
      );
  end if;
end;
$$;

create table if not exists private.ai_provider_job_provider_result_checkpoints (
  job_id uuid primary key references public.ai_provider_jobs(id) on delete cascade,
  output_contract_version integer not null check (output_contract_version between 1 and 32),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  checkpoint_version integer not null check (checkpoint_version >= 1),
  source_lease_generation integer not null check (source_lease_generation >= 1),
  source_fence_token uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (octet_length(payload::text) <= 4194304)
);

alter table private.ai_provider_job_provider_result_checkpoints enable row level security;
revoke all privileges on table private.ai_provider_job_provider_result_checkpoints from public, anon, authenticated;
grant all privileges on table private.ai_provider_job_provider_result_checkpoints to service_role;

drop trigger if exists ai_provider_job_provider_result_checkpoints_set_updated_at
  on private.ai_provider_job_provider_result_checkpoints;
create trigger ai_provider_job_provider_result_checkpoints_set_updated_at
before update on private.ai_provider_job_provider_result_checkpoints
for each row execute function private.set_updated_at();

create or replace function private.require_ai_provider_job_worker_role()
returns void
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
end;
$$;

create or replace function private.ai_provider_job_checkpoint_stage_rank(p_stage text)
returns integer
language sql
immutable
security definer
set search_path = public, private
as $$
  select case p_stage
    when 'queued' then 0
    when 'claimed' then 1
    when 'source_validated' then 2
    when 'provider_request_started' then 3
    when 'provider_result_checkpointed' then 4
    when 'normalized' then 5
    when 'drafts_persisted' then 6
    when 'completed' then 7
    else -1
  end;
$$;

create or replace function private.set_ai_provider_job_lease_fence()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
begin
  if new.status = 'leased'
    and (
      old.status is distinct from 'leased'
      or new.lease_owner is distinct from old.lease_owner
    ) then
    new.lease_generation := greatest(coalesce(old.lease_generation, 0), 0) + 1;
    new.execution_fence_token := gen_random_uuid();
    new.checkpoint_stage := case
      when coalesce(old.checkpoint_stage, 'queued') = 'queued' then 'claimed'
      else old.checkpoint_stage
    end;
    new.checkpointed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists ai_provider_jobs_assign_lease_fence on public.ai_provider_jobs;
create trigger ai_provider_jobs_assign_lease_fence
before update on public.ai_provider_jobs
for each row execute function private.set_ai_provider_job_lease_fence();

create or replace function public.heartbeat_ai_provider_job_fenced(
  p_job_id uuid,
  p_lease_owner text,
  p_execution_fence_token uuid,
  p_lease_seconds integer default 900
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  safe_lease_seconds integer := greatest(120, least(coalesce(p_lease_seconds, 900), 1800));
begin
  perform private.require_ai_provider_job_worker_role();

  update public.ai_provider_jobs
  set status = 'processing',
      lease_expires_at = now() + make_interval(secs => safe_lease_seconds),
      last_heartbeat_at = now(),
      started_at = coalesce(started_at, now())
  where id = p_job_id
    and lease_owner = p_lease_owner
    and execution_fence_token = p_execution_fence_token
    and status in ('leased', 'processing')
    and lease_expires_at > now();

  if found then
    return 'APPLIED';
  end if;

  return 'STALE_FENCE_REJECTED';
end;
$$;

create or replace function public.checkpoint_ai_provider_job_stage(
  p_job_id uuid,
  p_lease_owner text,
  p_execution_fence_token uuid,
  p_stage text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  locked_job public.ai_provider_jobs%rowtype;
  requested_rank integer := private.ai_provider_job_checkpoint_stage_rank(p_stage);
  current_rank integer;
begin
  perform private.require_ai_provider_job_worker_role();

  if requested_rank < 0 then
    raise exception 'Unsupported checkpoint stage.';
  end if;
  if jsonb_typeof(coalesce(p_safe_metadata, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_safe_metadata, '{}'::jsonb)::text) > 4096 then
    raise exception 'Checkpoint metadata must be a bounded object.';
  end if;

  select * into locked_job
  from public.ai_provider_jobs
  where id = p_job_id
  for update;

  if locked_job.id is null
    or locked_job.lease_owner is distinct from p_lease_owner
    or locked_job.execution_fence_token is distinct from p_execution_fence_token
    or locked_job.status not in ('leased', 'processing')
    or locked_job.lease_expires_at <= now() then
    return 'STALE_FENCE_REJECTED';
  end if;

  current_rank := private.ai_provider_job_checkpoint_stage_rank(locked_job.checkpoint_stage);
  if current_rank >= requested_rank then
    return 'NOOP_ALREADY_CHECKPOINTED';
  end if;

  update public.ai_provider_jobs
  set checkpoint_stage = p_stage,
      checkpoint_version = checkpoint_version + 1,
      checkpointed_at = now(),
      checkpoint_metadata = p_safe_metadata
  where id = locked_job.id;

  return 'APPLIED';
end;
$$;

create or replace function public.begin_ai_provider_job_pdf_processing_fenced(
  p_job_id uuid,
  p_lease_owner text,
  p_execution_fence_token uuid,
  p_source_asset_id uuid,
  p_provider_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  locked_job public.ai_provider_jobs%rowtype;
  locked_batch public.import_batches%rowtype;
begin
  perform private.require_ai_provider_job_worker_role();

  select * into locked_job
  from public.ai_provider_jobs
  where id = p_job_id
  for update;

  if locked_job.id is null
    or locked_job.lease_owner is distinct from p_lease_owner
    or locked_job.execution_fence_token is distinct from p_execution_fence_token
    or locked_job.status not in ('leased', 'processing')
    or locked_job.lease_expires_at <= now()
    or locked_job.job_kind <> 'ai_pdf_extract' then
    return 'STALE_FENCE_REJECTED';
  end if;

  select * into locked_batch
  from public.import_batches
  where id = locked_job.resource_id
    and source_type = 'ai_pdf'
    and target_bank_id is not distinct from locked_job.target_bank_id
  for update;

  if locked_batch.id is null then
    raise exception 'The queued PDF import is no longer available.';
  end if;
  if locked_batch.status = 'imported' then
    return 'NOOP_ALREADY_PERSISTED';
  end if;
  if locked_batch.status not in ('draft', 'failed', 'ready', 'validating') then
    raise exception 'The PDF batch is no longer retryable.';
  end if;

  update public.import_batches
  set status = 'validating',
      summary = coalesce(locked_batch.summary, '{}'::jsonb) || jsonb_build_object(
        'aiPdfImport',
        coalesce(locked_batch.summary -> 'aiPdfImport', '{}'::jsonb) || jsonb_build_object(
          'detail', 'AI processing is underway. You can leave this page.',
          'durableJobId', locked_job.id,
          'jobId', locked_job.id,
          'phase', 'queue_processing',
          'providerProfileId', p_provider_profile_id,
          'queueStatus', 'processing',
          'sourceAssetId', p_source_asset_id,
          'targetBankId', locked_job.target_bank_id,
          'updatedAt', now()
        )
      )
  where id = locked_batch.id;

  return 'APPLIED';
end;
$$;

-- Keep the current lease comparison and every logical draft write in one
-- transaction. The worker never sends a fence token to a requester; this is
-- callable only from the trusted service-role worker.
create or replace function public.persist_ai_provider_job_import_item_fenced(
  p_job_id uuid,
  p_lease_owner text,
  p_execution_fence_token uuid,
  p_item_index integer,
  p_persistence_lineage_key text,
  p_raw_payload jsonb,
  p_normalized_question_json jsonb,
  p_validation_errors jsonb,
  p_source_type text,
  p_visibility text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  locked_job public.ai_provider_jobs%rowtype;
  locked_batch public.import_batches%rowtype;
  batch_item public.import_batch_items%rowtype;
  persisted_question public.questions%rowtype;
  normalized jsonb := coalesce(p_normalized_question_json, 'null'::jsonb);
  question_code_value text;
begin
  perform private.require_ai_provider_job_worker_role();

  if p_source_type <> 'ai_pdf'
    or p_item_index < 0
    or coalesce(p_persistence_lineage_key, '') !~ '^[a-z0-9:_-]{16,240}$'
    or jsonb_typeof(coalesce(p_validation_errors, '[]'::jsonb)) <> 'array'
    or coalesce(p_visibility, '') not in ('private', 'shared', 'organization', 'public') then
    raise exception 'Invalid fenced import item.';
  end if;

  select * into locked_job
  from public.ai_provider_jobs
  where id = p_job_id
  for update;

  if locked_job.id is null
    or locked_job.lease_owner is distinct from p_lease_owner
    or locked_job.execution_fence_token is distinct from p_execution_fence_token
    or locked_job.status not in ('leased', 'processing')
    or locked_job.lease_expires_at <= now()
    or locked_job.job_kind <> 'ai_pdf_extract' then
    return jsonb_build_object('outcome', 'STALE_FENCE_REJECTED');
  end if;

  select * into locked_batch
  from public.import_batches
  where id = locked_job.resource_id
    and source_type = 'ai_pdf'
    and target_bank_id is not distinct from locked_job.target_bank_id
  for update;

  if locked_batch.id is null then
    raise exception 'The queued PDF import is no longer available.';
  end if;
  if locked_batch.status = 'imported' then
    return jsonb_build_object('outcome', 'NOOP_ALREADY_PERSISTED');
  end if;

  insert into public.import_batch_items (
    batch_id,
    item_index,
    raw_payload,
    normalized_question_json,
    persistence_lineage_key,
    validation_errors,
    status
  ) values (
    locked_batch.id,
    p_item_index,
    coalesce(p_raw_payload, '{}'::jsonb),
    case when normalized = 'null'::jsonb then null else normalized end,
    p_persistence_lineage_key,
    p_validation_errors,
    case when normalized = 'null'::jsonb then 'invalid' else 'valid' end
  ) on conflict do nothing;

  select * into batch_item
  from public.import_batch_items
  where batch_id = locked_batch.id
    and persistence_lineage_key = p_persistence_lineage_key
  for update;

  if batch_item.id is null then
    select * into batch_item
    from public.import_batch_items
    where batch_id = locked_batch.id
      and item_index = p_item_index
    for update;

    if batch_item.id is not null and batch_item.persistence_lineage_key is null then
      update public.import_batch_items
      set persistence_lineage_key = p_persistence_lineage_key
      where id = batch_item.id;
    elsif batch_item.id is not null then
      raise exception 'The existing import item has a different persistence lineage.';
    end if;
  end if;

  if batch_item.id is null then
    raise exception 'The fenced import item could not be resolved.';
  end if;
  if normalized = 'null'::jsonb then
    return jsonb_build_object('outcome', 'INVALID');
  end if;
  if batch_item.created_question_id is not null then
    return jsonb_build_object(
      'outcome', 'NOOP_ALREADY_PERSISTED',
      'questionId', batch_item.created_question_id
    );
  end if;

  if jsonb_typeof(normalized) <> 'object'
    or coalesce(normalized ->> 'question_code', '') = ''
    or coalesce(normalized ->> 'title', '') = ''
    or coalesce(normalized ->> 'question_type', '') not in ('mcq', 'fill_blank', 'frq', 'mixed') then
    raise exception 'The normalized import question is invalid.';
  end if;

  question_code_value := normalized ->> 'question_code';
  select * into persisted_question
  from public.questions
  where question_code = question_code_value
  for update;

  if persisted_question.id is null then
    insert into public.questions (
      organization_id,
      question_code,
      title,
      question_type,
      content_html,
      content_source,
      content_source_format,
      solution_html,
      solution_source,
      solution_source_format,
      options,
      answer_spec,
      difficulty_rating,
      owner_bank_id,
      visibility,
      source,
      source_kind,
      status,
      created_by,
      updated_by
    ) values (
      locked_batch.organization_id,
      question_code_value,
      normalized ->> 'title',
      normalized ->> 'question_type',
      coalesce(normalized ->> 'content_html', ''),
      coalesce(normalized ->> 'content_source', ''),
      coalesce(normalized ->> 'content_source_format', 'html'),
      nullif(normalized ->> 'solution_html', ''),
      coalesce(normalized ->> 'solution_source', ''),
      coalesce(normalized ->> 'solution_source_format', 'html'),
      coalesce(normalized -> 'options', '[]'::jsonb),
      coalesce(normalized -> 'answer_spec', '{}'::jsonb),
      greatest(0, least(coalesce((normalized ->> 'difficulty_rating')::integer, 500), 1000)),
      locked_batch.target_bank_id,
      p_visibility,
      format('ai_pdf_import:%s', locked_batch.id),
      'ai_import',
      'draft',
      locked_batch.created_by,
      locked_batch.created_by
    ) returning * into persisted_question;
  elsif persisted_question.source <> format('ai_pdf_import:%s', locked_batch.id)
    or persisted_question.owner_bank_id is distinct from locked_batch.target_bank_id
    or persisted_question.status <> 'draft' then
    raise exception 'The deterministic import identity collides with a non-replayable question.';
  end if;

  insert into public.question_taxonomy_assignments (
    question_id,
    tag_id,
    review_status,
    source
  )
  select persisted_question.id, tag_id, 'pending_review', 'batch_import'
  from jsonb_array_elements_text(coalesce(normalized -> 'tag_ids', '[]'::jsonb)) as tag_id
  on conflict (question_id, tag_id) do nothing;

  update public.import_batch_items
  set status = 'imported',
      created_question_id = persisted_question.id,
      normalized_question_json = normalized,
      validation_errors = p_validation_errors
  where id = batch_item.id;

  return jsonb_build_object(
    'outcome', 'APPLIED',
    'questionId', persisted_question.id
  );
end;
$$;

create or replace function public.finalize_ai_provider_job_import_batch_fenced(
  p_job_id uuid,
  p_lease_owner text,
  p_execution_fence_token uuid,
  p_status text,
  p_summary jsonb,
  p_persisted_output_lineage jsonb
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  locked_job public.ai_provider_jobs%rowtype;
  locked_batch public.import_batches%rowtype;
begin
  perform private.require_ai_provider_job_worker_role();

  if p_status not in ('imported', 'failed')
    or jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_persisted_output_lineage, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_summary, '{}'::jsonb)::text) > 65536
    or octet_length(coalesce(p_persisted_output_lineage, '{}'::jsonb)::text) > 4096 then
    raise exception 'Invalid fenced import finalization.';
  end if;

  select * into locked_job
  from public.ai_provider_jobs
  where id = p_job_id
  for update;

  if locked_job.id is null
    or locked_job.lease_owner is distinct from p_lease_owner
    or locked_job.execution_fence_token is distinct from p_execution_fence_token
    or locked_job.status not in ('leased', 'processing')
    or locked_job.lease_expires_at <= now()
    or locked_job.job_kind <> 'ai_pdf_extract' then
    return 'STALE_FENCE_REJECTED';
  end if;

  select * into locked_batch
  from public.import_batches
  where id = locked_job.resource_id
    and source_type = 'ai_pdf'
    and target_bank_id is not distinct from locked_job.target_bank_id
  for update;

  if locked_batch.id is null then
    raise exception 'The queued PDF import is no longer available.';
  end if;
  if locked_batch.status = 'imported' then
    return 'NOOP_ALREADY_CHECKPOINTED';
  end if;

  update public.import_batches
  set status = p_status,
      summary = p_summary
  where id = locked_batch.id;

  update public.ai_provider_jobs
  set persisted_output_lineage = p_persisted_output_lineage
  where id = locked_job.id;

  return 'APPLIED';
end;
$$;

create or replace function public.checkpoint_ai_provider_job_provider_result(
  p_job_id uuid,
  p_lease_owner text,
  p_execution_fence_token uuid,
  p_output_contract_version integer,
  p_payload jsonb,
  p_payload_sha256 text
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  locked_job public.ai_provider_jobs%rowtype;
  existing_checkpoint private.ai_provider_job_provider_result_checkpoints%rowtype;
  next_checkpoint_version integer;
begin
  perform private.require_ai_provider_job_worker_role();

  if p_output_contract_version not between 1 and 32
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 4194304
    or coalesce(p_payload_sha256, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'Provider result checkpoint is invalid.';
  end if;

  select * into locked_job
  from public.ai_provider_jobs
  where id = p_job_id
  for update;

  if locked_job.id is null
    or locked_job.lease_owner is distinct from p_lease_owner
    or locked_job.execution_fence_token is distinct from p_execution_fence_token
    or locked_job.status not in ('leased', 'processing')
    or locked_job.lease_expires_at <= now() then
    return 'STALE_FENCE_REJECTED';
  end if;

  select * into existing_checkpoint
  from private.ai_provider_job_provider_result_checkpoints
  where job_id = p_job_id
  for update;

  if existing_checkpoint.job_id is not null then
    if existing_checkpoint.output_contract_version = p_output_contract_version
      and existing_checkpoint.payload_sha256 = p_payload_sha256 then
      return 'NOOP_ALREADY_CHECKPOINTED';
    end if;

    -- Sequential PDF extraction appends a new normalized chunk to the same
    -- protected recovery envelope. The row is mutable only by the current
    -- lease fence; an older worker can never overwrite it after a reclaim.
    next_checkpoint_version := locked_job.checkpoint_version + 1;
    update private.ai_provider_job_provider_result_checkpoints
    set output_contract_version = p_output_contract_version,
        payload = p_payload,
        payload_sha256 = p_payload_sha256,
        checkpoint_version = next_checkpoint_version,
        source_lease_generation = locked_job.lease_generation,
        source_fence_token = p_execution_fence_token
    where job_id = p_job_id;

    update public.ai_provider_jobs
    set checkpoint_stage = 'provider_result_checkpointed',
        checkpoint_version = next_checkpoint_version,
        checkpointed_at = now(),
        checkpoint_metadata = jsonb_build_object(
          'outputContractVersion', p_output_contract_version,
          'payloadSha256', p_payload_sha256,
          'recoveryClassification', 'reusable'
        )
    where id = p_job_id;

    return 'APPLIED';
  end if;

  next_checkpoint_version := locked_job.checkpoint_version + 1;
  insert into private.ai_provider_job_provider_result_checkpoints (
    job_id,
    output_contract_version,
    payload,
    payload_sha256,
    checkpoint_version,
    source_lease_generation,
    source_fence_token
  ) values (
    p_job_id,
    p_output_contract_version,
    p_payload,
    p_payload_sha256,
    next_checkpoint_version,
    locked_job.lease_generation,
    p_execution_fence_token
  );

  update public.ai_provider_jobs
  set checkpoint_stage = 'provider_result_checkpointed',
      checkpoint_version = next_checkpoint_version,
      checkpointed_at = now(),
      checkpoint_metadata = jsonb_build_object(
        'outputContractVersion', p_output_contract_version,
        'payloadSha256', p_payload_sha256,
        'recoveryClassification', 'reusable'
      )
  where id = p_job_id;

  return 'APPLIED';
end;
$$;

create or replace function public.read_ai_provider_job_provider_result_checkpoint(
  p_job_id uuid,
  p_lease_owner text,
  p_execution_fence_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  locked_job public.ai_provider_jobs%rowtype;
  checkpoint private.ai_provider_job_provider_result_checkpoints%rowtype;
begin
  perform private.require_ai_provider_job_worker_role();

  select * into locked_job
  from public.ai_provider_jobs
  where id = p_job_id
  for update;

  if locked_job.id is null
    or locked_job.lease_owner is distinct from p_lease_owner
    or locked_job.execution_fence_token is distinct from p_execution_fence_token
    or locked_job.status not in ('leased', 'processing')
    or locked_job.lease_expires_at <= now() then
    return to_jsonb('STALE_FENCE_REJECTED'::text);
  end if;

  select * into checkpoint
  from private.ai_provider_job_provider_result_checkpoints
  where job_id = p_job_id;

  if checkpoint.job_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'checkpointVersion', checkpoint.checkpoint_version,
    'outputContractVersion', checkpoint.output_contract_version,
    'payload', checkpoint.payload,
    'payloadSha256', checkpoint.payload_sha256
  );
end;
$$;

create or replace function public.finish_ai_provider_job_fenced(
  p_job_id uuid,
  p_lease_owner text,
  p_execution_fence_token uuid,
  p_status text,
  p_safe_result jsonb default '{}'::jsonb,
  p_safe_error_code text default null,
  p_safe_message text default null,
  p_retryable boolean default false,
  p_available_at timestamptz default null,
  p_provider_attempt_count integer default 0
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  locked_job public.ai_provider_jobs%rowtype;
begin
  perform private.require_ai_provider_job_worker_role();

  if p_status not in ('completed', 'retry_wait', 'failed')
    or jsonb_typeof(coalesce(p_safe_result, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_safe_result, '{}'::jsonb)::text) > 4096 then
    raise exception 'Invalid fenced worker completion.';
  end if;

  select * into locked_job
  from public.ai_provider_jobs
  where id = p_job_id
  for update;

  if locked_job.id is null
    or locked_job.lease_owner is distinct from p_lease_owner
    or locked_job.execution_fence_token is distinct from p_execution_fence_token
    or locked_job.status not in ('leased', 'processing')
    or locked_job.lease_expires_at <= now() then
    return 'STALE_FENCE_REJECTED';
  end if;

  if p_status = 'completed'
    and private.ai_provider_job_checkpoint_stage_rank(locked_job.checkpoint_stage) <
      private.ai_provider_job_checkpoint_stage_rank('drafts_persisted') then
    raise exception 'Draft persistence checkpoint is required before completion.';
  end if;

  update public.ai_provider_jobs
  set status = p_status,
      safe_result = p_safe_result,
      safe_error_code = p_safe_error_code,
      safe_message = p_safe_message,
      retryable = p_retryable,
      provider_attempt_count = greatest(provider_attempt_count, coalesce(p_provider_attempt_count, 0)),
      available_at = case when p_status = 'retry_wait' then coalesce(p_available_at, now()) else available_at end,
      completed_at = case when p_status = 'completed' then now() else null end,
      failed_at = case when p_status = 'failed' then now() else null end,
      checkpoint_stage = case when p_status = 'completed' then 'completed' else checkpoint_stage end,
      checkpoint_version = case when p_status = 'completed' then checkpoint_version + 1 else checkpoint_version end,
      checkpointed_at = case when p_status = 'completed' then now() else checkpointed_at end,
      lease_owner = null,
      lease_acquired_at = null,
      lease_expires_at = null,
      last_heartbeat_at = null
  where id = locked_job.id;

  return 'APPLIED';
end;
$$;

-- The unfenced worker mutations remain in the historic migrations for audit
-- only. Revoke their service-role entrypoints so the current worker has one
-- required fencing path.
revoke all on function public.heartbeat_ai_provider_job(uuid, text, integer) from service_role;
revoke all on function public.finish_ai_provider_job(uuid, text, text, jsonb, text, text, boolean, timestamptz, integer) from service_role;

revoke all on function public.heartbeat_ai_provider_job_fenced(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.checkpoint_ai_provider_job_stage(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.begin_ai_provider_job_pdf_processing_fenced(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.persist_ai_provider_job_import_item_fenced(uuid, text, uuid, integer, text, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.finalize_ai_provider_job_import_batch_fenced(uuid, text, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.checkpoint_ai_provider_job_provider_result(uuid, text, uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.read_ai_provider_job_provider_result_checkpoint(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_ai_provider_job_fenced(uuid, text, uuid, text, jsonb, text, text, boolean, timestamptz, integer) from public, anon, authenticated;

grant execute on function public.heartbeat_ai_provider_job_fenced(uuid, text, uuid, integer) to service_role;
grant execute on function public.checkpoint_ai_provider_job_stage(uuid, text, uuid, text, jsonb) to service_role;
grant execute on function public.begin_ai_provider_job_pdf_processing_fenced(uuid, text, uuid, uuid, uuid) to service_role;
grant execute on function public.persist_ai_provider_job_import_item_fenced(uuid, text, uuid, integer, text, jsonb, jsonb, jsonb, text, text) to service_role;
grant execute on function public.finalize_ai_provider_job_import_batch_fenced(uuid, text, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.checkpoint_ai_provider_job_provider_result(uuid, text, uuid, integer, jsonb, text) to service_role;
grant execute on function public.read_ai_provider_job_provider_result_checkpoint(uuid, text, uuid) to service_role;
grant execute on function public.finish_ai_provider_job_fenced(uuid, text, uuid, text, jsonb, text, text, boolean, timestamptz, integer) to service_role;

comment on table private.ai_provider_job_provider_result_checkpoints is
  'Service-role-only normalized AI PDF recovery payloads. Never exposed to requesters, telemetry, or worker status APIs.';
comment on column public.ai_provider_jobs.execution_fence_token is
  'Immutable per-lease token. Every current worker mutation must compare this token atomically.';
