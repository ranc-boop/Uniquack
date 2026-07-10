-- Question Blueprint Library persistence foundation.
-- Stores reviewed reusable assessment blueprints extracted from AI Parsing observation.

begin;

create table if not exists public.question_blueprints (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null default 'system'
    check (owner_scope in ('system', 'school', 'teacher', 'private')),
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'deprecated')),
  title text not null default '' check (length(title) <= 240),
  taxonomy_targets jsonb not null default '{}'::jsonb
    check (jsonb_typeof(taxonomy_targets) = 'object'),
  question_pattern jsonb not null default '{}'::jsonb
    check (jsonb_typeof(question_pattern) = 'object'),
  required_elements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(required_elements) = 'array'),
  answer_spec_pattern jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answer_spec_pattern) = 'object'),
  distractor_pattern jsonb not null default '[]'::jsonb
    check (jsonb_typeof(distractor_pattern) = 'array'),
  difficulty_profile jsonb not null default '{}'::jsonb
    check (jsonb_typeof(difficulty_profile) = 'object'),
  generation_constraints jsonb not null default '[]'::jsonb
    check (jsonb_typeof(generation_constraints) = 'array'),
  originality_constraints jsonb not null default '[]'::jsonb
    check (jsonb_typeof(originality_constraints) = 'array'),
  source_refs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_refs) = 'object'),
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.question_blueprint_examples (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.question_blueprints(id) on delete cascade,
  source_kind text not null default 'import_batch'
    check (source_kind in ('import_batch', 'question', 'pdf_page', 'image', 'manual', 'unknown')),
  source_ref jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_ref) = 'object'),
  evidence_snippets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_snippets) = 'array'),
  asset_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(asset_refs) = 'array'),
  created_at timestamptz not null default now()
);

create table if not exists public.question_blueprint_review_actions (
  id uuid primary key default gen_random_uuid(),
  action_id text not null unique check (length(btrim(action_id)) > 0),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  blueprint_draft_id text not null check (length(btrim(blueprint_draft_id)) > 0),
  action_kind text not null
    check (action_kind in ('approve_blueprint', 'reject_blueprint', 'edit_blueprint', 'merge_similar_blueprint', 'mark_needs_more_evidence')),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'needs_more_evidence', 'archived')),
  reason text not null default '',
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  draft_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(draft_snapshot) = 'object'),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists question_blueprints_status_scope_idx
  on public.question_blueprints(status, owner_scope, updated_at desc);
create index if not exists question_blueprint_examples_blueprint_idx
  on public.question_blueprint_examples(blueprint_id, created_at desc);
create index if not exists question_blueprint_review_actions_status_idx
  on public.question_blueprint_review_actions(status, updated_at desc);
create index if not exists question_blueprint_review_actions_import_batch_idx
  on public.question_blueprint_review_actions(import_batch_id);

drop trigger if exists question_blueprints_set_updated_at on public.question_blueprints;
create trigger question_blueprints_set_updated_at
before update on public.question_blueprints
for each row execute function private.set_updated_at();

drop trigger if exists question_blueprint_review_actions_set_updated_at on public.question_blueprint_review_actions;
create trigger question_blueprint_review_actions_set_updated_at
before update on public.question_blueprint_review_actions
for each row execute function private.set_updated_at();

alter table public.question_blueprints enable row level security;
alter table public.question_blueprint_examples enable row level security;
alter table public.question_blueprint_review_actions enable row level security;

grant select, insert, update, delete on table
  public.question_blueprints,
  public.question_blueprint_examples,
  public.question_blueprint_review_actions
to authenticated;

drop policy if exists question_blueprints_admin_crud on public.question_blueprints;
create policy question_blueprints_admin_crud
on public.question_blueprints for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists question_blueprint_examples_admin_crud on public.question_blueprint_examples;
create policy question_blueprint_examples_admin_crud
on public.question_blueprint_examples for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists question_blueprint_review_actions_admin_crud on public.question_blueprint_review_actions;
create policy question_blueprint_review_actions_admin_crud
on public.question_blueprint_review_actions for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

comment on table public.question_blueprints is
  'Admin-reviewed reusable question blueprint library entries. These are assessment patterns, not generated questions.';
comment on table public.question_blueprint_review_actions is
  'Admin review queue for blueprint drafts extracted from AI Parsing observation. Actions never generate questions or Review Drafts.';

commit;
