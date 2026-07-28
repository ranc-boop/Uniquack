-- Prevent repeated taxonomy-path and RLS work in the shared question search.
--
-- PostgreSQL may inline assignment_rows into the final aggregate. On the
-- hosted dataset that caused the assignment lookup and taxonomy_tag_path()
-- work to be repeated, amplifying a 50-row search into tens of thousands of
-- buffer hits. MATERIALIZED evaluates that bounded page enrichment once.
--
-- This is a body-only forward fix. The function signature, grants, RLS
-- behavior, taxonomy expansion semantics, ordering, and cursor contract stay
-- unchanged.

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
    and question.owner_bank_id is null
    and (
      question_status is distinct from 'published'
      or question.visibility = 'public'
    )
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
assignment_rows as materialized (
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

comment on function public.search_questions_by_taxonomy(
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
) is
  'Question taxonomy search with page-bounded, once-materialized taxonomy enrichment to avoid repeated RLS and tag-path evaluation.';
