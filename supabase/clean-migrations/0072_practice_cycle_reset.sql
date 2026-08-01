-- Non-destructive Practice cycle reset.
-- Historical attempts, mistake evidence, and Assignment progress are retained.

create table public.practice_progress_resets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reset_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practice_progress_resets enable row level security;

revoke all on table public.practice_progress_resets from public, anon, authenticated;
grant select on table public.practice_progress_resets to authenticated;

create policy practice_progress_resets_select_own
on public.practice_progress_resets
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.reset_my_practice_progress()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  next_reset_at timestamptz := clock_timestamp();
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  insert into public.practice_progress_resets (user_id, reset_at, updated_at)
  values (actor_id, next_reset_at, next_reset_at)
  on conflict (user_id) do update
    set reset_at = excluded.reset_at,
        updated_at = excluded.updated_at;

  return next_reset_at;
end;
$$;

revoke execute on function public.reset_my_practice_progress() from public, anon;
grant execute on function public.reset_my_practice_progress() to authenticated;

create or replace function public.list_selectable_practice_sources()
returns table (
  source_kind text,
  source_id uuid,
  name text,
  visibility text,
  membership_role text,
  unseen_count bigint,
  needs_retry_count bigint,
  mastered_count bigint,
  ungraded_count bigint,
  question_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
with reset_boundary as (
  select coalesce(
    (select reset.reset_at
     from public.practice_progress_resets reset
     where reset.user_id = auth.uid()),
    '-infinity'::timestamptz
  ) as reset_at
),
latest_attempt as (
  select distinct on (attempt.source_question_id)
    attempt.source_question_id,
    attempt.is_correct
  from public.practice_attempts attempt
  cross join reset_boundary reset
  where attempt.user_id = auth.uid()
    and attempt.created_at > coalesce(reset.reset_at, '-infinity'::timestamptz)
  order by attempt.source_question_id, attempt.created_at desc, attempt.id desc
),
public_questions as (
  select question.id
  from public.questions question
  where question.status = 'published'
    and question.visibility = 'public'
    and question.owner_bank_id is null
    and question.deleted_at is null
),
member_banks as (
  select bank.id, bank.name, bank.visibility, member.role
  from public.question_banks bank
  join public.bank_members member
    on member.bank_id = bank.id
   and member.user_id = auth.uid()
   and member.status = 'active'
  where bank.status = 'active'
),
bank_ready_questions as (
  select distinct bank.id as bank_id, question.id as question_id
  from member_banks bank
  join public.bank_questions bank_question
    on bank_question.bank_id = bank.id
   and bank_question.status = 'active'
  join public.questions question
    on question.id = bank_question.question_id
   and question.deleted_at is null
   and question.status <> 'draft'
)
select
  'public_catalog'::text,
  null::uuid,
  'Public Question Bank'::text,
  'public'::text,
  null::text,
  count(*) filter (where latest_attempt.source_question_id is null),
  count(*) filter (where latest_attempt.is_correct = false),
  count(*) filter (where latest_attempt.is_correct = true),
  count(*) filter (
    where latest_attempt.source_question_id is not null
      and latest_attempt.is_correct is null
  ),
  count(*)
from public_questions question
left join latest_attempt on latest_attempt.source_question_id = question.id
union all
select
  'question_bank'::text,
  bank.id,
  bank.name,
  bank.visibility,
  bank.role,
  count(ready.question_id) filter (where latest_attempt.source_question_id is null),
  count(ready.question_id) filter (where latest_attempt.is_correct = false),
  count(ready.question_id) filter (where latest_attempt.is_correct = true),
  count(ready.question_id) filter (
    where latest_attempt.source_question_id is not null
      and latest_attempt.is_correct is null
  ),
  count(ready.question_id)
from member_banks bank
left join bank_ready_questions ready on ready.bank_id = bank.id
left join latest_attempt on latest_attempt.source_question_id = ready.question_id
group by bank.id, bank.name, bank.visibility, bank.role
order by source_kind, name;
$$;

revoke all on function public.list_selectable_practice_sources() from public, anon;
grant execute on function public.list_selectable_practice_sources() to authenticated;

create or replace function public.search_practice_questions_in_session(
  p_session_id uuid,
  p_include_tag_ids text[] default '{}'::text[],
  p_query_text text default null,
  p_difficulty_min integer default 0,
  p_difficulty_max integer default 1000,
  p_page_limit integer default 16
)
returns table (
  question_id uuid,
  question_code text,
  title text,
  difficulty_rating integer,
  question_type text,
  selection_state text,
  matched_tag_ids text[],
  unseen_count bigint,
  needs_retry_count bigint,
  mastered_count bigint,
  deferred_count bigint,
  ungraded_count bigint,
  eligible_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
with
owned_session as (
  select session.id
  from public.practice_sessions session
  where session.id = p_session_id
    and session.user_id = auth.uid()
    and session.status = 'active'
),
active_sources as (
  select source.*
  from public.practice_session_sources source
  join owned_session on owned_session.id = source.session_id
  where source.source_kind = 'public_catalog'
     or (
       source.source_kind = 'question_bank'
       and exists (
         select 1
         from public.question_banks bank
         join public.bank_members member
           on member.bank_id = bank.id
          and member.user_id = auth.uid()
          and member.status = 'active'
         where bank.id = source.bank_id
           and bank.status = 'active'
       )
     )
),
scope_questions as (
  select question.id
  from public.questions question
  where exists (
      select 1 from active_sources source
      where source.source_kind = 'public_catalog'
    )
    and question.status = 'published'
    and question.visibility = 'public'
    and question.owner_bank_id is null
    and question.deleted_at is null
  union
  select question.id
  from active_sources source
  join public.bank_questions bank_question
    on bank_question.bank_id = source.bank_id
   and bank_question.status = 'active'
  join public.questions question
    on question.id = bank_question.question_id
   and question.deleted_at is null
   and question.status <> 'draft'
  where source.source_kind = 'question_bank'
),
include_input as (
  select distinct unnest(coalesce(p_include_tag_ids, '{}'::text[])) as tag_id
),
include_expanded as (
  select distinct
    coalesce(descendant.facet_key, node.facet_key) as facet_key,
    coalesce(closure.descendant_tag_id, node.tag_id) as tag_id
  from include_input input
  join public.taxonomy_nodes node
    on node.tag_id = input.tag_id
   and node.status = 'active'
  left join public.taxonomy_node_closure closure
    on closure.ancestor_tag_id = node.tag_id
  left join public.taxonomy_nodes descendant
    on descendant.tag_id = closure.descendant_tag_id
   and descendant.status = 'active'
),
include_facets as (
  select distinct facet_key from include_expanded where facet_key is not null
),
reset_boundary as (
  select coalesce(
    (select reset.reset_at
     from public.practice_progress_resets reset
     where reset.user_id = auth.uid()),
    '-infinity'::timestamptz
  ) as reset_at
),
latest_attempt as (
  select distinct on (attempt.source_question_id)
    attempt.source_question_id,
    attempt.is_correct
  from public.practice_attempts attempt
  cross join reset_boundary reset
  where attempt.user_id = auth.uid()
    and attempt.created_at > coalesce(reset.reset_at, '-infinity'::timestamptz)
  order by attempt.source_question_id, attempt.created_at desc, attempt.id desc
),
retried_in_session as (
  select distinct round_question.source_question_id
  from public.practice_round_questions round_question
  join owned_session on owned_session.id = round_question.session_id
  where round_question.question_snapshot ->> 'selectionState' = 'needs_retry'
),
matched_scope as (
  select
    question.*,
    coalesce(
      array_agg(distinct assignment.tag_id)
        filter (where assignment.tag_id is not null),
      '{}'::text[]
    ) as matched_tag_ids
  from scope_questions scope
  join public.questions question on question.id = scope.id
  left join public.question_taxonomy_assignments assignment
    on assignment.question_id = question.id
   and assignment.review_status = 'approved'
  where question.difficulty_rating between
      greatest(0, coalesce(p_difficulty_min, 0))
      and least(1000, coalesce(p_difficulty_max, 1000))
    and (
      nullif(btrim(coalesce(p_query_text, '')), '') is null
      or question.question_code ilike '%' || btrim(p_query_text) || '%'
      or question.title ilike '%' || btrim(p_query_text) || '%'
    )
    and (
      not exists (select 1 from include_input)
      or not exists (
        select 1
        from include_facets facet
        where not exists (
          select 1
          from public.question_taxonomy_assignments selected_assignment
          join public.taxonomy_nodes selected_node
            on selected_node.tag_id = selected_assignment.tag_id
          join include_expanded include_tag
            on include_tag.tag_id = selected_assignment.tag_id
           and include_tag.facet_key = facet.facet_key
          where selected_assignment.question_id = question.id
            and selected_assignment.review_status = 'approved'
            and selected_node.status = 'active'
        )
      )
    )
  group by question.id
),
classified as (
  select
    question.*,
    case
      when latest_attempt.source_question_id is null then 'unseen'
      when latest_attempt.is_correct = true then 'mastered'
      when latest_attempt.is_correct is null then 'ungraded'
      when retried_in_session.source_question_id is not null then 'deferred'
      else 'needs_retry'
    end as selection_state
  from matched_scope question
  left join latest_attempt on latest_attempt.source_question_id = question.id
  left join retried_in_session on retried_in_session.source_question_id = question.id
),
inventory as (
  select
    count(*) filter (where selection_state = 'unseen') as unseen_count,
    count(*) filter (where selection_state = 'needs_retry') as needs_retry_count,
    count(*) filter (where selection_state = 'mastered') as mastered_count,
    count(*) filter (where selection_state = 'deferred') as deferred_count,
    count(*) filter (where selection_state = 'ungraded') as ungraded_count,
    count(*) filter (where selection_state in ('unseen', 'needs_retry')) as eligible_count
  from classified
),
eligible as (
  select * from classified
  where selection_state in ('unseen', 'needs_retry')
  order by
    case selection_state when 'unseen' then 0 else 1 end,
    created_at desc,
    id desc
  limit greatest(1, least(coalesce(p_page_limit, 16), 100))
)
select
  eligible.id,
  eligible.question_code,
  eligible.title,
  eligible.difficulty_rating,
  eligible.question_type,
  eligible.selection_state,
  eligible.matched_tag_ids,
  inventory.unseen_count,
  inventory.needs_retry_count,
  inventory.mastered_count,
  inventory.deferred_count,
  inventory.ungraded_count,
  inventory.eligible_count
from inventory
left join eligible on true
order by
  case eligible.selection_state when 'unseen' then 0 else 1 end,
  eligible.created_at desc,
  eligible.id desc;
$$;

revoke all on function public.search_practice_questions_in_session(
  uuid, text[], text, integer, integer, integer
) from public, anon;
grant execute on function public.search_practice_questions_in_session(
  uuid, text[], text, integer, integer, integer
) to authenticated;

comment on table public.practice_progress_resets is
  'Per-user Practice cycle boundary. Historical evidence remains immutable and recommendations consider only later attempts.';
