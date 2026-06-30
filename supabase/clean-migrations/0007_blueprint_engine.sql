-- Clean Supabase MVP v1 draft migration.
-- Question Blueprint library, review, versions, and calibration readiness.
-- Draft only: review before applying to any database.

create table if not exists public.question_blueprints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_scope text not null default 'school'
    check (owner_scope in ('system', 'school', 'teacher', 'private')),
  owner_id uuid references auth.users(id) on delete set null,
  folder_id uuid,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'needs_more_evidence', 'archived', 'deprecated', 'trashed')),
  title text not null,
  taxonomy_targets jsonb not null default '[]'::jsonb,
  question_pattern jsonb not null default '{}'::jsonb,
  required_elements jsonb not null default '[]'::jsonb,
  answer_spec_pattern jsonb not null default '{}'::jsonb,
  distractor_pattern jsonb not null default '{}'::jsonb,
  difficulty_profile jsonb not null default '{}'::jsonb,
  generation_constraints jsonb not null default '{}'::jsonb,
  originality_constraints jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  generation_ready boolean not null default false,
  generation_readiness text not null default 'uncalibrated'
    check (generation_readiness in ('uncalibrated', 'calibrating', 'generation_ready', 'needs_edit', 'blocked')),
  generation_blocking_reasons jsonb not null default '[]'::jsonb,
  calibration_status text not null default 'not_calibrated'
    check (calibration_status in ('not_calibrated', 'calibrating', 'calibrated', 'failed', 'invalidated')),
  last_calibrated_at timestamptz,
  last_calibration_run_id uuid,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.question_blueprint_folders (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null default 'system'
    check (owner_scope in ('system', 'school', 'teacher', 'private')),
  owner_id uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.question_blueprint_folders(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null check (length(btrim(slug)) between 1 and 140),
  description text check (description is null or length(description) <= 500),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (parent_id is null or parent_id <> id)
);

alter table public.question_blueprints
  add constraint question_blueprints_folder_fk
  foreign key (folder_id) references public.question_blueprint_folders(id) on delete set null;

create table if not exists public.question_blueprint_examples (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.question_blueprints(id) on delete cascade,
  source_kind text not null
    check (source_kind in ('source_reference', 'question', 'review_item', 'manual')),
  source_reference_id uuid references public.source_references(id) on delete set null,
  question_id uuid references public.questions(id) on delete set null,
  review_draft_item_id uuid references public.review_draft_items(id) on delete set null,
  evidence_snippets jsonb not null default '[]'::jsonb,
  asset_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.question_blueprint_review_actions (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid references public.question_blueprints(id) on delete cascade,
  review_draft_item_id uuid references public.review_draft_items(id) on delete set null,
  action_kind text not null
    check (action_kind in ('approve_blueprint', 'reject_blueprint', 'edit_blueprint', 'mark_needs_more_evidence', 'archive', 'deprecate', 'restore')),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'completed', 'rejected', 'reverted')),
  reason text,
  evidence jsonb not null default '[]'::jsonb,
  reviewer_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_blueprint_versions (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.question_blueprints(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  change_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (blueprint_id, version)
);

create table if not exists public.question_blueprint_calibration_runs (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.question_blueprints(id) on delete cascade,
  status text not null default 'planned'
    check (status in ('planned', 'running', 'passed', 'failed', 'skipped')),
  validation_result jsonb not null default '{}'::jsonb,
  readiness_before boolean,
  readiness_after boolean,
  provider_operation_log_id uuid references public.ai_provider_operation_logs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.question_blueprints
  add constraint question_blueprints_last_calibration_fk
  foreign key (last_calibration_run_id) references public.question_blueprint_calibration_runs(id) on delete set null;

alter table public.review_draft_items
  add constraint review_draft_items_created_blueprint_fk
  foreign key (created_blueprint_id) references public.question_blueprints(id) on delete set null;

create index if not exists question_blueprints_org_status_idx
  on public.question_blueprints(organization_id, status, updated_at desc)
  where deleted_at is null;

create index if not exists question_blueprints_folder_idx
  on public.question_blueprints(folder_id, status, updated_at desc)
  where deleted_at is null;

create index if not exists question_blueprint_folders_parent_idx
  on public.question_blueprint_folders(parent_id, sort_order, name)
  where deleted_at is null;

create index if not exists question_blueprint_folders_scope_slug_idx
  on public.question_blueprint_folders(owner_scope, owner_id, slug)
  where deleted_at is null;

create index if not exists question_blueprint_examples_blueprint_idx
  on public.question_blueprint_examples(blueprint_id);

create index if not exists question_blueprint_review_actions_blueprint_idx
  on public.question_blueprint_review_actions(blueprint_id, status);

drop trigger if exists question_blueprints_set_updated_at on public.question_blueprints;
create trigger question_blueprints_set_updated_at
before update on public.question_blueprints
for each row execute function private.set_updated_at();

drop trigger if exists question_blueprint_folders_set_updated_at on public.question_blueprint_folders;
create trigger question_blueprint_folders_set_updated_at
before update on public.question_blueprint_folders
for each row execute function private.set_updated_at();

drop trigger if exists question_blueprint_review_actions_set_updated_at on public.question_blueprint_review_actions;
create trigger question_blueprint_review_actions_set_updated_at
before update on public.question_blueprint_review_actions
for each row execute function private.set_updated_at();

drop trigger if exists question_blueprint_calibration_runs_set_updated_at on public.question_blueprint_calibration_runs;
create trigger question_blueprint_calibration_runs_set_updated_at
before update on public.question_blueprint_calibration_runs
for each row execute function private.set_updated_at();

alter table public.question_blueprints enable row level security;
alter table public.question_blueprint_folders enable row level security;
alter table public.question_blueprint_examples enable row level security;
alter table public.question_blueprint_review_actions enable row level security;
alter table public.question_blueprint_versions enable row level security;
alter table public.question_blueprint_calibration_runs enable row level security;

drop policy if exists question_blueprints_staff_read on public.question_blueprints;
create policy question_blueprints_staff_read
on public.question_blueprints for select
using (
  (owner_scope = 'system' and private.is_teacher_or_admin())
  or (organization_id is not null and private.is_org_staff(organization_id))
  or owner_id = auth.uid()
);

drop policy if exists question_blueprints_staff_write on public.question_blueprints;
create policy question_blueprints_staff_write
on public.question_blueprints for all
using (
  private.is_super_admin()
  or (
    owner_scope <> 'system'
    and (
      (organization_id is not null and private.is_org_staff(organization_id))
      or owner_id = auth.uid()
    )
  )
)
with check (
  private.is_super_admin()
  or (
    owner_scope <> 'system'
    and (
      (organization_id is not null and private.is_org_staff(organization_id))
      or owner_id = auth.uid()
    )
  )
);

drop policy if exists question_blueprint_folders_staff_read on public.question_blueprint_folders;
create policy question_blueprint_folders_staff_read
on public.question_blueprint_folders for select
using (
  (owner_scope = 'system' and private.is_teacher_or_admin())
  or owner_id = auth.uid()
  or private.is_admin()
);

drop policy if exists question_blueprint_folders_staff_write on public.question_blueprint_folders;
create policy question_blueprint_folders_staff_write
on public.question_blueprint_folders for all
using (
  private.is_super_admin()
  or (owner_scope <> 'system' and (owner_id = auth.uid() or private.is_admin()))
)
with check (
  private.is_super_admin()
  or (owner_scope <> 'system' and (owner_id = auth.uid() or private.is_admin()))
);

drop policy if exists question_blueprint_examples_staff_access on public.question_blueprint_examples;
create policy question_blueprint_examples_staff_access
on public.question_blueprint_examples for all
using (
  exists (
    select 1 from public.question_blueprints
    where question_blueprints.id = question_blueprint_examples.blueprint_id
      and (
        question_blueprints.owner_scope = 'system'
        and private.is_teacher_or_admin()
        or (question_blueprints.organization_id is not null and private.is_org_staff(question_blueprints.organization_id))
        or question_blueprints.owner_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1 from public.question_blueprints
    where question_blueprints.id = question_blueprint_examples.blueprint_id
      and (
        private.is_super_admin()
        or (
          question_blueprints.owner_scope <> 'system'
          and (
            (question_blueprints.organization_id is not null and private.is_org_staff(question_blueprints.organization_id))
            or question_blueprints.owner_id = auth.uid()
          )
        )
      )
  )
);

drop policy if exists question_blueprint_review_actions_staff_access on public.question_blueprint_review_actions;
create policy question_blueprint_review_actions_staff_access
on public.question_blueprint_review_actions for all
using (
  (
    blueprint_id is not null
    and exists (
      select 1 from public.question_blueprints
      where question_blueprints.id = question_blueprint_review_actions.blueprint_id
        and (
          (question_blueprints.owner_scope = 'system' and private.is_teacher_or_admin())
          or (question_blueprints.organization_id is not null and private.is_org_staff(question_blueprints.organization_id))
          or question_blueprints.owner_id = auth.uid()
        )
    )
  )
  or (
    review_draft_item_id is not null
    and exists (
      select 1
      from public.review_draft_items item
      join public.review_batches batch on batch.id = item.review_batch_id
      where item.id = question_blueprint_review_actions.review_draft_item_id
        and private.is_org_staff(batch.organization_id)
    )
  )
)
with check (
  (
    blueprint_id is not null
    and exists (
      select 1 from public.question_blueprints
      where question_blueprints.id = question_blueprint_review_actions.blueprint_id
        and (
          private.is_super_admin()
          or (
            question_blueprints.owner_scope <> 'system'
            and (
              (question_blueprints.organization_id is not null and private.is_org_staff(question_blueprints.organization_id))
              or question_blueprints.owner_id = auth.uid()
            )
          )
        )
    )
  )
  or (
    review_draft_item_id is not null
    and exists (
      select 1
      from public.review_draft_items item
      join public.review_batches batch on batch.id = item.review_batch_id
      where item.id = question_blueprint_review_actions.review_draft_item_id
        and private.is_org_staff(batch.organization_id)
    )
  )
);

drop policy if exists question_blueprint_versions_staff_read on public.question_blueprint_versions;
create policy question_blueprint_versions_staff_read
on public.question_blueprint_versions for select
using (
  exists (
    select 1 from public.question_blueprints
    where question_blueprints.id = question_blueprint_versions.blueprint_id
      and (
        (question_blueprints.owner_scope = 'system' and private.is_teacher_or_admin())
        or (question_blueprints.organization_id is not null and private.is_org_staff(question_blueprints.organization_id))
        or question_blueprints.owner_id = auth.uid()
      )
  )
);

drop policy if exists question_blueprint_versions_staff_insert on public.question_blueprint_versions;
create policy question_blueprint_versions_staff_insert
on public.question_blueprint_versions for insert
with check (
  exists (
    select 1 from public.question_blueprints
    where question_blueprints.id = question_blueprint_versions.blueprint_id
      and (
        private.is_super_admin()
        or (
          question_blueprints.owner_scope <> 'system'
          and (
            (question_blueprints.organization_id is not null and private.is_org_staff(question_blueprints.organization_id))
            or question_blueprints.owner_id = auth.uid()
          )
        )
      )
  )
);

drop policy if exists question_blueprint_calibration_runs_staff_access on public.question_blueprint_calibration_runs;
create policy question_blueprint_calibration_runs_staff_access
on public.question_blueprint_calibration_runs for all
using (
  exists (
    select 1 from public.question_blueprints
    where question_blueprints.id = question_blueprint_calibration_runs.blueprint_id
      and (
        (question_blueprints.owner_scope = 'system' and private.is_teacher_or_admin())
        or (question_blueprints.organization_id is not null and private.is_org_staff(question_blueprints.organization_id))
        or question_blueprints.owner_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1 from public.question_blueprints
    where question_blueprints.id = question_blueprint_calibration_runs.blueprint_id
      and (
        private.is_super_admin()
        or (
          question_blueprints.owner_scope <> 'system'
          and (
            (question_blueprints.organization_id is not null and private.is_org_staff(question_blueprints.organization_id))
            or question_blueprints.owner_id = auth.uid()
          )
        )
      )
  )
);
