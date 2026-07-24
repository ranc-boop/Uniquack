-- Practice Library scope and inventory.
-- Forward-only: binds self-study sessions to authenticated, immutable content sources.

create table if not exists public.practice_session_sources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  source_kind text not null
    check (source_kind in ('public_catalog', 'question_bank', 'assignment')),
  bank_id uuid references public.question_banks(id) on delete restrict,
  assignment_id uuid references public.assignments(id) on delete restrict,
  source_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_snapshot) = 'object'),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (source_kind = 'public_catalog' and bank_id is null and assignment_id is null)
    or (source_kind = 'question_bank' and bank_id is not null and assignment_id is null)
    or (source_kind = 'assignment' and bank_id is null and assignment_id is not null)
  )
);

create unique index if not exists practice_session_sources_public_unique
  on public.practice_session_sources(session_id)
  where source_kind = 'public_catalog';

create unique index if not exists practice_session_sources_bank_unique
  on public.practice_session_sources(session_id, bank_id)
  where source_kind = 'question_bank';

create unique index if not exists practice_session_sources_assignment_unique
  on public.practice_session_sources(session_id, assignment_id)
  where source_kind = 'assignment';

create index if not exists practice_session_sources_session_idx
  on public.practice_session_sources(session_id, source_kind);

alter table public.practice_session_sources enable row level security;

revoke all on table public.practice_session_sources from public, anon, authenticated;
grant select on table public.practice_session_sources to authenticated;
grant all on table public.practice_session_sources to service_role;

drop policy if exists practice_session_sources_select_own on public.practice_session_sources;
create policy practice_session_sources_select_own
on public.practice_session_sources for select
using (
  exists (
    select 1
    from public.practice_sessions session
    where session.id = practice_session_sources.session_id
      and session.user_id = auth.uid()
  )
);

-- There are deliberately no browser INSERT/UPDATE/DELETE policies. Sources are
-- attached exactly once by initialize_practice_session_sources and otherwise
-- remain immutable until the owning session is deleted.

create or replace function public.initialize_practice_session_sources(
  p_session_id uuid,
  p_bank_ids uuid[] default '{}'::uuid[],
  p_include_public boolean default true,
  p_assignment_id uuid default null
)
returns table (
  source_kind text,
  bank_id uuid,
  assignment_id uuid,
  source_snapshot jsonb
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid := auth.uid();
  requested_bank_ids uuid[];
  requested_count integer := 0;
  authorized_count integer := 0;
  assignment_row public.assignments%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.practice_sessions session
    where session.id = p_session_id
      and session.user_id = actor_id
      and session.status = 'active'
  ) then
    raise exception 'Active practice session not found.';
  end if;

  if exists (
    select 1
    from public.practice_session_sources source
    where source.session_id = p_session_id
  ) then
    raise exception 'Practice session sources are already initialized.';
  end if;

  select coalesce(array_agg(bank_id order by bank_id), '{}'::uuid[])
  into requested_bank_ids
  from (
    select distinct requested_id as bank_id
    from unnest(coalesce(p_bank_ids, '{}'::uuid[])) requested(requested_id)
    where requested_id is not null
  ) deduplicated;

  requested_count := coalesce(array_length(requested_bank_ids, 1), 0);

  if requested_count > 10 then
    raise exception 'Choose at most 10 Libraries.';
  end if;

  if p_assignment_id is not null then
    if p_include_public or requested_count > 0 then
      raise exception 'Assignment practice cannot add Library or public catalog sources.';
    end if;

    select assignment.*
    into assignment_row
    from public.assignments assignment
    join public.classroom_members member
      on member.classroom_id = assignment.classroom_id
     and member.user_id = actor_id
     and member.role = 'student'
     and member.status = 'active'
    where assignment.id = p_assignment_id
      and assignment.status = 'assigned';

    if assignment_row.id is null then
      raise exception 'Assigned work is not available to this student.';
    end if;

    insert into public.practice_session_sources (
      session_id,
      source_kind,
      assignment_id,
      source_snapshot,
      created_by
    )
    values (
      p_session_id,
      'assignment',
      p_assignment_id,
      jsonb_build_object(
        'assignmentId', assignment_row.id,
        'title', assignment_row.title,
        'scope', 'assignment_only'
      ),
      actor_id
    );
  else
    if not p_include_public and requested_count = 0 then
      raise exception 'Choose at least one practice source.';
    end if;

    select count(*)
    into authorized_count
    from public.question_banks bank
    join public.bank_members member
      on member.bank_id = bank.id
     and member.user_id = actor_id
     and member.status = 'active'
    where bank.id = any(requested_bank_ids)
      and bank.status = 'active';

    if authorized_count <> requested_count then
      raise exception 'One or more selected Libraries are unavailable.';
    end if;

    if p_include_public then
      insert into public.practice_session_sources (
        session_id,
        source_kind,
        source_snapshot,
        created_by
      )
      values (
        p_session_id,
        'public_catalog',
        jsonb_build_object('name', 'Public Question Bank'),
        actor_id
      );
    end if;

    insert into public.practice_session_sources (
      session_id,
      source_kind,
      bank_id,
      source_snapshot,
      created_by
    )
    select
      p_session_id,
      'question_bank',
      bank.id,
      jsonb_build_object(
        'bankId', bank.id,
        'name', bank.name,
        'visibility', bank.visibility,
        'membershipRole', member.role
      ),
      actor_id
    from public.question_banks bank
    join public.bank_members member
      on member.bank_id = bank.id
     and member.user_id = actor_id
     and member.status = 'active'
    where bank.id = any(requested_bank_ids)
      and bank.status = 'active'
    order by bank.name, bank.id;
  end if;

  return query
  select
    source.source_kind,
    source.bank_id,
    source.assignment_id,
    source.source_snapshot
  from public.practice_session_sources source
  where source.session_id = p_session_id
  order by source.created_at, source.id;
end;
$$;

revoke all on function public.initialize_practice_session_sources(uuid, uuid[], boolean, uuid)
from public, anon;
grant execute on function public.initialize_practice_session_sources(uuid, uuid[], boolean, uuid)
to authenticated;

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
with latest_attempt as (
  select distinct on (attempt.source_question_id)
    attempt.source_question_id,
    attempt.is_correct
  from public.practice_attempts attempt
  where attempt.user_id = auth.uid()
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
  'public_catalog'::text as source_kind,
  null::uuid as source_id,
  'Public Question Bank'::text as name,
  'public'::text as visibility,
  null::text as membership_role,
  count(*) filter (where latest_attempt.source_question_id is null) as unseen_count,
  count(*) filter (where latest_attempt.is_correct = false) as needs_retry_count,
  count(*) filter (where latest_attempt.is_correct = true) as mastered_count,
  count(*) filter (
    where latest_attempt.source_question_id is not null
      and latest_attempt.is_correct is null
  ) as ungraded_count,
  count(*) as question_count
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
      select 1
      from active_sources source
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
  select distinct facet_key
  from include_expanded
  where facet_key is not null
),
latest_attempt as (
  select distinct on (attempt.source_question_id)
    attempt.source_question_id,
    attempt.is_correct
  from public.practice_attempts attempt
  where attempt.user_id = auth.uid()
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
  select *
  from classified
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

-- Preserve current semantics for already-created sessions.
insert into public.practice_session_sources (
  session_id,
  source_kind,
  assignment_id,
  source_snapshot,
  created_by
)
select
  link.practice_session_id,
  'assignment',
  link.assignment_id,
  jsonb_build_object(
    'assignmentId', link.assignment_id,
    'scope', 'assignment_only',
    'backfilled', true
  ),
  session.user_id
from public.assignment_practice_sessions link
join public.practice_sessions session on session.id = link.practice_session_id
on conflict do nothing;

insert into public.practice_session_sources (
  session_id,
  source_kind,
  source_snapshot,
  created_by
)
select
  session.id,
  'public_catalog',
  jsonb_build_object('name', 'Public Question Bank', 'backfilled', true),
  session.user_id
from public.practice_sessions session
where not exists (
  select 1
  from public.practice_session_sources source
  where source.session_id = session.id
)
on conflict do nothing;

comment on table public.practice_session_sources is
  'Immutable, authenticated content-source scope for self-study and assignment Practice sessions.';
