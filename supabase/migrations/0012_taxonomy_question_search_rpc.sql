-- Database-native taxonomy search for question bank and future Agent tools.
-- Not applied by Codex. Apply manually after 0011_math_taxonomy_source_of_truth.sql.

create or replace function public.search_questions_by_taxonomy(
  include_tag_ids text[] default '{}'::text[],
  exclude_tag_ids text[] default '{}'::text[],
  difficulty_min integer default null,
  difficulty_max integer default null,
  question_status text default 'published',
  assignment_review_status text default 'approved',
  page_limit integer default 50,
  page_offset integer default 0
)
returns table (
  question_id uuid,
  question_code text,
  title text,
  difficulty_rating integer,
  question_type text,
  status text,
  matched_tag_ids text[],
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
with
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
include_curriculum_concept as (
  select
    coalesce(descendant.facet_key, mapped.to_facet_key) as facet_key,
    coalesce(closure.descendant_tag_id, mapped.to_tag_id) as tag_id
  from (
    select
      edge.to_tag_id,
      target.facet_key as to_facet_key
    from include_input input
    join public.taxonomy_edges edge
      on edge.from_tag_id = input.tag_id
     and edge.edge_kind = 'maps_to'
     and edge.status = 'active'
    join public.taxonomy_nodes target
      on target.tag_id = edge.to_tag_id
     and target.status = 'active'
  ) mapped
  left join public.taxonomy_node_closure closure
    on closure.ancestor_tag_id = mapped.to_tag_id
  left join public.taxonomy_nodes descendant
    on descendant.tag_id = closure.descendant_tag_id
   and descendant.status = 'active'
  where coalesce(descendant.is_assignable, true)
),
include_expanded as (
  select distinct facet_key, tag_id
  from include_expanded_base
  where facet_key is not null
  union
  select distinct facet_key, tag_id
  from include_curriculum_concept
  where facet_key is not null
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
exclude_curriculum_concept as (
  select
    coalesce(descendant.facet_key, mapped.to_facet_key) as facet_key,
    coalesce(closure.descendant_tag_id, mapped.to_tag_id) as tag_id
  from (
    select
      edge.to_tag_id,
      target.facet_key as to_facet_key
    from exclude_input input
    join public.taxonomy_edges edge
      on edge.from_tag_id = input.tag_id
     and edge.edge_kind = 'maps_to'
     and edge.status = 'active'
    join public.taxonomy_nodes target
      on target.tag_id = edge.to_tag_id
     and target.status = 'active'
  ) mapped
  left join public.taxonomy_node_closure closure
    on closure.ancestor_tag_id = mapped.to_tag_id
  left join public.taxonomy_nodes descendant
    on descendant.tag_id = closure.descendant_tag_id
   and descendant.status = 'active'
  where coalesce(descendant.is_assignable, true)
),
exclude_expanded as (
  select distinct tag_id
  from exclude_expanded_base
  where tag_id is not null
  union
  select distinct tag_id
  from exclude_curriculum_concept
  where tag_id is not null
),
filtered_questions as (
  select q.*
  from public.questions q
  where (question_status is null or q.status = question_status)
    and (difficulty_min is null or q.difficulty_rating >= difficulty_min)
    and (difficulty_max is null or q.difficulty_rating <= difficulty_max)
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
ranked_questions as (
  select
    q.*,
    count(*) over () as total_count
  from filtered_questions q
  order by q.created_at desc
  limit greatest(1, least(coalesce(page_limit, 50), 100))
  offset greatest(0, coalesce(page_offset, 0))
)
select
  q.id as question_id,
  q.question_code,
  q.title,
  q.difficulty_rating,
  q.question_type,
  q.status,
  coalesce(
    array_agg(distinct assignment.tag_id)
      filter (where assignment.tag_id is not null),
    '{}'::text[]
  ) as matched_tag_ids,
  q.total_count
from ranked_questions q
left join public.question_taxonomy_assignments assignment
  on assignment.question_id = q.id
 and (
   assignment_review_status is null
   or assignment.review_status = assignment_review_status
 )
group by
  q.id,
  q.question_code,
  q.title,
  q.difficulty_rating,
  q.question_type,
  q.status,
  q.created_at,
  q.total_count
order by q.created_at desc;
$$;

grant execute on function public.search_questions_by_taxonomy(
  text[],
  text[],
  integer,
  integer,
  text,
  text,
  integer,
  integer
) to authenticated, anon;

