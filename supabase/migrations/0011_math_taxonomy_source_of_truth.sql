-- Generic math taxonomy source of truth.
-- Destructive by design for development: legacy tags and five-facet tables are removed.

begin;

create table if not exists public.taxonomy_facets (
  facet_key text primary key check (length(btrim(facet_key)) > 0),
  subject_tag_id text not null,
  root_tag_id text not null unique,
  label text not null check (length(btrim(label)) > 0),
  description text,
  sort_order int not null default 0,
  status text not null default 'active' check (status in ('active', 'deprecated', 'archived')),
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.taxonomy_nodes (
  tag_id text primary key check (length(btrim(tag_id)) > 0),
  node_kind text not null default 'tag' check (node_kind in ('subject', 'facet_root', 'tag')),
  subject_tag_id text,
  facet_key text,
  label text not null check (length(btrim(label)) > 0),
  description text,
  is_assignable boolean not null default true,
  sort_order int not null default 0,
  status text not null default 'active' check (status in ('active', 'deprecated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  deprecated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((node_kind = 'subject' and subject_tag_id is null and facet_key is null) or (node_kind <> 'subject' and subject_tag_id is not null))
);

alter table public.taxonomy_facets
  add constraint taxonomy_facets_subject_fkey foreign key (subject_tag_id) references public.taxonomy_nodes(tag_id) on delete restrict,
  add constraint taxonomy_facets_root_fkey foreign key (root_tag_id) references public.taxonomy_nodes(tag_id) on delete restrict;

create table if not exists public.taxonomy_edges (
  id uuid primary key default gen_random_uuid(),
  from_tag_id text not null references public.taxonomy_nodes(tag_id) on delete cascade,
  to_tag_id text not null references public.taxonomy_nodes(tag_id) on delete cascade,
  edge_kind text not null check (edge_kind in ('parent_child', 'related', 'maps_to')),
  is_primary boolean not null default true,
  sort_order int not null default 0,
  status text not null default 'active' check (status in ('active', 'deprecated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  deprecated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_tag_id <> to_tag_id),
  unique (from_tag_id, to_tag_id, edge_kind)
);

create table if not exists public.taxonomy_node_closure (
  ancestor_tag_id text not null references public.taxonomy_nodes(tag_id) on delete cascade,
  descendant_tag_id text not null references public.taxonomy_nodes(tag_id) on delete cascade,
  depth int not null check (depth >= 0),
  primary key (ancestor_tag_id, descendant_tag_id)
);

create table if not exists public.taxonomy_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_text text not null check (length(btrim(alias_text)) > 0),
  normalized_alias text not null check (length(btrim(normalized_alias)) > 0),
  tag_id text not null references public.taxonomy_nodes(tag_id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ambiguous', 'deprecated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  deprecated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_alias, tag_id)
);

create table if not exists public.question_taxonomy_assignments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  tag_id text not null references public.taxonomy_nodes(tag_id) on delete restrict,
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source text not null default 'manual' check (source in ('manual', 'ai_suggestion', 'batch_import', 'review_action')),
  review_status text not null default 'pending_review' check (review_status in ('pending_review', 'approved', 'rejected', 'needs_review', 'archived')),
  evidence jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists question_taxonomy_assignments_unique_active
  on public.question_taxonomy_assignments(question_id, tag_id)
  where review_status <> 'archived';

create table if not exists public.taxonomy_review_actions (
  id uuid primary key default gen_random_uuid(),
  action_id text not null unique check (length(btrim(action_id)) > 0),
  question_id uuid references public.questions(id) on delete set null,
  question_ref jsonb not null default '{}'::jsonb,
  action_kind text not null check (action_kind in ('approve_bundle', 'reject_bundle', 'edit_bundle', 'approve_single_tag', 'reject_single_tag', 'replace_tag', 'mark_ambiguous', 'merge_alias_candidate', 'request_manual_review')),
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

alter table public.question_rubric_steps drop column if exists linked_tag_id;
alter table public.question_rubric_steps add column if not exists linked_taxonomy_tag_id text references public.taxonomy_nodes(tag_id) on delete set null;

create index if not exists taxonomy_nodes_subject_facet_status_idx on public.taxonomy_nodes(subject_tag_id, facet_key, status);
create index if not exists taxonomy_nodes_assignable_status_idx on public.taxonomy_nodes(is_assignable, status) where is_assignable;
create index if not exists taxonomy_edges_from_idx on public.taxonomy_edges(from_tag_id, edge_kind, status);
create index if not exists taxonomy_edges_to_idx on public.taxonomy_edges(to_tag_id, edge_kind, status);
create index if not exists taxonomy_aliases_normalized_idx on public.taxonomy_aliases(normalized_alias, status);
create index if not exists taxonomy_node_closure_descendant_idx on public.taxonomy_node_closure(descendant_tag_id, depth);
create index if not exists question_taxonomy_assignments_question_idx on public.question_taxonomy_assignments(question_id, review_status);
create index if not exists question_taxonomy_assignments_tag_idx on public.question_taxonomy_assignments(tag_id, review_status);
create index if not exists taxonomy_review_actions_question_idx on public.taxonomy_review_actions(question_id, review_status);
create index if not exists question_rubric_steps_linked_taxonomy_tag_idx on public.question_rubric_steps(linked_taxonomy_tag_id);

create or replace function private.rebuild_taxonomy_node_closure()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.taxonomy_node_closure;

  insert into public.taxonomy_node_closure (ancestor_tag_id, descendant_tag_id, depth)
  select tag_id, tag_id, 0
  from public.taxonomy_nodes
  where status = 'active';

  with recursive walk as (
    select e.from_tag_id as ancestor_tag_id, e.to_tag_id as descendant_tag_id, 1 as depth, array[e.from_tag_id, e.to_tag_id] as path
    from public.taxonomy_edges e
    join public.taxonomy_nodes p on p.tag_id = e.from_tag_id and p.status = 'active'
    join public.taxonomy_nodes c on c.tag_id = e.to_tag_id and c.status = 'active'
    where e.edge_kind = 'parent_child' and e.status = 'active'
    union all
    select w.ancestor_tag_id, e.to_tag_id, w.depth + 1, w.path || e.to_tag_id
    from walk w
    join public.taxonomy_edges e on e.from_tag_id = w.descendant_tag_id and e.edge_kind = 'parent_child' and e.status = 'active'
    join public.taxonomy_nodes c on c.tag_id = e.to_tag_id and c.status = 'active'
    where not e.to_tag_id = any(w.path)
  )
  insert into public.taxonomy_node_closure (ancestor_tag_id, descendant_tag_id, depth)
  select ancestor_tag_id, descendant_tag_id, min(depth)
  from walk
  group by ancestor_tag_id, descendant_tag_id
  on conflict (ancestor_tag_id, descendant_tag_id) do update set depth = excluded.depth;
end;
$$;

create or replace function private.refresh_taxonomy_node_closure_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.rebuild_taxonomy_node_closure();
  return null;
end;
$$;

create or replace function private.validate_taxonomy_node()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facet_subject_tag_id text;
  facet_root_tag_id text;
begin
  if new.node_kind = 'subject' then
    if new.subject_tag_id is not null or new.facet_key is not null or new.is_assignable then
      raise exception 'Subject taxonomy nodes cannot belong to a facet or be assignable.';
    end if;
    return new;
  end if;

  if new.subject_tag_id is null or new.facet_key is null then
    raise exception 'Non-subject taxonomy nodes require subject_tag_id and facet_key.';
  end if;

  select subject_tag_id, root_tag_id
  into facet_subject_tag_id, facet_root_tag_id
  from public.taxonomy_facets
  where facet_key = new.facet_key;

  if found then
    if facet_subject_tag_id <> new.subject_tag_id then
      raise exception 'Taxonomy node subject does not match its facet subject.';
    end if;
    if new.node_kind = 'facet_root' and facet_root_tag_id <> new.tag_id then
      raise exception 'Facet root node does not match taxonomy_facets.root_tag_id.';
    end if;
    if new.node_kind = 'tag' and facet_root_tag_id = new.tag_id then
      raise exception 'Facet root must use node_kind facet_root.';
    end if;
  elsif new.node_kind <> 'facet_root' then
    raise exception 'Taxonomy facet % does not exist.', new.facet_key;
  end if;

  if new.node_kind = 'facet_root' and new.is_assignable then
    raise exception 'Facet root taxonomy nodes cannot be assignable.';
  end if;

  return new;
end;
$$;

create or replace function private.validate_taxonomy_parent_edge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_node public.taxonomy_nodes%rowtype;
  child_node public.taxonomy_nodes%rowtype;
  excluded_edge_id uuid;
begin
  if new.edge_kind <> 'parent_child' or new.status <> 'active' then
    return new;
  end if;

  select * into parent_node
  from public.taxonomy_nodes
  where tag_id = new.from_tag_id;

  select * into child_node
  from public.taxonomy_nodes
  where tag_id = new.to_tag_id;

  if parent_node.status <> 'active' or child_node.status <> 'active' then
    raise exception 'Active parent-child edges require active taxonomy nodes.';
  end if;

  if parent_node.node_kind = 'subject' then
    if child_node.node_kind <> 'facet_root'
       or child_node.subject_tag_id <> parent_node.tag_id then
      raise exception 'Subject roots may only parent their facet roots.';
    end if;
  elsif parent_node.subject_tag_id is distinct from child_node.subject_tag_id
     or parent_node.facet_key is distinct from child_node.facet_key then
    raise exception 'Parent-child edges must remain inside one subject and facet.';
  end if;

  excluded_edge_id := case when tg_op = 'UPDATE' then old.id else null end;

  if exists (
    with recursive descendants(tag_id) as (
      select e.to_tag_id
      from public.taxonomy_edges e
      where e.from_tag_id = new.to_tag_id
        and e.edge_kind = 'parent_child'
        and e.status = 'active'
        and (excluded_edge_id is null or e.id <> excluded_edge_id)
      union
      select e.to_tag_id
      from descendants d
      join public.taxonomy_edges e
        on e.from_tag_id = d.tag_id
       and e.edge_kind = 'parent_child'
       and e.status = 'active'
       and (excluded_edge_id is null or e.id <> excluded_edge_id)
    )
    select 1
    from descendants
    where tag_id = new.from_tag_id
  ) then
    raise exception 'Taxonomy parent-child edge would create a cycle.';
  end if;

  return new;
end;
$$;

create or replace function private.validate_question_taxonomy_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_node public.taxonomy_nodes%rowtype;
begin
  select * into assigned_node
  from public.taxonomy_nodes
  where tag_id = new.tag_id;

  if not found then
    raise exception 'Taxonomy node % does not exist.', new.tag_id;
  end if;

  if assigned_node.status <> 'active'
     or assigned_node.node_kind <> 'tag'
     or not assigned_node.is_assignable then
    raise exception 'Question taxonomy assignments require an active assignable tag node.';
  end if;

  return new;
end;
$$;

create or replace function public.taxonomy_tag_path(input_tag_id text)
returns text[]
language sql
stable
security invoker
as $$
  with recursive upward as (
    select n.tag_id, n.label, 0 as depth
    from public.taxonomy_nodes n
    where n.tag_id = input_tag_id
    union all
    select p.tag_id, p.label, upward.depth + 1
    from upward
    join public.taxonomy_edges e on e.to_tag_id = upward.tag_id and e.edge_kind = 'parent_child' and e.status = 'active' and e.is_primary
    join public.taxonomy_nodes p on p.tag_id = e.from_tag_id and p.status = 'active'
  )
  select coalesce(array_agg(label order by depth desc), '{}'::text[])
  from upward;
$$;

insert into public.taxonomy_nodes (tag_id, node_kind, subject_tag_id, facet_key, label, description, is_assignable, sort_order, status, metadata) values
  ('subject.math', 'subject', null, null, 'Mathematics', 'Root subject for the official mathematics taxonomy.', false, 0, 'active', '{"seed":"math_taxonomy_v1"}'::jsonb)
on conflict (tag_id) do update set label = excluded.label, description = excluded.description, node_kind = excluded.node_kind, is_assignable = excluded.is_assignable, metadata = excluded.metadata;


insert into public.taxonomy_nodes (tag_id, node_kind, subject_tag_id, facet_key, label, description, is_assignable, sort_order, status, metadata) values
  ('concept', 'facet_root', 'subject.math', 'concept', 'Concept', 'Concept seed tag for the concept facet.', false, 0, 'active', '{"seed":"math_taxonomy_v1","notes":["Concept is the canonical cross-course knowledge graph.","Concept IDs must not include curriculum prefixes such as AP, IB, SAT, A-Level, or BC.","Concepts support future mastery graph relationships."]}'::jsonb),
  ('concept.algebra.expressions', 'tag', 'subject.math', 'concept', 'Algebra expressions', 'Algebra expressions seed tag for the concept facet.', true, 1, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.equations', 'tag', 'subject.math', 'concept', 'Algebra equations', 'Algebra equations seed tag for the concept facet.', true, 2, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions', 'tag', 'subject.math', 'concept', 'Functions', 'Functions seed tag for the concept facet.', true, 3, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.linear', 'tag', 'subject.math', 'concept', 'Linear functions', 'Linear functions seed tag for the concept facet.', true, 4, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.quadratic', 'tag', 'subject.math', 'concept', 'Quadratic functions', 'Quadratic functions seed tag for the concept facet.', true, 5, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.quadratic.vertex', 'tag', 'subject.math', 'concept', 'Quadratic vertex', 'Quadratic vertex seed tag for the concept facet.', true, 6, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.quadratic.axis_of_symmetry', 'tag', 'subject.math', 'concept', 'Axis of symmetry', 'Axis of symmetry seed tag for the concept facet.', true, 7, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.quadratic.opening_direction', 'tag', 'subject.math', 'concept', 'Opening direction', 'Opening direction seed tag for the concept facet.', true, 8, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.quadratic.extreme_value', 'tag', 'subject.math', 'concept', 'Extreme value', 'Extreme value seed tag for the concept facet.', true, 9, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.quadratic.where_extreme_occurs', 'tag', 'subject.math', 'concept', 'Where extreme occurs', 'Where extreme occurs seed tag for the concept facet.', true, 10, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.quadratic.roots', 'tag', 'subject.math', 'concept', 'Quadratic roots', 'Quadratic roots seed tag for the concept facet.', true, 11, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.quadratic.transformations', 'tag', 'subject.math', 'concept', 'Quadratic transformations', 'Quadratic transformations seed tag for the concept facet.', true, 12, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.polynomial', 'tag', 'subject.math', 'concept', 'Polynomial functions', 'Polynomial functions seed tag for the concept facet.', true, 13, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.rational', 'tag', 'subject.math', 'concept', 'Rational functions', 'Rational functions seed tag for the concept facet.', true, 14, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.exponential', 'tag', 'subject.math', 'concept', 'Exponential functions', 'Exponential functions seed tag for the concept facet.', true, 15, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.functions.logarithmic', 'tag', 'subject.math', 'concept', 'Logarithmic functions', 'Logarithmic functions seed tag for the concept facet.', true, 16, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.algebra.sequences', 'tag', 'subject.math', 'concept', 'Sequences', 'Sequences seed tag for the concept facet.', true, 17, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.calculus.limits', 'tag', 'subject.math', 'concept', 'Limits', 'Limits seed tag for the concept facet.', true, 18, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.calculus.derivatives', 'tag', 'subject.math', 'concept', 'Derivatives', 'Derivatives seed tag for the concept facet.', true, 19, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.calculus.derivatives.chain_rule', 'tag', 'subject.math', 'concept', 'Chain rule', 'Chain rule seed tag for the concept facet.', true, 20, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.calculus.derivatives.product_rule', 'tag', 'subject.math', 'concept', 'Product rule', 'Product rule seed tag for the concept facet.', true, 21, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.calculus.derivatives.quotient_rule', 'tag', 'subject.math', 'concept', 'Quotient rule', 'Quotient rule seed tag for the concept facet.', true, 22, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.calculus.integrals', 'tag', 'subject.math', 'concept', 'Integrals', 'Integrals seed tag for the concept facet.', true, 23, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.calculus.series', 'tag', 'subject.math', 'concept', 'Series', 'Series seed tag for the concept facet.', true, 24, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.trigonometry.right_triangle_trig', 'tag', 'subject.math', 'concept', 'Right triangle trig', 'Right triangle trig seed tag for the concept facet.', true, 25, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.trigonometry.unit_circle', 'tag', 'subject.math', 'concept', 'Unit circle', 'Unit circle seed tag for the concept facet.', true, 26, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.statistics.mean_median', 'tag', 'subject.math', 'concept', 'Mean and median', 'Mean and median seed tag for the concept facet.', true, 27, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.statistics.standard_deviation', 'tag', 'subject.math', 'concept', 'Standard deviation', 'Standard deviation seed tag for the concept facet.', true, 28, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.probability.conditional_probability', 'tag', 'subject.math', 'concept', 'Conditional probability', 'Conditional probability seed tag for the concept facet.', true, 29, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.physics.mechanics.forces', 'tag', 'subject.math', 'concept', 'Forces', 'Forces seed tag for the concept facet.', true, 30, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.physics.mechanics.energy.conservation_of_energy', 'tag', 'subject.math', 'concept', 'Conservation of energy', 'Conservation of energy seed tag for the concept facet.', true, 31, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.physics.mechanics.momentum', 'tag', 'subject.math', 'concept', 'Momentum', 'Momentum seed tag for the concept facet.', true, 32, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('concept.physics.mechanics.rotation.torque', 'tag', 'subject.math', 'concept', 'Torque', 'Torque seed tag for the concept facet.', true, 33, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum', 'facet_root', 'subject.math', 'curriculum', 'Curriculum', 'Curriculum seed tag for the curriculum facet.', false, 1000, 'active', '{"seed":"math_taxonomy_v1","notes":["Curriculum is an overlay for course/exam/syllabus placement.","Curriculum mapping to concept uses maps_to edges only.","Curriculum tags must not become concept parents."]}'::jsonb),
  ('curriculum.bc', 'tag', 'subject.math', 'curriculum', 'BC curriculum', 'BC curriculum seed tag for the curriculum facet.', true, 1001, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.bc.precalculus_11', 'tag', 'subject.math', 'curriculum', 'BC Precalculus 11', 'BC Precalculus 11 seed tag for the curriculum facet.', true, 1002, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.bc.precalculus_11.linear_relations', 'tag', 'subject.math', 'curriculum', 'Linear relations', 'Linear relations seed tag for the curriculum facet.', true, 1003, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.bc.precalculus_11.quadratic_functions', 'tag', 'subject.math', 'curriculum', 'Quadratic functions', 'Quadratic functions seed tag for the curriculum facet.', true, 1004, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.bc.precalculus_11.rational_expressions', 'tag', 'subject.math', 'curriculum', 'Rational expressions', 'Rational expressions seed tag for the curriculum facet.', true, 1005, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.bc.precalculus_11.trigonometry', 'tag', 'subject.math', 'curriculum', 'Trigonometry', 'Trigonometry seed tag for the curriculum facet.', true, 1006, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.bc.precalculus_12', 'tag', 'subject.math', 'curriculum', 'BC Precalculus 12', 'BC Precalculus 12 seed tag for the curriculum facet.', true, 1007, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.bc.precalculus_12.transformations', 'tag', 'subject.math', 'curriculum', 'Transformations', 'Transformations seed tag for the curriculum facet.', true, 1008, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.bc.precalculus_12.polynomial_functions', 'tag', 'subject.math', 'curriculum', 'Polynomial functions', 'Polynomial functions seed tag for the curriculum facet.', true, 1009, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.bc.precalculus_12.rational_functions', 'tag', 'subject.math', 'curriculum', 'Rational functions', 'Rational functions seed tag for the curriculum facet.', true, 1010, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.bc.precalculus_12.logarithms', 'tag', 'subject.math', 'curriculum', 'Logarithms', 'Logarithms seed tag for the curriculum facet.', true, 1011, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.ap', 'tag', 'subject.math', 'curriculum', 'AP curriculum', 'AP curriculum seed tag for the curriculum facet.', true, 1012, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.ap.ap_precalculus', 'tag', 'subject.math', 'curriculum', 'AP Precalculus', 'AP Precalculus seed tag for the curriculum facet.', true, 1013, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.ap.ap_calculus_ab', 'tag', 'subject.math', 'curriculum', 'AP Calculus AB', 'AP Calculus AB seed tag for the curriculum facet.', true, 1014, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.ap.ap_calculus_bc', 'tag', 'subject.math', 'curriculum', 'AP Calculus BC', 'AP Calculus BC seed tag for the curriculum facet.', true, 1015, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.sat.math.advanced_math', 'tag', 'subject.math', 'curriculum', 'SAT Math Advanced Math', 'SAT Math Advanced Math seed tag for the curriculum facet.', true, 1016, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.ib.aa_hl.calculus', 'tag', 'subject.math', 'curriculum', 'IB AA HL Calculus', 'IB AA HL Calculus seed tag for the curriculum facet.', true, 1017, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('curriculum.a_level.pure_math', 'tag', 'subject.math', 'curriculum', 'A-Level Pure Math', 'A-Level Pure Math seed tag for the curriculum facet.', true, 1018, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form', 'facet_root', 'subject.math', 'form', 'Form', 'Form seed tag for the form facet.', false, 2000, 'active', '{"seed":"math_taxonomy_v1","notes":["Form covers symbolic, graph, table, visual, verbal, context, and mixed presentation.","Form supports same-concept different-representation search."]}'::jsonb),
  ('form.symbolic.standard_form', 'tag', 'subject.math', 'form', 'Standard form', 'Standard form seed tag for the form facet.', true, 2001, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.symbolic.vertex_form', 'tag', 'subject.math', 'form', 'Vertex form', 'Vertex form seed tag for the form facet.', true, 2002, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.symbolic.factored_form', 'tag', 'subject.math', 'form', 'Factored form', 'Factored form seed tag for the form facet.', true, 2003, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.symbolic.equation_system', 'tag', 'subject.math', 'form', 'Equation system', 'Equation system seed tag for the form facet.', true, 2004, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.graph.coordinate_graph', 'tag', 'subject.math', 'form', 'Coordinate graph', 'Coordinate graph seed tag for the form facet.', true, 2005, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.visual.diagram', 'tag', 'subject.math', 'form', 'Diagram', 'Diagram seed tag for the form facet.', true, 2006, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.visual.geometric_figure', 'tag', 'subject.math', 'form', 'Geometric figure', 'Geometric figure seed tag for the form facet.', true, 2007, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.table.input_output_table', 'tag', 'subject.math', 'form', 'Input-output table', 'Input-output table seed tag for the form facet.', true, 2008, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.table.data_table', 'tag', 'subject.math', 'form', 'Data table', 'Data table seed tag for the form facet.', true, 2009, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.verbal.word_problem', 'tag', 'subject.math', 'form', 'Word problem', 'Word problem seed tag for the form facet.', true, 2010, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.verbal.multi_sentence_context', 'tag', 'subject.math', 'form', 'Multi-sentence context', 'Multi-sentence context seed tag for the form facet.', true, 2011, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.context.pure_math', 'tag', 'subject.math', 'form', 'Pure math', 'Pure math seed tag for the form facet.', true, 2012, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.context.projectile_motion', 'tag', 'subject.math', 'form', 'Projectile motion', 'Projectile motion seed tag for the form facet.', true, 2013, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.context.area_optimization', 'tag', 'subject.math', 'form', 'Area optimization', 'Area optimization seed tag for the form facet.', true, 2014, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.context.revenue_profit', 'tag', 'subject.math', 'form', 'Revenue/profit', 'Revenue/profit seed tag for the form facet.', true, 2015, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.context.rate_motion', 'tag', 'subject.math', 'form', 'Rate/motion', 'Rate/motion seed tag for the form facet.', true, 2016, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('form.mixed.equation_and_graph', 'tag', 'subject.math', 'form', 'Equation and graph', 'Equation and graph seed tag for the form facet.', true, 2017, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method', 'facet_root', 'subject.math', 'method', 'Method', 'Method seed tag for the method facet.', false, 3000, 'active', '{"seed":"math_taxonomy_v1","notes":["Method describes how the student usually solves the problem.","Method is not the tested knowledge concept."]}'::jsonb),
  ('method.algebraic_manipulation.expand', 'tag', 'subject.math', 'method', 'Expand', 'Expand seed tag for the method facet.', true, 3001, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.algebraic_manipulation.factor', 'tag', 'subject.math', 'method', 'Factor', 'Factor seed tag for the method facet.', true, 3002, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.algebraic_manipulation.complete_the_square', 'tag', 'subject.math', 'method', 'Complete the square', 'Complete the square seed tag for the method facet.', true, 3003, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.algebraic_manipulation.isolate_variable', 'tag', 'subject.math', 'method', 'Isolate variable', 'Isolate variable seed tag for the method facet.', true, 3004, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.algebraic_manipulation.substitute', 'tag', 'subject.math', 'method', 'Substitute', 'Substitute seed tag for the method facet.', true, 3005, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.graph_reasoning.read_from_graph', 'tag', 'subject.math', 'method', 'Read from graph', 'Read from graph seed tag for the method facet.', true, 3006, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.graph_reasoning.use_intercepts', 'tag', 'subject.math', 'method', 'Use intercepts', 'Use intercepts seed tag for the method facet.', true, 3007, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.graph_reasoning.use_slope', 'tag', 'subject.math', 'method', 'Use slope', 'Use slope seed tag for the method facet.', true, 3008, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.graph_reasoning.compare_graph_features', 'tag', 'subject.math', 'method', 'Compare graph features', 'Compare graph features seed tag for the method facet.', true, 3009, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.formula_based.use_axis_of_symmetry_formula', 'tag', 'subject.math', 'method', 'Use axis of symmetry formula', 'Use axis of symmetry formula seed tag for the method facet.', true, 3010, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.formula_based.use_quadratic_formula', 'tag', 'subject.math', 'method', 'Use quadratic formula', 'Use quadratic formula seed tag for the method facet.', true, 3011, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.formula_based.use_derivative_rule', 'tag', 'subject.math', 'method', 'Use derivative rule', 'Use derivative rule seed tag for the method facet.', true, 3012, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.modeling.define_variable', 'tag', 'subject.math', 'method', 'Define variable', 'Define variable seed tag for the method facet.', true, 3013, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.modeling.build_equation', 'tag', 'subject.math', 'method', 'Build equation', 'Build equation seed tag for the method facet.', true, 3014, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.modeling.interpret_result', 'tag', 'subject.math', 'method', 'Interpret result', 'Interpret result seed tag for the method facet.', true, 3015, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.read_from_vertex_form', 'tag', 'subject.math', 'method', 'Read from vertex form', 'Read from vertex form seed tag for the method facet.', true, 3016, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('method.interpret_result_in_context', 'tag', 'subject.math', 'method', 'Interpret result in context', 'Interpret result in context seed tag for the method facet.', true, 3017, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task', 'facet_root', 'subject.math', 'task', 'Task', 'Task seed tag for the task facet.', false, 4000, 'active', '{"seed":"math_taxonomy_v1","notes":["Task represents what the question asks the student to do.","Determine extreme value and determine where extreme occurs stay separate."]}'::jsonb),
  ('task.identify.identify_vertex', 'tag', 'subject.math', 'task', 'Identify vertex', 'Identify vertex seed tag for the task facet.', true, 4001, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.identify.identify_intercepts', 'tag', 'subject.math', 'task', 'Identify intercepts', 'Identify intercepts seed tag for the task facet.', true, 4002, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.identify.identify_graph_feature', 'tag', 'subject.math', 'task', 'Identify graph feature', 'Identify graph feature seed tag for the task facet.', true, 4003, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.determine.determine_value', 'tag', 'subject.math', 'task', 'Determine value', 'Determine value seed tag for the task facet.', true, 4004, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.determine.determine_extreme_value', 'tag', 'subject.math', 'task', 'Determine extreme value', 'Determine extreme value seed tag for the task facet.', true, 4005, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.determine.determine_where_extreme_occurs', 'tag', 'subject.math', 'task', 'Determine where extreme occurs', 'Determine where extreme occurs seed tag for the task facet.', true, 4006, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.determine.determine_roots', 'tag', 'subject.math', 'task', 'Determine roots', 'Determine roots seed tag for the task facet.', true, 4007, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.determine.determine_equation', 'tag', 'subject.math', 'task', 'Determine equation', 'Determine equation seed tag for the task facet.', true, 4008, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.rewrite.rewrite_to_vertex_form', 'tag', 'subject.math', 'task', 'Rewrite to vertex form', 'Rewrite to vertex form seed tag for the task facet.', true, 4009, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.rewrite.rewrite_to_standard_form', 'tag', 'subject.math', 'task', 'Rewrite to standard form', 'Rewrite to standard form seed tag for the task facet.', true, 4010, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.rewrite.simplify_expression', 'tag', 'subject.math', 'task', 'Simplify expression', 'Simplify expression seed tag for the task facet.', true, 4011, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.explain.explain_reasoning', 'tag', 'subject.math', 'task', 'Explain reasoning', 'Explain reasoning seed tag for the task facet.', true, 4012, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.explain.explain_error', 'tag', 'subject.math', 'task', 'Explain error', 'Explain error seed tag for the task facet.', true, 4013, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.explain.justify_answer', 'tag', 'subject.math', 'task', 'Justify answer', 'Justify answer seed tag for the task facet.', true, 4014, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.model.build_model', 'tag', 'subject.math', 'task', 'Build model', 'Build model seed tag for the task facet.', true, 4015, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.model.optimize_quantity', 'tag', 'subject.math', 'task', 'Optimize quantity', 'Optimize quantity seed tag for the task facet.', true, 4016, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb),
  ('task.model.interpret_context', 'tag', 'subject.math', 'task', 'Interpret context', 'Interpret context seed tag for the task facet.', true, 4017, 'active', '{"seed":"math_taxonomy_v1","exampleSignals":[]}'::jsonb)
on conflict (tag_id) do update set node_kind = excluded.node_kind, subject_tag_id = excluded.subject_tag_id, facet_key = excluded.facet_key, label = excluded.label, description = excluded.description, is_assignable = excluded.is_assignable, sort_order = excluded.sort_order, status = excluded.status, metadata = excluded.metadata;


insert into public.taxonomy_facets (facet_key, subject_tag_id, root_tag_id, label, description, sort_order, status, config) values
  ('concept', 'subject.math', 'concept', 'Canonical cross-course concepts', 'Concept is the canonical cross-course knowledge graph. Concept IDs must not include curriculum prefixes such as AP, IB, SAT, A-Level, or BC. Concepts support future mastery graph relationships.', 1, 'active', '{"seed":"math_taxonomy_v1","recommended":true}'::jsonb),
  ('curriculum', 'subject.math', 'curriculum', 'Curriculum / exam overlays', 'Curriculum is an overlay for course/exam/syllabus placement. Curriculum mapping to concept uses maps_to edges only. Curriculum tags must not become concept parents.', 2, 'active', '{"seed":"math_taxonomy_v1","recommended":true}'::jsonb),
  ('form', 'subject.math', 'form', 'Presentation, representation, and context', 'Form covers symbolic, graph, table, visual, verbal, context, and mixed presentation. Form supports same-concept different-representation search.', 3, 'active', '{"seed":"math_taxonomy_v1","recommended":true}'::jsonb),
  ('method', 'subject.math', 'method', 'Solving methods', 'Method describes how the student usually solves the problem. Method is not the tested knowledge concept.', 4, 'active', '{"seed":"math_taxonomy_v1","recommended":true}'::jsonb),
  ('task', 'subject.math', 'task', 'Student task demands', 'Task represents what the question asks the student to do. Determine extreme value and determine where extreme occurs stay separate.', 5, 'active', '{"seed":"math_taxonomy_v1","recommended":true}'::jsonb)
on conflict (facet_key) do update set subject_tag_id = excluded.subject_tag_id, root_tag_id = excluded.root_tag_id, label = excluded.label, description = excluded.description, sort_order = excluded.sort_order, status = excluded.status, config = excluded.config;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'taxonomy_nodes_facet_fkey'
      and conrelid = 'public.taxonomy_nodes'::regclass
  ) then
    alter table public.taxonomy_nodes
      add constraint taxonomy_nodes_facet_fkey
      foreign key (facet_key) references public.taxonomy_facets(facet_key) on delete restrict;
  end if;
end $$;


insert into public.taxonomy_edges (from_tag_id, to_tag_id, edge_kind, is_primary, sort_order, status, metadata) values
  ('subject.math', 'concept', 'parent_child', true, 0, 'active', '{"seed":"math_taxonomy_v1","subjectRoot":true}'::jsonb),
  ('concept', 'concept.algebra.expressions', 'parent_child', true, 1, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.algebra.equations', 'parent_child', true, 2, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.algebra.functions', 'parent_child', true, 3, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions', 'concept.algebra.functions.linear', 'parent_child', true, 4, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions', 'concept.algebra.functions.quadratic', 'parent_child', true, 5, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions.quadratic', 'concept.algebra.functions.quadratic.vertex', 'parent_child', true, 6, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions.quadratic', 'concept.algebra.functions.quadratic.axis_of_symmetry', 'parent_child', true, 7, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions.quadratic', 'concept.algebra.functions.quadratic.opening_direction', 'parent_child', true, 8, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions.quadratic', 'concept.algebra.functions.quadratic.extreme_value', 'parent_child', true, 9, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions.quadratic', 'concept.algebra.functions.quadratic.where_extreme_occurs', 'parent_child', true, 10, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions.quadratic', 'concept.algebra.functions.quadratic.roots', 'parent_child', true, 11, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions.quadratic', 'concept.algebra.functions.quadratic.transformations', 'parent_child', true, 12, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions', 'concept.algebra.functions.polynomial', 'parent_child', true, 13, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions', 'concept.algebra.functions.rational', 'parent_child', true, 14, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions', 'concept.algebra.functions.exponential', 'parent_child', true, 15, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.algebra.functions', 'concept.algebra.functions.logarithmic', 'parent_child', true, 16, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.algebra.sequences', 'parent_child', true, 17, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.calculus.limits', 'parent_child', true, 18, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.calculus.derivatives', 'parent_child', true, 19, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.calculus.derivatives', 'concept.calculus.derivatives.chain_rule', 'parent_child', true, 20, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.calculus.derivatives', 'concept.calculus.derivatives.product_rule', 'parent_child', true, 21, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept.calculus.derivatives', 'concept.calculus.derivatives.quotient_rule', 'parent_child', true, 22, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.calculus.integrals', 'parent_child', true, 23, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.calculus.series', 'parent_child', true, 24, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.trigonometry.right_triangle_trig', 'parent_child', true, 25, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.trigonometry.unit_circle', 'parent_child', true, 26, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.statistics.mean_median', 'parent_child', true, 27, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.statistics.standard_deviation', 'parent_child', true, 28, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.probability.conditional_probability', 'parent_child', true, 29, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.physics.mechanics.forces', 'parent_child', true, 30, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.physics.mechanics.energy.conservation_of_energy', 'parent_child', true, 31, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.physics.mechanics.momentum', 'parent_child', true, 32, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('concept', 'concept.physics.mechanics.rotation.torque', 'parent_child', true, 33, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('subject.math', 'curriculum', 'parent_child', true, 34, 'active', '{"seed":"math_taxonomy_v1","subjectRoot":true}'::jsonb),
  ('curriculum', 'curriculum.bc', 'parent_child', true, 35, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc', 'curriculum.bc.precalculus_11', 'parent_child', true, 36, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc.precalculus_11', 'curriculum.bc.precalculus_11.linear_relations', 'parent_child', true, 37, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc.precalculus_11', 'curriculum.bc.precalculus_11.quadratic_functions', 'parent_child', true, 38, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc.precalculus_11', 'curriculum.bc.precalculus_11.rational_expressions', 'parent_child', true, 39, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc.precalculus_11', 'curriculum.bc.precalculus_11.trigonometry', 'parent_child', true, 40, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc', 'curriculum.bc.precalculus_12', 'parent_child', true, 41, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc.precalculus_12', 'curriculum.bc.precalculus_12.transformations', 'parent_child', true, 42, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc.precalculus_12', 'curriculum.bc.precalculus_12.polynomial_functions', 'parent_child', true, 43, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc.precalculus_12', 'curriculum.bc.precalculus_12.rational_functions', 'parent_child', true, 44, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc.precalculus_12', 'curriculum.bc.precalculus_12.logarithms', 'parent_child', true, 45, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum', 'curriculum.ap', 'parent_child', true, 46, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.ap', 'curriculum.ap.ap_precalculus', 'parent_child', true, 47, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.ap', 'curriculum.ap.ap_calculus_ab', 'parent_child', true, 48, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.ap', 'curriculum.ap.ap_calculus_bc', 'parent_child', true, 49, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum', 'curriculum.sat.math.advanced_math', 'parent_child', true, 50, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum', 'curriculum.ib.aa_hl.calculus', 'parent_child', true, 51, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum', 'curriculum.a_level.pure_math', 'parent_child', true, 52, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('curriculum.bc.precalculus_11.quadratic_functions', 'concept.algebra.functions.quadratic', 'maps_to', false, 53, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"maps_to"}'::jsonb),
  ('curriculum.ap.ap_precalculus', 'concept.algebra.functions.polynomial', 'maps_to', false, 54, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"maps_to"}'::jsonb),
  ('curriculum.ap.ap_precalculus', 'concept.algebra.functions.rational', 'maps_to', false, 55, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"maps_to"}'::jsonb),
  ('curriculum.ap.ap_precalculus', 'concept.algebra.functions.exponential', 'maps_to', false, 56, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"maps_to"}'::jsonb),
  ('curriculum.ap.ap_precalculus', 'concept.algebra.functions.logarithmic', 'maps_to', false, 57, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"maps_to"}'::jsonb),
  ('curriculum.ap.ap_calculus_ab', 'concept.calculus.limits', 'maps_to', false, 58, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"maps_to"}'::jsonb),
  ('curriculum.ap.ap_calculus_ab', 'concept.calculus.derivatives', 'maps_to', false, 59, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"maps_to"}'::jsonb),
  ('curriculum.ap.ap_calculus_ab', 'concept.calculus.integrals', 'maps_to', false, 60, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"maps_to"}'::jsonb),
  ('curriculum.ap.ap_calculus_bc', 'concept.calculus.series', 'maps_to', false, 61, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"maps_to"}'::jsonb),
  ('subject.math', 'form', 'parent_child', true, 62, 'active', '{"seed":"math_taxonomy_v1","subjectRoot":true}'::jsonb),
  ('form', 'form.symbolic.standard_form', 'parent_child', true, 63, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.symbolic.vertex_form', 'parent_child', true, 64, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.symbolic.factored_form', 'parent_child', true, 65, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.symbolic.equation_system', 'parent_child', true, 66, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.graph.coordinate_graph', 'parent_child', true, 67, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.visual.diagram', 'parent_child', true, 68, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.visual.geometric_figure', 'parent_child', true, 69, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.table.input_output_table', 'parent_child', true, 70, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.table.data_table', 'parent_child', true, 71, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.verbal.word_problem', 'parent_child', true, 72, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.verbal.multi_sentence_context', 'parent_child', true, 73, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.context.pure_math', 'parent_child', true, 74, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.context.projectile_motion', 'parent_child', true, 75, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.context.area_optimization', 'parent_child', true, 76, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.context.revenue_profit', 'parent_child', true, 77, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.context.rate_motion', 'parent_child', true, 78, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('form', 'form.mixed.equation_and_graph', 'parent_child', true, 79, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('subject.math', 'method', 'parent_child', true, 80, 'active', '{"seed":"math_taxonomy_v1","subjectRoot":true}'::jsonb),
  ('method', 'method.algebraic_manipulation.expand', 'parent_child', true, 81, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.algebraic_manipulation.factor', 'parent_child', true, 82, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.algebraic_manipulation.complete_the_square', 'parent_child', true, 83, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.algebraic_manipulation.isolate_variable', 'parent_child', true, 84, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.algebraic_manipulation.substitute', 'parent_child', true, 85, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.graph_reasoning.read_from_graph', 'parent_child', true, 86, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.graph_reasoning.use_intercepts', 'parent_child', true, 87, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.graph_reasoning.use_slope', 'parent_child', true, 88, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.graph_reasoning.compare_graph_features', 'parent_child', true, 89, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.formula_based.use_axis_of_symmetry_formula', 'parent_child', true, 90, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.formula_based.use_quadratic_formula', 'parent_child', true, 91, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.formula_based.use_derivative_rule', 'parent_child', true, 92, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.modeling.define_variable', 'parent_child', true, 93, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.modeling.build_equation', 'parent_child', true, 94, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.modeling.interpret_result', 'parent_child', true, 95, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.read_from_vertex_form', 'parent_child', true, 96, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('method', 'method.interpret_result_in_context', 'parent_child', true, 97, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('subject.math', 'task', 'parent_child', true, 98, 'active', '{"seed":"math_taxonomy_v1","subjectRoot":true}'::jsonb),
  ('task', 'task.identify.identify_vertex', 'parent_child', true, 99, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.identify.identify_intercepts', 'parent_child', true, 100, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.identify.identify_graph_feature', 'parent_child', true, 101, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.determine.determine_value', 'parent_child', true, 102, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.determine.determine_extreme_value', 'parent_child', true, 103, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.determine.determine_where_extreme_occurs', 'parent_child', true, 104, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.determine.determine_roots', 'parent_child', true, 105, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.determine.determine_equation', 'parent_child', true, 106, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.rewrite.rewrite_to_vertex_form', 'parent_child', true, 107, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.rewrite.rewrite_to_standard_form', 'parent_child', true, 108, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.rewrite.simplify_expression', 'parent_child', true, 109, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.explain.explain_reasoning', 'parent_child', true, 110, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.explain.explain_error', 'parent_child', true, 111, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.explain.justify_answer', 'parent_child', true, 112, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.model.build_model', 'parent_child', true, 113, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.model.optimize_quantity', 'parent_child', true, 114, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb),
  ('task', 'task.model.interpret_context', 'parent_child', true, 115, 'active', '{"seed":"math_taxonomy_v1","sourceEdgeKind":"parent_child"}'::jsonb)
on conflict (from_tag_id, to_tag_id, edge_kind) do update set is_primary = excluded.is_primary, sort_order = excluded.sort_order, status = excluded.status, metadata = excluded.metadata;


insert into public.taxonomy_aliases (alias_text, normalized_alias, tag_id, status, metadata) values
  ('quadratic max', 'quadratic max', 'concept.algebra.functions.quadratic.extreme_value', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb),
  ('maximum value', 'maximum value', 'concept.algebra.functions.quadratic.extreme_value', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb),
  ('where maximum occurs', 'where maximum occurs', 'concept.algebra.functions.quadratic.where_extreme_occurs', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb),
  ('x value of vertex', 'x value of vertex', 'concept.algebra.functions.quadratic.where_extreme_occurs', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb),
  ('vertex form', 'vertex form', 'form.symbolic.vertex_form', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb),
  ('complete square', 'complete square', 'method.algebraic_manipulation.complete_the_square', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb),
  ('read graph', 'read graph', 'method.graph_reasoning.read_from_graph', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb),
  ('chain rule', 'chain rule', 'concept.calculus.derivatives.chain_rule', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb),
  ('composite derivative', 'composite derivative', 'concept.calculus.derivatives.chain_rule', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb),
  ('vertex', 'vertex', 'concept.algebra.functions.quadratic.vertex', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb),
  ('vertex', 'vertex', 'task.identify.identify_vertex', 'active', '{"seed":"math_taxonomy_v1"}'::jsonb)
on conflict (normalized_alias, tag_id) do update set alias_text = excluded.alias_text, status = excluded.status, metadata = excluded.metadata;


select private.rebuild_taxonomy_node_closure();

drop trigger if exists taxonomy_nodes_validate on public.taxonomy_nodes;
create trigger taxonomy_nodes_validate
before insert or update on public.taxonomy_nodes
for each row execute function private.validate_taxonomy_node();

drop trigger if exists taxonomy_edges_validate_parent on public.taxonomy_edges;
create trigger taxonomy_edges_validate_parent
before insert or update on public.taxonomy_edges
for each row execute function private.validate_taxonomy_parent_edge();

drop trigger if exists question_taxonomy_assignments_validate on public.question_taxonomy_assignments;
create trigger question_taxonomy_assignments_validate
before insert or update on public.question_taxonomy_assignments
for each row execute function private.validate_question_taxonomy_assignment();

drop trigger if exists taxonomy_nodes_refresh_closure on public.taxonomy_nodes;
create trigger taxonomy_nodes_refresh_closure
after insert or update or delete on public.taxonomy_nodes
for each statement execute function private.refresh_taxonomy_node_closure_trigger();

drop trigger if exists taxonomy_edges_refresh_closure on public.taxonomy_edges;
create trigger taxonomy_edges_refresh_closure
after insert or update or delete on public.taxonomy_edges
for each statement execute function private.refresh_taxonomy_node_closure_trigger();

alter table public.taxonomy_facets enable row level security;
alter table public.taxonomy_nodes enable row level security;
alter table public.taxonomy_edges enable row level security;
alter table public.taxonomy_node_closure enable row level security;
alter table public.taxonomy_aliases enable row level security;
alter table public.question_taxonomy_assignments enable row level security;
alter table public.taxonomy_review_actions enable row level security;

grant select on public.taxonomy_facets, public.taxonomy_nodes, public.taxonomy_edges, public.taxonomy_node_closure, public.taxonomy_aliases to anon, authenticated;
grant select on public.question_taxonomy_assignments to anon, authenticated;
grant select, insert, update, delete on public.taxonomy_facets, public.taxonomy_nodes, public.taxonomy_edges, public.taxonomy_aliases, public.question_taxonomy_assignments, public.taxonomy_review_actions to authenticated;
grant execute on function public.taxonomy_tag_path(text) to anon, authenticated;

create policy taxonomy_facets_public_read_active on public.taxonomy_facets for select using (status = 'active');
create policy taxonomy_facets_admin_crud on public.taxonomy_facets for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy taxonomy_nodes_public_read_active on public.taxonomy_nodes for select using (status = 'active');
create policy taxonomy_nodes_admin_crud on public.taxonomy_nodes for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy taxonomy_edges_public_read_active on public.taxonomy_edges for select using (status = 'active');
create policy taxonomy_edges_admin_crud on public.taxonomy_edges for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy taxonomy_node_closure_public_read on public.taxonomy_node_closure for select using (true);
create policy taxonomy_aliases_public_read_active on public.taxonomy_aliases for select using (status = 'active');
create policy taxonomy_aliases_admin_crud on public.taxonomy_aliases for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy question_taxonomy_assignments_public_read_approved on public.question_taxonomy_assignments for select using (review_status = 'approved' and exists (select 1 from public.questions q where q.id = question_id and q.status = 'published'));
create policy question_taxonomy_assignments_admin_crud on public.question_taxonomy_assignments for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy taxonomy_review_actions_admin_crud on public.taxonomy_review_actions for all using ((select private.is_admin())) with check ((select private.is_admin()));

drop table if exists public.five_facet_video_tag_assignments cascade;
drop table if exists public.five_facet_tag_review_actions cascade;
drop table if exists public.five_facet_question_tag_assignments cascade;
drop table if exists public.five_facet_curriculum_concept_mappings cascade;
drop table if exists public.five_facet_tag_aliases cascade;
drop table if exists public.five_facet_tag_edges cascade;
drop table if exists public.five_facet_tag_nodes cascade;
drop table if exists public.video_tags cascade;
drop table if exists public.question_tags cascade;
drop table if exists public.tags cascade;

commit;
