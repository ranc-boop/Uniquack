-- Keep the Teacher surface to one explicit approval action and add a
-- reversible Library removal state. Existing Assignments keep their snapshots.

create or replace function public.approve_bank_review_question(
  p_target_question_id uuid,
  p_target_bank_id uuid
)
returns table (
  question_id uuid,
  bank_question_id uuid,
  source_review_item_id uuid
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  revision_source_id uuid;
  source_bank_question_id uuid;
  strict_review_item_id uuid;
  strict_review_status text;
  approved_record record;
begin
  if auth.uid() is null or not private.is_question_bank_content_editor(p_target_bank_id) then
    raise exception 'Only Library owners or editors can approve Review Drafts.';
  end if;

  select item.id, item.status, question_row.revision_of_question_id
  into strict_review_item_id, strict_review_status, revision_source_id
  from public.questions question_row
  join public.review_draft_items item
    on item.id = question_row.source_review_item_id
  join public.review_batches batch
    on batch.id = item.review_batch_id
  where question_row.id = p_target_question_id
    and question_row.owner_bank_id = p_target_bank_id
    and question_row.status = 'draft'
    and question_row.published_at is null
    and question_row.deleted_at is null
    and item.item_kind = 'question'
    and item.status in ('pending_review', 'needs_more_evidence')
    and item.created_question_id = question_row.id
    and item.target_bank_id = p_target_bank_id
    and batch.organization_id = question_row.organization_id
    and batch.target_bank_id = p_target_bank_id
  for update of question_row, item, batch;

  if strict_review_item_id is null then
    raise exception 'This Draft changed or is no longer available. Refresh Review and try again.';
  end if;

  -- "Needs fix" is a UI triage marker, not a second approval gate. Once the
  -- current content passes server validation, this explicit click approves it.
  if strict_review_status = 'needs_more_evidence' then
    update public.review_draft_items
    set status = 'pending_review'
    where id = strict_review_item_id;
  end if;

  if revision_source_id is not null then
    select active_bank_question.id
    into source_bank_question_id
    from public.bank_questions active_bank_question
    where active_bank_question.bank_id = p_target_bank_id
      and active_bank_question.question_id = revision_source_id
      and active_bank_question.status = 'active'
    for update;

    if source_bank_question_id is null then
      raise exception 'The original active Library question could not be found.';
    end if;
  end if;

  select *
  into approved_record
  from public.approve_bank_review_question_legacy(
    p_target_question_id,
    p_target_bank_id
  );

  if revision_source_id is not null then
    update public.bank_questions
    set
      status = 'archived',
      metadata = metadata || jsonb_build_object(
        'replacedByQuestionId', p_target_question_id,
        'replacedAt', now()
      )
    where id = source_bank_question_id;

    update public.bank_questions
    set metadata = metadata || jsonb_build_object(
      'revisionOfQuestionId', revision_source_id,
      'replacesBankQuestionId', source_bank_question_id
    )
    where id = approved_record.bank_question_id;
  end if;

  return query
  select
    approved_record.question_id,
    approved_record.bank_question_id,
    approved_record.source_review_item_id;
end;
$$;

revoke all on function public.approve_bank_review_question(uuid, uuid)
  from public, anon;
grant execute on function public.approve_bank_review_question(uuid, uuid)
  to authenticated;

create or replace function public.approve_bank_review_questions(
  p_target_bank_id uuid,
  p_target_question_ids uuid[]
)
returns table (
  question_id uuid,
  bank_question_id uuid,
  source_review_item_id uuid
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  requested_count integer;
  validated_count integer;
  target_question_id uuid;
begin
  if auth.uid() is null or not private.is_question_bank_content_editor(p_target_bank_id) then
    raise exception 'Only Library owners or editors can approve Review Drafts.';
  end if;

  requested_count := coalesce(array_length(p_target_question_ids, 1), 0);
  if requested_count = 0 or requested_count > 25 then
    raise exception 'Select between 1 and 25 Review Drafts from the current page.';
  end if;

  if exists (
    select 1
    from unnest(p_target_question_ids) selected(question_id)
    where selected.question_id is null
  ) or (
    select count(distinct selected.question_id)
    from unnest(p_target_question_ids) selected(question_id)
  ) <> requested_count then
    raise exception 'Review Draft selection must contain unique IDs.';
  end if;

  perform question_row.id
  from public.questions question_row
  join public.review_draft_items item
    on item.id = question_row.source_review_item_id
  join public.review_batches batch
    on batch.id = item.review_batch_id
  where question_row.id = any(p_target_question_ids)
  order by question_row.id
  for update of question_row, item, batch;

  select count(*)
  into validated_count
  from public.questions question_row
  join public.review_draft_items item
    on item.id = question_row.source_review_item_id
  join public.review_batches batch
    on batch.id = item.review_batch_id
  where question_row.id = any(p_target_question_ids)
    and question_row.owner_bank_id = p_target_bank_id
    and question_row.status = 'draft'
    and question_row.published_at is null
    and question_row.deleted_at is null
    and item.item_kind = 'question'
    and item.status in ('pending_review', 'needs_more_evidence')
    and item.created_question_id = question_row.id
    and item.target_bank_id = p_target_bank_id
    and batch.organization_id = question_row.organization_id
    and batch.target_bank_id = p_target_bank_id;

  if validated_count <> requested_count then
    raise exception 'The selection changed or is no longer available. Refresh Review and try again.';
  end if;

  if exists (
    select question_row.revision_of_question_id
    from public.questions question_row
    where question_row.id = any(p_target_question_ids)
      and question_row.revision_of_question_id is not null
    group by question_row.revision_of_question_id
    having count(*) > 1
  ) then
    raise exception 'A batch cannot approve multiple edits of the same Ready question.';
  end if;

  for target_question_id in
    select selected.question_id
    from unnest(p_target_question_ids) selected(question_id)
    order by selected.question_id
  loop
    return query
    select *
    from public.approve_bank_review_question(
      target_question_id,
      p_target_bank_id
    );
  end loop;
end;
$$;

revoke all on function public.approve_bank_review_questions(uuid, uuid[])
  from public, anon;
grant execute on function public.approve_bank_review_questions(uuid, uuid[])
  to authenticated;

create or replace function public.set_bank_question_statuses(
  p_target_bank_id uuid,
  p_selected_bank_question_ids uuid[],
  p_target_status text
)
returns table (
  bank_question_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  requested_count integer;
  validated_count integer;
begin
  if auth.uid() is null or not private.is_question_bank_content_editor(p_target_bank_id) then
    raise exception 'Only Library owners or editors can manage Library questions.';
  end if;

  if p_target_status not in ('active', 'archived', 'removed') then
    raise exception 'Invalid Library question state.';
  end if;

  requested_count := coalesce(array_length(p_selected_bank_question_ids, 1), 0);
  if requested_count = 0 or requested_count > 25 then
    raise exception 'Select between 1 and 25 Library questions from the current page.';
  end if;

  if exists (
    select 1
    from unnest(p_selected_bank_question_ids) selected(bank_question_id)
    where selected.bank_question_id is null
  ) or (
    select count(distinct selected.bank_question_id)
    from unnest(p_selected_bank_question_ids) selected(bank_question_id)
  ) <> requested_count then
    raise exception 'Library question selection must contain unique IDs.';
  end if;

  perform bank_question.id
  from public.bank_questions bank_question
  join public.questions question_row
    on question_row.id = bank_question.question_id
  where bank_question.id = any(p_selected_bank_question_ids)
  order by bank_question.id
  for update of bank_question, question_row;

  select count(*)
  into validated_count
  from public.bank_questions bank_question
  join public.questions question_row
    on question_row.id = bank_question.question_id
  where bank_question.id = any(p_selected_bank_question_ids)
    and bank_question.bank_id = p_target_bank_id
    and bank_question.status in ('active', 'archived')
    and question_row.owner_bank_id = p_target_bank_id
    and question_row.status = 'review'
    and question_row.published_at is null
    and question_row.deleted_at is null
    and (
      p_target_status <> 'active'
      or not (coalesce(bank_question.metadata, '{}'::jsonb) ? 'replacedByQuestionId')
    );

  if validated_count <> requested_count then
    raise exception 'The selection changed or is no longer available. Refresh Questions and try again.';
  end if;

  return query
  update public.bank_questions bank_question
  set status = p_target_status
  where bank_question.id = any(p_selected_bank_question_ids)
    and bank_question.bank_id = p_target_bank_id
  returning bank_question.id, bank_question.status;
end;
$$;

comment on function public.set_bank_question_statuses(uuid, uuid[], text) is
  'Atomically restores, archives, or removes current Library associations without changing historical Assignments.';

revoke all on function public.set_bank_question_statuses(uuid, uuid[], text)
  from public, anon;
grant execute on function public.set_bank_question_statuses(uuid, uuid[], text)
  to authenticated;
