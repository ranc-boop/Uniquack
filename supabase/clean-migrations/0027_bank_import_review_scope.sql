-- Bank-scoped import and Review Draft approval
-- Keeps teacher bank content private/shared to the bank and separate from global publish.

alter table public.import_batches
  add column if not exists target_bank_id uuid references public.question_banks(id) on delete set null;

alter table public.review_batches
  add column if not exists target_bank_id uuid references public.question_banks(id) on delete set null;

alter table public.review_draft_items
  add column if not exists target_bank_id uuid references public.question_banks(id) on delete set null;

alter table public.questions
  add column if not exists owner_bank_id uuid references public.question_banks(id) on delete set null,
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'organization', 'public'));

create index if not exists import_batches_target_bank_id_idx
  on public.import_batches(target_bank_id, created_at desc)
  where target_bank_id is not null;

create index if not exists review_batches_target_bank_id_idx
  on public.review_batches(target_bank_id, created_at desc)
  where target_bank_id is not null;

create index if not exists review_draft_items_target_bank_id_idx
  on public.review_draft_items(target_bank_id, created_at desc)
  where target_bank_id is not null;

create index if not exists questions_owner_bank_status_idx
  on public.questions(owner_bank_id, status, created_at desc)
  where owner_bank_id is not null and deleted_at is null;

drop policy if exists import_batches_staff_or_owner_access on public.import_batches;
create policy import_batches_staff_or_owner_access
on public.import_batches for all
using (
  (
    target_bank_id is not null
    and private.can_read_question_bank(target_bank_id)
  )
  or (
    target_bank_id is null
    and (
      private.is_super_admin()
      or created_by = auth.uid()
      or (organization_id is not null and private.is_org_staff(organization_id))
    )
  )
)
with check (
  (
    target_bank_id is not null
    and private.can_manage_question_bank(target_bank_id)
  )
  or (
    target_bank_id is null
    and (
      private.is_super_admin()
      or created_by = auth.uid()
      or (organization_id is not null and private.is_org_staff(organization_id))
    )
  )
);

drop policy if exists import_batch_items_batch_access on public.import_batch_items;
create policy import_batch_items_batch_access
on public.import_batch_items for all
using (
  exists (
    select 1 from public.import_batches
    where import_batches.id = import_batch_items.batch_id
      and (
        (
          import_batches.target_bank_id is not null
          and private.can_read_question_bank(import_batches.target_bank_id)
        )
        or (
          import_batches.target_bank_id is null
          and (
            private.is_super_admin()
            or import_batches.created_by = auth.uid()
            or (
              import_batches.organization_id is not null
              and private.is_org_staff(import_batches.organization_id)
            )
          )
        )
      )
  )
)
with check (
  exists (
    select 1 from public.import_batches
    where import_batches.id = import_batch_items.batch_id
      and (
        (
          import_batches.target_bank_id is not null
          and private.can_manage_question_bank(import_batches.target_bank_id)
        )
        or (
          import_batches.target_bank_id is null
          and (
            private.is_super_admin()
            or import_batches.created_by = auth.uid()
            or (
              import_batches.organization_id is not null
              and private.is_org_staff(import_batches.organization_id)
            )
          )
        )
      )
  )
);

drop policy if exists import_batch_assets_batch_access on public.import_batch_assets;
create policy import_batch_assets_batch_access
on public.import_batch_assets for all
using (
  exists (
    select 1 from public.import_batches
    where import_batches.id = import_batch_assets.batch_id
      and (
        (
          import_batches.target_bank_id is not null
          and private.can_read_question_bank(import_batches.target_bank_id)
        )
        or (
          import_batches.target_bank_id is null
          and (
            private.is_super_admin()
            or import_batches.created_by = auth.uid()
            or (
              import_batches.organization_id is not null
              and private.is_org_staff(import_batches.organization_id)
            )
          )
        )
      )
  )
)
with check (
  exists (
    select 1 from public.import_batches
    where import_batches.id = import_batch_assets.batch_id
      and (
        (
          import_batches.target_bank_id is not null
          and private.can_manage_question_bank(import_batches.target_bank_id)
        )
        or (
          import_batches.target_bank_id is null
          and (
            private.is_super_admin()
            or import_batches.created_by = auth.uid()
            or (
              import_batches.organization_id is not null
              and private.is_org_staff(import_batches.organization_id)
            )
          )
        )
      )
  )
);

drop policy if exists review_batches_staff_access on public.review_batches;
create policy review_batches_staff_access
on public.review_batches for all
using (
  (
    target_bank_id is not null
    and private.can_read_question_bank(target_bank_id)
  )
  or (
    target_bank_id is null
    and private.is_org_staff(organization_id)
  )
)
with check (
  (
    target_bank_id is not null
    and private.can_manage_question_bank(target_bank_id)
  )
  or (
    target_bank_id is null
    and private.is_org_staff(organization_id)
  )
);

drop policy if exists review_draft_items_staff_access on public.review_draft_items;
create policy review_draft_items_staff_access
on public.review_draft_items for all
using (
  exists (
    select 1 from public.review_batches
    where review_batches.id = review_draft_items.review_batch_id
      and (
        (
          coalesce(review_draft_items.target_bank_id, review_batches.target_bank_id) is not null
          and private.can_read_question_bank(
            coalesce(review_draft_items.target_bank_id, review_batches.target_bank_id)
          )
        )
        or (
          coalesce(review_draft_items.target_bank_id, review_batches.target_bank_id) is null
          and private.is_org_staff(review_batches.organization_id)
        )
      )
  )
)
with check (
  exists (
    select 1 from public.review_batches
    where review_batches.id = review_draft_items.review_batch_id
      and (
        (
          coalesce(review_draft_items.target_bank_id, review_batches.target_bank_id) is not null
          and private.can_manage_question_bank(
            coalesce(review_draft_items.target_bank_id, review_batches.target_bank_id)
          )
        )
        or (
          coalesce(review_draft_items.target_bank_id, review_batches.target_bank_id) is null
          and private.is_org_staff(review_batches.organization_id)
        )
      )
  )
);

drop policy if exists review_actions_staff_access on public.review_actions;
create policy review_actions_staff_access
on public.review_actions for all
using (
  review_batch_id is not null
  and exists (
    select 1 from public.review_batches
    where review_batches.id = review_actions.review_batch_id
      and (
        (
          review_batches.target_bank_id is not null
          and private.can_read_question_bank(review_batches.target_bank_id)
        )
        or (
          review_batches.target_bank_id is null
          and private.is_org_staff(review_batches.organization_id)
        )
      )
  )
)
with check (
  review_batch_id is not null
  and exists (
    select 1 from public.review_batches
    where review_batches.id = review_actions.review_batch_id
      and (
        (
          review_batches.target_bank_id is not null
          and private.can_manage_question_bank(review_batches.target_bank_id)
        )
        or (
          review_batches.target_bank_id is null
          and private.is_org_staff(review_batches.organization_id)
        )
      )
  )
);

drop policy if exists questions_staff_access on public.questions;
create policy questions_staff_access
on public.questions for all
using (
  owner_bank_id is null
  and private.is_org_staff(organization_id)
)
with check (
  owner_bank_id is null
  and private.is_org_staff(organization_id)
);

drop policy if exists questions_bank_member_read on public.questions;
create policy questions_bank_member_read
on public.questions for select
using (
  deleted_at is null
  and owner_bank_id is not null
  and exists (
    select 1
    from public.bank_questions bank_question
    where bank_question.question_id = questions.id
      and bank_question.bank_id = questions.owner_bank_id
      and bank_question.status = 'active'
      and private.can_read_question_bank(bank_question.bank_id)
  )
);

drop policy if exists questions_bank_manager_write on public.questions;
create policy questions_bank_manager_write
on public.questions for all
using (
  owner_bank_id is not null
  and private.can_manage_question_bank(owner_bank_id)
  and exists (
    select 1
    from public.question_banks bank
    where bank.id = questions.owner_bank_id
      and bank.organization_id = questions.organization_id
  )
)
with check (
  owner_bank_id is not null
  and private.can_manage_question_bank(owner_bank_id)
  and exists (
    select 1
    from public.question_banks bank
    where bank.id = questions.owner_bank_id
      and bank.organization_id = questions.organization_id
  )
);

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

create or replace function public.approve_review_item_to_bank(
  p_review_item_id uuid,
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
  resolved_question_id uuid;
begin
  select created_question_id
  into resolved_question_id
  from public.review_draft_items
  where id = p_review_item_id
    and item_kind = 'question';

  if resolved_question_id is null then
    raise exception 'Review Draft item does not reference a created question.';
  end if;

  return query
  select *
  from public.approve_bank_review_question(resolved_question_id, p_target_bank_id);
end;
$$;

comment on function public.approve_bank_review_question(uuid, uuid) is
  'Approves a Review Draft question into a teacher Question Bank without global publish or assignment.';

comment on function public.approve_review_item_to_bank(uuid, uuid) is
  'Review-item wrapper for approving a bank-scoped draft into a teacher Question Bank.';

revoke all on function public.approve_bank_review_question(uuid, uuid) from public, anon;
revoke all on function public.approve_review_item_to_bank(uuid, uuid) from public, anon;

grant execute on function public.approve_bank_review_question(uuid, uuid) to authenticated;
grant execute on function public.approve_review_item_to_bank(uuid, uuid) to authenticated;
