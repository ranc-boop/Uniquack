-- Library revisions, immutable public submissions, and independent public pulls.
-- Forward-only: teacher-owned questions remain bank-owned and global public
-- questions continue to use owner_bank_id is null.

alter table public.questions
  add column if not exists revision_of_question_id uuid
    references public.questions(id) on delete set null;

alter table public.question_assets
  add column if not exists display_on_detail boolean not null default true;

create index if not exists questions_revision_of_question_id_idx
  on public.questions(revision_of_question_id)
  where revision_of_question_id is not null and deleted_at is null;

create unique index if not exists questions_one_open_revision_idx
  on public.questions(owner_bank_id, revision_of_question_id)
  where revision_of_question_id is not null
    and status = 'draft'
    and deleted_at is null;

create table if not exists public.public_question_submissions (
  id uuid primary key default gen_random_uuid(),
  source_bank_id uuid not null references public.question_banks(id) on delete restrict,
  source_bank_question_id uuid not null references public.bank_questions(id) on delete restrict,
  source_question_id uuid not null references public.questions(id) on delete restrict,
  supersedes_submission_id uuid references public.public_question_submissions(id) on delete set null,
  submitted_snapshot jsonb not null,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending'
    check (status in (
      'pending',
      'in_review',
      'changes_requested',
      'accepted',
      'rejected',
      'withdrawn'
    )),
  review_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  published_question_id uuid references public.questions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_question_submissions_publish_state_check check (
    (status = 'accepted' and published_question_id is not null)
    or (status <> 'accepted' and published_question_id is null)
  )
);

create unique index if not exists public_question_submissions_one_open_idx
  on public.public_question_submissions(source_question_id)
  where status in ('pending', 'in_review');

create index if not exists public_question_submissions_bank_status_idx
  on public.public_question_submissions(source_bank_id, status, created_at desc);

create index if not exists public_question_submissions_status_created_idx
  on public.public_question_submissions(status, created_at desc);

create table if not exists public.public_question_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.public_question_submissions(id) on delete cascade,
  action_kind text not null
    check (action_kind in (
      'submitted',
      'review_started',
      'changes_requested',
      'accepted',
      'rejected',
      'withdrawn'
    )),
  actor_id uuid references public.profiles(id) on delete set null,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists public_question_submission_events_submission_idx
  on public.public_question_submission_events(submission_id, created_at);

alter table public.questions
  add column if not exists public_submission_id uuid
    references public.public_question_submissions(id) on delete set null;

create unique index if not exists questions_public_submission_id_key
  on public.questions(public_submission_id)
  where public_submission_id is not null;

drop trigger if exists public_question_submissions_set_updated_at
  on public.public_question_submissions;
create trigger public_question_submissions_set_updated_at
before update on public.public_question_submissions
for each row execute function private.set_updated_at();

create or replace function private.prevent_public_submission_snapshot_change()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.submitted_snapshot is distinct from old.submitted_snapshot
    or new.source_bank_id is distinct from old.source_bank_id
    or new.source_bank_question_id is distinct from old.source_bank_question_id
    or new.source_question_id is distinct from old.source_question_id
    or new.submitted_by is distinct from old.submitted_by
    or new.supersedes_submission_id is distinct from old.supersedes_submission_id
  then
    raise exception 'Public submission source and snapshot are immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists public_question_submissions_snapshot_immutable
  on public.public_question_submissions;
create trigger public_question_submissions_snapshot_immutable
before update on public.public_question_submissions
for each row execute function private.prevent_public_submission_snapshot_change();

alter table public.public_question_submissions enable row level security;
alter table public.public_question_submission_events enable row level security;

create or replace function private.is_question_bank_content_editor(
  target_bank_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.bank_members member
    join public.question_banks bank on bank.id = member.bank_id
    where member.bank_id = target_bank_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role in ('owner', 'editor')
      and bank.status = 'active'
  );
$$;

create or replace function private.is_question_bank_member(
  target_bank_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.bank_members member
    join public.question_banks bank on bank.id = member.bank_id
    where member.bank_id = target_bank_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and bank.status = 'active'
  );
$$;

revoke all on function private.is_question_bank_content_editor(uuid)
  from public, anon, authenticated;
grant execute on function private.is_question_bank_content_editor(uuid)
  to authenticated;
revoke all on function private.is_question_bank_member(uuid)
  from public, anon, authenticated;
grant execute on function private.is_question_bank_member(uuid)
  to authenticated;

create or replace function private.can_read_question_child(
  target_question_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.questions question
    where question.id = target_question_id
      and question.deleted_at is null
      and (
        (
          question.owner_bank_id is null
          and private.is_admin()
        )
        or (
          question.owner_bank_id is not null
          and private.is_question_bank_member(question.owner_bank_id)
        )
      )
  );
$$;

create or replace function private.can_manage_question_child(
  target_question_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.questions question
    where question.id = target_question_id
      and question.deleted_at is null
      and (
        (
          question.owner_bank_id is null
          and private.is_admin()
        )
        or (
          question.owner_bank_id is not null
          and private.is_question_bank_content_editor(question.owner_bank_id)
        )
      )
  );
$$;

revoke all on function private.can_read_question_child(uuid)
  from public, anon, authenticated;
grant execute on function private.can_read_question_child(uuid)
  to authenticated;
revoke all on function private.can_manage_question_child(uuid)
  from public, anon, authenticated;
grant execute on function private.can_manage_question_child(uuid)
  to authenticated;

-- Keep the canonical asset authorization helper aligned with the new draft
-- member-read policy without granting any write capability.
create or replace function private.can_read_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.questions question
    where question.id = p_question_id
      and question.deleted_at is null
      and (
        (
          question.status = 'published'
          and question.visibility = 'public'
          and question.owner_bank_id is null
        )
        or (
          question.owner_bank_id is null
          and private.is_admin()
        )
        or (
          question.owner_bank_id is not null
          and private.is_question_bank_member(question.owner_bank_id)
        )
        or private.can_read_assignment_question(question.id)
      )
  );
$$;

revoke all on function private.can_read_question(uuid)
  from public, anon, authenticated;

-- Managers may author private drafts, but only the security-definer Review RPC
-- may turn them into assignment-ready questions or activate bank rows.
drop policy if exists questions_bank_manager_write on public.questions;
drop policy if exists questions_bank_manager_draft_insert on public.questions;
drop policy if exists questions_bank_manager_draft_read on public.questions;
create policy questions_bank_manager_draft_read
on public.questions for select
using (
  owner_bank_id is not null
  and private.is_question_bank_member(owner_bank_id)
);

create policy questions_bank_manager_draft_insert
on public.questions for insert
with check (
  owner_bank_id is not null
  and private.is_question_bank_content_editor(owner_bank_id)
  and status = 'draft'
  and visibility = 'private'
  and published_at is null
  and exists (
    select 1
    from public.question_banks bank
    where bank.id = questions.owner_bank_id
      and bank.organization_id = questions.organization_id
      and bank.status = 'active'
  )
);

drop policy if exists questions_bank_manager_draft_update on public.questions;
create policy questions_bank_manager_draft_update
on public.questions for update
using (
  owner_bank_id is not null
  and private.is_question_bank_content_editor(owner_bank_id)
  and status = 'draft'
  and visibility = 'private'
  and published_at is null
)
with check (
  owner_bank_id is not null
  and private.is_question_bank_content_editor(owner_bank_id)
  and status in ('draft', 'archived')
  and visibility = 'private'
  and published_at is null
  and exists (
    select 1
    from public.question_banks bank
    where bank.id = questions.owner_bank_id
      and bank.organization_id = questions.organization_id
  )
);

drop policy if exists bank_questions_write_managers on public.bank_questions;

drop policy if exists questions_staff_access on public.questions;
create policy questions_staff_access
on public.questions for all
using (
  owner_bank_id is null
  and private.is_admin()
)
with check (
  owner_bank_id is null
  and private.is_admin()
);

-- A Viewer may inspect a Library Review Draft and its child metadata, but only
-- an owner/editor may mutate child rows. Global question children remain
-- Admin-managed. These forward overrides replace the old organization-staff
-- FOR ALL policies from 0006.
drop policy if exists question_rubric_steps_staff_access
  on public.question_rubric_steps;
create policy question_rubric_steps_staff_access
on public.question_rubric_steps for all
using (private.can_manage_question_child(question_id))
with check (private.can_manage_question_child(question_id));
drop policy if exists question_rubric_steps_library_read
  on public.question_rubric_steps;
create policy question_rubric_steps_library_read
on public.question_rubric_steps for select
using (private.can_read_question_child(question_id));

drop policy if exists question_assets_staff_access
  on public.question_assets;
create policy question_assets_staff_access
on public.question_assets for all
using (private.can_manage_question_child(question_id))
with check (private.can_manage_question_child(question_id));
drop policy if exists question_assets_library_read
  on public.question_assets;
create policy question_assets_library_read
on public.question_assets for select
using (private.can_read_question_child(question_id));

drop policy if exists question_source_files_staff_read
  on public.question_source_files;
create policy question_source_files_staff_read
on public.question_source_files for select
using (
  private.is_admin()
  or created_by = auth.uid()
  or (
    question_id is not null
    and private.can_read_question_child(question_id)
  )
);
drop policy if exists question_source_files_staff_write
  on public.question_source_files;
create policy question_source_files_staff_write
on public.question_source_files for all
using (
  (
    question_id is null
    and private.is_admin()
  )
  or (
    question_id is not null
    and private.can_manage_question_child(question_id)
  )
)
with check (
  (
    question_id is null
    and private.is_admin()
  )
  or (
    question_id is not null
    and private.can_manage_question_child(question_id)
  )
);

drop policy if exists question_source_refs_staff_read
  on public.question_source_references;
create policy question_source_refs_staff_read
on public.question_source_references for select
using (private.can_read_question_child(question_id));
drop policy if exists question_source_refs_staff_write
  on public.question_source_references;
create policy question_source_refs_staff_write
on public.question_source_references for all
using (private.can_manage_question_child(question_id))
with check (private.can_manage_question_child(question_id));

drop policy if exists question_status_events_staff_read
  on public.question_status_events;
create policy question_status_events_staff_read
on public.question_status_events for select
using (private.can_read_question_child(question_id));
drop policy if exists question_status_events_staff_insert
  on public.question_status_events;
create policy question_status_events_staff_insert
on public.question_status_events for insert
with check (private.can_manage_question_child(question_id));

drop policy if exists question_taxonomy_assignments_staff_access
  on public.question_taxonomy_assignments;
create policy question_taxonomy_assignments_staff_access
on public.question_taxonomy_assignments for all
using (private.can_manage_question_child(question_id))
with check (private.can_manage_question_child(question_id));
drop policy if exists question_taxonomy_assignments_library_read
  on public.question_taxonomy_assignments;
create policy question_taxonomy_assignments_library_read
on public.question_taxonomy_assignments for select
using (private.can_read_question_child(question_id));

-- Storage object authorization must follow the same child-resource boundary;
-- organization membership alone never grants upload/delete capability.
create or replace function private.can_write_question_asset_storage_object(
  p_bucket_id text,
  p_object_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, storage
set row_security = off
as $$
begin
  if p_bucket_id <> 'question-assets' then
    return false;
  end if;

  return exists (
    select 1
    from public.question_assets asset
    where asset.storage_bucket = p_bucket_id
      and asset.storage_path = p_object_path
      and private.can_manage_question_child(asset.question_id)
  );
end;
$$;

create or replace function private.can_read_question_asset_storage_object(
  p_bucket_id text,
  p_object_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, storage
set row_security = off
as $$
begin
  if p_bucket_id <> 'question-assets' then
    return false;
  end if;

  return exists (
    select 1
    from public.question_assets asset
    where asset.storage_bucket = p_bucket_id
      and asset.storage_path = p_object_path
      and private.can_read_question(asset.question_id)
  );
end;
$$;

revoke all on function private.can_write_question_asset_storage_object(text, text)
  from public, anon, authenticated;
grant execute on function private.can_write_question_asset_storage_object(text, text)
  to authenticated;
revoke all on function private.can_read_question_asset_storage_object(text, text)
  from public, anon, authenticated;
grant execute on function private.can_read_question_asset_storage_object(text, text)
  to authenticated;

drop policy if exists question_banks_update_managers on public.question_banks;
create policy question_banks_update_managers
on public.question_banks for update
using (private.can_manage_question_bank(id))
with check (
  private.can_manage_question_bank(id)
  and (visibility <> 'public' or private.is_super_admin())
);

drop policy if exists public_question_submissions_read_scoped
  on public.public_question_submissions;
create policy public_question_submissions_read_scoped
on public.public_question_submissions for select
using (
  private.is_super_admin()
  or private.is_question_bank_content_editor(source_bank_id)
);

drop policy if exists public_question_submission_events_read_scoped
  on public.public_question_submission_events;
create policy public_question_submission_events_read_scoped
on public.public_question_submission_events for select
using (
  exists (
    select 1
    from public.public_question_submissions submission
    where submission.id = public_question_submission_events.submission_id
      and (
        private.is_super_admin()
        or private.is_question_bank_content_editor(submission.source_bank_id)
      )
  )
);

-- Direct writes are intentionally omitted. All mutations go through the
-- security-definer functions below, which re-check the client-provided scope.

alter function public.create_question_bank(text, text, text)
  rename to create_question_bank_legacy;

revoke all on function public.create_question_bank_legacy(text, text, text)
  from public, anon, authenticated;

create or replace function public.create_question_bank(
  bank_name text,
  bank_description text default null,
  bank_visibility text default 'private'
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if coalesce(bank_visibility, 'private') = 'public'
    and not private.is_super_admin()
  then
    raise exception 'Teachers cannot create public Libraries. Submit assignment-ready questions through public review.';
  end if;

  return public.create_question_bank_legacy(
    bank_name,
    bank_description,
    bank_visibility
  );
end;
$$;

alter function public.publish_review_draft_questions(uuid[])
  rename to publish_review_draft_questions_legacy;

revoke all on function public.publish_review_draft_questions_legacy(uuid[])
  from public, anon, authenticated;

create or replace function public.publish_review_draft_questions(
  question_ids uuid[]
)
returns table (
  question_id uuid,
  source_review_item_id uuid,
  approved_taxonomy_assignment_count integer
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Only Admin can publish Central Public Library Review Drafts.';
  end if;

  if exists (
    select 1
    from public.questions question
    where question.id = any(coalesce(question_ids, '{}'::uuid[]))
      and (
        question.owner_bank_id is not null
        or question.status <> 'draft'
        or question.visibility <> 'private'
      )
  ) then
    raise exception 'Global Review can publish only private global drafts.';
  end if;

  return query
  select *
  from public.publish_review_draft_questions_legacy(question_ids);
end;
$$;

create or replace function public.create_bank_manual_question_draft(
  p_bank_id uuid,
  p_question_code text,
  p_title text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid := auth.uid();
  bank_row public.question_banks%rowtype;
  question_id uuid := gen_random_uuid();
  review_batch_id uuid := gen_random_uuid();
  review_item_id uuid := gen_random_uuid();
begin
  if actor_id is null or not private.is_question_bank_content_editor(p_bank_id) then
    raise exception 'Only Library owners or editors can create manual drafts.';
  end if;

  select *
  into bank_row
  from public.question_banks
  where id = p_bank_id
    and status = 'active'
  for update;

  if bank_row.id is null then
    raise exception 'The target Library is not active.';
  end if;

  if length(btrim(coalesce(p_question_code, ''))) < 1
    or length(btrim(p_question_code)) > 80
  then
    raise exception 'Question code must contain 1 to 80 characters.';
  end if;

  if length(btrim(coalesce(p_title, ''))) < 1
    or length(btrim(p_title)) > 240
  then
    raise exception 'Question title must contain 1 to 240 characters.';
  end if;

  insert into public.review_batches (
    id,
    organization_id,
    created_by,
    source_kind,
    status,
    target_bank_id,
    title,
    summary
  )
  values (
    review_batch_id,
    bank_row.organization_id,
    actor_id,
    'manual',
    'pending_review',
    p_bank_id,
    'Manual Library question',
    jsonb_build_object(
      'reviewScope', 'question_bank',
      'targetBankId', p_bank_id
    )
  );

  insert into public.questions (
    id,
    organization_id,
    question_code,
    title,
    question_type,
    content_html,
    difficulty_rating,
    status,
    source_kind,
    owner_bank_id,
    visibility,
    created_by,
    updated_by
  )
  values (
    question_id,
    bank_row.organization_id,
    btrim(p_question_code),
    btrim(p_title),
    'frq',
    '',
    500,
    'draft',
    'review_draft',
    p_bank_id,
    'private',
    actor_id,
    actor_id
  );

  insert into public.review_draft_items (
    id,
    review_batch_id,
    item_kind,
    status,
    draft_payload,
    validation_warnings,
    target_bank_id,
    created_question_id
  )
  values (
    review_item_id,
    review_batch_id,
    'question',
    'pending_review',
    jsonb_build_object(
      'questionId', question_id,
      'questionCode', btrim(p_question_code),
      'title', btrim(p_title),
      'sourceKind', 'manual',
      'targetBankId', p_bank_id
    ),
    '[]'::jsonb,
    p_bank_id,
    question_id
  );

  update public.questions
  set source_review_item_id = review_item_id
  where id = question_id;

  return question_id;
end;
$$;

create or replace function public.create_global_manual_question_draft(
  p_question_code text,
  p_title text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid := auth.uid();
  organization_id uuid;
  question_id uuid := gen_random_uuid();
  review_batch_id uuid := gen_random_uuid();
  review_item_id uuid := gen_random_uuid();
begin
  if actor_id is null or not private.is_admin() then
    raise exception 'Only Admin can create Central Public Library drafts.';
  end if;

  select profile.default_organization_id
  into organization_id
  from public.profiles profile
  where profile.id = actor_id
    and profile.status = 'active';

  if organization_id is null
    or not private.is_org_staff(organization_id)
  then
    raise exception 'An active default organization is required.';
  end if;

  if length(btrim(coalesce(p_question_code, ''))) < 1
    or length(btrim(p_question_code)) > 80
  then
    raise exception 'Question code must contain 1 to 80 characters.';
  end if;

  if length(btrim(coalesce(p_title, ''))) < 1
    or length(btrim(p_title)) > 240
  then
    raise exception 'Question title must contain 1 to 240 characters.';
  end if;

  insert into public.review_batches (
    id,
    organization_id,
    created_by,
    source_kind,
    status,
    target_bank_id,
    title,
    summary
  )
  values (
    review_batch_id,
    organization_id,
    actor_id,
    'manual',
    'pending_review',
    null,
    'Central Public Library manual question',
    jsonb_build_object('reviewScope', 'global')
  );

  insert into public.questions (
    id,
    organization_id,
    question_code,
    title,
    question_type,
    content_html,
    difficulty_rating,
    status,
    source_kind,
    owner_bank_id,
    visibility,
    created_by,
    updated_by
  )
  values (
    question_id,
    organization_id,
    btrim(p_question_code),
    btrim(p_title),
    'frq',
    '',
    500,
    'draft',
    'review_draft',
    null,
    'private',
    actor_id,
    actor_id
  );

  insert into public.review_draft_items (
    id,
    review_batch_id,
    item_kind,
    status,
    draft_payload,
    validation_warnings,
    target_bank_id,
    created_question_id
  )
  values (
    review_item_id,
    review_batch_id,
    'question',
    'pending_review',
    jsonb_build_object(
      'questionId', question_id,
      'questionCode', btrim(p_question_code),
      'title', btrim(p_title),
      'sourceKind', 'manual',
      'reviewScope', 'global'
    ),
    '[]'::jsonb,
    null,
    question_id
  );

  update public.questions
  set source_review_item_id = review_item_id
  where id = question_id;

  return question_id;
end;
$$;

create or replace function public.create_bank_question_revision_draft(
  p_bank_id uuid,
  p_source_question_id uuid,
  p_copied_assets jsonb default '[]'::jsonb,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid := p_actor_id;
  source_question public.questions%rowtype;
  source_bank_question public.bank_questions%rowtype;
  revision_id uuid := gen_random_uuid();
  review_batch_id uuid := gen_random_uuid();
  review_item_id uuid := gen_random_uuid();
  asset_row jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Revision asset finalization is server-only.';
  end if;

  if actor_id is null or not exists (
    select 1
    from public.bank_members member
    join public.question_banks bank on bank.id = member.bank_id
    where member.bank_id = p_bank_id
      and member.user_id = actor_id
      and member.status = 'active'
      and member.role in ('owner', 'editor')
      and bank.status = 'active'
  ) then
    raise exception 'Only Library owners or editors can create revisions.';
  end if;

  select bank_question.*
  into source_bank_question
  from public.bank_questions bank_question
  join public.question_banks bank on bank.id = bank_question.bank_id
  where bank_question.bank_id = p_bank_id
    and bank_question.question_id = p_source_question_id
    and bank_question.status = 'active'
    and bank.status = 'active'
  for update of bank_question;

  if source_bank_question.id is null then
    raise exception 'The assignment-ready source question is not active in this Library.';
  end if;

  select *
  into source_question
  from public.questions
  where id = p_source_question_id
    and owner_bank_id = p_bank_id
    and deleted_at is null
  for update;

  if source_question.id is null then
    raise exception 'The source question does not belong to this Library.';
  end if;

  if jsonb_array_length(coalesce(p_copied_assets, '[]'::jsonb)) <> (
    select count(*)
    from public.question_assets asset
    where asset.question_id = source_question.id
  ) then
    raise exception 'Every revision image must be copied independently.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
    where copied->>'bucket' <> 'question-assets'
      or copied->>'path' not like
        'library-revisions/' || p_bank_id::text || '/' || source_question.id::text || '/%'
      or nullif(copied->>'assetId', '') is null
      or nullif(copied->>'sourceAssetId', '') is null
      or not exists (
        select 1
        from public.question_assets source_asset
        where source_asset.question_id = source_question.id
          and source_asset.id::text = copied->>'sourceAssetId'
      )
  ) then
    raise exception 'A revision asset has an invalid server manifest.';
  end if;

  if (
    select count(distinct copied->>'sourceAssetId')
    from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
  ) <> jsonb_array_length(coalesce(p_copied_assets, '[]'::jsonb))
    or (
      select count(distinct copied->>'assetId')
      from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
    ) <> jsonb_array_length(coalesce(p_copied_assets, '[]'::jsonb))
  then
    raise exception 'Revision assets must have a one-to-one mapping.';
  end if;

  if exists (
    select 1
    from public.questions
    where owner_bank_id = p_bank_id
      and revision_of_question_id = p_source_question_id
      and status = 'draft'
      and deleted_at is null
  ) then
    raise exception 'An open revision already exists for this question.';
  end if;

  insert into public.review_batches (
    id,
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
    review_batch_id,
    source_question.organization_id,
    actor_id,
    'manual',
    p_source_question_id,
    'pending_review',
    p_bank_id,
    'Question revision',
    jsonb_build_object(
      'reviewScope', 'question_bank',
      'revisionOfQuestionId', p_source_question_id,
      'targetBankId', p_bank_id
    )
  );

  insert into public.questions (
    id,
    organization_id,
    question_code,
    title,
    question_type,
    content_html,
    content_source,
    content_source_format,
    solution_html,
    solution_source,
    solution_source_format,
    options,
    answer_spec,
    difficulty_rating,
    status,
    source,
    source_kind,
    source_review_item_id,
    owner_bank_id,
    visibility,
    revision_of_question_id,
    created_by,
    updated_by
  )
  values (
    revision_id,
    source_question.organization_id,
    left(source_question.question_code, 64) || '-rev-' || left(replace(revision_id::text, '-', ''), 8),
    source_question.title,
    source_question.question_type,
    source_question.content_html,
    source_question.content_source,
    source_question.content_source_format,
    source_question.solution_html,
    source_question.solution_source,
    source_question.solution_source_format,
    source_question.options,
    source_question.answer_spec,
    source_question.difficulty_rating,
    'draft',
    source_question.source,
    'review_draft',
    null,
    p_bank_id,
    'private',
    p_source_question_id,
    actor_id,
    actor_id
  );

  insert into public.review_draft_items (
    id,
    review_batch_id,
    item_kind,
    status,
    draft_payload,
    validation_warnings,
    target_bank_id,
    created_question_id
  )
  values (
    review_item_id,
    review_batch_id,
    'question',
    'pending_review',
    jsonb_build_object(
      'revisionOfQuestionId', p_source_question_id,
      'sourceBankQuestionId', source_bank_question.id,
      'targetBankId', p_bank_id
    ),
    '[]'::jsonb,
    p_bank_id,
    revision_id
  );

  update public.questions
  set source_review_item_id = review_item_id
  where id = revision_id;

  insert into public.question_taxonomy_assignments (
    question_id,
    tag_id,
    source,
    confidence,
    review_status,
    evidence,
    created_by,
    updated_by
  )
  select
    revision_id,
    assignment.tag_id,
    'review',
    assignment.confidence,
    'pending_review',
    assignment.evidence || jsonb_build_object('revisionOfQuestionId', p_source_question_id),
    actor_id,
    actor_id
  from public.question_taxonomy_assignments assignment
  where assignment.question_id = p_source_question_id
    and assignment.review_status = 'approved';

  for asset_row in
    select value
    from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb))
  loop
    insert into public.question_assets (
      id,
      question_id,
      asset_kind,
      storage_bucket,
      storage_path,
      label,
      alt_text,
      display_order,
      created_by
    )
    values (
      (asset_row->>'assetId')::uuid,
      revision_id,
      'image',
      asset_row->>'bucket',
      asset_row->>'path',
      nullif(asset_row->>'label', ''),
      nullif(asset_row->>'altText', ''),
      coalesce((asset_row->>'displayOrder')::integer, 0),
      actor_id
    );

    update public.questions
    set
      content_html = replace(
        content_html,
        '/api/question-assets/' || (asset_row->>'sourceAssetId'),
        '/api/question-assets/' || (asset_row->>'assetId')
      ),
      solution_html = case
        when solution_html is null then null
        else replace(
          solution_html,
          '/api/question-assets/' || (asset_row->>'sourceAssetId'),
          '/api/question-assets/' || (asset_row->>'assetId')
        )
      end,
      content_source = case
        when content_source is null then null
        else replace(
          content_source,
          '/api/question-assets/' || (asset_row->>'sourceAssetId'),
          '/api/question-assets/' || (asset_row->>'assetId')
        )
      end,
      solution_source = case
        when solution_source is null then null
        else replace(
          solution_source,
          '/api/question-assets/' || (asset_row->>'sourceAssetId'),
          '/api/question-assets/' || (asset_row->>'assetId')
        )
      end,
      options = replace(
        options::text,
        '/api/question-assets/' || (asset_row->>'sourceAssetId'),
        '/api/question-assets/' || (asset_row->>'assetId')
      )::jsonb,
      answer_spec = replace(
        answer_spec::text,
        '/api/question-assets/' || (asset_row->>'sourceAssetId'),
        '/api/question-assets/' || (asset_row->>'assetId')
      )::jsonb
    where id = revision_id;
  end loop;

  if exists (
    select 1
    from regexp_matches(
      coalesce((select content_html from public.questions where id = revision_id), '')
        || ' '
        || coalesce((select solution_html from public.questions where id = revision_id), '')
        || ' '
        || coalesce((select content_source from public.questions where id = revision_id), '')
        || ' '
        || coalesce((select solution_source from public.questions where id = revision_id), '')
        || ' '
        || coalesce((select options::text from public.questions where id = revision_id), '')
        || ' '
        || coalesce((select answer_spec::text from public.questions where id = revision_id), ''),
      '/api/question-assets/([0-9a-fA-F-]{36})',
      'g'
    ) as asset_match
    where asset_match[1] not in (
      select copied->>'assetId'
      from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
    )
  ) then
    raise exception 'The revision contains an unreviewed image reference.';
  end if;

  return revision_id;
end;
$$;

-- Keep the mature approval flow and wrap only the revision swap behavior.
alter function public.approve_bank_review_question(uuid, uuid)
  rename to approve_bank_review_question_legacy;

revoke all on function public.approve_bank_review_question_legacy(uuid, uuid)
  from public, anon, authenticated;

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
  approved_record record;
begin
  if auth.uid() is null or not private.is_question_bank_content_editor(p_target_bank_id) then
    raise exception 'Only Library owners or editors can approve Review Drafts.';
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

alter function public.create_assignment_from_bank(
  uuid, uuid, text, text, timestamptz, uuid[], boolean
)
  rename to create_assignment_from_bank_legacy;

revoke all on function public.create_assignment_from_bank_legacy(
  uuid, uuid, text, text, timestamptz, uuid[], boolean
) from public, anon, authenticated;

create or replace function public.create_assignment_from_bank(
  p_target_bank_id uuid,
  p_target_classroom_id uuid,
  p_assignment_title text,
  p_assignment_instructions text default null,
  p_assignment_due_at timestamptz default null,
  p_selected_bank_question_ids uuid[] default '{}'::uuid[],
  p_assign_now boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  selected_count integer;
  reviewed_count integer;
begin
  if auth.uid() is null
    or not private.is_question_bank_content_editor(p_target_bank_id)
  then
    raise exception 'Only Library owners or editors can create assignments.';
  end if;

  select count(distinct selected_id)
  into selected_count
  from unnest(coalesce(p_selected_bank_question_ids, '{}'::uuid[]))
    selected_rows(selected_id);

  select count(*)
  into reviewed_count
  from public.bank_questions bank_question
  join public.questions question
    on question.id = bank_question.question_id
  where bank_question.id = any(coalesce(p_selected_bank_question_ids, '{}'::uuid[]))
    and bank_question.bank_id = p_target_bank_id
    and bank_question.status = 'active'
    and question.owner_bank_id = p_target_bank_id
    and question.status = 'review'
    and question.deleted_at is null
    and question.published_at is null;

  if selected_count = 0 or reviewed_count <> selected_count then
    raise exception 'Every selected item must be an active, reviewed Library question.';
  end if;

  return public.create_assignment_from_bank_legacy(
    p_target_bank_id,
    p_target_classroom_id,
    p_assignment_title,
    p_assignment_instructions,
    p_assignment_due_at,
    p_selected_bank_question_ids,
    p_assign_now
  );
end;
$$;

create or replace function public.submit_bank_questions_to_public_review(
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
  actor_id uuid := auth.uid();
  source_row record;
  previous_submission_id uuid;
  created_submission_id uuid;
  snapshot jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_public_license_confirmed is distinct from true then
    raise exception 'Public publication rights must be explicitly confirmed.';
  end if;

  if p_source_bank_question_ids is null
    or coalesce(array_length(p_source_bank_question_ids, 1), 0) = 0
  then
    raise exception 'Select at least one assignment-ready Library question.';
  end if;

  for source_row in
    select
      bank_question.id as bank_question_id,
      bank_question.bank_id,
      question.*
    from public.bank_questions bank_question
    join public.question_banks bank
      on bank.id = bank_question.bank_id and bank.status = 'active'
    join public.questions question
      on question.id = bank_question.question_id
    where bank_question.id = any(p_source_bank_question_ids)
      and bank_question.status = 'active'
      and question.owner_bank_id = bank_question.bank_id
      and question.status = 'review'
      and question.deleted_at is null
  loop
    if not private.is_question_bank_content_editor(source_row.bank_id) then
      raise exception 'A selected question is outside your manageable Library scope.';
    end if;

    if exists (
      select 1
      from public.public_question_submissions open_submission
      where open_submission.source_question_id = source_row.id
        and open_submission.status in ('pending', 'in_review')
    ) then
      raise exception 'This question already has an open public submission.';
    end if;

    select prior.id
    into previous_submission_id
    from public.public_question_submissions prior
    where prior.source_question_id = source_row.id
    order by prior.created_at desc
    limit 1;

    snapshot := jsonb_build_object(
      'schemaVersion', 1,
      'sourceBankId', source_row.bank_id,
      'sourceBankQuestionId', source_row.bank_question_id,
      'sourceQuestionId', source_row.id,
      'questionCode', source_row.question_code,
      'title', source_row.title,
      'questionType', source_row.question_type,
      'contentHtml', source_row.content_html,
      'contentSource', source_row.content_source,
      'contentSourceFormat', source_row.content_source_format,
      'solutionHtml', source_row.solution_html,
      'solutionSource', source_row.solution_source,
      'solutionSourceFormat', source_row.solution_source_format,
      'options', source_row.options,
      'answerSpec', source_row.answer_spec,
      'difficultyRating', source_row.difficulty_rating,
      'source', source_row.source,
      'taxonomy', coalesce((
        select jsonb_agg(jsonb_build_object(
          'tagId', assignment.tag_id,
          'confidence', assignment.confidence,
          'evidence', assignment.evidence
        ) order by assignment.tag_id)
        from public.question_taxonomy_assignments assignment
        where assignment.question_id = source_row.id
          and assignment.review_status = 'approved'
      ), '[]'::jsonb),
      'assets', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', asset.id,
          'kind', asset.asset_kind,
          'bucket', asset.storage_bucket,
          'path', asset.storage_path,
          'label', asset.label,
          'altText', asset.alt_text,
          'displayOrder', asset.display_order
        ) order by asset.display_order, asset.id)
        from public.question_assets asset
        where asset.question_id = source_row.id
          and asset.asset_kind = 'image'
      ), '[]'::jsonb)
    );

    insert into public.public_question_submissions (
      source_bank_id,
      source_bank_question_id,
      source_question_id,
      supersedes_submission_id,
      submitted_snapshot,
      submitted_by,
      status
    )
    values (
      source_row.bank_id,
      source_row.bank_question_id,
      source_row.id,
      previous_submission_id,
      snapshot,
      actor_id,
      'pending'
    )
    returning id into created_submission_id;

    insert into public.public_question_submission_events (
      submission_id,
      action_kind,
      actor_id,
      evidence
    )
    values (
      created_submission_id,
      'submitted',
      actor_id,
      jsonb_build_object(
        'snapshotSchemaVersion', 1,
        'publicLicenseConfirmed', true,
        'licenseConfirmationVersion', 1,
        'confirmedAt', now()
      )
    );

    submission_id := created_submission_id;
    source_question_id := source_row.id;
    status := 'pending';
    return next;
  end loop;

  if not found then
    raise exception 'No assignment-ready questions matched the selected IDs.';
  end if;
end;
$$;

create or replace function public.review_public_question_submission(
  p_submission_id uuid,
  p_decision text,
  p_reason text default null,
  p_public_assets jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  reviewer_id uuid := auth.uid();
  submission_row public.public_question_submissions%rowtype;
  snapshot jsonb;
  v_published_question_id uuid;
  published_code text;
  taxonomy_row jsonb;
  asset_row jsonb;
begin
  if reviewer_id is null or not private.is_super_admin() then
    raise exception 'Only Super Admin can review public submissions.';
  end if;

  if p_decision not in ('approve', 'request_changes', 'reject', 'start_review') then
    raise exception 'Invalid public submission decision.';
  end if;

  if p_decision in ('request_changes', 'reject')
    and btrim(coalesce(p_reason, '')) = ''
  then
    raise exception 'A reason is required for this decision.';
  end if;

  select *
  into submission_row
  from public.public_question_submissions
  where id = p_submission_id
  for update;

  if submission_row.id is null then
    raise exception 'Public submission was not found.';
  end if;

  if submission_row.submitted_by = reviewer_id then
    raise exception 'A public submission must be reviewed by a different Super Admin.';
  end if;

  if submission_row.status not in ('pending', 'in_review') then
    raise exception 'This public submission is no longer reviewable.';
  end if;

  if p_decision = 'start_review' then
    update public.public_question_submissions
    set status = 'in_review'
    where id = submission_row.id;

    insert into public.public_question_submission_events (
      submission_id, action_kind, actor_id, reason
    )
    values (submission_row.id, 'review_started', reviewer_id, nullif(btrim(coalesce(p_reason, '')), ''));

    return null;
  end if;

  if p_decision = 'request_changes' then
    update public.public_question_submissions
    set
      status = 'changes_requested',
      review_reason = btrim(p_reason),
      reviewed_by = reviewer_id,
      reviewed_at = now()
    where id = submission_row.id;

    insert into public.public_question_submission_events (
      submission_id, action_kind, actor_id, reason
    )
    values (submission_row.id, 'changes_requested', reviewer_id, btrim(p_reason));

    return null;
  end if;

  if p_decision = 'reject' then
    update public.public_question_submissions
    set
      status = 'rejected',
      review_reason = btrim(p_reason),
      reviewed_by = reviewer_id,
      reviewed_at = now()
    where id = submission_row.id;

    insert into public.public_question_submission_events (
      submission_id, action_kind, actor_id, reason
    )
    values (submission_row.id, 'rejected', reviewer_id, btrim(p_reason));

    return null;
  end if;

  snapshot := submission_row.submitted_snapshot;
  if btrim(coalesce(snapshot->>'title', '')) = ''
    or btrim(coalesce(snapshot->>'contentHtml', '')) = ''
    or btrim(coalesce(snapshot->>'questionType', '')) = ''
  then
    raise exception 'The approved snapshot is missing required question content.';
  end if;

  if jsonb_typeof(coalesce(p_public_assets, '[]'::jsonb)) <> 'array' then
    raise exception 'Public asset evidence must be a JSON array.';
  end if;

  if jsonb_array_length(coalesce(snapshot->'assets', '[]'::jsonb))
    <> jsonb_array_length(coalesce(p_public_assets, '[]'::jsonb))
  then
    raise exception 'Every submitted image must be copied before approval.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_public_assets, '[]'::jsonb)) copied
    where copied->>'bucket' <> 'question-assets'
      or copied->>'path' not like
        'public-submissions/' || submission_row.id::text || '/%'
      or nullif(copied->>'assetId', '') is null
      or nullif(copied->>'sourceAssetId', '') is null
      or not exists (
        select 1
        from jsonb_array_elements(coalesce(snapshot->'assets', '[]'::jsonb)) source_asset
        where source_asset->>'id' = copied->>'sourceAssetId'
      )
  ) then
    raise exception 'A copied public asset has an invalid server manifest.';
  end if;

  if (
    select count(distinct copied->>'sourceAssetId')
    from jsonb_array_elements(coalesce(p_public_assets, '[]'::jsonb)) copied
  ) <> jsonb_array_length(coalesce(snapshot->'assets', '[]'::jsonb))
    or (
      select count(distinct copied->>'assetId')
      from jsonb_array_elements(coalesce(p_public_assets, '[]'::jsonb)) copied
    ) <> jsonb_array_length(coalesce(p_public_assets, '[]'::jsonb))
  then
    raise exception 'Copied public assets must map one-to-one to submitted images.';
  end if;

  v_published_question_id := gen_random_uuid();
  published_code := left(coalesce(nullif(snapshot->>'questionCode', ''), 'PUBLIC'), 62)
    || '-pub-' || left(replace(v_published_question_id::text, '-', ''), 8);

  insert into public.questions (
    id,
    organization_id,
    question_code,
    title,
    question_type,
    content_html,
    content_source,
    content_source_format,
    solution_html,
    solution_source,
    solution_source_format,
    options,
    answer_spec,
    difficulty_rating,
    status,
    source,
    source_kind,
    owner_bank_id,
    visibility,
    public_submission_id,
    created_by,
    updated_by,
    reviewed_by,
    published_at
  )
  select
    v_published_question_id,
    bank.organization_id,
    published_code,
    snapshot->>'title',
    snapshot->>'questionType',
    snapshot->>'contentHtml',
    '',
    coalesce(nullif(snapshot->>'contentSourceFormat', ''), 'html'),
    nullif(snapshot->>'solutionHtml', ''),
    '',
    coalesce(nullif(snapshot->>'solutionSourceFormat', ''), 'html'),
    coalesce(snapshot->'options', '[]'::jsonb),
    coalesce(snapshot->'answerSpec', '{}'::jsonb),
    coalesce((snapshot->>'difficultyRating')::integer, 500),
    'published',
    'public_submission:' || submission_row.id::text,
    'review_draft',
    null,
    'public',
    submission_row.id,
    reviewer_id,
    reviewer_id,
    reviewer_id,
    now()
  from public.question_banks bank
  where bank.id = submission_row.source_bank_id;

  for taxonomy_row in
    select value from jsonb_array_elements(coalesce(snapshot->'taxonomy', '[]'::jsonb))
  loop
    insert into public.question_taxonomy_assignments (
      question_id,
      tag_id,
      source,
      confidence,
      review_status,
      evidence,
      approved_by,
      approved_at,
      created_by,
      updated_by
    )
    values (
      v_published_question_id,
      taxonomy_row->>'tagId',
      'review_action',
      nullif(taxonomy_row->>'confidence', '')::numeric,
      'approved',
      coalesce(taxonomy_row->'evidence', '{}'::jsonb)
        || jsonb_build_object('publicSubmissionId', submission_row.id),
      reviewer_id,
      now(),
      reviewer_id,
      reviewer_id
    );
  end loop;

  for asset_row in
    select value from jsonb_array_elements(coalesce(p_public_assets, '[]'::jsonb))
  loop
    if btrim(coalesce(asset_row->>'bucket', '')) = ''
      or btrim(coalesce(asset_row->>'path', '')) = ''
    then
      raise exception 'A copied public asset is missing its storage location.';
    end if;

    insert into public.question_assets (
      id,
      question_id,
      asset_kind,
      storage_bucket,
      storage_path,
      label,
      alt_text,
      display_order,
      created_by
    )
    values (
      (asset_row->>'assetId')::uuid,
      v_published_question_id,
      'image',
      asset_row->>'bucket',
      asset_row->>'path',
      nullif(asset_row->>'label', ''),
      nullif(asset_row->>'altText', ''),
      coalesce((asset_row->>'displayOrder')::integer, 0),
      reviewer_id
    );

    update public.questions
    set
      content_html = replace(
        content_html,
        '/api/question-assets/' || (asset_row->>'sourceAssetId'),
        '/api/question-assets/' || (asset_row->>'assetId')
      ),
      solution_html = case
        when solution_html is null then null
        else replace(
          solution_html,
          '/api/question-assets/' || (asset_row->>'sourceAssetId'),
          '/api/question-assets/' || (asset_row->>'assetId')
        )
      end,
      content_source = case
        when content_source is null then null
        else replace(
          content_source,
          '/api/question-assets/' || (asset_row->>'sourceAssetId'),
          '/api/question-assets/' || (asset_row->>'assetId')
        )
      end,
      solution_source = case
        when solution_source is null then null
        else replace(
          solution_source,
          '/api/question-assets/' || (asset_row->>'sourceAssetId'),
          '/api/question-assets/' || (asset_row->>'assetId')
        )
      end,
      options = replace(
        options::text,
        '/api/question-assets/' || (asset_row->>'sourceAssetId'),
        '/api/question-assets/' || (asset_row->>'assetId')
      )::jsonb,
      answer_spec = replace(
        answer_spec::text,
        '/api/question-assets/' || (asset_row->>'sourceAssetId'),
        '/api/question-assets/' || (asset_row->>'assetId')
      )::jsonb
    where id = v_published_question_id;
  end loop;

  if exists (
    select 1
    from regexp_matches(
      coalesce((select content_html from public.questions where id = v_published_question_id), '')
        || ' '
        || coalesce((select solution_html from public.questions where id = v_published_question_id), '')
        || ' '
        || coalesce((select options::text from public.questions where id = v_published_question_id), '')
        || ' '
        || coalesce((select answer_spec::text from public.questions where id = v_published_question_id), ''),
      '/api/question-assets/([0-9a-fA-F-]{36})',
      'g'
    ) as asset_match
    where asset_match[1] not in (
      select copied->>'assetId'
      from jsonb_array_elements(coalesce(p_public_assets, '[]'::jsonb)) copied
    )
  ) or (
    select coalesce(content_html, '')
      || ' ' || coalesce(solution_html, '')
      || ' ' || coalesce(options::text, '')
      || ' ' || coalesce(answer_spec::text, '')
    from public.questions
    where id = v_published_question_id
  ) ~* '(https?://|storage/v1/object/sign|x-amz-(credential|signature)|x-goog-signature|[?&](token|signature|sig|se|sp)=|service[_-]?role|provider[_-]?(key|token))'
  then
    raise exception 'Public content contains a private or unreviewed resource reference.';
  end if;

  update public.public_question_submissions
  set
    status = 'accepted',
    review_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    reviewed_by = reviewer_id,
    reviewed_at = now(),
    published_question_id = v_published_question_id
  where id = submission_row.id;

  insert into public.public_question_submission_events (
    submission_id,
    action_kind,
    actor_id,
    reason,
    evidence
  )
  values (
    submission_row.id,
    'accepted',
    reviewer_id,
    nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object(
      'publishedQuestionId', v_published_question_id,
      'copiedAssetCount', jsonb_array_length(coalesce(p_public_assets, '[]'::jsonb))
    )
  );

  return v_published_question_id;
end;
$$;

create or replace function public.withdraw_public_question_submission(
  p_submission_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid := auth.uid();
  submission_row public.public_question_submissions%rowtype;
begin
  select *
  into submission_row
  from public.public_question_submissions
  where id = p_submission_id
  for update;

  if actor_id is null
    or submission_row.id is null
    or not private.is_question_bank_content_editor(submission_row.source_bank_id)
  then
    raise exception 'This public submission is outside your manageable Library scope.';
  end if;

  if submission_row.status not in ('pending', 'in_review', 'changes_requested') then
    raise exception 'This public submission can no longer be withdrawn.';
  end if;

  update public.public_question_submissions
  set status = 'withdrawn'
  where id = submission_row.id;

  insert into public.public_question_submission_events (
    submission_id, action_kind, actor_id
  )
  values (submission_row.id, 'withdrawn', actor_id);
end;
$$;

create or replace function public.pull_public_question_to_bank(
  p_bank_id uuid,
  p_public_question_id uuid,
  p_copied_assets jsonb default '[]'::jsonb,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid := p_actor_id;
  public_question public.questions%rowtype;
  copied_question_id uuid := gen_random_uuid();
  asset_row jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Public asset finalization is server-only.';
  end if;

  if actor_id is null or not exists (
    select 1
    from public.bank_members member
    join public.question_banks bank on bank.id = member.bank_id
    where member.bank_id = p_bank_id
      and member.user_id = actor_id
      and member.status = 'active'
      and member.role in ('owner', 'editor')
      and bank.status = 'active'
  ) then
    raise exception 'Only Library owners or editors can add public questions.';
  end if;

  if not exists (
    select 1 from public.question_banks
    where id = p_bank_id and status = 'active'
  ) then
    raise exception 'Target Library was not found or is not active.';
  end if;

  select *
  into public_question
  from public.questions
  where id = p_public_question_id
    and owner_bank_id is null
    and visibility = 'public'
    and status = 'published'
    and deleted_at is null;

  if public_question.id is null then
    raise exception 'The selected Central Public Library question is unavailable.';
  end if;

  if jsonb_array_length(coalesce(p_copied_assets, '[]'::jsonb)) <> (
    select count(*) from public.question_assets where question_id = public_question.id
  ) then
    raise exception 'Every public image must be copied into the target Library.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
    where copied->>'bucket' <> 'question-assets'
      or copied->>'path' not like 'library-pulls/' || p_bank_id::text || '/%'
      or nullif(copied->>'assetId', '') is null
      or nullif(copied->>'sourceAssetId', '') is null
  ) then
    raise exception 'A copied public asset has an invalid server manifest.';
  end if;

  if (
    select count(distinct copied->>'sourceAssetId')
    from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
  ) <> (
    select count(*)
    from public.question_assets asset
    where asset.question_id = public_question.id
      and asset.id::text in (
        select copied->>'sourceAssetId'
        from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
      )
  ) then
    raise exception 'Copied public assets do not match the source question.';
  end if;

  if (
    select count(distinct copied->>'assetId')
    from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
  ) <> jsonb_array_length(coalesce(p_copied_assets, '[]'::jsonb)) then
    raise exception 'Copied public asset IDs must be unique.';
  end if;

  insert into public.questions (
    id,
    organization_id,
    question_code,
    title,
    question_type,
    content_html,
    content_source,
    content_source_format,
    solution_html,
    solution_source,
    solution_source_format,
    options,
    answer_spec,
    difficulty_rating,
    status,
    source,
    source_kind,
    owner_bank_id,
    visibility,
    created_by,
    updated_by,
    reviewed_by
  )
  select
    copied_question_id,
    bank.organization_id,
    left(public_question.question_code, 62) || '-lib-' ||
      left(replace(copied_question_id::text, '-', ''), 8),
    public_question.title,
    public_question.question_type,
    public_question.content_html,
    public_question.content_source,
    public_question.content_source_format,
    public_question.solution_html,
    public_question.solution_source,
    public_question.solution_source_format,
    public_question.options,
    public_question.answer_spec,
    public_question.difficulty_rating,
    'review',
    'public_question:' || public_question.id::text,
    'manual',
    p_bank_id,
    bank.visibility,
    actor_id,
    actor_id,
    actor_id
  from public.question_banks bank
  where bank.id = p_bank_id;

  insert into public.question_taxonomy_assignments (
    question_id,
    tag_id,
    source,
    confidence,
    review_status,
    evidence,
    approved_by,
    approved_at,
    created_by,
    updated_by
  )
  select
    copied_question_id,
    assignment.tag_id,
    'review_action',
    assignment.confidence,
    'approved',
    assignment.evidence || jsonb_build_object(
      'sourcePublicQuestionId', public_question.id
    ),
    actor_id,
    now(),
    actor_id,
    actor_id
  from public.question_taxonomy_assignments assignment
  where assignment.question_id = public_question.id
    and assignment.review_status = 'approved';

  for asset_row in
    select value from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb))
  loop
    insert into public.question_assets (
      id,
      question_id,
      asset_kind,
      storage_bucket,
      storage_path,
      label,
      alt_text,
      display_order,
      created_by
    )
    values (
      (asset_row->>'assetId')::uuid,
      copied_question_id,
      'image',
      asset_row->>'bucket',
      asset_row->>'path',
      nullif(asset_row->>'label', ''),
      nullif(asset_row->>'altText', ''),
      coalesce((asset_row->>'displayOrder')::integer, 0),
      actor_id
    );

    update public.questions
    set
      content_html = replace(
        content_html,
        '/api/question-assets/' || (asset_row->>'sourceAssetId'),
        '/api/question-assets/' || (asset_row->>'assetId')
      ),
      solution_html = case
        when solution_html is null then null
        else replace(
          solution_html,
          '/api/question-assets/' || (asset_row->>'sourceAssetId'),
          '/api/question-assets/' || (asset_row->>'assetId')
        )
      end,
      content_source = case
        when content_source is null then null
        else replace(
          content_source,
          '/api/question-assets/' || (asset_row->>'sourceAssetId'),
          '/api/question-assets/' || (asset_row->>'assetId')
        )
      end,
      solution_source = case
        when solution_source is null then null
        else replace(
          solution_source,
          '/api/question-assets/' || (asset_row->>'sourceAssetId'),
          '/api/question-assets/' || (asset_row->>'assetId')
        )
      end,
      options = replace(
        options::text,
        '/api/question-assets/' || (asset_row->>'sourceAssetId'),
        '/api/question-assets/' || (asset_row->>'assetId')
      )::jsonb,
      answer_spec = replace(
        answer_spec::text,
        '/api/question-assets/' || (asset_row->>'sourceAssetId'),
        '/api/question-assets/' || (asset_row->>'assetId')
      )::jsonb
    where id = copied_question_id;
  end loop;

  if exists (
    select 1
    from regexp_matches(
      coalesce((select content_html from public.questions where id = copied_question_id), '')
        || ' '
        || coalesce((select solution_html from public.questions where id = copied_question_id), '')
        || ' '
        || coalesce((select content_source from public.questions where id = copied_question_id), '')
        || ' '
        || coalesce((select solution_source from public.questions where id = copied_question_id), '')
        || ' '
        || coalesce((select options::text from public.questions where id = copied_question_id), '')
        || ' '
        || coalesce((select answer_spec::text from public.questions where id = copied_question_id), ''),
      '/api/question-assets/([0-9a-fA-F-]{36})',
      'g'
    ) as asset_match
    where asset_match[1] not in (
      select copied->>'assetId'
      from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
    )
  ) then
    raise exception 'The public question contains an unreviewed image reference.';
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
    p_bank_id,
    copied_question_id,
    'active',
    'public_pull',
    actor_id,
    jsonb_build_object(
      'sourcePublicQuestionId', public_question.id,
      'pulledAt', now()
    )
  );

  return copied_question_id;
end;
$$;

revoke all on function public.create_bank_question_revision_draft(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated;

create or replace function public.search_bank_question_rows(
  p_bank_id uuid,
  p_query text default null,
  p_readiness text default 'active',
  p_source_kind text default null,
  p_taxonomy_tag_id text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  bank_question_id uuid,
  added_at timestamptz,
  metadata jsonb,
  bank_source_kind text,
  bank_question_status text,
  question_id uuid,
  question_code text,
  title text,
  question_type text,
  difficulty_rating integer,
  question_status text,
  question_source text,
  question_source_kind text,
  source_review_item_id uuid,
  visibility text,
  published_at timestamptz,
  tag_summaries jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null or not private.can_read_question_bank(p_bank_id) then
    raise exception 'Library access is required.';
  end if;

  if p_readiness not in ('active', 'archived') then
    raise exception 'Invalid Library readiness filter.';
  end if;

  return query
  select
    bank_question.id,
    bank_question.added_at,
    bank_question.metadata,
    bank_question.source_kind,
    bank_question.status,
    question.id,
    question.question_code,
    question.title,
    question.question_type,
    question.difficulty_rating,
    question.status,
    question.source,
    question.source_kind,
    question.source_review_item_id,
    question.visibility,
    question.published_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tag_id', assignment.tag_id,
          'review_status', assignment.review_status,
          'label', taxonomy.label,
          'facet_key', taxonomy.facet_key
        )
        order by taxonomy.label, assignment.tag_id
      )
      from public.question_taxonomy_assignments assignment
      left join public.taxonomy_nodes taxonomy on taxonomy.tag_id = assignment.tag_id
      where assignment.question_id = question.id
        and assignment.review_status = 'approved'
    ), '[]'::jsonb),
    count(*) over()
  from public.bank_questions bank_question
  join public.questions question on question.id = bank_question.question_id
  where bank_question.bank_id = p_bank_id
    and bank_question.status = p_readiness
    and question.deleted_at is null
    and (
      nullif(btrim(coalesce(p_source_kind, '')), '') is null
      or bank_question.source_kind = p_source_kind
    )
    and (
      nullif(btrim(coalesce(p_query, '')), '') is null
      or question.question_code ilike '%' || btrim(p_query) || '%'
      or question.title ilike '%' || btrim(p_query) || '%'
    )
    and (
      nullif(btrim(coalesce(p_taxonomy_tag_id, '')), '') is null
      or exists (
        select 1
        from public.question_taxonomy_assignments filter_assignment
        where filter_assignment.question_id = question.id
          and filter_assignment.tag_id = btrim(p_taxonomy_tag_id)
          and filter_assignment.review_status = 'approved'
      )
    )
  order by bank_question.added_at desc, bank_question.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$$;

create or replace function public.search_bank_review_question_ids(
  p_bank_id uuid,
  p_query text default null,
  p_review_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  question_id uuid,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null or not private.is_question_bank_member(p_bank_id) then
    raise exception 'Library membership is required.';
  end if;

  if p_review_status is not null
    and p_review_status not in ('pending_review', 'needs_more_evidence')
  then
    raise exception 'Invalid Review Draft status filter.';
  end if;

  return query
  select
    question.id,
    count(*) over()
  from public.questions question
  where question.owner_bank_id = p_bank_id
    and question.status = 'draft'
    and question.deleted_at is null
    and (
      nullif(btrim(coalesce(p_query, '')), '') is null
      or question.question_code ilike '%' || btrim(p_query) || '%'
      or question.title ilike '%' || btrim(p_query) || '%'
    )
    and (
      p_review_status is null
      or exists (
        select 1
        from public.review_draft_items item
        where item.item_kind = 'question'
          and item.target_bank_id = p_bank_id
          and item.status = p_review_status
          and (
            item.created_question_id = question.id
            or item.id = question.source_review_item_id
          )
      )
    )
  order by question.created_at desc, question.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
end;
$$;

create or replace function public.count_bank_question_rows(
  p_bank_id uuid,
  p_query text default null,
  p_readiness text default 'active',
  p_source_kind text default null,
  p_taxonomy_tag_id text default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  result_count bigint;
begin
  if auth.uid() is null or not private.can_read_question_bank(p_bank_id) then
    raise exception 'Library access is required.';
  end if;
  if p_readiness not in ('active', 'archived') then
    raise exception 'Invalid Library readiness filter.';
  end if;

  select count(*)
  into result_count
  from public.bank_questions bank_question
  join public.questions question on question.id = bank_question.question_id
  where bank_question.bank_id = p_bank_id
    and bank_question.status = p_readiness
    and question.deleted_at is null
    and (
      nullif(btrim(coalesce(p_source_kind, '')), '') is null
      or bank_question.source_kind = p_source_kind
    )
    and (
      nullif(btrim(coalesce(p_query, '')), '') is null
      or question.question_code ilike '%' || btrim(p_query) || '%'
      or question.title ilike '%' || btrim(p_query) || '%'
    )
    and (
      nullif(btrim(coalesce(p_taxonomy_tag_id, '')), '') is null
      or exists (
        select 1
        from public.question_taxonomy_assignments filter_assignment
        where filter_assignment.question_id = question.id
          and filter_assignment.tag_id = btrim(p_taxonomy_tag_id)
          and filter_assignment.review_status = 'approved'
      )
    );
  return result_count;
end;
$$;

create or replace function public.count_bank_review_questions(
  p_bank_id uuid,
  p_query text default null,
  p_review_status text default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  result_count bigint;
begin
  if auth.uid() is null or not private.is_question_bank_member(p_bank_id) then
    raise exception 'Library membership is required.';
  end if;
  if p_review_status is not null
    and p_review_status not in ('pending_review', 'needs_more_evidence')
  then
    raise exception 'Invalid Review Draft status filter.';
  end if;

  select count(*)
  into result_count
  from public.questions question
  where question.owner_bank_id = p_bank_id
    and question.status = 'draft'
    and question.deleted_at is null
    and (
      nullif(btrim(coalesce(p_query, '')), '') is null
      or question.question_code ilike '%' || btrim(p_query) || '%'
      or question.title ilike '%' || btrim(p_query) || '%'
    )
    and (
      p_review_status is null
      or exists (
        select 1
        from public.review_draft_items item
        where item.item_kind = 'question'
          and item.target_bank_id = p_bank_id
          and item.status = p_review_status
          and (
            item.created_question_id = question.id
            or item.id = question.source_review_item_id
          )
      )
    );
  return result_count;
end;
$$;

revoke all on function public.search_bank_question_rows(
  uuid, text, text, text, text, integer, integer
) from public, anon;
revoke all on function public.search_bank_review_question_ids(
  uuid, text, text, integer, integer
) from public, anon;
grant execute on function public.search_bank_question_rows(
  uuid, text, text, text, text, integer, integer
) to authenticated;
grant execute on function public.search_bank_review_question_ids(
  uuid, text, text, integer, integer
) to authenticated;
revoke all on function public.count_bank_question_rows(
  uuid, text, text, text, text
) from public, anon;
revoke all on function public.count_bank_review_questions(
  uuid, text, text
) from public, anon;
grant execute on function public.count_bank_question_rows(
  uuid, text, text, text, text
) to authenticated;
grant execute on function public.count_bank_review_questions(
  uuid, text, text
) to authenticated;

revoke all on function public.publish_review_draft_questions(uuid[])
  from public, anon;
revoke all on function public.create_bank_manual_question_draft(uuid, text, text)
  from public, anon;
revoke all on function public.create_global_manual_question_draft(text, text)
  from public, anon;
revoke all on function public.create_question_bank(text, text, text)
  from public, anon;
revoke all on function public.approve_bank_review_question(uuid, uuid)
  from public, anon;
revoke all on function public.submit_bank_questions_to_public_review(uuid[], boolean)
  from public, anon;
revoke all on function public.review_public_question_submission(uuid, text, text, jsonb)
  from public, anon;
revoke all on function public.withdraw_public_question_submission(uuid)
  from public, anon;
revoke all on function public.pull_public_question_to_bank(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated;

grant execute on function public.create_bank_question_revision_draft(uuid, uuid, jsonb, uuid)
  to service_role;
grant execute on function public.publish_review_draft_questions(uuid[])
  to authenticated;
grant execute on function public.create_bank_manual_question_draft(uuid, text, text)
  to authenticated;
grant execute on function public.create_global_manual_question_draft(text, text)
  to authenticated;
grant execute on function public.create_question_bank(text, text, text)
  to authenticated;
grant execute on function public.approve_bank_review_question(uuid, uuid)
  to authenticated;
grant execute on function public.submit_bank_questions_to_public_review(uuid[], boolean)
  to authenticated;
grant execute on function public.create_assignment_from_bank(
  uuid, uuid, text, text, timestamptz, uuid[], boolean
) to authenticated;
grant execute on function public.review_public_question_submission(uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.withdraw_public_question_submission(uuid)
  to authenticated;
grant execute on function public.pull_public_question_to_bank(uuid, uuid, jsonb, uuid)
  to service_role;

comment on table public.public_question_submissions is
  'Immutable teacher-owned question snapshots submitted for independent Super Admin public governance.';
comment on function public.review_public_question_submission(uuid, text, text, jsonb) is
  'Super Admin-only decision gate. Approval creates a new global public question and never changes the teacher source.';
