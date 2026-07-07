-- 0029_teacher_role_bank_public_boundary.sql
-- Teacher role and bank/public boundary hardening.
--
-- Question Banks are private/shared content workspaces. Public/global Question
-- Bank reads must only expose global questions that were explicitly published
-- as public content. Bank-owned questions are delivered through assignments,
-- not through the public question catalog.

update public.questions
set visibility = 'public'
where owner_bank_id is null
  and status = 'published'
  and visibility <> 'public';

drop policy if exists questions_published_read on public.questions;
create policy questions_published_read
on public.questions for select
using (
  status = 'published'
  and visibility = 'public'
  and owner_bank_id is null
  and deleted_at is null
);

drop policy if exists question_rubric_steps_public_read on public.question_rubric_steps;
create policy question_rubric_steps_public_read
on public.question_rubric_steps for select
using (
  exists (
    select 1
    from public.questions
    where questions.id = question_rubric_steps.question_id
      and questions.status = 'published'
      and questions.visibility = 'public'
      and questions.owner_bank_id is null
      and questions.deleted_at is null
  )
);

drop policy if exists question_assets_public_read on public.question_assets;
create policy question_assets_public_read
on public.question_assets for select
using (
  exists (
    select 1
    from public.questions
    where questions.id = question_assets.question_id
      and questions.status = 'published'
      and questions.visibility = 'public'
      and questions.owner_bank_id is null
      and questions.deleted_at is null
  )
);

drop policy if exists question_taxonomy_assignments_public_read on public.question_taxonomy_assignments;
create policy question_taxonomy_assignments_public_read
on public.question_taxonomy_assignments for select
using (
  review_status = 'approved'
  and exists (
    select 1
    from public.questions
    where questions.id = question_taxonomy_assignments.question_id
      and questions.status = 'published'
      and questions.visibility = 'public'
      and questions.owner_bank_id is null
      and questions.deleted_at is null
  )
);

create or replace function public.publish_review_draft_questions(question_ids uuid[])
returns table (
  question_id uuid,
  source_review_item_id uuid,
  approved_taxonomy_assignment_count integer
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  reviewer_id uuid := auth.uid();
  selected_count integer := 0;
  processed_count integer := 0;
  question_row public.questions%rowtype;
  resolved_review_batch_id uuid;
  resolved_review_item_id uuid;
  linked_batch_id uuid;
  linked_batch_source_type text;
  approved_assignment_count integer := 0;
begin
  if reviewer_id is null then
    raise exception 'Review Draft publish requires an authenticated reviewer.';
  end if;

  if not private.is_teacher_or_admin() then
    raise exception 'Review Draft publish requires teacher or admin access.';
  end if;

  select count(*)
  into selected_count
  from (
    select distinct unnest(coalesce(question_ids, '{}'::uuid[])) as id
  ) selected
  where selected.id is not null;

  if selected_count = 0 then
    raise exception 'Select at least one question to publish.';
  end if;

  for question_row in
    select question.*
    from public.questions question
    join (
      select distinct unnest(coalesce(question_ids, '{}'::uuid[])) as id
    ) selected
      on selected.id = question.id
    where selected.id is not null
    order by question.created_at, question.id
    for update of question
  loop
    processed_count := processed_count + 1;
    resolved_review_batch_id := null;
    resolved_review_item_id := question_row.source_review_item_id;
    linked_batch_id := null;
    linked_batch_source_type := null;
    approved_assignment_count := 0;

    if not private.is_org_staff(question_row.organization_id) then
      raise exception 'Review Draft publish cannot access the selected question organization.';
    end if;

    if question_row.owner_bank_id is not null then
      raise exception 'Bank-owned questions must be approved through bank review, not global publish.';
    end if;

    if question_row.deleted_at is not null then
      raise exception 'Deleted questions cannot be published.';
    end if;

    if question_row.status = 'published' then
      raise exception 'Question % is already published.', question_row.question_code;
    end if;

    if question_row.source_kind in ('ai_import', 'blueprint_generation') then
      if resolved_review_item_id is not null then
        select item.review_batch_id
        into resolved_review_batch_id
        from public.review_draft_items item
        join public.review_batches batch
          on batch.id = item.review_batch_id
        where item.id = resolved_review_item_id
          and item.item_kind = 'question'
          and (item.created_question_id is null or item.created_question_id = question_row.id)
          and batch.organization_id = question_row.organization_id
        limit 1;

        if resolved_review_batch_id is null then
          raise exception 'Review lineage for question % is invalid or not accessible.', question_row.question_code;
        end if;
      else
        select item.batch_id, batch.source_type
        into linked_batch_id, linked_batch_source_type
        from public.import_batch_items item
        join public.import_batches batch
          on batch.id = item.batch_id
        where item.created_question_id = question_row.id
          and batch.organization_id = question_row.organization_id
        order by item.created_at desc, item.id desc
        limit 1;

        if linked_batch_id is null then
          raise exception 'Review lineage is required before publishing generated question %.', question_row.question_code;
        end if;

        select batch.id
        into resolved_review_batch_id
        from public.review_batches batch
        where batch.organization_id = question_row.organization_id
          and batch.source_kind = case
            when question_row.source_kind = 'blueprint_generation' then 'blueprint_generation'
            else 'ai_import'
          end
          and batch.source_record_id = linked_batch_id
          and batch.summary ->> 'lineageCreatedBy' = 'publish_review_draft_questions'
        order by batch.created_at desc, batch.id desc
        limit 1;

        if resolved_review_batch_id is null then
          insert into public.review_batches (
            organization_id,
            created_by,
            source_kind,
            source_record_id,
            status,
            title,
            summary
          )
          values (
            question_row.organization_id,
            reviewer_id,
            case
              when question_row.source_kind = 'blueprint_generation' then 'blueprint_generation'
              else 'ai_import'
            end,
            linked_batch_id,
            'pending_review',
            'Recovered review lineage for generated questions',
            jsonb_build_object(
              'lineageCreatedBy', 'publish_review_draft_questions',
              'sourceImportBatchId', linked_batch_id,
              'sourceType', linked_batch_source_type,
              'reason', 'Generated question existed before review_draft_items lineage was attached.'
            )
          )
          returning id into resolved_review_batch_id;
        end if;

        insert into public.review_draft_items (
          review_batch_id,
          item_kind,
          status,
          draft_payload,
          validation_warnings,
          created_question_id
        )
        select
          resolved_review_batch_id,
          'question',
          'pending_review',
          jsonb_build_object(
            'questionId', question_row.id,
            'questionCode', question_row.question_code,
            'title', question_row.title,
            'sourceKind', question_row.source_kind,
            'sourceImportBatchId', linked_batch_id,
            'lineageCreatedBy', 'publish_review_draft_questions'
          ),
          coalesce(item.validation_errors, '[]'::jsonb),
          question_row.id
        from public.import_batch_items item
        where item.batch_id = linked_batch_id
          and item.created_question_id = question_row.id
        order by item.created_at desc, item.id desc
        limit 1
        returning id into resolved_review_item_id;

        if resolved_review_item_id is null then
          raise exception 'Review lineage could not be attached for generated question %.', question_row.question_code;
        end if;
      end if;
    end if;

    update public.questions as question_update
    set
      source_review_item_id = case
        when question_row.source_kind in ('ai_import', 'blueprint_generation')
        then resolved_review_item_id
        else question_update.source_review_item_id
      end,
      owner_bank_id = null,
      visibility = 'public',
      status = 'published',
      published_at = coalesce(question_row.published_at, now()),
      reviewed_by = reviewer_id,
      updated_by = reviewer_id
    where question_update.id = question_row.id;

    update public.question_taxonomy_assignments as assignment
    set
      review_status = 'approved',
      approved_at = now(),
      approved_by = reviewer_id,
      updated_by = reviewer_id
    where assignment.question_id = question_row.id
      and assignment.review_status in ('pending_review', 'needs_review');

    get diagnostics approved_assignment_count = row_count;

    if resolved_review_item_id is not null then
      update public.review_draft_items
      set status = 'approved'
      where id = resolved_review_item_id;

      update public.review_batches
      set status = 'approved'
      where id = resolved_review_batch_id
        and not exists (
          select 1
          from public.review_draft_items pending_item
          where pending_item.review_batch_id = resolved_review_batch_id
            and pending_item.status in ('pending_review', 'needs_more_evidence')
        );

      insert into public.review_actions (
        review_batch_id,
        review_draft_item_id,
        action_kind,
        status,
        reason,
        evidence,
        reviewer_id
      )
      values (
        resolved_review_batch_id,
        resolved_review_item_id,
        'approve',
        'completed',
        'Published generated draft through Review Draft approval workflow.',
        jsonb_build_array(jsonb_build_object(
          'questionId', question_row.id,
          'questionCode', question_row.question_code,
          'sourceKind', question_row.source_kind
        )),
        reviewer_id
      );
    end if;

    insert into public.question_status_events (
      question_id,
      from_status,
      to_status,
      reason,
      actor_id
    )
    values (
      question_row.id,
      question_row.status,
      'published',
      'Review Draft approval workflow',
      reviewer_id
    );

    question_id := question_row.id;
    source_review_item_id := resolved_review_item_id;
    approved_taxonomy_assignment_count := approved_assignment_count;
    return next;
  end loop;

  if processed_count <> selected_count then
    raise exception 'Only resolved % of % selected question(s).', processed_count, selected_count;
  end if;
end;
$$;

comment on function public.publish_review_draft_questions(uuid[]) is
  'Teacher/admin Review Draft publish RPC. Publishes only global public questions; bank-owned questions must use bank review approval.';

revoke all on function public.publish_review_draft_questions(uuid[])
from public, anon;

grant execute on function public.publish_review_draft_questions(uuid[])
to authenticated;

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
