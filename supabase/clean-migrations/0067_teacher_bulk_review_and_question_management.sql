-- Add atomic, current-page Teacher bulk operations without weakening the
-- Library-first Review, ownership, or Assignment safety gates.

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

  select item.id, question_row.revision_of_question_id
  into strict_review_item_id, revision_source_id
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
    and item.status = 'pending_review'
    and item.created_question_id = question_row.id
    and item.target_bank_id = p_target_bank_id
    and batch.organization_id = question_row.organization_id
    and batch.target_bank_id = p_target_bank_id
  for update of question_row, item, batch;

  if strict_review_item_id is null then
    raise exception 'Review Draft must be pending with complete bank-scoped lineage before approval.';
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

comment on function public.approve_bank_review_question(uuid, uuid) is
  'Approves one pending bank-scoped Review Draft with strict bidirectional lineage.';

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

  -- Lock the complete selection in deterministic order before validating it.
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
    and item.status = 'pending_review'
    and item.created_question_id = question_row.id
    and item.target_bank_id = p_target_bank_id
    and batch.organization_id = question_row.organization_id
    and batch.target_bank_id = p_target_bank_id;

  if validated_count <> requested_count then
    raise exception 'Every selected Review Draft must still be pending with complete Library lineage.';
  end if;

  if exists (
    select question_row.revision_of_question_id
    from public.questions question_row
    where question_row.id = any(p_target_question_ids)
      and question_row.revision_of_question_id is not null
    group by question_row.revision_of_question_id
    having count(*) > 1
  ) then
    raise exception 'A batch cannot approve multiple revisions of the same active Library question.';
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

comment on function public.approve_bank_review_questions(uuid, uuid[]) is
  'Atomically approves 1-25 current-page pending Review Drafts after locking and validating the complete selection.';

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

  if p_target_status not in ('active', 'archived') then
    raise exception 'Library questions can only be activated or archived here.';
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
    raise exception 'Every selected item must still be a manageable Library question; superseded revisions cannot be restored.';
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
  'Atomically archives or restores 1-25 current-page Library question associations without changing historical Assignments.';

revoke all on function public.set_bank_question_statuses(uuid, uuid[], text)
  from public, anon;
grant execute on function public.set_bank_question_statuses(uuid, uuid[], text)
  to authenticated;

create or replace function public.submit_bank_questions_to_public_review_for_bank(
  p_target_bank_id uuid,
  p_source_bank_question_ids uuid[],
  p_public_license_confirmed boolean
)
returns table (
  submission_id uuid,
  source_question_id uuid,
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
    raise exception 'Only Library owners or editors can submit questions for Public Review.';
  end if;

  if p_public_license_confirmed is distinct from true then
    raise exception 'Public publication rights must be explicitly confirmed.';
  end if;

  requested_count := coalesce(array_length(p_source_bank_question_ids, 1), 0);

  if requested_count = 0 or requested_count > 25 then
    raise exception 'Select between 1 and 25 Library questions from the current page.';
  end if;

  if exists (
    select 1
    from unnest(p_source_bank_question_ids) selected(bank_question_id)
    where selected.bank_question_id is null
  ) or (
    select count(distinct selected.bank_question_id)
    from unnest(p_source_bank_question_ids) selected(bank_question_id)
  ) <> requested_count then
    raise exception 'Public Review selection must contain unique IDs.';
  end if;

  perform bank_question.id
  from public.bank_questions bank_question
  join public.questions question_row
    on question_row.id = bank_question.question_id
  where bank_question.id = any(p_source_bank_question_ids)
  order by bank_question.id
  for update of bank_question, question_row;

  select count(*)
  into validated_count
  from public.bank_questions bank_question
  join public.questions question_row
    on question_row.id = bank_question.question_id
  where bank_question.id = any(p_source_bank_question_ids)
    and bank_question.bank_id = p_target_bank_id
    and bank_question.status = 'active'
    and question_row.owner_bank_id = p_target_bank_id
    and question_row.status = 'review'
    and question_row.published_at is null
    and question_row.deleted_at is null;

  if validated_count <> requested_count then
    raise exception 'Every selected item must still be an active, reviewed question in this Library.';
  end if;

  return query
  select *
  from public.submit_bank_questions_to_public_review(
    p_source_bank_question_ids,
    p_public_license_confirmed
  );
end;
$$;

comment on function public.submit_bank_questions_to_public_review_for_bank(uuid, uuid[], boolean) is
  'Locks and validates one current-page Library selection before creating immutable Public Review snapshots.';

revoke all on function public.submit_bank_questions_to_public_review_for_bank(uuid, uuid[], boolean)
  from public, anon;
grant execute on function public.submit_bank_questions_to_public_review_for_bank(uuid, uuid[], boolean)
  to authenticated;

create table if not exists public.teacher_focus_selection_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  surface text not null check (surface in ('questions', 'review')),
  selected_ids uuid[] not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  check (
    coalesce(array_length(selected_ids, 1), 0) between 1 and 25
    and expires_at > created_at
    and expires_at <= created_at + interval '15 minutes'
  )
);

create index if not exists teacher_focus_selection_receipts_expiry_idx
  on public.teacher_focus_selection_receipts (expires_at);

alter table public.teacher_focus_selection_receipts enable row level security;

drop policy if exists teacher_focus_selection_receipts_owner_read
  on public.teacher_focus_selection_receipts;
create policy teacher_focus_selection_receipts_owner_read
on public.teacher_focus_selection_receipts
for select
using (
  user_id = auth.uid()
  and expires_at > now()
);

revoke all on table public.teacher_focus_selection_receipts
  from public, anon, authenticated;

create or replace function public.create_teacher_focus_selection_receipt(
  p_target_bank_id uuid,
  p_surface text,
  p_selected_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid := auth.uid();
  requested_count integer;
  validated_count integer;
  created_receipt_id uuid;
begin
  if actor_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = actor_id
      and profile.status = 'active'
      and profile.role in ('teacher', 'admin', 'super_admin')
  ) then
    raise exception 'Teacher workspace access is required.';
  end if;

  if p_surface not in ('questions', 'review') then
    raise exception 'Unsupported focus selection surface.';
  end if;

  if (
    p_surface = 'review'
    and not private.is_question_bank_member(p_target_bank_id)
  ) or (
    p_surface = 'questions'
    and not private.can_read_question_bank(p_target_bank_id)
  ) then
    raise exception 'The selected Library is not available.';
  end if;

  requested_count := coalesce(array_length(p_selected_ids, 1), 0);

  if requested_count = 0 or requested_count > 25 then
    raise exception 'Focus preview accepts 1-25 current-page items.';
  end if;

  if exists (
    select 1 from unnest(p_selected_ids) selected(id)
    where selected.id is null
  ) or (
    select count(distinct selected.id)
    from unnest(p_selected_ids) selected(id)
  ) <> requested_count then
    raise exception 'Focus selection must contain unique IDs.';
  end if;

  if p_surface = 'questions' then
    select count(*)
    into validated_count
    from public.bank_questions bank_question
    where bank_question.id = any(p_selected_ids)
      and bank_question.bank_id = p_target_bank_id
      and bank_question.status in ('active', 'archived');
  else
    select count(*)
    into validated_count
    from public.review_draft_items item
    join public.review_batches batch
      on batch.id = item.review_batch_id
    where item.id = any(p_selected_ids)
      and item.item_kind = 'question'
      and item.target_bank_id = p_target_bank_id
      and batch.target_bank_id = p_target_bank_id;
  end if;

  if validated_count <> requested_count then
    raise exception 'Every focus item must belong to the selected Library.';
  end if;

  delete from public.teacher_focus_selection_receipts
  where expires_at <= now();

  insert into public.teacher_focus_selection_receipts (
    user_id,
    bank_id,
    surface,
    selected_ids
  )
  values (
    actor_id,
    p_target_bank_id,
    p_surface,
    p_selected_ids
  )
  returning id into created_receipt_id;

  return created_receipt_id;
end;
$$;

comment on function public.create_teacher_focus_selection_receipt(uuid, text, uuid[]) is
  'Creates a short-lived, user-bound opaque receipt so private selected IDs never enter preview URLs or browser history.';

revoke all on function public.create_teacher_focus_selection_receipt(uuid, text, uuid[])
  from public, anon;
grant execute on function public.create_teacher_focus_selection_receipt(uuid, text, uuid[])
  to authenticated;

create or replace function public.read_teacher_focus_selection_receipt(
  p_receipt_id uuid,
  p_target_bank_id uuid,
  p_surface text
)
returns uuid[]
language plpgsql
security definer
set search_path = public, private
as $$
declare
  selected_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select receipt.selected_ids
  into selected_ids
  from public.teacher_focus_selection_receipts receipt
  where receipt.id = p_receipt_id
    and receipt.user_id = auth.uid()
    and receipt.bank_id = p_target_bank_id
    and receipt.surface = p_surface
    and receipt.expires_at > now();

  if selected_ids is null then
    raise exception 'Focus selection is unavailable or expired.';
  end if;

  return selected_ids;
end;
$$;

comment on function public.read_teacher_focus_selection_receipt(uuid, uuid, text) is
  'Returns IDs only to the authenticated creator of an unexpired, bank- and surface-bound focus receipt.';

revoke all on function public.read_teacher_focus_selection_receipt(uuid, uuid, text)
  from public, anon;
grant execute on function public.read_teacher_focus_selection_receipt(uuid, uuid, text)
  to authenticated;
