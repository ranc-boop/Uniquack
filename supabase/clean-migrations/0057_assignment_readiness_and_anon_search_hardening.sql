-- Assignment readiness and anonymous public-search hardening.
--
-- This forward-only migration:
-- 1. lets anonymous public-question RLS evaluate the private membership helper
--    without exposing any bank rows (auth.uid() remains null and the helper
--    returns false);
-- 2. quarantines legacy assigned deliveries that contain unreviewed
--    bank-owned questions while preserving questions and student progress;
-- 3. prevents future bank-owned questions from entering an assigned
--    Assignment before Library Review approval.

grant execute on function private.is_question_bank_member(uuid) to anon;

-- Close the deployment window between legacy quarantine and trigger creation.
-- SHARE ROW EXCLUSIVE allows reads while blocking concurrent writers until this
-- migration transaction commits.
lock table
  public.assignments,
  public.assignment_items,
  public.questions,
  public.bank_questions
in share row exclusive mode;

-- Preserve evidence and teacher content. Only delivery state is withdrawn.
with affected_assignments as (
  select distinct assignment.id
  from public.assignments assignment
  join public.assignment_items item
    on item.assignment_id = assignment.id
   and item.item_type = 'question'
  join public.questions question
    on question.id = item.question_id
  where assignment.status = 'assigned'
    and question.owner_bank_id is not null
    and (
      question.status <> 'review'
      or question.deleted_at is not null
      or question.published_at is not null
      or item.bank_question_id is null
      or item.source_bank_id is distinct from question.owner_bank_id
      or not exists (
        select 1
        from public.bank_questions bank_question
        where bank_question.id = item.bank_question_id
          and bank_question.question_id = question.id
          and bank_question.bank_id = question.owner_bank_id
      )
    )
)
update public.assignments assignment
set
  status = 'draft',
  assigned_at = null,
  source_summary = coalesce(assignment.source_summary, '{}'::jsonb)
    || jsonb_build_object(
      'deliveryQuarantinedAt',
      now(),
      'deliveryQuarantinedPreviousAssignedAt',
      assignment.assigned_at,
      'deliveryQuarantineReason',
      'unreviewed_library_question',
      'deliveryQuarantinedBy',
      '0057_assignment_readiness_and_anon_search_hardening'
    )
from affected_assignments affected
where assignment.id = affected.id;

-- An active bank row means assignment-ready in the current Library model.
-- Legacy draft rows are retained for Review but removed from the active set.
update public.bank_questions bank_question
set
  status = 'archived',
  metadata = coalesce(bank_question.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'archivedAt',
      now(),
      'archiveReason',
      'unreviewed_library_question',
      'archivedBy',
      '0057_assignment_readiness_and_anon_search_hardening'
    )
from public.questions question
where question.id = bank_question.question_id
  and bank_question.status = 'active'
  and question.owner_bank_id = bank_question.bank_id
  and (
    question.status <> 'review'
    or question.deleted_at is not null
    or question.published_at is not null
  );

create or replace function private.assert_assignment_library_questions_ready(
  target_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'edustruct.assignment_library_readiness',
      0
    )
  );

  if exists (
    select 1
    from public.assignment_items item
    join public.questions question
      on question.id = item.question_id
    where item.assignment_id = target_assignment_id
      and item.item_type = 'question'
      and question.owner_bank_id is not null
      and (
        question.status <> 'review'
        or question.deleted_at is not null
        or question.published_at is not null
        or item.bank_question_id is null
        or item.source_bank_id is distinct from question.owner_bank_id
        or not exists (
          select 1
          from public.bank_questions bank_question
          where bank_question.id = item.bank_question_id
            and bank_question.question_id = question.id
            and bank_question.bank_id = question.owner_bank_id
            and bank_question.status = 'active'
        )
      )
  ) then
    raise exception
      'Every bank-owned Assignment item must be an active, reviewed Library question.';
  end if;
end;
$$;

revoke all on function private.assert_assignment_library_questions_ready(uuid)
  from public, anon, authenticated;

create or replace function private.enforce_assignment_library_readiness()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'edustruct.assignment_library_readiness',
      0
    )
  );

  if new.status = 'assigned'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
    )
  then
    perform private.assert_assignment_library_questions_ready(new.id);
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_assignment_library_readiness()
  from public, anon, authenticated;

drop trigger if exists assignments_enforce_library_readiness
  on public.assignments;
create trigger assignments_enforce_library_readiness
before insert or update of status on public.assignments
for each row
execute function private.enforce_assignment_library_readiness();

create or replace function private.enforce_assigned_item_library_readiness()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  assignment_is_assigned boolean := false;
  question_row public.questions%rowtype;
begin
  if new.item_type <> 'question' or new.question_id is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'edustruct.assignment_library_readiness',
      0
    )
  );

  select assignment.status = 'assigned'
  into assignment_is_assigned
  from public.assignments assignment
  where assignment.id = new.assignment_id;

  if not coalesce(assignment_is_assigned, false) then
    return new;
  end if;

  select *
  into question_row
  from public.questions question
  where question.id = new.question_id;

  if question_row.owner_bank_id is null then
    return new;
  end if;

  if question_row.status <> 'review'
    or question_row.deleted_at is not null
    or question_row.published_at is not null
    or new.bank_question_id is null
    or new.source_bank_id is distinct from question_row.owner_bank_id
    or not exists (
      select 1
      from public.bank_questions bank_question
      where bank_question.id = new.bank_question_id
        and bank_question.question_id = question_row.id
        and bank_question.bank_id = question_row.owner_bank_id
        and bank_question.status = 'active'
    )
  then
    raise exception
      'Bank-owned questions must pass Library Review before Assignment delivery.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_assigned_item_library_readiness()
  from public, anon, authenticated;

drop trigger if exists assignment_items_enforce_library_readiness
  on public.assignment_items;
create trigger assignment_items_enforce_library_readiness
before insert or update of
  assignment_id,
  question_id,
  item_type,
  bank_question_id,
  source_bank_id
on public.assignment_items
for each row
execute function private.enforce_assigned_item_library_readiness();

create or replace function private.prevent_assigned_library_question_regression()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'edustruct.assignment_library_readiness',
      0
    )
  );

  if old.owner_bank_id is not null
    and exists (
      select 1
      from public.assignment_items item
      join public.assignments assignment
        on assignment.id = item.assignment_id
      where item.question_id = old.id
        and item.item_type = 'question'
        and assignment.status = 'assigned'
    )
    and (
      new.owner_bank_id is distinct from old.owner_bank_id
      or new.status <> 'review'
      or new.deleted_at is not null
      or new.published_at is not null
    )
  then
    raise exception
      'An assigned Library question cannot be returned to an unreviewed state.';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_assigned_library_question_regression()
  from public, anon, authenticated;

drop trigger if exists questions_prevent_assigned_library_regression
  on public.questions;
create trigger questions_prevent_assigned_library_regression
before update of owner_bank_id, status, deleted_at, published_at
on public.questions
for each row
execute function private.prevent_assigned_library_question_regression();

comment on function private.assert_assignment_library_questions_ready(uuid) is
  'Fails closed when a new Assignment delivery contains bank-owned questions that have not passed Library Review.';
