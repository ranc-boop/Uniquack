-- Manual reapply for migration 0027 corrected bank approval RPC.
-- Run this only if the remote function fails with an ambiguous question_id conflict target.

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
  reviewer_id uuid := auth.uid();
  bank_row public.question_banks%rowtype;
  question_row public.questions%rowtype;
  import_batch_row public.import_batches%rowtype;
  resolved_review_batch_id uuid;
  resolved_review_item_id uuid;
  resolved_bank_question_id uuid;
begin
  if reviewer_id is null then
    raise exception 'Bank Review Draft approval requires an authenticated teacher.';
  end if;

  if not private.can_manage_question_bank(p_target_bank_id) then
    raise exception 'Only bank owners or editors can approve Review Drafts into this bank.';
  end if;

  select *
  into bank_row
  from public.question_banks
  where id = p_target_bank_id
    and status = 'active'
  for update;

  if bank_row.id is null then
    raise exception 'Target Question Bank was not found or is not active.';
  end if;

  select *
  into question_row
  from public.questions
  where id = p_target_question_id
  for update;

  if question_row.id is null then
    raise exception 'Review Draft question was not found.';
  end if;

  if question_row.organization_id <> bank_row.organization_id then
    raise exception 'Review Draft question organization does not match the target bank.';
  end if;

  if question_row.deleted_at is not null then
    raise exception 'Deleted questions cannot be approved into a bank.';
  end if;

  if question_row.status = 'published' then
    raise exception 'Published/global questions must be pulled through a future public-library gate, not this private bank approval flow.';
  end if;

  if question_row.owner_bank_id is not null and question_row.owner_bank_id <> p_target_bank_id then
    raise exception 'This Review Draft belongs to a different Question Bank.';
  end if;

  resolved_review_item_id := question_row.source_review_item_id;

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
      and coalesce(item.target_bank_id, batch.target_bank_id, p_target_bank_id) = p_target_bank_id
    limit 1;

    if resolved_review_batch_id is null then
      raise exception 'Review Draft lineage is not scoped to this Question Bank.';
    end if;
  else
    select batch.*
    into import_batch_row
    from public.import_batch_items item
    join public.import_batches batch
      on batch.id = item.batch_id
    where item.created_question_id = question_row.id
      and batch.organization_id = question_row.organization_id
      and batch.target_bank_id = p_target_bank_id
    order by item.created_at desc, item.id desc
    limit 1;

    if import_batch_row.id is null then
      raise exception 'Bank-scoped import lineage is required before approving this Review Draft.';
    end if;

    select batch.id
    into resolved_review_batch_id
    from public.review_batches batch
    where batch.organization_id = question_row.organization_id
      and batch.source_kind = case
        when import_batch_row.source_type = 'ai_pdf' then 'ai_import'
        when import_batch_row.source_type = 'package' then 'package_import'
        when import_batch_row.source_type = 'course_builder' then 'course_builder'
        else 'manual'
      end
      and batch.source_record_id = import_batch_row.id
      and batch.target_bank_id = p_target_bank_id
    order by batch.created_at desc, batch.id desc
    limit 1;

    if resolved_review_batch_id is null then
      insert into public.review_batches (
        organization_id,
        created_by,
        source_kind,
        source_record_id,
        status,
        target_bank_id,
        title,
        summary
      )
      values (
        question_row.organization_id,
        reviewer_id,
        case
          when import_batch_row.source_type = 'ai_pdf' then 'ai_import'
          when import_batch_row.source_type = 'package' then 'package_import'
          when import_batch_row.source_type = 'course_builder' then 'course_builder'
          else 'manual'
        end,
        import_batch_row.id,
        'pending_review',
        p_target_bank_id,
        'Bank-scoped Review Drafts',
        jsonb_build_object(
          'lineageCreatedBy', 'approve_bank_review_question',
          'sourceImportBatchId', import_batch_row.id,
          'targetBankId', p_target_bank_id,
          'reviewScope', 'question_bank'
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
      target_bank_id,
      created_question_id
    )
    values (
      resolved_review_batch_id,
      'question',
      'pending_review',
      jsonb_build_object(
        'questionId', question_row.id,
        'questionCode', question_row.question_code,
        'title', question_row.title,
        'sourceKind', question_row.source_kind,
        'lineageCreatedBy', 'approve_bank_review_question',
        'targetBankId', p_target_bank_id
      ),
      '[]'::jsonb,
      p_target_bank_id,
      question_row.id
    )
    returning id into resolved_review_item_id;
  end if;

  insert into public.bank_questions (
    bank_id,
    question_id,
    status,
    source_kind,
    added_by,
    metadata
  )
  values (
    p_target_bank_id,
    question_row.id,
    'active',
    'review_draft',
    reviewer_id,
    jsonb_build_object(
      'sourceReviewItemId', resolved_review_item_id,
      'sourceKind', question_row.source_kind,
      'approvedThrough', 'approve_bank_review_question'
    )
  )
  on conflict on constraint bank_questions_bank_id_question_id_key
  do update set
    status = 'active',
    source_kind = 'review_draft',
    added_by = excluded.added_by,
    added_at = now(),
    metadata = public.bank_questions.metadata || excluded.metadata
  returning id into resolved_bank_question_id;

  update public.questions as question_update
  set
    owner_bank_id = p_target_bank_id,
    visibility = bank_row.visibility,
    source_review_item_id = resolved_review_item_id,
    status = case
      when question_update.status in ('draft', 'review') then 'review'
      else question_update.status
    end,
    published_at = null,
    reviewed_by = reviewer_id,
    updated_by = reviewer_id
  where question_update.id = question_row.id;

  update public.question_taxonomy_assignments assignment
  set
    review_status = 'approved',
    approved_at = now(),
    approved_by = reviewer_id,
    updated_by = reviewer_id
  where assignment.question_id = question_row.id
    and assignment.review_status in ('pending_review', 'needs_review');

  update public.review_draft_items
  set
    status = 'approved',
    target_bank_id = p_target_bank_id
  where id = resolved_review_item_id;

  update public.review_batches
  set status = 'approved',
      target_bank_id = p_target_bank_id
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
    'Approved Review Draft into a teacher Question Bank without global publish.',
    jsonb_build_array(jsonb_build_object(
      'questionId', question_row.id,
      'targetBankId', p_target_bank_id,
      'privateBankApproval', true
    )),
    reviewer_id
  );

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
    'review',
    'Review Draft approved into Question Bank',
    reviewer_id
  );

  question_id := question_row.id;
  bank_question_id := resolved_bank_question_id;
  source_review_item_id := resolved_review_item_id;
  return next;
end;
$$;

