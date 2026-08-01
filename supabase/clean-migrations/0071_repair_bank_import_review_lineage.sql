-- Repair and maintain strict bidirectional Review lineage for bank-scoped
-- imports. This does not approve content.

create or replace function public.ensure_bank_import_review_lineage(
  p_import_batch_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid;
  batch_row public.import_batches%rowtype;
  resolved_review_batch_id uuid;
  review_item_id uuid;
  source_kind_value text;
  linked_count integer := 0;
  question_row record;
begin
  select *
  into batch_row
  from public.import_batches
  where id = p_import_batch_id
  for update;

  if batch_row.id is null or batch_row.target_bank_id is null then
    return 0;
  end if;

  if current_user not in ('postgres', 'supabase_admin')
    and coalesce(auth.role(), '') <> 'service_role'
    and (
      auth.uid() is null
      or not private.is_question_bank_content_editor(batch_row.target_bank_id)
    )
  then
    raise exception 'Only Library owners or editors can prepare imported Drafts for Review.';
  end if;

  actor_id := coalesce(auth.uid(), batch_row.created_by);
  source_kind_value := case
    when batch_row.source_type = 'ai_pdf' then 'ai_import'
    when batch_row.source_type = 'package' then 'package_import'
    when batch_row.source_type = 'course_builder' then 'course_builder'
    else 'manual'
  end;

  select id
  into resolved_review_batch_id
  from public.review_batches
  where organization_id = batch_row.organization_id
    and source_kind = source_kind_value
    and source_record_id = batch_row.id
    and target_bank_id = batch_row.target_bank_id
  order by created_at desc, id desc
  limit 1
  for update;

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
      batch_row.organization_id,
      actor_id,
      source_kind_value,
      batch_row.id,
      'pending_review',
      batch_row.target_bank_id,
      'Library Review',
      jsonb_build_object(
        'sourceImportBatchId', batch_row.id,
        'targetBankId', batch_row.target_bank_id
      )
    )
    returning id into resolved_review_batch_id;
  end if;

  for question_row in
    select question.id, question.question_code, question.title,
      question.source_kind
    from public.questions question
    where question.id in (
      select import_item.created_question_id
      from public.import_batch_items import_item
      where import_item.batch_id = batch_row.id
        and import_item.created_question_id is not null
    )
      and question.organization_id = batch_row.organization_id
      and question.owner_bank_id = batch_row.target_bank_id
      and question.status = 'draft'
      and question.deleted_at is null
    order by question.id
    for update of question
  loop
    select id
    into review_item_id
    from public.review_draft_items
    where item_kind = 'question'
      and created_question_id = question_row.id
      and target_bank_id = batch_row.target_bank_id
    order by created_at desc, id desc
    limit 1
    for update;

    if review_item_id is null then
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
          'targetBankId', batch_row.target_bank_id
        ),
        '[]'::jsonb,
        batch_row.target_bank_id,
        question_row.id
      )
      returning id into review_item_id;
    end if;

    update public.review_draft_items
    set
      review_batch_id = resolved_review_batch_id,
      target_bank_id = batch_row.target_bank_id
    where id = review_item_id;

    update public.questions
    set source_review_item_id = review_item_id
    where id = question_row.id
      and source_review_item_id is distinct from review_item_id;

    linked_count := linked_count + 1;
  end loop;

  return linked_count;
end;
$$;

revoke all on function public.ensure_bank_import_review_lineage(uuid)
  from public, anon;
grant execute on function public.ensure_bank_import_review_lineage(uuid)
  to authenticated, service_role;

do $$
declare
  import_batch_id uuid;
begin
  for import_batch_id in
    select id
    from public.import_batches
    where target_bank_id is not null
    order by created_at, id
  loop
    perform public.ensure_bank_import_review_lineage(import_batch_id);
  end loop;
end;
$$;
