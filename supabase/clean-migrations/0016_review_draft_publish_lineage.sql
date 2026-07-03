-- Transactional Review Draft publish helper.
--
-- Clean schema requires AI-import / blueprint-generated questions to carry
-- review lineage before they can become published. This RPC performs the
-- lineage attachment, question publish, taxonomy approval, and review audit
-- updates in one database transaction.

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
  'Teacher/admin Review Draft publish RPC. Attaches generated-question review lineage, publishes questions, approves taxonomy assignments, and records review actions atomically.';

revoke all on function public.publish_review_draft_questions(uuid[])
from public, anon;

grant execute on function public.publish_review_draft_questions(uuid[])
to authenticated;
