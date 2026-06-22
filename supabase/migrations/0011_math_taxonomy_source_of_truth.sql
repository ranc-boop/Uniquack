-- Generic math taxonomy source of truth.
-- Production-safe schema migration. Destructive taxonomy seed/reset data lives in a separate development-only migration.

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

-- 0011 is intentionally rerunnable during development. The table may already
-- exist from an older 0011 attempt, so recreate the cyclic taxonomy foreign
-- keys explicitly. Nodes reference facets by facet_key, while facets reference
-- their root nodes; keeping either side during reseed makes the seed order
-- impossible. Drop both sides before truncating/reseeding, then add them back
-- after nodes and facets exist.
alter table public.taxonomy_nodes drop constraint if exists taxonomy_nodes_subject_fkey;
alter table public.taxonomy_nodes drop constraint if exists taxonomy_nodes_facet_fkey;
alter table public.taxonomy_facets drop constraint if exists taxonomy_facets_subject_fkey;
alter table public.taxonomy_facets drop constraint if exists taxonomy_facets_root_fkey;

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
  truncate table public.taxonomy_node_closure;

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


create or replace function private.taxonomy_label_from_tag_id(input_tag_id text)
returns text
language sql
immutable
as $$
  select initcap(replace(regexp_replace(input_tag_id, '^.*\.', ''), '_', ' '));
$$;


create or replace function public.taxonomy_tag_path(input_tag_id text)
returns text[]
language sql
stable
security invoker
as $$
  with recursive upward as (
    select n.tag_id, 0 as depth
    from public.taxonomy_nodes n
    where n.tag_id = input_tag_id
    union all
    select p.tag_id, upward.depth + 1
    from upward
    join public.taxonomy_edges e on e.to_tag_id = upward.tag_id and e.edge_kind = 'parent_child' and e.status = 'active' and e.is_primary
    join public.taxonomy_nodes p on p.tag_id = e.from_tag_id and p.status = 'active'
  )
  select coalesce(array_agg(private.taxonomy_label_from_tag_id(tag_id) order by depth desc), '{}'::text[])
  from upward;
$$;


-- Taxonomy seed/reset data is intentionally not part of this production-safe
-- structure migration. Use the development-only reset migration when a local
-- taxonomy catalog needs to be rebuilt from seed data.

alter table public.taxonomy_facets
  add constraint taxonomy_facets_subject_fkey foreign key (subject_tag_id) references public.taxonomy_nodes(tag_id) on delete restrict,
  add constraint taxonomy_facets_root_fkey foreign key (root_tag_id) references public.taxonomy_nodes(tag_id) on delete restrict;

alter table public.taxonomy_nodes
  add constraint taxonomy_nodes_subject_fkey foreign key (subject_tag_id) references public.taxonomy_nodes(tag_id) on delete restrict,
  add constraint taxonomy_nodes_facet_fkey foreign key (facet_key) references public.taxonomy_facets(facet_key) on delete restrict;

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
grant usage on schema private to anon, authenticated;
grant execute on function private.current_user_role() to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.is_super_admin() to anon, authenticated;
grant execute on function private.taxonomy_label_from_tag_id(text) to anon, authenticated;

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

commit;
