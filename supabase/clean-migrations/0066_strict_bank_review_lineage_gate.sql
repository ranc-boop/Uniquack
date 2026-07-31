-- Require complete, bank-scoped, bidirectional Review Draft lineage before
-- approving a question into a Library. This is a forward-only correction to
-- the legacy approval path, which could create missing lineage during approve.

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
  approved_record record;
begin
  if auth.uid() is null or not private.is_question_bank_content_editor(p_target_bank_id) then
    raise exception 'Only Library owners or editors can approve Review Drafts.';
  end if;

  select item.id
  into strict_review_item_id
  from public.questions question_row
  join public.review_draft_items item
    on item.id = question_row.source_review_item_id
  join public.review_batches batch
    on batch.id = item.review_batch_id
  where question_row.id = p_target_question_id
    and question_row.owner_bank_id = p_target_bank_id
    and question_row.deleted_at is null
    and item.item_kind = 'question'
    and item.created_question_id = question_row.id
    and item.target_bank_id = p_target_bank_id
    and batch.organization_id = question_row.organization_id
    and batch.target_bank_id = p_target_bank_id
  for update of question_row, item, batch;

  if strict_review_item_id is null then
    raise exception 'Review Draft lineage must be linked in both directions before approval.';
  end if;

  select revision_of_question_id
  into revision_source_id
  from public.questions
  where id = p_target_question_id
    and owner_bank_id = p_target_bank_id
    and deleted_at is null
  for update;

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

comment on function public.approve_bank_review_question(uuid, uuid) is
  'Approves a bank-scoped Review Draft only when question and Review item lineage are complete in both directions.';

revoke all on function public.approve_bank_review_question(uuid, uuid)
  from public, anon;
grant execute on function public.approve_bank_review_question(uuid, uuid)
  to authenticated;
