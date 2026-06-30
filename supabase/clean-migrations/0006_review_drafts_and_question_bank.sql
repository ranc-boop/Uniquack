-- Clean Supabase MVP v1 draft migration.
-- Review Drafts are the human-governance boundary before Question Bank approval.
-- Draft only: review before applying to any database.

create table if not exists public.review_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  source_kind text not null
    check (source_kind in ('ai_import', 'package_import', 'blueprint_generation', 'course_builder', 'manual')),
  source_record_id uuid,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'in_review', 'approved', 'partial', 'rejected', 'archived')),
  title text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_draft_items (
  id uuid primary key default gen_random_uuid(),
  review_batch_id uuid not null references public.review_batches(id) on delete cascade,
  item_kind text not null
    check (item_kind in ('question', 'blueprint', 'taxonomy_change', 'course_plan')),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'needs_more_evidence', 'archived')),
  draft_payload jsonb not null default '{}'::jsonb,
  validation_warnings jsonb not null default '[]'::jsonb,
  source_extraction_id uuid references public.ai_import_extractions(id) on delete set null,
  created_question_id uuid,
  created_blueprint_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_actions (
  id uuid primary key default gen_random_uuid(),
  review_batch_id uuid references public.review_batches(id) on delete cascade,
  review_draft_item_id uuid references public.review_draft_items(id) on delete cascade,
  action_kind text not null
    check (action_kind in ('approve', 'reject', 'edit', 'request_more_evidence', 'archive')),
  status text not null default 'completed'
    check (status in ('planned', 'completed', 'reverted')),
  reason text,
  evidence jsonb not null default '[]'::jsonb,
  reviewer_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.review_source_references (
  id uuid primary key default gen_random_uuid(),
  review_batch_id uuid references public.review_batches(id) on delete cascade,
  review_draft_item_id uuid references public.review_draft_items(id) on delete cascade,
  source_reference_id uuid not null references public.source_references(id) on delete restrict,
  evidence_role text not null default 'supporting'
    check (evidence_role in ('primary', 'supporting', 'warning', 'source_example')),
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  question_code text not null check (length(btrim(question_code)) > 0),
  title text not null,
  question_type text not null
    check (question_type in ('mcq', 'fill_blank', 'frq', 'mixed')),
  content_html text not null,
  content_source text not null default '',
  content_source_format text not null default 'html'
    check (content_source_format in ('html', 'markdown_latex', 'plain_text')),
  solution_html text,
  solution_source text not null default '',
  solution_source_format text not null default 'html'
    check (solution_source_format in ('html', 'markdown_latex', 'plain_text')),
  options jsonb not null default '[]'::jsonb,
  answer_spec jsonb not null default '{}'::jsonb,
  difficulty_rating integer not null default 500
    check (difficulty_rating >= 0 and difficulty_rating <= 1000),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived', 'deprecated')),
  source text,
  source_kind text not null default 'manual'
    check (source_kind in ('manual', 'review_draft', 'package_import', 'ai_import', 'blueprint_generation')),
  source_review_item_id uuid references public.review_draft_items(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (question_code),
  unique (organization_id, question_code),
  constraint questions_ai_or_blueprint_requires_review_lineage
    check (
      source_kind not in ('ai_import', 'blueprint_generation')
      or source_review_item_id is not null
      or status <> 'published'
    )
);

create table if not exists public.question_rubric_steps (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  label text,
  content_html text not null,
  max_points numeric(6, 2) not null default 0 check (max_points >= 0),
  linked_taxonomy_tag_id text references public.taxonomy_nodes(tag_id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, step_order)
);

create table if not exists public.question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  asset_kind text not null
    check (asset_kind in ('image', 'pdf', 'video', 'other')),
  storage_bucket text not null,
  storage_path text not null,
  label text,
  alt_text text,
  display_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_source_files (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.questions(id) on delete set null,
  object_path text not null unique check (length(btrim(object_path)) > 0),
  original_filename text not null check (length(btrim(original_filename)) > 0),
  mime_type text not null check (mime_type = 'application/pdf'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'deleted')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.question_source_files is
  'Current app-facing private source PDF metadata for question editing and AI import source ownership.';

create table if not exists public.question_source_references (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  source_reference_id uuid not null references public.source_references(id) on delete restrict,
  evidence_role text not null default 'supporting'
    check (evidence_role in ('primary', 'supporting', 'answer', 'asset')),
  created_at timestamptz not null default now(),
  unique (question_id, source_reference_id, evidence_role)
);

create table if not exists public.question_status_events (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.question_taxonomy_assignments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  tag_id text not null references public.taxonomy_nodes(tag_id) on delete restrict,
  source text not null default 'review'
    check (source in ('review', 'manual', 'ai_suggestion', 'import', 'batch_import', 'blueprint', 'review_action', 'teacher_course_blueprint_generation')),
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  review_status text not null default 'approved'
    check (review_status in ('pending_review', 'approved', 'rejected', 'needs_review', 'archived')),
  evidence jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, tag_id)
);

create or replace function private.validate_question_taxonomy_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not exists (
    select 1
    from public.taxonomy_nodes
    where tag_id = new.tag_id
      and status = 'active'
      and is_assignable = true
      and node_kind = 'tag'
  ) then
    raise exception 'taxonomy node must be an active assignable leaf';
  end if;

  return new;
end;
$$;

drop trigger if exists question_taxonomy_assignments_validate_node
on public.question_taxonomy_assignments;
create trigger question_taxonomy_assignments_validate_node
before insert or update of tag_id on public.question_taxonomy_assignments
for each row execute function private.validate_question_taxonomy_assignment();

alter table public.review_draft_items
  add constraint review_draft_items_created_question_fk
  foreign key (created_question_id) references public.questions(id) on delete set null;

alter table public.import_batch_items
  add constraint import_batch_items_created_question_fk
  foreign key (created_question_id) references public.questions(id) on delete set null;

alter table public.ai_import_extractions
  add constraint ai_import_extractions_review_batch_fk
  foreign key (review_batch_id) references public.review_batches(id) on delete set null,
  add constraint ai_import_extractions_review_item_fk
  foreign key (review_draft_item_id) references public.review_draft_items(id) on delete set null;

create index if not exists review_batches_org_status_idx
  on public.review_batches(organization_id, status, created_at desc);

create index if not exists review_draft_items_batch_status_idx
  on public.review_draft_items(review_batch_id, status);

create index if not exists questions_org_status_idx
  on public.questions(organization_id, status, created_at desc)
  where deleted_at is null;

create index if not exists question_source_files_question_id_idx
  on public.question_source_files(question_id);

create index if not exists question_taxonomy_assignments_question_idx
  on public.question_taxonomy_assignments(question_id, review_status);

create index if not exists question_taxonomy_assignments_tag_idx
  on public.question_taxonomy_assignments(tag_id, review_status);

drop trigger if exists review_batches_set_updated_at on public.review_batches;
create trigger review_batches_set_updated_at
before update on public.review_batches
for each row execute function private.set_updated_at();

drop trigger if exists review_draft_items_set_updated_at on public.review_draft_items;
create trigger review_draft_items_set_updated_at
before update on public.review_draft_items
for each row execute function private.set_updated_at();

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at
before update on public.questions
for each row execute function private.set_updated_at();

drop trigger if exists question_rubric_steps_set_updated_at on public.question_rubric_steps;
create trigger question_rubric_steps_set_updated_at
before update on public.question_rubric_steps
for each row execute function private.set_updated_at();

drop trigger if exists question_assets_set_updated_at on public.question_assets;
create trigger question_assets_set_updated_at
before update on public.question_assets
for each row execute function private.set_updated_at();

drop trigger if exists question_source_files_set_updated_at on public.question_source_files;
create trigger question_source_files_set_updated_at
before update on public.question_source_files
for each row execute function private.set_updated_at();

drop trigger if exists question_taxonomy_assignments_set_updated_at on public.question_taxonomy_assignments;
create trigger question_taxonomy_assignments_set_updated_at
before update on public.question_taxonomy_assignments
for each row execute function private.set_updated_at();

alter table public.review_batches enable row level security;
alter table public.review_draft_items enable row level security;
alter table public.review_actions enable row level security;
alter table public.review_source_references enable row level security;
alter table public.questions enable row level security;
alter table public.question_rubric_steps enable row level security;
alter table public.question_assets enable row level security;
alter table public.question_source_files enable row level security;
alter table public.question_source_references enable row level security;
alter table public.question_status_events enable row level security;
alter table public.question_taxonomy_assignments enable row level security;

drop policy if exists review_batches_staff_access on public.review_batches;
create policy review_batches_staff_access
on public.review_batches for all
using (private.is_org_staff(organization_id))
with check (private.is_org_staff(organization_id));

drop policy if exists review_draft_items_staff_access on public.review_draft_items;
create policy review_draft_items_staff_access
on public.review_draft_items for all
using (
  exists (
    select 1 from public.review_batches
    where review_batches.id = review_draft_items.review_batch_id
      and private.is_org_staff(review_batches.organization_id)
  )
)
with check (
  exists (
    select 1 from public.review_batches
    where review_batches.id = review_draft_items.review_batch_id
      and private.is_org_staff(review_batches.organization_id)
  )
);

drop policy if exists review_actions_staff_access on public.review_actions;
create policy review_actions_staff_access
on public.review_actions for all
using (
  review_batch_id is not null
  and exists (
    select 1 from public.review_batches
    where review_batches.id = review_actions.review_batch_id
      and private.is_org_staff(review_batches.organization_id)
  )
)
with check (
  review_batch_id is not null
  and exists (
    select 1 from public.review_batches
    where review_batches.id = review_actions.review_batch_id
      and private.is_org_staff(review_batches.organization_id)
  )
);

drop policy if exists review_source_references_staff_access on public.review_source_references;
create policy review_source_references_staff_access
on public.review_source_references for all
using (
  review_batch_id is not null
  and exists (
    select 1 from public.review_batches
    where review_batches.id = review_source_references.review_batch_id
      and private.is_org_staff(review_batches.organization_id)
  )
)
with check (
  review_batch_id is not null
  and exists (
    select 1 from public.review_batches
    where review_batches.id = review_source_references.review_batch_id
      and private.is_org_staff(review_batches.organization_id)
  )
);

drop policy if exists questions_published_read on public.questions;
create policy questions_published_read
on public.questions for select
using (status = 'published' and deleted_at is null);

drop policy if exists questions_staff_access on public.questions;
create policy questions_staff_access
on public.questions for all
using (private.is_org_staff(organization_id))
with check (private.is_org_staff(organization_id));

drop policy if exists question_rubric_steps_public_read on public.question_rubric_steps;
create policy question_rubric_steps_public_read
on public.question_rubric_steps for select
using (
  exists (
    select 1 from public.questions
    where questions.id = question_rubric_steps.question_id
      and questions.status = 'published'
      and questions.deleted_at is null
  )
);

drop policy if exists question_rubric_steps_staff_access on public.question_rubric_steps;
create policy question_rubric_steps_staff_access
on public.question_rubric_steps for all
using (
  exists (
    select 1 from public.questions
    where questions.id = question_rubric_steps.question_id
      and private.is_org_staff(questions.organization_id)
  )
)
with check (
  exists (
    select 1 from public.questions
    where questions.id = question_rubric_steps.question_id
      and private.is_org_staff(questions.organization_id)
  )
);

drop policy if exists question_assets_public_read on public.question_assets;
create policy question_assets_public_read
on public.question_assets for select
using (
  exists (
    select 1 from public.questions
    where questions.id = question_assets.question_id
      and questions.status = 'published'
      and questions.deleted_at is null
  )
);

drop policy if exists question_assets_staff_access on public.question_assets;
create policy question_assets_staff_access
on public.question_assets for all
using (
  exists (
    select 1 from public.questions
    where questions.id = question_assets.question_id
      and private.is_org_staff(questions.organization_id)
  )
)
with check (
  exists (
    select 1 from public.questions
    where questions.id = question_assets.question_id
      and private.is_org_staff(questions.organization_id)
  )
);

drop policy if exists question_source_files_staff_read on public.question_source_files;
create policy question_source_files_staff_read
on public.question_source_files for select
using (
  private.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.questions
    where questions.id = question_source_files.question_id
      and private.is_org_staff(questions.organization_id)
  )
);

drop policy if exists question_source_files_staff_write on public.question_source_files;
create policy question_source_files_staff_write
on public.question_source_files for all
using (
  private.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.questions
    where questions.id = question_source_files.question_id
      and private.is_org_staff(questions.organization_id)
  )
)
with check (
  private.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.questions
    where questions.id = question_source_files.question_id
      and private.is_org_staff(questions.organization_id)
  )
);

drop policy if exists question_source_refs_staff_read on public.question_source_references;
create policy question_source_refs_staff_read
on public.question_source_references for select
using (
  exists (
    select 1 from public.questions
    where questions.id = question_source_references.question_id
      and private.is_org_staff(questions.organization_id)
  )
);

drop policy if exists question_source_refs_staff_write on public.question_source_references;
create policy question_source_refs_staff_write
on public.question_source_references for all
using (
  exists (
    select 1 from public.questions
    where questions.id = question_source_references.question_id
      and private.is_org_staff(questions.organization_id)
  )
)
with check (
  exists (
    select 1 from public.questions
    where questions.id = question_source_references.question_id
      and private.is_org_staff(questions.organization_id)
  )
);

drop policy if exists question_status_events_staff_read on public.question_status_events;
create policy question_status_events_staff_read
on public.question_status_events for select
using (
  exists (
    select 1 from public.questions
    where questions.id = question_status_events.question_id
      and private.is_org_staff(questions.organization_id)
  )
);

drop policy if exists question_status_events_staff_insert on public.question_status_events;
create policy question_status_events_staff_insert
on public.question_status_events for insert
with check (
  exists (
    select 1 from public.questions
    where questions.id = question_status_events.question_id
      and private.is_org_staff(questions.organization_id)
  )
);

drop policy if exists question_taxonomy_assignments_public_read on public.question_taxonomy_assignments;
create policy question_taxonomy_assignments_public_read
on public.question_taxonomy_assignments for select
using (
  review_status = 'approved'
  and exists (
    select 1 from public.questions
    where questions.id = question_taxonomy_assignments.question_id
      and questions.status = 'published'
      and questions.deleted_at is null
  )
);

drop policy if exists question_taxonomy_assignments_staff_access on public.question_taxonomy_assignments;
create policy question_taxonomy_assignments_staff_access
on public.question_taxonomy_assignments for all
using (
  exists (
    select 1 from public.questions
    where questions.id = question_taxonomy_assignments.question_id
      and private.is_org_staff(questions.organization_id)
  )
)
with check (
  exists (
    select 1 from public.questions
    where questions.id = question_taxonomy_assignments.question_id
      and private.is_org_staff(questions.organization_id)
  )
);

create index if not exists questions_taxonomy_search_fts_idx
  on public.questions using gin (
    to_tsvector('simple'::regconfig, coalesce(question_code, '') || ' ' || coalesce(title, ''))
  );

create or replace function public.search_questions_by_taxonomy(
  include_tag_ids text[] default '{}'::text[],
  exclude_tag_ids text[] default '{}'::text[],
  difficulty_min integer default null,
  difficulty_max integer default null,
  question_status text default 'published',
  query_text text default null,
  assignment_review_status text default 'approved',
  page_limit integer default 50,
  page_offset integer default 0,
  page_cursor text default null
)
returns table (
  question_id uuid,
  question_code text,
  title text,
  difficulty_rating integer,
  question_type text,
  status text,
  matched_tag_ids text[],
  matched_tags jsonb,
  total_count bigint,
  next_cursor text
)
language sql
stable
security invoker
set search_path = public
as $$
with
args as (
  select
    greatest(1, least(coalesce(page_limit, 50), 100))::integer as limit_count,
    greatest(0, coalesce(page_offset, 0))::integer as offset_count,
    nullif(btrim(query_text), '') as normalized_query,
    nullif(split_part(coalesce(page_cursor, ''), '|', 1), '')::timestamptz as cursor_created_at,
    nullif(split_part(coalesce(page_cursor, ''), '|', 2), '')::uuid as cursor_question_id
),
include_input as (
  select distinct unnest(coalesce(include_tag_ids, '{}'::text[])) as tag_id
),
exclude_input as (
  select distinct unnest(coalesce(exclude_tag_ids, '{}'::text[])) as tag_id
),
include_expanded_base as (
  select
    coalesce(descendant.facet_key, selected.facet_key) as facet_key,
    coalesce(closure.descendant_tag_id, selected.tag_id) as tag_id
  from include_input input
  join public.taxonomy_nodes selected
    on selected.tag_id = input.tag_id
   and selected.status = 'active'
  left join public.taxonomy_node_closure closure
    on closure.ancestor_tag_id = selected.tag_id
  left join public.taxonomy_nodes descendant
    on descendant.tag_id = closure.descendant_tag_id
   and descendant.status = 'active'
  where coalesce(descendant.is_assignable, selected.is_assignable)
),
include_mapped as (
  select
    coalesce(descendant.facet_key, target.facet_key) as facet_key,
    coalesce(closure.descendant_tag_id, target.tag_id) as tag_id
  from include_input input
  join public.taxonomy_edges edge
    on edge.from_tag_id = input.tag_id
   and edge.edge_kind = 'maps_to'
   and edge.status = 'active'
  join public.taxonomy_nodes target
    on target.tag_id = edge.to_tag_id
   and target.status = 'active'
  left join public.taxonomy_node_closure closure
    on closure.ancestor_tag_id = target.tag_id
  left join public.taxonomy_nodes descendant
    on descendant.tag_id = closure.descendant_tag_id
   and descendant.status = 'active'
  where coalesce(descendant.is_assignable, target.is_assignable)
),
include_expanded as (
  select distinct facet_key, tag_id
  from include_expanded_base
  where facet_key is not null and tag_id is not null
  union
  select distinct facet_key, tag_id
  from include_mapped
  where facet_key is not null and tag_id is not null
),
include_facets as (
  select distinct facet_key
  from include_expanded
),
exclude_expanded_base as (
  select
    coalesce(descendant.facet_key, selected.facet_key) as facet_key,
    coalesce(closure.descendant_tag_id, selected.tag_id) as tag_id
  from exclude_input input
  join public.taxonomy_nodes selected
    on selected.tag_id = input.tag_id
   and selected.status = 'active'
  left join public.taxonomy_node_closure closure
    on closure.ancestor_tag_id = selected.tag_id
  left join public.taxonomy_nodes descendant
    on descendant.tag_id = closure.descendant_tag_id
   and descendant.status = 'active'
  where coalesce(descendant.is_assignable, selected.is_assignable)
),
exclude_mapped as (
  select
    coalesce(descendant.facet_key, target.facet_key) as facet_key,
    coalesce(closure.descendant_tag_id, target.tag_id) as tag_id
  from exclude_input input
  join public.taxonomy_edges edge
    on edge.from_tag_id = input.tag_id
   and edge.edge_kind = 'maps_to'
   and edge.status = 'active'
  join public.taxonomy_nodes target
    on target.tag_id = edge.to_tag_id
   and target.status = 'active'
  left join public.taxonomy_node_closure closure
    on closure.ancestor_tag_id = target.tag_id
  left join public.taxonomy_nodes descendant
    on descendant.tag_id = closure.descendant_tag_id
   and descendant.status = 'active'
  where coalesce(descendant.is_assignable, target.is_assignable)
),
exclude_expanded as (
  select distinct tag_id
  from exclude_expanded_base
  where tag_id is not null
  union
  select distinct tag_id
  from exclude_mapped
  where tag_id is not null
),
filtered_questions as (
  select question.*
  from public.questions question
  cross join args
  where (question_status is null or question.status = question_status)
    and question.deleted_at is null
    and (difficulty_min is null or question.difficulty_rating >= difficulty_min)
    and (difficulty_max is null or question.difficulty_rating <= difficulty_max)
    and (
      args.normalized_query is null
      or to_tsvector('simple'::regconfig, coalesce(question.question_code, '') || ' ' || coalesce(question.title, ''))
        @@ plainto_tsquery('simple'::regconfig, args.normalized_query)
      or question.question_code ilike '%' || args.normalized_query || '%'
      or question.title ilike '%' || args.normalized_query || '%'
    )
    and (
      args.cursor_created_at is null
      or question.created_at < args.cursor_created_at
      or (question.created_at = args.cursor_created_at and question.id < args.cursor_question_id)
    )
    and not exists (
      select 1
      from include_facets facet
      where not exists (
        select 1
        from public.question_taxonomy_assignments assignment
        join include_expanded include_tag
          on include_tag.tag_id = assignment.tag_id
         and include_tag.facet_key = facet.facet_key
        where assignment.question_id = question.id
          and (
            assignment_review_status is null
            or assignment.review_status = assignment_review_status
          )
      )
    )
    and not exists (
      select 1
      from public.question_taxonomy_assignments assignment
      join exclude_expanded exclude_tag
        on exclude_tag.tag_id = assignment.tag_id
      where assignment.question_id = question.id
        and (
          assignment_review_status is null
          or assignment.review_status = assignment_review_status
        )
    )
),
ordered_page as (
  select
    question.*,
    count(*) over () as total_count
  from filtered_questions question
  order by question.created_at desc, question.id desc
  limit (select limit_count + 1 from args)
  offset (select case when page_cursor is null then offset_count else 0 end from args)
),
ordered_questions as (
  select
    ordered_page.*,
    row_number() over (order by ordered_page.created_at desc, ordered_page.id desc) as page_row_index
  from ordered_page
),
visible_questions as (
  select *
  from ordered_questions
  where page_row_index <= (select limit_count from args)
),
next_page as (
  select
    case
      when (select count(*) from ordered_questions) > (select limit_count from args)
      then (
        select visible.created_at::text || '|' || visible.id::text
        from visible_questions visible
        order by visible.created_at asc, visible.id asc
        limit 1
      )
      else null
    end as next_cursor
),
assignment_rows as (
  select
    question.id as question_id,
    assignment.tag_id,
    node.facet_key,
    assignment.review_status,
    public.taxonomy_tag_path(assignment.tag_id) as path
  from visible_questions question
  left join public.question_taxonomy_assignments assignment
    on assignment.question_id = question.id
   and (
     assignment_review_status is null
     or assignment.review_status = assignment_review_status
   )
  left join public.taxonomy_nodes node
    on node.tag_id = assignment.tag_id
)
select
  question.id as question_id,
  question.question_code,
  question.title,
  question.difficulty_rating,
  question.question_type,
  question.status,
  coalesce(
    array_agg(distinct assignment_rows.tag_id)
      filter (where assignment_rows.tag_id is not null),
    '{}'::text[]
  ) as matched_tag_ids,
  coalesce(
    jsonb_agg(
      distinct jsonb_build_object(
        'tag_id', assignment_rows.tag_id,
        'facet_key', assignment_rows.facet_key,
        'review_status', assignment_rows.review_status,
        'path', assignment_rows.path
      )
    ) filter (where assignment_rows.tag_id is not null),
    '[]'::jsonb
  ) as matched_tags,
  question.total_count,
  next_page.next_cursor
from visible_questions question
cross join next_page
left join assignment_rows
  on assignment_rows.question_id = question.id
group by
  question.id,
  question.question_code,
  question.title,
  question.difficulty_rating,
  question.question_type,
  question.status,
  question.created_at,
  question.total_count,
  next_page.next_cursor
order by question.created_at desc, question.id desc;
$$;

grant execute on function public.search_questions_by_taxonomy(
  text[],
  text[],
  integer,
  integer,
  text,
  text,
  text,
  integer,
  integer,
  text
) to authenticated, anon;
