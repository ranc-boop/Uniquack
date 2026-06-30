-- Clean Supabase MVP v1 draft migration.
-- AI Parsing normalized job, packet, extraction, and error state.
-- Draft only: review before applying to any database.

create table if not exists public.ai_import_jobs (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid references public.import_jobs(id) on delete set null,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  provider_profile_id uuid references public.ai_provider_profiles(id) on delete set null,
  mode text not null
    check (mode in ('question_extraction', 'blueprint_observation', 'asset_analysis')),
  source_strategy text not null
    check (source_strategy in ('native_pdf', 'file_reference', 'page_images', 'text_packet', 'gemini_native_pdf', 'openai_file', 'mock')),
  status text not null default 'created'
    check (status in ('created', 'running', 'partial', 'completed', 'failed', 'canceled')),
  phase text,
  page_count integer check (page_count is null or page_count >= 0),
  summary jsonb not null default '{}'::jsonb,
  warning_count integer not null default 0 check (warning_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.ai_import_assets (
  id uuid primary key default gen_random_uuid(),
  ai_import_job_id uuid not null references public.ai_import_jobs(id) on delete cascade,
  source_file_id uuid references public.source_files(id) on delete set null,
  source_page_id uuid references public.source_pages(id) on delete set null,
  asset_role text not null
    check (asset_role in ('source_pdf', 'page_image', 'supporting_asset')),
  page_number integer check (page_number is null or page_number > 0),
  status text not null default 'ready'
    check (status in ('pending', 'ready', 'failed', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_import_preanalysis (
  id uuid primary key default gen_random_uuid(),
  ai_import_job_id uuid not null references public.ai_import_jobs(id) on delete cascade,
  status text not null default 'planned'
    check (status in ('planned', 'running', 'completed', 'failed', 'skipped')),
  page_count integer check (page_count is null or page_count >= 0),
  bounded_page_previews jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error_summary text check (error_summary is null or length(error_summary) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_import_packet_plans (
  id uuid primary key default gen_random_uuid(),
  ai_import_job_id uuid not null references public.ai_import_jobs(id) on delete cascade,
  strategy text not null
    check (strategy in ('single_pass', 'sequential_pages', 'text_packets')),
  status text not null default 'planned'
    check (status in ('planned', 'running', 'completed', 'failed', 'skipped')),
  packet_count integer not null default 0 check (packet_count >= 0),
  page_count integer check (page_count is null or page_count >= 0),
  warnings jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_import_packets (
  id uuid primary key default gen_random_uuid(),
  packet_plan_id uuid not null references public.ai_import_packet_plans(id) on delete cascade,
  ai_import_job_id uuid not null references public.ai_import_jobs(id) on delete cascade,
  packet_index integer not null check (packet_index >= 0),
  page_start integer check (page_start is null or page_start > 0),
  page_end integer check (page_end is null or page_end >= page_start),
  status text not null default 'planned'
    check (status in ('planned', 'running', 'completed', 'failed', 'skipped')),
  retry_count integer not null default 0 check (retry_count >= 0),
  provider_operation_log_id uuid references public.ai_provider_operation_logs(id) on delete set null,
  warning_count integer not null default 0 check (warning_count >= 0),
  warnings jsonb not null default '[]'::jsonb,
  redacted_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (packet_plan_id, packet_index)
);

create table if not exists public.ai_import_extractions (
  id uuid primary key default gen_random_uuid(),
  ai_import_job_id uuid not null references public.ai_import_jobs(id) on delete cascade,
  packet_id uuid references public.ai_import_packets(id) on delete set null,
  extraction_kind text not null
    check (extraction_kind in ('question_candidates', 'blueprint_observations', 'source_observations')),
  status text not null default 'created'
    check (status in ('created', 'validated', 'handed_to_review', 'failed', 'discarded')),
  normalized_payload jsonb not null default '{}'::jsonb,
  source_reference_ids uuid[] not null default '{}'::uuid[],
  review_batch_id uuid,
  review_draft_item_id uuid,
  validation_warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_import_errors (
  id uuid primary key default gen_random_uuid(),
  ai_import_job_id uuid not null references public.ai_import_jobs(id) on delete cascade,
  packet_id uuid references public.ai_import_packets(id) on delete set null,
  provider_operation_log_id uuid references public.ai_provider_operation_logs(id) on delete set null,
  error_kind text not null,
  redacted_message text not null check (length(redacted_message) <= 1000),
  retryable boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.ai_import_extractions is
  'Normalized bounded extraction output for review handoff. Do not store provider bodies or unbounded document text here.';

create index if not exists ai_import_jobs_org_status_idx
  on public.ai_import_jobs(organization_id, status, created_at desc);

create index if not exists ai_import_jobs_import_batch_idx
  on public.ai_import_jobs(import_batch_id)
  where import_batch_id is not null;

create index if not exists ai_import_assets_job_idx
  on public.ai_import_assets(ai_import_job_id, asset_role);

create index if not exists ai_import_packets_job_status_idx
  on public.ai_import_packets(ai_import_job_id, status, packet_index);

create index if not exists ai_import_extractions_job_kind_idx
  on public.ai_import_extractions(ai_import_job_id, extraction_kind, status);

create index if not exists ai_import_errors_job_idx
  on public.ai_import_errors(ai_import_job_id, created_at desc);

drop trigger if exists ai_import_jobs_set_updated_at on public.ai_import_jobs;
create trigger ai_import_jobs_set_updated_at
before update on public.ai_import_jobs
for each row execute function private.set_updated_at();

drop trigger if exists ai_import_assets_set_updated_at on public.ai_import_assets;
create trigger ai_import_assets_set_updated_at
before update on public.ai_import_assets
for each row execute function private.set_updated_at();

drop trigger if exists ai_import_preanalysis_set_updated_at on public.ai_import_preanalysis;
create trigger ai_import_preanalysis_set_updated_at
before update on public.ai_import_preanalysis
for each row execute function private.set_updated_at();

drop trigger if exists ai_import_packet_plans_set_updated_at on public.ai_import_packet_plans;
create trigger ai_import_packet_plans_set_updated_at
before update on public.ai_import_packet_plans
for each row execute function private.set_updated_at();

drop trigger if exists ai_import_packets_set_updated_at on public.ai_import_packets;
create trigger ai_import_packets_set_updated_at
before update on public.ai_import_packets
for each row execute function private.set_updated_at();

drop trigger if exists ai_import_extractions_set_updated_at on public.ai_import_extractions;
create trigger ai_import_extractions_set_updated_at
before update on public.ai_import_extractions
for each row execute function private.set_updated_at();

alter table public.ai_import_jobs enable row level security;
alter table public.ai_import_assets enable row level security;
alter table public.ai_import_preanalysis enable row level security;
alter table public.ai_import_packet_plans enable row level security;
alter table public.ai_import_packets enable row level security;
alter table public.ai_import_extractions enable row level security;
alter table public.ai_import_errors enable row level security;

drop policy if exists ai_import_jobs_staff_read on public.ai_import_jobs;
create policy ai_import_jobs_staff_read
on public.ai_import_jobs for select
using (private.is_org_staff(organization_id));

drop policy if exists ai_import_jobs_staff_write on public.ai_import_jobs;
create policy ai_import_jobs_staff_write
on public.ai_import_jobs for all
using (private.is_org_staff(organization_id))
with check (private.is_org_staff(organization_id));

drop policy if exists ai_import_assets_staff_access on public.ai_import_assets;
create policy ai_import_assets_staff_access
on public.ai_import_assets for all
using (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_assets.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
)
with check (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_assets.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
);

drop policy if exists ai_import_preanalysis_staff_access on public.ai_import_preanalysis;
create policy ai_import_preanalysis_staff_access
on public.ai_import_preanalysis for all
using (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_preanalysis.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
)
with check (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_preanalysis.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
);

drop policy if exists ai_import_packet_plans_staff_access on public.ai_import_packet_plans;
create policy ai_import_packet_plans_staff_access
on public.ai_import_packet_plans for all
using (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_packet_plans.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
)
with check (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_packet_plans.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
);

drop policy if exists ai_import_packets_staff_access on public.ai_import_packets;
create policy ai_import_packets_staff_access
on public.ai_import_packets for all
using (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_packets.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
)
with check (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_packets.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
);

drop policy if exists ai_import_extractions_staff_access on public.ai_import_extractions;
create policy ai_import_extractions_staff_access
on public.ai_import_extractions for all
using (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_extractions.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
)
with check (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_extractions.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
);

drop policy if exists ai_import_errors_staff_read on public.ai_import_errors;
create policy ai_import_errors_staff_read
on public.ai_import_errors for select
using (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_errors.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
);

drop policy if exists ai_import_errors_staff_insert on public.ai_import_errors;
create policy ai_import_errors_staff_insert
on public.ai_import_errors for insert
with check (
  exists (
    select 1 from public.ai_import_jobs
    where ai_import_jobs.id = ai_import_errors.ai_import_job_id
      and private.is_org_staff(ai_import_jobs.organization_id)
  )
);
