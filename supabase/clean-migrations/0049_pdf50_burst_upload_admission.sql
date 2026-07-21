-- PDF50-1: private burst reservation and bounded admission into the existing queue.
-- This migration is forward-only. It does not change provider execution limits.

create table if not exists public.ai_pdf_upload_bursts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  target_bank_id uuid not null references public.question_banks(id) on delete restrict,
  client_request_key text not null
    check (length(btrim(client_request_key)) between 1 and 120),
  manifest_hash text not null
    check (manifest_hash ~ '^[a-f0-9]{64}$'),
  parsing_profile text not null default 'standard'
    check (parsing_profile in ('fast', 'standard', 'advanced')),
  provider_profile_id uuid not null references public.ai_provider_profiles(id) on delete restrict,
  status text not null default 'reserved'
    check (status in (
      'reserved', 'uploading', 'admission_wait', 'queued', 'processing',
      'completed', 'partial', 'failed', 'cancelled'
    )),
  item_count integer not null check (item_count between 1 and 50),
  reserved_count integer not null default 0 check (reserved_count between 0 and 50),
  admission_ready_count integer not null default 0 check (admission_ready_count between 0 and 50),
  queued_count integer not null default 0 check (queued_count between 0 and 50),
  processing_count integer not null default 0 check (processing_count between 0 and 50),
  completed_count integer not null default 0 check (completed_count between 0 and 50),
  failed_count integer not null default 0 check (failed_count between 0 and 50),
  cancelled_count integer not null default 0 check (cancelled_count between 0 and 50),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, client_request_key)
);

comment on table public.ai_pdf_upload_bursts is
  'Private upload/admission aggregate for at most 50 PDFs. It stores no PDF bytes, signed URLs, provider credentials, prompts, or raw provider output.';

create table if not exists public.ai_pdf_upload_burst_items (
  id uuid primary key default gen_random_uuid(),
  burst_id uuid not null references public.ai_pdf_upload_bursts(id) on delete restrict,
  item_index integer not null check (item_index between 0 and 49),
  client_item_key text not null
    check (length(btrim(client_item_key)) between 1 and 120),
  original_filename text not null
    check (length(btrim(original_filename)) between 1 and 255),
  expected_size_bytes bigint not null
    check (expected_size_bytes between 1 and 52428800),
  expected_mime_type text not null default 'application/pdf'
    check (expected_mime_type = 'application/pdf'),
  object_path text not null unique
    check (object_path ~ '^ai-pdf-bursts/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  upload_attempt_id uuid not null unique,
  import_batch_id uuid not null unique references public.import_batches(id) on delete restrict,
  source_asset_id uuid not null unique references public.import_batch_assets(id) on delete restrict,
  ai_provider_job_id uuid unique references public.ai_provider_jobs(id) on delete restrict,
  status text not null default 'reserved'
    check (status in (
      'reserved', 'finalizing', 'admission_ready', 'queued', 'processing',
      'completed', 'failed', 'cancelled'
    )),
  verified_size_bytes bigint check (
    verified_size_bytes is null or verified_size_bytes between 1 and 52428800
  ),
  verified_mime_type text check (
    verified_mime_type is null or verified_mime_type = 'application/pdf'
  ),
  page_count integer check (page_count is null or page_count between 1 and 300),
  safe_error_code text check (
    safe_error_code is null or length(btrim(safe_error_code)) between 1 and 80
  ),
  finalized_at timestamptz,
  queued_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (burst_id, item_index),
  unique (burst_id, client_item_key)
);

comment on table public.ai_pdf_upload_burst_items is
  'One immutable reserved PDF path linked to one existing import batch/source asset and at most one initial durable AI PDF job.';

create index if not exists ai_pdf_upload_bursts_bank_created_idx
  on public.ai_pdf_upload_bursts(target_bank_id, created_at desc);

create index if not exists ai_pdf_upload_bursts_org_status_idx
  on public.ai_pdf_upload_bursts(organization_id, status, created_at);

create index if not exists ai_pdf_upload_burst_items_admission_idx
  on public.ai_pdf_upload_burst_items(status, created_at)
  where status = 'admission_ready';

create index if not exists ai_pdf_upload_burst_items_burst_idx
  on public.ai_pdf_upload_burst_items(burst_id, item_index);

drop trigger if exists ai_pdf_upload_bursts_set_updated_at on public.ai_pdf_upload_bursts;
create trigger ai_pdf_upload_bursts_set_updated_at
before update on public.ai_pdf_upload_bursts
for each row execute function private.set_updated_at();

drop trigger if exists ai_pdf_upload_burst_items_set_updated_at on public.ai_pdf_upload_burst_items;
create trigger ai_pdf_upload_burst_items_set_updated_at
before update on public.ai_pdf_upload_burst_items
for each row execute function private.set_updated_at();

create or replace function private.can_actor_manage_ai_pdf_burst_bank(
  p_actor_id uuid,
  p_target_bank_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
set row_security = off
as $$
begin
  return exists (
    select 1
    from public.profiles profile
    join public.question_banks bank on bank.id = p_target_bank_id
    where profile.id = p_actor_id
      and profile.status = 'active'
      and profile.role in ('teacher', 'admin', 'super_admin')
      and bank.status = 'active'
      and exists (
        select 1
        from public.bank_members member
        where member.bank_id = bank.id
          and member.user_id = p_actor_id
          and member.status = 'active'
          and member.role in ('owner', 'editor')
      )
  );
end;
$$;

create or replace function private.protect_ai_pdf_upload_burst_identity()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if row(
    new.id, new.organization_id, new.created_by, new.target_bank_id,
    new.client_request_key, new.manifest_hash, new.parsing_profile,
    new.provider_profile_id, new.item_count, new.created_at
  ) is distinct from row(
    old.id, old.organization_id, old.created_by, old.target_bank_id,
    old.client_request_key, old.manifest_hash, old.parsing_profile,
    old.provider_profile_id, old.item_count, old.created_at
  ) then
    raise exception 'AI PDF burst identity is immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_pdf_upload_bursts_protect_identity on public.ai_pdf_upload_bursts;
create trigger ai_pdf_upload_bursts_protect_identity
before update on public.ai_pdf_upload_bursts
for each row execute function private.protect_ai_pdf_upload_burst_identity();

create or replace function private.protect_ai_pdf_upload_burst_item_identity()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if row(
    new.id, new.burst_id, new.item_index, new.client_item_key,
    new.original_filename, new.expected_size_bytes, new.expected_mime_type,
    new.object_path, new.upload_attempt_id, new.import_batch_id,
    new.source_asset_id, new.created_at
  ) is distinct from row(
    old.id, old.burst_id, old.item_index, old.client_item_key,
    old.original_filename, old.expected_size_bytes, old.expected_mime_type,
    old.object_path, old.upload_attempt_id, old.import_batch_id,
    old.source_asset_id, old.created_at
  ) then
    raise exception 'AI PDF burst item reservation is immutable.';
  end if;

  if old.ai_provider_job_id is not null
    and new.ai_provider_job_id is distinct from old.ai_provider_job_id then
    raise exception 'AI PDF burst item job linkage is immutable.';
  end if;

  if old.status in ('completed', 'cancelled') and new.status <> old.status then
    raise exception 'Terminal AI PDF burst item state is immutable.';
  end if;

  return new;
end;
$$;

drop trigger if exists ai_pdf_upload_burst_items_protect_identity on public.ai_pdf_upload_burst_items;
create trigger ai_pdf_upload_burst_items_protect_identity
before update on public.ai_pdf_upload_burst_items
for each row execute function private.protect_ai_pdf_upload_burst_item_identity();

create or replace function private.refresh_ai_pdf_upload_burst(p_burst_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  burst_row public.ai_pdf_upload_bursts%rowtype;
  reserved_total integer;
  finalizing_total integer;
  admission_total integer;
  queued_total integer;
  processing_total integer;
  completed_total integer;
  failed_total integer;
  cancelled_total integer;
  next_status text;
  terminal_total integer;
begin
  select * into burst_row
  from public.ai_pdf_upload_bursts
  where id = p_burst_id
  for update;

  if burst_row.id is null then return; end if;

  select
    count(*) filter (where status = 'reserved'),
    count(*) filter (where status = 'finalizing'),
    count(*) filter (where status = 'admission_ready'),
    count(*) filter (where status = 'queued'),
    count(*) filter (where status = 'processing'),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'cancelled')
  into
    reserved_total, finalizing_total, admission_total, queued_total,
    processing_total, completed_total, failed_total, cancelled_total
  from public.ai_pdf_upload_burst_items
  where burst_id = p_burst_id;

  terminal_total := completed_total + failed_total + cancelled_total;

  next_status := case
    when cancelled_total = burst_row.item_count then 'cancelled'
    when terminal_total = burst_row.item_count and completed_total = burst_row.item_count
      then 'completed'
    when terminal_total = burst_row.item_count and completed_total > 0
      then 'partial'
    when terminal_total = burst_row.item_count and failed_total > 0
      then 'failed'
    when processing_total > 0 then 'processing'
    when queued_total > 0 then 'queued'
    when admission_total > 0 then 'admission_wait'
    when finalizing_total > 0 then 'uploading'
    when reserved_total = burst_row.item_count then 'reserved'
    else 'uploading'
  end;

  update public.ai_pdf_upload_bursts
  set
    status = next_status,
    reserved_count = reserved_total + finalizing_total,
    admission_ready_count = admission_total,
    queued_count = queued_total,
    processing_count = processing_total,
    completed_count = completed_total,
    failed_count = failed_total,
    cancelled_count = cancelled_total,
    completed_at = case
      when next_status in ('completed', 'partial', 'failed', 'cancelled')
        then coalesce(completed_at, now())
      else null
    end,
    cancelled_at = case
      when next_status = 'cancelled' then coalesce(cancelled_at, now())
      else cancelled_at
    end
  where id = p_burst_id;
end;
$$;

create or replace function private.refresh_ai_pdf_upload_burst_from_item()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.refresh_ai_pdf_upload_burst(coalesce(new.burst_id, old.burst_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists ai_pdf_upload_burst_items_refresh_parent on public.ai_pdf_upload_burst_items;
create trigger ai_pdf_upload_burst_items_refresh_parent
after insert or update of status, ai_provider_job_id, safe_error_code
on public.ai_pdf_upload_burst_items
for each row execute function private.refresh_ai_pdf_upload_burst_from_item();

create or replace function private.sync_ai_pdf_burst_item_from_job()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  update public.ai_pdf_upload_burst_items
  set
    status = case
      when new.status in ('queued', 'retry_wait') then 'queued'
      when new.status in ('leased', 'processing') then 'processing'
      when new.status = 'completed' then 'completed'
      when new.status = 'failed' then 'failed'
      when new.status = 'cancelled' then 'cancelled'
      else status
    end,
    safe_error_code = case
      when new.status = 'failed' then coalesce(new.safe_error_code, 'ai_processing_failed')
      when new.status in ('queued', 'leased', 'processing', 'completed') then null
      else safe_error_code
    end,
    completed_at = case
      when new.status in ('completed', 'failed', 'cancelled')
        then coalesce(completed_at, now())
      else completed_at
    end,
    cancelled_at = case
      when new.status = 'cancelled' then coalesce(cancelled_at, now())
      else cancelled_at
    end
  where ai_provider_job_id = new.id;
  return new;
end;
$$;

drop trigger if exists ai_provider_jobs_sync_pdf_burst_item on public.ai_provider_jobs;
create trigger ai_provider_jobs_sync_pdf_burst_item
after update of status, safe_error_code on public.ai_provider_jobs
for each row execute function private.sync_ai_pdf_burst_item_from_job();

create or replace function public.reserve_ai_pdf_upload_burst(
  p_created_by uuid,
  p_target_bank_id uuid,
  p_client_request_key text,
  p_parsing_profile text,
  p_provider_profile_id uuid,
  p_items jsonb
)
returns table (
  burst_id uuid,
  item_id uuid,
  client_item_key text,
  item_index integer,
  item_status text,
  import_batch_id uuid,
  source_asset_id uuid,
  object_path text,
  upload_attempt_id uuid,
  original_filename text,
  expected_size_bytes bigint,
  expected_mime_type text
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  target_bank public.question_banks%rowtype;
  existing_burst public.ai_pdf_upload_bursts%rowtype;
  created_burst_id uuid := gen_random_uuid();
  manifest_hash_value text;
  item_count_value integer;
  item_value jsonb;
  item_ordinality bigint;
  created_item_id uuid;
  created_batch_id uuid;
  created_asset_id uuid;
  created_upload_attempt_id uuid;
  created_object_path text;
  item_key text;
  item_filename text;
  item_mime text;
  item_size bigint;
begin
  if not private.is_trusted_ai_provider_worker() then
    raise exception 'Trusted server role required.';
  end if;

  if not private.can_actor_manage_ai_pdf_burst_bank(p_created_by, p_target_bank_id) then
    raise exception 'Only active teacher/admin Bank owners or editors can reserve PDF uploads.';
  end if;

  select * into target_bank
  from public.question_banks
  where id = p_target_bank_id and status = 'active';
  if target_bank.id is null then raise exception 'Target Bank is not active.'; end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'PDF burst items must be an array.';
  end if;
  item_count_value := jsonb_array_length(p_items);
  if item_count_value < 1 or item_count_value > 50 then
    raise exception 'A PDF burst must contain between 1 and 50 files.';
  end if;

  if length(btrim(coalesce(p_client_request_key, ''))) not between 1 and 120 then
    raise exception 'A bounded client request key is required.';
  end if;
  if p_parsing_profile not in ('fast', 'standard', 'advanced') then
    raise exception 'Unsupported parsing profile.';
  end if;
  if not exists (
    select 1 from public.ai_provider_profiles profile
    where profile.id = p_provider_profile_id
      and profile.enabled
      and profile.deleted_at is null
      and profile.supports_pdf_input
      and (profile.organization_id is null or profile.organization_id = target_bank.organization_id)
  ) then
    raise exception 'AI PDF parsing is not available for this Bank.';
  end if;

  manifest_hash_value := encode(
    extensions.digest(convert_to(p_items::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended(p_created_by::text || ':' || p_client_request_key, 49));

  select * into existing_burst
  from public.ai_pdf_upload_bursts
  where created_by = p_created_by
    and client_request_key = p_client_request_key
  for update;

  if existing_burst.id is not null then
    if existing_burst.target_bank_id <> p_target_bank_id
      or existing_burst.manifest_hash <> manifest_hash_value
      or existing_burst.item_count <> item_count_value
      or existing_burst.parsing_profile <> p_parsing_profile then
      raise exception 'This request key is already used by a different PDF burst.';
    end if;

    return query
    select
      existing_burst.id, item.id, item.client_item_key, item.item_index,
      item.status,
      item.import_batch_id, item.source_asset_id, item.object_path,
      item.upload_attempt_id, item.original_filename,
      item.expected_size_bytes, item.expected_mime_type
    from public.ai_pdf_upload_burst_items item
    where item.burst_id = existing_burst.id
    order by item.item_index;
    return;
  end if;

  insert into public.ai_pdf_upload_bursts (
    id, organization_id, created_by, target_bank_id, client_request_key,
    manifest_hash, parsing_profile, provider_profile_id, item_count
  ) values (
    created_burst_id, target_bank.organization_id, p_created_by,
    p_target_bank_id, btrim(p_client_request_key), manifest_hash_value,
    p_parsing_profile, p_provider_profile_id, item_count_value
  );

  for item_value, item_ordinality in
    select value, ordinality
    from jsonb_array_elements(p_items) with ordinality
  loop
    item_key := btrim(coalesce(item_value ->> 'clientItemKey', ''));
    item_filename := btrim(coalesce(item_value ->> 'originalFilename', ''));
    item_mime := lower(btrim(coalesce(item_value ->> 'mimeType', '')));
    if coalesce(item_value ->> 'sizeBytes', '') !~ '^[0-9]{1,12}$' then
      raise exception 'Each PDF requires a valid byte size.';
    end if;
    item_size := (item_value ->> 'sizeBytes')::bigint;

    if length(item_key) not between 1 and 120 then
      raise exception 'Each PDF requires a bounded client item key.';
    end if;
    if length(item_filename) not between 1 and 255
      or lower(item_filename) not like '%.pdf' then
      raise exception 'Each item requires a valid PDF filename.';
    end if;
    if item_mime <> 'application/pdf' then
      raise exception 'Only application/pdf uploads are accepted.';
    end if;
    if item_size < 1 or item_size > 52428800 then
      raise exception 'Each PDF must be between 1 byte and 50MB.';
    end if;

    created_item_id := gen_random_uuid();
    created_batch_id := gen_random_uuid();
    created_asset_id := gen_random_uuid();
    created_upload_attempt_id := gen_random_uuid();
    created_object_path := format(
      'ai-pdf-bursts/%s/%s.pdf', created_burst_id, created_item_id
    );

    insert into public.import_batches (
      id, organization_id, source_type, status, created_by, target_bank_id, summary
    ) values (
      created_batch_id, target_bank.organization_id, 'ai_pdf', 'draft',
      p_created_by, p_target_bank_id,
      jsonb_build_object(
        'aiPdfImport', jsonb_build_object(
          'burstId', created_burst_id,
          'burstItemId', created_item_id,
          'fileName', item_filename,
          'importedFrom', 'teacher_bank_ai_pdf_burst',
          'phase', 'upload_reserved',
          'reviewRoute', format('/teacher/banks/%s/review', p_target_bank_id),
          'reviewScope', 'question_bank',
          'targetBankId', p_target_bank_id
        ),
        'importedFrom', 'teacher_bank_ai_pdf_burst',
        'reviewGate', 'bank_review_required',
        'reviewScope', 'question_bank',
        'targetBankId', p_target_bank_id
      )
    );

    insert into public.import_batch_assets (
      id, batch_id, asset_role, object_path, mime_type, size_bytes,
      original_filename, status, metadata, created_by
    ) values (
      created_asset_id, created_batch_id, 'source_pdf', created_object_path,
      'application/pdf', item_size, item_filename, 'pending',
      jsonb_build_object(
        'burstId', created_burst_id,
        'burstItemId', created_item_id,
        'targetBankId', p_target_bank_id,
        'uploadAttemptId', created_upload_attempt_id,
        'uploadReservedAt', now(),
        'uploadState', 'reserved'
      ),
      p_created_by
    );

    insert into public.ai_pdf_upload_burst_items (
      id, burst_id, item_index, client_item_key, original_filename,
      expected_size_bytes, expected_mime_type, object_path, upload_attempt_id,
      import_batch_id, source_asset_id
    ) values (
      created_item_id, created_burst_id, (item_ordinality - 1)::integer,
      item_key, item_filename, item_size, 'application/pdf', created_object_path,
      created_upload_attempt_id, created_batch_id, created_asset_id
    );
  end loop;

  perform private.refresh_ai_pdf_upload_burst(created_burst_id);

  return query
  select
    created_burst_id, item.id, item.client_item_key, item.item_index,
    item.status,
    item.import_batch_id, item.source_asset_id, item.object_path,
    item.upload_attempt_id, item.original_filename,
    item.expected_size_bytes, item.expected_mime_type
  from public.ai_pdf_upload_burst_items item
  where item.burst_id = created_burst_id
  order by item.item_index;
end;
$$;

create or replace function public.release_ai_pdf_burst_admission_jobs(
  p_burst_id uuid default null,
  p_limit integer default 4
)
returns table (released_count integer, waiting_count integer)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  selected_burst public.ai_pdf_upload_bursts%rowtype;
  candidate record;
  existing_job_id uuid;
  created_job_id uuid;
  normalized_limit integer := greatest(1, least(coalesce(p_limit, 4), 12));
  user_outstanding integer;
  organization_outstanding integer;
  released_total integer := 0;
  waiting_total integer := 0;
  job_key text;
begin
  if not private.is_trusted_ai_provider_worker() then
    raise exception 'Trusted worker role required.';
  end if;

  select burst.* into selected_burst
  from public.ai_pdf_upload_bursts burst
  join public.ai_pdf_upload_burst_items item on item.burst_id = burst.id
  where item.status = 'admission_ready'
    and (p_burst_id is null or burst.id = p_burst_id)
    and burst.status <> 'cancelled'
  order by item.created_at, item.item_index
  limit 1
  for update of burst;

  if selected_burst.id is null then
    return query select 0, 0;
    return;
  end if;

  -- Match the existing enqueue lock order. One pump handles one creator/org
  -- burst, so concurrent finalize and worker calls cannot race past 5/12.
  perform pg_advisory_xact_lock(hashtextextended(selected_burst.created_by::text, 33));
  perform pg_advisory_xact_lock(hashtextextended(selected_burst.organization_id::text, 34));

  for candidate in
    select
      item.id as item_id,
      item.import_batch_id,
      item.source_asset_id,
      burst.id as burst_id,
      burst.organization_id,
      burst.created_by,
      burst.target_bank_id,
      burst.provider_profile_id
    from public.ai_pdf_upload_burst_items item
    join public.ai_pdf_upload_bursts burst on burst.id = item.burst_id
    join public.question_banks bank on bank.id = burst.target_bank_id
    join public.profiles profile on profile.id = burst.created_by
    where item.status = 'admission_ready'
      and burst.id = selected_burst.id
      and burst.status <> 'cancelled'
      and bank.status = 'active'
      and profile.status = 'active'
    order by item.created_at, item.item_index
    for update of item skip locked
    limit normalized_limit
  loop
    select count(*) into user_outstanding
    from public.ai_provider_jobs
    where created_by = candidate.created_by
      and status in ('queued', 'leased', 'processing', 'retry_wait');

    select count(*) into organization_outstanding
    from public.ai_provider_jobs
    where organization_id = candidate.organization_id
      and status in ('queued', 'leased', 'processing', 'retry_wait');

    if user_outstanding >= 5 or organization_outstanding >= 12 then
      waiting_total := waiting_total + 1;
      continue;
    end if;

    job_key := format(
      'ai_pdf_extract:%s:%s:v1:retry:0',
      candidate.import_batch_id,
      candidate.source_asset_id
    );

    select id into existing_job_id
    from public.ai_provider_jobs
    where job_kind = 'ai_pdf_extract'
      and resource_type = 'import_batch'
      and resource_id = candidate.import_batch_id
      and idempotency_key = job_key;

    if existing_job_id is null then
      begin
        insert into public.ai_provider_jobs (
          organization_id, created_by, job_kind, resource_type, resource_id,
          target_bank_id, provider_profile_id, status, priority, fairness_key,
          idempotency_key, retry_generation, payload, available_at
        ) values (
          candidate.organization_id, candidate.created_by, 'ai_pdf_extract',
          'import_batch', candidate.import_batch_id, candidate.target_bank_id,
          candidate.provider_profile_id, 'queued', 0,
          concat(candidate.organization_id::text, ':', candidate.created_by::text),
          job_key, 0,
          jsonb_build_object(
            'operationVersion', 1,
            'sourceAssetId', candidate.source_asset_id
          ),
          now()
        )
        on conflict (job_kind, resource_type, resource_id, idempotency_key)
        do update set updated_at = public.ai_provider_jobs.updated_at
        returning id into created_job_id;
      exception when others then
        update public.ai_pdf_upload_burst_items
        set safe_error_code = 'admission_temporarily_blocked'
        where id = candidate.item_id and status = 'admission_ready';
        waiting_total := waiting_total + 1;
        continue;
      end;
    else
      created_job_id := existing_job_id;
    end if;

    update public.ai_pdf_upload_burst_items
    set
      ai_provider_job_id = created_job_id,
      status = 'queued',
      safe_error_code = null,
      queued_at = coalesce(queued_at, now())
    where id = candidate.item_id
      and status = 'admission_ready';

    if found then released_total := released_total + 1; end if;
  end loop;

  select count(*) into waiting_total
  from public.ai_pdf_upload_burst_items item
  where item.status = 'admission_ready'
    and (p_burst_id is null or item.burst_id = p_burst_id);

  return query select released_total, waiting_total;
end;
$$;

create or replace function public.cancel_ai_pdf_upload_burst_items(
  p_burst_id uuid,
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  burst_row public.ai_pdf_upload_bursts%rowtype;
  cancelled_total integer := 0;
  queued_cancelled_total integer := 0;
  item_cancelled_total integer := 0;
begin
  if not private.is_trusted_ai_provider_worker() then
    raise exception 'Trusted server role required.';
  end if;

  select * into burst_row
  from public.ai_pdf_upload_bursts
  where id = p_burst_id
  for update;
  if burst_row.id is null then raise exception 'PDF burst was not found.'; end if;

  if not private.can_actor_manage_ai_pdf_burst_bank(p_actor_id, burst_row.target_bank_id) then
    raise exception 'Only the Bank owner or editor can cancel unstarted uploads.';
  end if;

  update public.ai_provider_jobs job
  set
    status = 'cancelled',
    cancellation_requested_at = coalesce(cancellation_requested_at, now()),
    cancelled_at = coalesce(cancelled_at, now()),
    safe_error_code = 'cancelled_before_processing',
    safe_message = 'This queued PDF was cancelled before processing.',
    retryable = false
  where job.id in (
    select item.ai_provider_job_id
    from public.ai_pdf_upload_burst_items item
    where item.burst_id = p_burst_id
      and item.status = 'queued'
      and item.ai_provider_job_id is not null
  )
    and job.status in ('queued', 'retry_wait');
  get diagnostics queued_cancelled_total = row_count;

  update public.ai_pdf_upload_burst_items
  set
    status = 'cancelled',
    safe_error_code = 'cancelled_before_processing',
    cancelled_at = coalesce(cancelled_at, now())
  where burst_id = p_burst_id
    and status in ('reserved', 'admission_ready');
  get diagnostics item_cancelled_total = row_count;
  cancelled_total := queued_cancelled_total + item_cancelled_total;

  perform private.refresh_ai_pdf_upload_burst(p_burst_id);
  return cancelled_total;
end;
$$;

alter table public.ai_pdf_upload_bursts enable row level security;
alter table public.ai_pdf_upload_burst_items enable row level security;

drop policy if exists ai_pdf_upload_bursts_manager_read on public.ai_pdf_upload_bursts;
create policy ai_pdf_upload_bursts_manager_read
on public.ai_pdf_upload_bursts for select
to authenticated
using (
  private.can_actor_manage_ai_pdf_burst_bank(auth.uid(), target_bank_id)
);

drop policy if exists ai_pdf_upload_burst_items_manager_read on public.ai_pdf_upload_burst_items;
create policy ai_pdf_upload_burst_items_manager_read
on public.ai_pdf_upload_burst_items for select
to authenticated
using (
  exists (
    select 1
    from public.ai_pdf_upload_bursts burst
    where burst.id = ai_pdf_upload_burst_items.burst_id
      and private.can_actor_manage_ai_pdf_burst_bank(
        auth.uid(), burst.target_bank_id
      )
  )
);

revoke all on table public.ai_pdf_upload_bursts from public, anon, authenticated;
revoke all on table public.ai_pdf_upload_burst_items from public, anon, authenticated;
grant select on table public.ai_pdf_upload_bursts to authenticated;
grant select on table public.ai_pdf_upload_burst_items to authenticated;
grant all on table public.ai_pdf_upload_bursts to service_role;
grant all on table public.ai_pdf_upload_burst_items to service_role;

revoke all on function public.reserve_ai_pdf_upload_burst(uuid, uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_pdf_upload_burst(uuid, uuid, text, text, uuid, jsonb)
  to service_role;

revoke all on function public.release_ai_pdf_burst_admission_jobs(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.release_ai_pdf_burst_admission_jobs(uuid, integer)
  to service_role;

revoke all on function public.cancel_ai_pdf_upload_burst_items(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_ai_pdf_upload_burst_items(uuid, uuid)
  to service_role;

-- Adopt a compatible private source bucket when this migration upgrades a
-- continuously used clean database. Never recreate the bucket or its objects.
do $$
declare
  existing_bucket storage.buckets%rowtype;
  canonical_file_size_limit constant bigint := 52428800;
  canonical_mime_types constant text[] := array['application/pdf'];
begin
  select * into existing_bucket
  from storage.buckets
  where id = 'ai-import-sources'
  for update;

  if not found then
    insert into storage.buckets (
      id, name, public, file_size_limit, allowed_mime_types
    ) values (
      'ai-import-sources', 'ai-import-sources', false,
      canonical_file_size_limit, canonical_mime_types
    );
    return;
  end if;

  if existing_bucket.name is distinct from 'ai-import-sources'
    or existing_bucket.public is distinct from false then
    raise exception 'AI import source bucket is incompatible with the required private PDF contract.';
  end if;

  -- MIME restrictions are an exact compatibility requirement. Broad or unset
  -- policies may serve another workload, so 0049 refuses to repurpose them.
  if existing_bucket.allowed_mime_types is distinct from canonical_mime_types then
    raise exception 'AI import source bucket is incompatible with the required private PDF contract.';
  end if;

  if existing_bucket.file_size_limit is null
    or existing_bucket.file_size_limit > canonical_file_size_limit then
    -- Tightening an unset or larger cap never broadens access or deletes data.
    update storage.buckets
    set file_size_limit = canonical_file_size_limit
    where id = 'ai-import-sources';
  elsif existing_bucket.file_size_limit <= 0 then
    raise exception 'AI import source bucket is incompatible with the required private PDF contract.';
  end if;
  -- A smaller existing cap is stricter and is intentionally preserved.
end;
$$;

create or replace function private.can_manage_ai_import_source_object(p_object_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, storage
set row_security = off
as $$
begin
  return exists (
    select 1
    from public.import_batch_assets asset
    join public.import_batches batch on batch.id = asset.batch_id
    where asset.object_path = p_object_path
      and asset.asset_role = 'source_pdf'
      and asset.status in ('pending', 'ready', 'failed', 'archived')
      and (
        (
          batch.target_bank_id is not null
          and private.can_actor_manage_ai_pdf_burst_bank(
            auth.uid(), batch.target_bank_id
          )
        )
        or (
          batch.target_bank_id is null
          and private.is_admin()
        )
      )
  );
end;
$$;

create or replace function private.can_upload_reserved_ai_import_source_object(
  p_object_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, storage
set row_security = off
as $$
begin
  return exists (
    select 1
    from public.import_batch_assets asset
    join public.import_batches batch on batch.id = asset.batch_id
    where asset.object_path = p_object_path
      and asset.asset_role = 'source_pdf'
      and asset.status = 'pending'
      and asset.created_by = auth.uid()
      and batch.created_by = auth.uid()
      and (
        (
          batch.target_bank_id is not null
          and private.can_actor_manage_ai_pdf_burst_bank(
            auth.uid(), batch.target_bank_id
          )
          and exists (
            select 1
            from public.ai_pdf_upload_burst_items item
            where item.source_asset_id = asset.id
              and item.object_path = p_object_path
              and item.status in ('reserved', 'finalizing')
          )
        )
        or (
          batch.target_bank_id is null
          and private.is_admin()
        )
      )
  );
end;
$$;

-- Existing question-assets Storage policies share storage.objects with this
-- bucket. Keep their authorization unchanged for question-assets while moving
-- question/bank lookups behind security-definer helpers so unrelated buckets do
-- not require caller table grants merely to plan/evaluate Storage policies.
create or replace function private.can_write_question_asset_storage_object(
  p_bucket_id text,
  p_object_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, storage
set row_security = off
as $$
begin
  if p_bucket_id <> 'question-assets' then
    return false;
  end if;

  return exists (
    select 1
    from public.question_assets qa
    join public.questions q on q.id = qa.question_id
    where qa.storage_bucket = p_bucket_id
      and qa.storage_path = p_object_path
      and (
        qa.created_by = auth.uid()
        or private.is_org_staff(q.organization_id)
      )
  );
end;
$$;

create or replace function private.can_read_question_asset_storage_object(
  p_bucket_id text,
  p_object_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, storage
set row_security = off
as $$
begin
  if p_bucket_id <> 'question-assets' then
    return false;
  end if;

  return private.is_admin()
    or exists (
      select 1
      from public.question_assets qa
      join public.questions q on q.id = qa.question_id
      where qa.storage_bucket = p_bucket_id
        and qa.storage_path = p_object_path
        and private.is_org_staff(q.organization_id)
    );
end;
$$;

revoke all on function private.can_write_question_asset_storage_object(text, text)
  from public, anon, authenticated;
revoke all on function private.can_read_question_asset_storage_object(text, text)
  from public, anon, authenticated;
grant execute on function private.can_write_question_asset_storage_object(text, text)
  to authenticated;
grant execute on function private.can_read_question_asset_storage_object(text, text)
  to authenticated;

drop policy if exists question_assets_staff_upload on storage.objects;
create policy question_assets_staff_upload
on storage.objects for insert
to authenticated
with check (private.can_write_question_asset_storage_object(bucket_id, name));

drop policy if exists question_assets_staff_list on storage.objects;
create policy question_assets_staff_list
on storage.objects for select
to authenticated
using (private.can_read_question_asset_storage_object(bucket_id, name));

drop policy if exists question_assets_staff_delete on storage.objects;
create policy question_assets_staff_delete
on storage.objects for delete
to authenticated
using (private.can_write_question_asset_storage_object(bucket_id, name));

-- These pre-0049 policies are known arbitrary-path admin grants. They are the
-- only legacy policy names this migration reconciles; all other policies stay
-- untouched and an incompatible bucket aborts before this point.
do $$
declare
  unexpected_source_policy_count integer;
begin
  select count(*) into unexpected_source_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and (
      policyname like 'ai_import_sources_%'
      or coalesce(qual, '') ilike '%ai-import-sources%'
      or coalesce(with_check, '') ilike '%ai-import-sources%'
    )
    and policyname not in (
      'ai_import_sources_admin_upload',
      'ai_import_sources_admin_read',
      'ai_import_sources_admin_delete',
      'ai_import_sources_reserved_upload',
      'ai_import_sources_manager_read',
      'ai_import_sources_manager_delete'
    );

  if unexpected_source_policy_count > 0 then
    raise exception 'AI import source storage policies require review before PDF50 migration.';
  end if;
end;
$$;

drop policy if exists ai_import_sources_admin_upload on storage.objects;
drop policy if exists ai_import_sources_admin_read on storage.objects;
drop policy if exists ai_import_sources_admin_delete on storage.objects;

drop policy if exists ai_import_sources_reserved_upload on storage.objects;
create policy ai_import_sources_reserved_upload
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'ai-import-sources'
  and private.can_upload_reserved_ai_import_source_object(name)
);

drop policy if exists ai_import_sources_manager_read on storage.objects;
create policy ai_import_sources_manager_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'ai-import-sources'
  and private.can_manage_ai_import_source_object(name)
);

drop policy if exists ai_import_sources_manager_delete on storage.objects;
create policy ai_import_sources_manager_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'ai-import-sources'
  and private.can_manage_ai_import_source_object(name)
);
