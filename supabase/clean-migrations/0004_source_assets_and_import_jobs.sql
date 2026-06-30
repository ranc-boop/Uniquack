-- Clean Supabase MVP v1 draft migration.
-- Private source assets and import job ownership.
-- Draft only: review before applying to any database.

create table if not exists public.source_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  file_name text not null,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  checksum text,
  storage_bucket text not null,
  storage_path text not null,
  visibility text not null default 'private'
    check (visibility in ('private', 'organization', 'public_asset')),
  page_count integer check (page_count is null or page_count >= 0),
  status text not null default 'uploaded'
    check (status in ('uploading', 'uploaded', 'processing', 'ready', 'failed', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.source_pages (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references public.source_files(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  image_storage_bucket text,
  image_storage_path text,
  preview_text text,
  preview_char_count integer not null default 0 check (preview_char_count >= 0 and preview_char_count <= 4000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_file_id, page_number)
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  job_kind text not null
    check (job_kind in ('package', 'asset', 'ai_parsing', 'course_builder')),
  status text not null default 'created'
    check (status in ('created', 'running', 'partial', 'completed', 'failed', 'canceled')),
  mode text,
  source_strategy text,
  summary jsonb not null default '{}'::jsonb,
  warning_count integer not null default 0 check (warning_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.import_job_assets (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  source_file_id uuid references public.source_files(id) on delete set null,
  asset_role text not null
    check (asset_role in ('source', 'page_image', 'supporting_asset', 'generated_asset')),
  status text not null default 'ready'
    check (status in ('pending', 'ready', 'failed', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_file_id uuid references public.source_files(id) on delete set null,
  source_page_id uuid references public.source_pages(id) on delete set null,
  ref_kind text not null
    check (ref_kind in ('file', 'page', 'region', 'text_span', 'asset')),
  page_number integer check (page_number is null or page_number > 0),
  region jsonb not null default '{}'::jsonb,
  bounded_text text,
  bounded_text_char_count integer not null default 0 check (bounded_text_char_count >= 0 and bounded_text_char_count <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.source_pages
  add constraint source_pages_preview_text_bounded
  check (preview_text is null or length(preview_text) <= 4000);

alter table public.source_references
  add constraint source_references_bounded_text_bounded
  check (bounded_text is null or length(bounded_text) <= 4000);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  source_type text not null
    check (source_type in ('manual_json', 'manual_csv', 'ai_pdf', 'ai_image', 'ai_word', 'package', 'course_builder')),
  source_file_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'validating', 'ready', 'imported', 'partial', 'failed', 'canceled')),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.import_batches is
  'Current app-facing import batch contract. Clean normalized import_jobs may link here during the app cutover.';

create table if not exists public.import_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  item_index integer not null check (item_index >= 0),
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_question_json jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  status text not null default 'invalid'
    check (status in ('valid', 'invalid', 'imported', 'skipped')),
  created_question_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, item_index)
);

create table if not exists public.import_batch_assets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_file_id uuid references public.source_files(id) on delete set null,
  asset_role text not null
    check (asset_role in ('source_pdf', 'ai_crop_candidate', 'unmatched', 'other', 'source', 'page_image', 'supporting_asset', 'generated_asset')),
  object_path text not null unique check (length(btrim(object_path)) > 0),
  mime_type text not null check (length(btrim(mime_type)) > 0),
  size_bytes bigint not null check (size_bytes > 0),
  original_filename text not null check (length(btrim(original_filename)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed', 'deleted', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.source_files is
  'Private uploaded source file metadata. Actual file bytes belong in storage.';

comment on table public.source_references is
  'Bounded source evidence references for review, questions, and blueprints.';

create index if not exists source_files_org_status_idx
  on public.source_files(organization_id, status, created_at desc)
  where deleted_at is null;

create index if not exists source_pages_file_page_idx
  on public.source_pages(source_file_id, page_number);

create index if not exists import_jobs_org_kind_status_idx
  on public.import_jobs(organization_id, job_kind, status, created_at desc);

create index if not exists import_batches_created_by_created_at_idx
  on public.import_batches(created_by, created_at desc);

create index if not exists import_batches_org_status_idx
  on public.import_batches(organization_id, status, created_at desc);

create index if not exists import_batch_items_batch_id_idx
  on public.import_batch_items(batch_id, item_index);

create index if not exists import_batch_assets_batch_id_idx
  on public.import_batch_assets(batch_id);

create index if not exists import_batch_assets_role_status_idx
  on public.import_batch_assets(asset_role, status);

create index if not exists import_job_assets_job_idx
  on public.import_job_assets(import_job_id, asset_role);

create index if not exists source_references_org_file_idx
  on public.source_references(organization_id, source_file_id);

drop trigger if exists source_files_set_updated_at on public.source_files;
create trigger source_files_set_updated_at
before update on public.source_files
for each row execute function private.set_updated_at();

drop trigger if exists source_pages_set_updated_at on public.source_pages;
create trigger source_pages_set_updated_at
before update on public.source_pages
for each row execute function private.set_updated_at();

drop trigger if exists import_jobs_set_updated_at on public.import_jobs;
create trigger import_jobs_set_updated_at
before update on public.import_jobs
for each row execute function private.set_updated_at();

drop trigger if exists import_batches_set_updated_at on public.import_batches;
create trigger import_batches_set_updated_at
before update on public.import_batches
for each row execute function private.set_updated_at();

drop trigger if exists import_batch_items_set_updated_at on public.import_batch_items;
create trigger import_batch_items_set_updated_at
before update on public.import_batch_items
for each row execute function private.set_updated_at();

drop trigger if exists import_batch_assets_set_updated_at on public.import_batch_assets;
create trigger import_batch_assets_set_updated_at
before update on public.import_batch_assets
for each row execute function private.set_updated_at();

drop trigger if exists import_job_assets_set_updated_at on public.import_job_assets;
create trigger import_job_assets_set_updated_at
before update on public.import_job_assets
for each row execute function private.set_updated_at();

alter table public.source_files enable row level security;
alter table public.source_pages enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_batch_items enable row level security;
alter table public.import_batch_assets enable row level security;
alter table public.import_job_assets enable row level security;
alter table public.source_references enable row level security;

drop policy if exists source_files_staff_read on public.source_files;
create policy source_files_staff_read
on public.source_files for select
using (private.is_org_staff(organization_id));

drop policy if exists source_files_staff_write on public.source_files;
create policy source_files_staff_write
on public.source_files for all
using (private.is_org_staff(organization_id))
with check (private.is_org_staff(organization_id));

drop policy if exists source_pages_staff_read on public.source_pages;
create policy source_pages_staff_read
on public.source_pages for select
using (
  exists (
    select 1 from public.source_files
    where source_files.id = source_pages.source_file_id
      and private.is_org_staff(source_files.organization_id)
  )
);

drop policy if exists source_pages_staff_write on public.source_pages;
create policy source_pages_staff_write
on public.source_pages for all
using (
  exists (
    select 1 from public.source_files
    where source_files.id = source_pages.source_file_id
      and private.is_org_staff(source_files.organization_id)
  )
)
with check (
  exists (
    select 1 from public.source_files
    where source_files.id = source_pages.source_file_id
      and private.is_org_staff(source_files.organization_id)
  )
);

drop policy if exists import_jobs_staff_read on public.import_jobs;
create policy import_jobs_staff_read
on public.import_jobs for select
using (private.is_org_staff(organization_id));

drop policy if exists import_jobs_staff_write on public.import_jobs;
create policy import_jobs_staff_write
on public.import_jobs for all
using (private.is_org_staff(organization_id))
with check (private.is_org_staff(organization_id));

drop policy if exists import_batches_staff_or_owner_access on public.import_batches;
create policy import_batches_staff_or_owner_access
on public.import_batches for all
using (
  private.is_super_admin()
  or created_by = auth.uid()
  or (organization_id is not null and private.is_org_staff(organization_id))
)
with check (
  private.is_super_admin()
  or created_by = auth.uid()
  or (organization_id is not null and private.is_org_staff(organization_id))
);

drop policy if exists import_batch_items_batch_access on public.import_batch_items;
create policy import_batch_items_batch_access
on public.import_batch_items for all
using (
  exists (
    select 1 from public.import_batches
    where import_batches.id = import_batch_items.batch_id
      and (
        private.is_super_admin()
        or import_batches.created_by = auth.uid()
        or (import_batches.organization_id is not null and private.is_org_staff(import_batches.organization_id))
      )
  )
)
with check (
  exists (
    select 1 from public.import_batches
    where import_batches.id = import_batch_items.batch_id
      and (
        private.is_super_admin()
        or import_batches.created_by = auth.uid()
        or (import_batches.organization_id is not null and private.is_org_staff(import_batches.organization_id))
      )
  )
);

drop policy if exists import_batch_assets_batch_access on public.import_batch_assets;
create policy import_batch_assets_batch_access
on public.import_batch_assets for all
using (
  exists (
    select 1 from public.import_batches
    where import_batches.id = import_batch_assets.batch_id
      and (
        private.is_super_admin()
        or import_batches.created_by = auth.uid()
        or (import_batches.organization_id is not null and private.is_org_staff(import_batches.organization_id))
      )
  )
)
with check (
  exists (
    select 1 from public.import_batches
    where import_batches.id = import_batch_assets.batch_id
      and (
        private.is_super_admin()
        or import_batches.created_by = auth.uid()
        or (import_batches.organization_id is not null and private.is_org_staff(import_batches.organization_id))
      )
  )
);

drop policy if exists import_job_assets_staff_read on public.import_job_assets;
create policy import_job_assets_staff_read
on public.import_job_assets for select
using (
  exists (
    select 1 from public.import_jobs
    where import_jobs.id = import_job_assets.import_job_id
      and private.is_org_staff(import_jobs.organization_id)
  )
);

drop policy if exists import_job_assets_staff_write on public.import_job_assets;
create policy import_job_assets_staff_write
on public.import_job_assets for all
using (
  exists (
    select 1 from public.import_jobs
    where import_jobs.id = import_job_assets.import_job_id
      and private.is_org_staff(import_jobs.organization_id)
  )
)
with check (
  exists (
    select 1 from public.import_jobs
    where import_jobs.id = import_job_assets.import_job_id
      and private.is_org_staff(import_jobs.organization_id)
  )
);

drop policy if exists source_references_staff_read on public.source_references;
create policy source_references_staff_read
on public.source_references for select
using (private.is_org_staff(organization_id));

drop policy if exists source_references_staff_write on public.source_references;
create policy source_references_staff_write
on public.source_references for all
using (private.is_org_staff(organization_id))
with check (private.is_org_staff(organization_id));
