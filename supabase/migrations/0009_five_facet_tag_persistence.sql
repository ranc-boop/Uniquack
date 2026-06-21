create table if not exists public.five_facet_tag_nodes (
  id uuid primary key default gen_random_uuid(),
  tag_id text not null unique check (length(btrim(tag_id)) > 0),
  category text not null check (category in ('curriculum', 'concept', 'method', 'task', 'form')),
  label text not null check (length(btrim(label)) > 0),
  description text,
  status text not null default 'active' check (status in ('active', 'deprecated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  deprecated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tag_id !~ '^difficulty(\.|$)'),
  check (tag_id !~ '^error_pattern(\.|$)')
);

comment on table public.five_facet_tag_nodes is
  'Official five-facet tag catalog nodes. Difficulty stays numeric question metadata; error_pattern belongs to attempt diagnosis.';

create table if not exists public.five_facet_tag_edges (
  id uuid primary key default gen_random_uuid(),
  from_tag_id text not null references public.five_facet_tag_nodes(tag_id) on delete cascade,
  to_tag_id text not null references public.five_facet_tag_nodes(tag_id) on delete cascade,
  edge_kind text not null check (edge_kind in ('parent_child', 'related', 'maps_to')),
  status text not null default 'active' check (status in ('active', 'deprecated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  deprecated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_tag_id, to_tag_id, edge_kind)
);

comment on table public.five_facet_tag_edges is
  'Official five-facet tag graph edges. Curriculum-to-concept mappings are overlays, not concept parents.';

create table if not exists public.five_facet_tag_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_text text not null check (length(btrim(alias_text)) > 0),
  normalized_alias text not null check (length(btrim(normalized_alias)) > 0),
  tag_id text not null references public.five_facet_tag_nodes(tag_id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ambiguous', 'deprecated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  deprecated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_alias, tag_id)
);

comment on table public.five_facet_tag_aliases is
  'Human-reviewable aliases for official five-facet tags. Ambiguous aliases may map to multiple candidate tags.';

create table if not exists public.five_facet_curriculum_concept_mappings (
  id uuid primary key default gen_random_uuid(),
  curriculum_tag_id text not null references public.five_facet_tag_nodes(tag_id) on delete cascade,
  concept_tag_id text not null references public.five_facet_tag_nodes(tag_id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'deprecated', 'archived')),
  evidence jsonb not null default '{}'::jsonb,
  deprecated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (curriculum_tag_id like 'curriculum.%'),
  check (concept_tag_id like 'concept.%'),
  unique (curriculum_tag_id, concept_tag_id)
);

comment on table public.five_facet_curriculum_concept_mappings is
  'Official curriculum overlays that map course tags to canonical concept tags.';

create table if not exists public.five_facet_question_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  tag_id text not null references public.five_facet_tag_nodes(tag_id) on delete restrict,
  category text not null check (category in ('curriculum', 'concept', 'method', 'task', 'form')),
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source text not null default 'manual' check (source in ('manual', 'ai_suggestion', 'batch_import', 'review_action')),
  review_status text not null default 'pending_review' check (review_status in ('pending_review', 'approved', 'rejected', 'needs_review', 'archived')),
  evidence jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tag_id !~ '^difficulty(\.|$)'),
  check (tag_id !~ '^error_pattern(\.|$)')
);

comment on table public.five_facet_question_tag_assignments is
  'Official five-facet tag assignments for questions. AI suggestions must remain reviewable and cannot auto-publish tags.';

create unique index if not exists five_facet_question_tag_assignments_unique_active
  on public.five_facet_question_tag_assignments(question_id, tag_id)
  where review_status <> 'archived';

create table if not exists public.five_facet_tag_review_actions (
  id uuid primary key default gen_random_uuid(),
  action_id text not null unique check (length(btrim(action_id)) > 0),
  question_id uuid references public.questions(id) on delete set null,
  question_ref jsonb not null default '{}'::jsonb,
  action_kind text not null check (
    action_kind in (
      'approve_bundle',
      'reject_bundle',
      'edit_bundle',
      'approve_single_tag',
      'reject_single_tag',
      'replace_tag',
      'mark_ambiguous',
      'merge_alias_candidate',
      'request_manual_review'
    )
  ),
  target_facet text check (target_facet is null or target_facet in ('curriculum', 'concept', 'method', 'task', 'form')),
  target_tag_ids text[] not null default '{}'::text[],
  proposed_tag_ids text[] not null default '{}'::text[],
  reason text not null default '',
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending_review' check (review_status in ('pending_review', 'approved', 'rejected', 'needs_review', 'archived')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.five_facet_tag_review_actions is
  'Auditable review action drafts for five-facet tag suggestions. Actions are pending review until an explicit future admin workflow executes them.';

create index if not exists five_facet_tag_nodes_category_status_idx
  on public.five_facet_tag_nodes(category, status);

create index if not exists five_facet_tag_edges_from_idx
  on public.five_facet_tag_edges(from_tag_id, edge_kind, status);

create index if not exists five_facet_tag_edges_to_idx
  on public.five_facet_tag_edges(to_tag_id, edge_kind, status);

create index if not exists five_facet_tag_aliases_normalized_idx
  on public.five_facet_tag_aliases(normalized_alias, status);

create index if not exists five_facet_curriculum_concept_curriculum_idx
  on public.five_facet_curriculum_concept_mappings(curriculum_tag_id, status);

create index if not exists five_facet_question_tag_assignments_question_idx
  on public.five_facet_question_tag_assignments(question_id, category, review_status);

create index if not exists five_facet_question_tag_assignments_tag_idx
  on public.five_facet_question_tag_assignments(tag_id, review_status);

create index if not exists five_facet_tag_review_actions_question_idx
  on public.five_facet_tag_review_actions(question_id, review_status);

create index if not exists five_facet_tag_review_actions_kind_idx
  on public.five_facet_tag_review_actions(action_kind, review_status);

drop trigger if exists five_facet_tag_nodes_set_updated_at
on public.five_facet_tag_nodes;
create trigger five_facet_tag_nodes_set_updated_at
before update on public.five_facet_tag_nodes
for each row execute function private.set_updated_at();

drop trigger if exists five_facet_tag_edges_set_updated_at
on public.five_facet_tag_edges;
create trigger five_facet_tag_edges_set_updated_at
before update on public.five_facet_tag_edges
for each row execute function private.set_updated_at();

drop trigger if exists five_facet_tag_aliases_set_updated_at
on public.five_facet_tag_aliases;
create trigger five_facet_tag_aliases_set_updated_at
before update on public.five_facet_tag_aliases
for each row execute function private.set_updated_at();

drop trigger if exists five_facet_curriculum_concept_mappings_set_updated_at
on public.five_facet_curriculum_concept_mappings;
create trigger five_facet_curriculum_concept_mappings_set_updated_at
before update on public.five_facet_curriculum_concept_mappings
for each row execute function private.set_updated_at();

drop trigger if exists five_facet_question_tag_assignments_set_updated_at
on public.five_facet_question_tag_assignments;
create trigger five_facet_question_tag_assignments_set_updated_at
before update on public.five_facet_question_tag_assignments
for each row execute function private.set_updated_at();

drop trigger if exists five_facet_tag_review_actions_set_updated_at
on public.five_facet_tag_review_actions;
create trigger five_facet_tag_review_actions_set_updated_at
before update on public.five_facet_tag_review_actions
for each row execute function private.set_updated_at();

alter table public.five_facet_tag_nodes enable row level security;
alter table public.five_facet_tag_edges enable row level security;
alter table public.five_facet_tag_aliases enable row level security;
alter table public.five_facet_curriculum_concept_mappings enable row level security;
alter table public.five_facet_question_tag_assignments enable row level security;
alter table public.five_facet_tag_review_actions enable row level security;

grant select, insert, update, delete on table public.five_facet_tag_nodes
  to authenticated;
grant select, insert, update, delete on table public.five_facet_tag_edges
  to authenticated;
grant select, insert, update, delete on table public.five_facet_tag_aliases
  to authenticated;
grant select, insert, update, delete on table public.five_facet_curriculum_concept_mappings
  to authenticated;
grant select, insert, update, delete on table public.five_facet_question_tag_assignments
  to authenticated;
grant select, insert, update, delete on table public.five_facet_tag_review_actions
  to authenticated;

drop policy if exists five_facet_tag_nodes_admin_crud
on public.five_facet_tag_nodes;
create policy five_facet_tag_nodes_admin_crud
on public.five_facet_tag_nodes for all
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists five_facet_tag_edges_admin_crud
on public.five_facet_tag_edges;
create policy five_facet_tag_edges_admin_crud
on public.five_facet_tag_edges for all
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists five_facet_tag_aliases_admin_crud
on public.five_facet_tag_aliases;
create policy five_facet_tag_aliases_admin_crud
on public.five_facet_tag_aliases for all
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists five_facet_curriculum_concept_mappings_admin_crud
on public.five_facet_curriculum_concept_mappings;
create policy five_facet_curriculum_concept_mappings_admin_crud
on public.five_facet_curriculum_concept_mappings for all
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists five_facet_question_tag_assignments_admin_crud
on public.five_facet_question_tag_assignments;
create policy five_facet_question_tag_assignments_admin_crud
on public.five_facet_question_tag_assignments for all
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists five_facet_tag_review_actions_admin_crud
on public.five_facet_tag_review_actions;
create policy five_facet_tag_review_actions_admin_crud
on public.five_facet_tag_review_actions for all
using ((select private.is_admin()))
with check ((select private.is_admin()));
