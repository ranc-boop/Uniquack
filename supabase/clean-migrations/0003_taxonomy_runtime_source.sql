-- Clean Supabase MVP v1 draft migration.
-- Taxonomy is the runtime tag source of truth.
-- Draft only: review before applying to any database.

create table if not exists public.taxonomy_facets (
  facet_key text primary key check (length(btrim(facet_key)) > 0),
  subject_tag_id text not null,
  root_tag_id text not null unique,
  label text not null check (length(btrim(label)) > 0),
  description text,
  sort_order integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'deprecated', 'archived')),
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.taxonomy_nodes (
  tag_id text primary key check (length(btrim(tag_id)) > 0),
  node_kind text not null default 'tag'
    check (node_kind in ('subject', 'facet_root', 'tag')),
  subject_tag_id text,
  facet_key text,
  label text not null check (length(btrim(label)) > 0),
  description text,
  is_assignable boolean not null default true,
  sort_order integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'deprecated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  deprecated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (node_kind = 'subject' and subject_tag_id is null and facet_key is null)
    or (node_kind <> 'subject' and subject_tag_id is not null)
  )
);

create table if not exists public.taxonomy_edges (
  id uuid primary key default gen_random_uuid(),
  from_tag_id text not null references public.taxonomy_nodes(tag_id) on delete cascade,
  to_tag_id text not null references public.taxonomy_nodes(tag_id) on delete cascade,
  edge_kind text not null
    check (edge_kind in ('parent_child', 'related', 'maps_to', 'prerequisite')),
  is_primary boolean not null default true,
  sort_order integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'deprecated', 'archived')),
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
  depth integer not null check (depth >= 0),
  primary key (ancestor_tag_id, descendant_tag_id)
);

create table if not exists public.taxonomy_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_text text not null check (length(btrim(alias_text)) > 0),
  normalized_alias text not null check (length(btrim(normalized_alias)) > 0),
  tag_id text not null references public.taxonomy_nodes(tag_id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'ambiguous', 'deprecated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  deprecated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_alias, tag_id)
);

create table if not exists public.taxonomy_review_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  action_id text unique,
  question_id uuid,
  question_ref jsonb not null default '{}'::jsonb,
  action_kind text not null
    check (
      action_kind in (
        'create_node',
        'edit_node',
        'merge_alias',
        'deprecate_node',
        'manual_review',
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
  review_status text not null default 'pending_review'
    check (review_status in ('pending_review', 'approved', 'rejected', 'needs_review', 'archived', 'applied')),
  target_node_id text references public.taxonomy_nodes(tag_id) on delete set null,
  target_tag_ids text[] not null default '{}'::text[],
  proposed_tag_ids text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  reason text,
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.taxonomy_facets
  add constraint taxonomy_facets_subject_fkey
    foreign key (subject_tag_id) references public.taxonomy_nodes(tag_id) on delete restrict deferrable initially deferred,
  add constraint taxonomy_facets_root_fkey
    foreign key (root_tag_id) references public.taxonomy_nodes(tag_id) on delete restrict deferrable initially deferred;

alter table public.taxonomy_nodes
  add constraint taxonomy_nodes_subject_fkey
    foreign key (subject_tag_id) references public.taxonomy_nodes(tag_id) on delete restrict deferrable initially deferred,
  add constraint taxonomy_nodes_facet_fkey
    foreign key (facet_key) references public.taxonomy_facets(facet_key) on delete restrict deferrable initially deferred;

comment on table public.taxonomy_nodes is
  'Official runtime taxonomy nodes. Current app contract uses tag_id/facet_key and active assignable leaf tags.';

create index if not exists taxonomy_nodes_subject_facet_status_idx
  on public.taxonomy_nodes(subject_tag_id, facet_key, status);

create index if not exists taxonomy_nodes_assignable_status_idx
  on public.taxonomy_nodes(is_assignable, status)
  where is_assignable;

create index if not exists taxonomy_edges_from_idx
  on public.taxonomy_edges(from_tag_id, edge_kind, status);

create index if not exists taxonomy_edges_to_idx
  on public.taxonomy_edges(to_tag_id, edge_kind, status);

create index if not exists taxonomy_node_closure_descendant_idx
  on public.taxonomy_node_closure(descendant_tag_id, depth);

create index if not exists taxonomy_aliases_normalized_idx
  on public.taxonomy_aliases(normalized_alias, status);

create index if not exists taxonomy_review_actions_question_idx
  on public.taxonomy_review_actions(question_id, review_status);

drop trigger if exists taxonomy_facets_set_updated_at on public.taxonomy_facets;
create trigger taxonomy_facets_set_updated_at
before update on public.taxonomy_facets
for each row execute function private.set_updated_at();

drop trigger if exists taxonomy_nodes_set_updated_at on public.taxonomy_nodes;
create trigger taxonomy_nodes_set_updated_at
before update on public.taxonomy_nodes
for each row execute function private.set_updated_at();

drop trigger if exists taxonomy_edges_set_updated_at on public.taxonomy_edges;
create trigger taxonomy_edges_set_updated_at
before update on public.taxonomy_edges
for each row execute function private.set_updated_at();

drop trigger if exists taxonomy_aliases_set_updated_at on public.taxonomy_aliases;
create trigger taxonomy_aliases_set_updated_at
before update on public.taxonomy_aliases
for each row execute function private.set_updated_at();

drop trigger if exists taxonomy_review_actions_set_updated_at on public.taxonomy_review_actions;
create trigger taxonomy_review_actions_set_updated_at
before update on public.taxonomy_review_actions
for each row execute function private.set_updated_at();

create or replace function private.rebuild_taxonomy_node_closure()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  truncate table public.taxonomy_node_closure;

  insert into public.taxonomy_node_closure (ancestor_tag_id, descendant_tag_id, depth)
  select tag_id, tag_id, 0
  from public.taxonomy_nodes
  where status = 'active';

  with recursive walk as (
    select
      edge.from_tag_id as ancestor_tag_id,
      edge.to_tag_id as descendant_tag_id,
      1 as depth,
      array[edge.from_tag_id, edge.to_tag_id] as path
    from public.taxonomy_edges edge
    join public.taxonomy_nodes parent_node
      on parent_node.tag_id = edge.from_tag_id
     and parent_node.status = 'active'
    join public.taxonomy_nodes child_node
      on child_node.tag_id = edge.to_tag_id
     and child_node.status = 'active'
    where edge.edge_kind = 'parent_child'
      and edge.status = 'active'
    union all
    select
      walk.ancestor_tag_id,
      edge.to_tag_id,
      walk.depth + 1,
      walk.path || edge.to_tag_id
    from walk
    join public.taxonomy_edges edge
      on edge.from_tag_id = walk.descendant_tag_id
     and edge.edge_kind = 'parent_child'
     and edge.status = 'active'
    join public.taxonomy_nodes child_node
      on child_node.tag_id = edge.to_tag_id
     and child_node.status = 'active'
    where not edge.to_tag_id = any(walk.path)
  )
  insert into public.taxonomy_node_closure (ancestor_tag_id, descendant_tag_id, depth)
  select ancestor_tag_id, descendant_tag_id, min(depth)
  from walk
  group by ancestor_tag_id, descendant_tag_id
  on conflict (ancestor_tag_id, descendant_tag_id)
  do update set depth = excluded.depth;
end;
$$;

create or replace function private.refresh_taxonomy_node_closure_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private
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
set search_path = public, private
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
set search_path = public, private
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
      select edge.to_tag_id
      from public.taxonomy_edges edge
      where edge.from_tag_id = new.to_tag_id
        and edge.edge_kind = 'parent_child'
        and edge.status = 'active'
        and (excluded_edge_id is null or edge.id <> excluded_edge_id)
      union
      select edge.to_tag_id
      from descendants
      join public.taxonomy_edges edge
        on edge.from_tag_id = descendants.tag_id
       and edge.edge_kind = 'parent_child'
       and edge.status = 'active'
       and (excluded_edge_id is null or edge.id <> excluded_edge_id)
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
set search_path = public, private
as $$
  with recursive upward as (
    select node.tag_id, 0 as depth
    from public.taxonomy_nodes node
    where node.tag_id = input_tag_id
    union all
    select parent_node.tag_id, upward.depth + 1
    from upward
    join public.taxonomy_edges edge
      on edge.to_tag_id = upward.tag_id
     and edge.edge_kind = 'parent_child'
     and edge.status = 'active'
     and edge.is_primary
    join public.taxonomy_nodes parent_node
      on parent_node.tag_id = edge.from_tag_id
     and parent_node.status = 'active'
  )
  select coalesce(array_agg(private.taxonomy_label_from_tag_id(tag_id) order by depth desc), '{}'::text[])
  from upward;
$$;

select private.rebuild_taxonomy_node_closure();

drop trigger if exists taxonomy_nodes_validate on public.taxonomy_nodes;
create trigger taxonomy_nodes_validate
before insert or update on public.taxonomy_nodes
for each row execute function private.validate_taxonomy_node();

drop trigger if exists taxonomy_edges_validate_parent on public.taxonomy_edges;
create trigger taxonomy_edges_validate_parent
before insert or update on public.taxonomy_edges
for each row execute function private.validate_taxonomy_parent_edge();

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
alter table public.taxonomy_review_actions enable row level security;

drop policy if exists taxonomy_facets_active_read on public.taxonomy_facets;
create policy taxonomy_facets_active_read
on public.taxonomy_facets for select
using (status = 'active' or private.is_admin());

drop policy if exists taxonomy_facets_admin_crud on public.taxonomy_facets;
create policy taxonomy_facets_admin_crud
on public.taxonomy_facets for all
using (private.is_admin())
with check (private.is_admin());

drop policy if exists taxonomy_nodes_active_read on public.taxonomy_nodes;
create policy taxonomy_nodes_active_read
on public.taxonomy_nodes for select
using (status = 'active' or private.is_admin());

drop policy if exists taxonomy_nodes_admin_crud on public.taxonomy_nodes;
create policy taxonomy_nodes_admin_crud
on public.taxonomy_nodes for all
using (private.is_admin())
with check (private.is_admin());

drop policy if exists taxonomy_edges_active_read on public.taxonomy_edges;
create policy taxonomy_edges_active_read
on public.taxonomy_edges for select
using (status = 'active' or private.is_admin());

drop policy if exists taxonomy_edges_admin_crud on public.taxonomy_edges;
create policy taxonomy_edges_admin_crud
on public.taxonomy_edges for all
using (private.is_admin())
with check (private.is_admin());

drop policy if exists taxonomy_node_closure_read on public.taxonomy_node_closure;
create policy taxonomy_node_closure_read
on public.taxonomy_node_closure for select
using (true);

drop policy if exists taxonomy_node_closure_admin_write on public.taxonomy_node_closure;
create policy taxonomy_node_closure_admin_write
on public.taxonomy_node_closure for all
using (private.is_admin())
with check (private.is_admin());

drop policy if exists taxonomy_aliases_active_read on public.taxonomy_aliases;
create policy taxonomy_aliases_active_read
on public.taxonomy_aliases for select
using (status = 'active' or private.is_admin());

drop policy if exists taxonomy_aliases_admin_crud on public.taxonomy_aliases;
create policy taxonomy_aliases_admin_crud
on public.taxonomy_aliases for all
using (private.is_admin())
with check (private.is_admin());

drop policy if exists taxonomy_review_actions_staff_read on public.taxonomy_review_actions;
create policy taxonomy_review_actions_staff_read
on public.taxonomy_review_actions for select
using (
  private.is_admin()
  or (organization_id is not null and private.is_org_staff(organization_id))
);

drop policy if exists taxonomy_review_actions_staff_write on public.taxonomy_review_actions;
create policy taxonomy_review_actions_staff_write
on public.taxonomy_review_actions for all
using (
  private.is_admin()
  or (organization_id is not null and private.is_org_staff(organization_id))
)
with check (
  private.is_admin()
  or (organization_id is not null and private.is_org_staff(organization_id))
);

grant execute on function public.taxonomy_tag_path(text) to anon, authenticated;
grant execute on function private.rebuild_taxonomy_node_closure() to authenticated;
grant execute on function private.refresh_taxonomy_node_closure_trigger() to authenticated;
grant execute on function private.taxonomy_label_from_tag_id(text) to anon, authenticated;
