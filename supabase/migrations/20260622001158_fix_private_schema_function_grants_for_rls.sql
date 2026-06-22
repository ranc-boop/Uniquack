-- Forward repair for databases that applied an older/partial 0011 taxonomy migration.
-- Safe to apply without resetting existing questions, drafts, or taxonomy assignments.

begin;

grant usage on schema private to anon, authenticated;
grant execute on function private.current_user_role() to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.is_super_admin() to anon, authenticated;

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

grant execute on function private.taxonomy_label_from_tag_id(text) to anon, authenticated;
grant execute on function public.taxonomy_tag_path(text) to anon, authenticated;

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

commit;

-- Recreate the taxonomy search RPC after repairing helper function access.
-- Database-native taxonomy search for question bank and future Agent tools.
-- Apply after 0011_math_taxonomy_source_of_truth.sql.

create index if not exists questions_taxonomy_search_fts_idx
  on public.questions using gin (
    to_tsvector('simple'::regconfig, coalesce(question_code, '') || ' ' || coalesce(title, ''))
  );

drop function if exists public.search_questions_by_taxonomy(
  text[],
  text[],
  integer,
  integer,
  text,
  text,
  text,
  integer,
  integer
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
  select q.*
  from public.questions q
  cross join args
  where (question_status is null or q.status = question_status)
    and (difficulty_min is null or q.difficulty_rating >= difficulty_min)
    and (difficulty_max is null or q.difficulty_rating <= difficulty_max)
    and (
      args.normalized_query is null
      or to_tsvector('simple'::regconfig, coalesce(q.question_code, '') || ' ' || coalesce(q.title, ''))
        @@ plainto_tsquery('simple'::regconfig, args.normalized_query)
      or q.question_code ilike '%' || args.normalized_query || '%'
      or q.title ilike '%' || args.normalized_query || '%'
    )
    and (
      args.cursor_created_at is null
      or q.created_at < args.cursor_created_at
      or (q.created_at = args.cursor_created_at and q.id < args.cursor_question_id)
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
        where assignment.question_id = q.id
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
      where assignment.question_id = q.id
        and (
          assignment_review_status is null
          or assignment.review_status = assignment_review_status
        )
    )
),
ordered_page as (
  select
    q.*,
    count(*) over () as total_count
  from filtered_questions q
  order by q.created_at desc, q.id desc
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
    q.id as question_id,
    assignment.tag_id,
    node.facet_key,
    assignment.review_status,
    public.taxonomy_tag_path(assignment.tag_id) as path
  from visible_questions q
  left join public.question_taxonomy_assignments assignment
    on assignment.question_id = q.id
   and (
     assignment_review_status is null
     or assignment.review_status = assignment_review_status
   )
  left join public.taxonomy_nodes node
    on node.tag_id = assignment.tag_id
)
select
  q.id as question_id,
  q.question_code,
  q.title,
  q.difficulty_rating,
  q.question_type,
  q.status,
  coalesce(
    array_agg(distinct ar.tag_id)
      filter (where ar.tag_id is not null),
    '{}'::text[]
  ) as matched_tag_ids,
  coalesce(
    jsonb_agg(
      distinct jsonb_build_object(
        'tag_id', ar.tag_id,
        'facet_key', ar.facet_key,
        'review_status', ar.review_status,
        'path', ar.path
      )
    ) filter (where ar.tag_id is not null),
    '[]'::jsonb
  ) as matched_tags,
  q.total_count,
  next_page.next_cursor
from visible_questions q
cross join next_page
left join assignment_rows ar
  on ar.question_id = q.id
group by
  q.id,
  q.question_code,
  q.title,
  q.difficulty_rating,
  q.question_type,
  q.status,
  q.created_at,
  q.total_count,
  next_page.next_cursor
order by q.created_at desc, q.id desc;
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
