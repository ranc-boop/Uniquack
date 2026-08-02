-- Official Public Library and two-state question approval.
-- Forward-only: legacy question status/visibility remain compatibility fields.

lock table public.question_banks, public.bank_questions, public.questions
  in share row exclusive mode;

alter table public.question_banks
  alter column organization_id drop not null,
  alter column owner_id drop not null,
  add column if not exists owner_scope text not null default 'user',
  add column if not exists system_key text;

alter table public.questions
  add column if not exists approval_status text not null default 'pending';

update public.question_banks
set owner_scope = case
  when owner_id is null and organization_id is not null then 'organization'
  else 'user'
end
where system_key is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'question_banks_owner_scope_check'
      and conrelid = 'public.question_banks'::regclass
  ) then
    alter table public.question_banks
      add constraint question_banks_owner_scope_check
      check (owner_scope in ('user', 'organization', 'system'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'question_banks_system_ownership_check'
      and conrelid = 'public.question_banks'::regclass
  ) then
    alter table public.question_banks
      add constraint question_banks_system_ownership_check
      check (
        (owner_scope = 'user' and owner_id is not null and system_key is null)
        or (owner_scope = 'organization' and organization_id is not null and system_key is null)
        or (
          owner_scope = 'system'
          and owner_id is null
          and organization_id is null
          and system_key = 'official_public'
          and visibility = 'public'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'questions_approval_status_check'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_approval_status_check
      check (approval_status in ('pending', 'approved'));
  end if;

end;
$$;

-- A non-system Library is never the official public catalog. Existing
-- collaborator access is preserved by mapping legacy public banks to shared.
update public.question_banks
set visibility = 'shared'
where owner_scope <> 'system'
  and visibility = 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'question_banks_official_public_visibility_check'
      and conrelid = 'public.question_banks'::regclass
  ) then
    alter table public.question_banks
      add constraint question_banks_official_public_visibility_check
      check (visibility <> 'public' or owner_scope = 'system');
  end if;
end;
$$;

create unique index if not exists question_banks_official_public_key
  on public.question_banks(system_key)
  where owner_scope = 'system' and system_key = 'official_public';

create index if not exists questions_approval_status_live_idx
  on public.questions(approval_status, created_at desc)
  where deleted_at is null;

create index if not exists bank_questions_active_bank_question_idx
  on public.bank_questions(bank_id, question_id)
  where status = 'active';

insert into public.question_banks (
  organization_id,
  owner_id,
  owner_scope,
  system_key,
  name,
  description,
  visibility,
  status,
  metadata,
  created_by,
  updated_by
)
values (
  null,
  null,
  'system',
  'official_public',
  'EduStruct Public Library',
  'The single governed public question catalog.',
  'public',
  'active',
  jsonb_build_object('managedBy', 'platform', 'createdByMigration', '0076'),
  null,
  null
)
on conflict (system_key) where owner_scope = 'system' and system_key = 'official_public'
do update set
  name = excluded.name,
  description = excluded.description,
  visibility = 'public',
  status = 'active',
  updated_at = now();

-- Preserve every existing question and Assignment reference. Global questions
-- gain official membership without rewriting owner_bank_id.
insert into public.bank_questions (
  bank_id,
  question_id,
  status,
  source_kind,
  added_by,
  metadata
)
select
  official.id,
  question.id,
  case when question.status = 'archived' then 'archived' else 'active' end,
  'manual',
  question.created_by,
  jsonb_build_object(
    'lineageKind', 'legacy_global',
    'migratedBy', '0076',
    'legacyStatus', question.status,
    'legacyVisibility', question.visibility
  )
from public.questions question
cross join public.question_banks official
where official.owner_scope = 'system'
  and official.system_key = 'official_public'
  and question.owner_bank_id is null
  and question.deleted_at is null
on conflict (bank_id, question_id) do nothing;

-- Approval evidence is deliberately conservative. Ambiguous records remain
-- pending; only the legacy public/published set or a completed Library Review
-- is approved.
update public.questions question
set approval_status = case
  when question.deleted_at is not null then 'pending'
  when question.owner_bank_id is null
    and question.status = 'published'
    and question.visibility = 'public'
    then 'approved'
  when question.owner_bank_id is not null
    and exists (
      select 1
      from public.review_draft_items item
      where item.id = question.source_review_item_id
        and item.status = 'approved'
        and item.created_question_id = question.id
    )
    then 'approved'
  else 'pending'
end;

create or replace function private.question_grading_capability_v2(
  p_question_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when question.question_type = 'mcq'
      and jsonb_typeof(question.options) = 'array'
      and jsonb_array_length(
        case when jsonb_typeof(question.options) = 'array'
          then question.options else '[]'::jsonb end
      ) >= 2
      and not exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(question.options) = 'array'
            then question.options else '[]'::jsonb end
        ) option_row
        where jsonb_typeof(option_row) <> 'object'
          or btrim(coalesce(option_row->>'id', '')) = ''
      )
      and (
        select count(distinct option_row->>'id')
        from jsonb_array_elements(
          case when jsonb_typeof(question.options) = 'array'
            then question.options else '[]'::jsonb end
        ) option_row
      ) = jsonb_array_length(
        case when jsonb_typeof(question.options) = 'array'
          then question.options else '[]'::jsonb end
      )
      and jsonb_typeof(coalesce(question.answer_spec->'correct_option_ids', '[]'::jsonb)) = 'array'
      and jsonb_array_length(
        case when jsonb_typeof(question.answer_spec->'correct_option_ids') = 'array'
          then question.answer_spec->'correct_option_ids' else '[]'::jsonb end
      ) > 0
      and not exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(question.answer_spec->'correct_option_ids') = 'array'
            then question.answer_spec->'correct_option_ids' else '[]'::jsonb end
        ) correct_value
        where jsonb_typeof(correct_value) <> 'string'
          or btrim(coalesce(correct_value #>> '{}', '')) = ''
      )
      and (
        select count(distinct correct_value #>> '{}')
        from jsonb_array_elements(
          case when jsonb_typeof(question.answer_spec->'correct_option_ids') = 'array'
            then question.answer_spec->'correct_option_ids' else '[]'::jsonb end
        ) correct_value
      ) = jsonb_array_length(
        case when jsonb_typeof(question.answer_spec->'correct_option_ids') = 'array'
          then question.answer_spec->'correct_option_ids' else '[]'::jsonb end
      )
      and not exists (
        select 1
        from jsonb_array_elements_text(
          case when jsonb_typeof(question.answer_spec->'correct_option_ids') = 'array'
            then question.answer_spec->'correct_option_ids' else '[]'::jsonb end
        ) correct_id
        where not exists (
          select 1
          from jsonb_array_elements(question.options) option_row
          where option_row->>'id' = correct_id
        )
      )
      then 'deterministic'
    when question.question_type = 'fill_blank'
      and (
        exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(question.answer_spec->'accepted_answers') = 'array'
              then question.answer_spec->'accepted_answers' else '[]'::jsonb end
          ) answer_value
          where jsonb_typeof(answer_value) = 'string'
            and btrim(coalesce(answer_value #>> '{}', '')) <> ''
        )
        or exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(question.answer_spec->'final_answers') = 'array'
              then question.answer_spec->'final_answers' else '[]'::jsonb end
          ) answer_value
          where jsonb_typeof(answer_value) = 'string'
            and btrim(coalesce(answer_value #>> '{}', '')) <> ''
        )
      )
      then 'deterministic'
    when question.question_type in ('frq', 'mixed')
      and (
        btrim(coalesce(question.solution_html, '')) <> ''
        or btrim(coalesce(question.solution_source, '')) <> ''
        or exists (
          select 1 from public.question_rubric_steps rubric
          where rubric.question_id = question.id
            and rubric.status <> 'archived'
            and btrim(coalesce(rubric.content_html, '')) <> ''
        )
      )
      then 'ai_review'
    else 'needs_configuration'
  end
  from public.questions question
  where question.id = p_question_id
    and question.deleted_at is null;
$$;

-- Legacy `review` was the assignment-ready state before two-state approval.
-- Promote only records that still pass the canonical readiness validator;
-- malformed legacy rows remain pending and must be corrected through revision.
update public.questions question
set approval_status = 'approved'
where question.owner_bank_id is not null
  and question.status = 'review'
  and question.deleted_at is null
  and private.question_grading_capability_v2(question.id) <> 'needs_configuration';

create unique index if not exists questions_one_pending_official_revision_v2_idx
  on public.questions(revision_of_question_id)
  where owner_bank_id is null
    and revision_of_question_id is not null
    and approval_status = 'pending'
    and deleted_at is null;

create or replace function private.prevent_approved_question_content_update_v2()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if old.approval_status = 'approved'
    and (
      new.title is distinct from old.title
      or new.question_type is distinct from old.question_type
      or new.content_html is distinct from old.content_html
      or new.content_source is distinct from old.content_source
      or new.content_source_format is distinct from old.content_source_format
      or new.solution_html is distinct from old.solution_html
      or new.solution_source is distinct from old.solution_source
      or new.solution_source_format is distinct from old.solution_source_format
      or new.options is distinct from old.options
      or new.answer_spec is distinct from old.answer_spec
      or new.difficulty_rating is distinct from old.difficulty_rating
    )
  then
    raise exception 'Approved question content is immutable. Create and approve a revision instead.';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_approved_question_content_update_v2()
  from public, anon, authenticated;

drop trigger if exists questions_prevent_approved_content_update_v2
  on public.questions;
create trigger questions_prevent_approved_content_update_v2
before update on public.questions
for each row execute function private.prevent_approved_question_content_update_v2();

revoke all on function private.question_grading_capability_v2(uuid)
  from public, anon, authenticated;

create or replace function private.can_read_official_public_question_v2(
  p_question_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.status = 'active'
  ) and exists (
    select 1
    from public.bank_questions membership
    join public.question_banks bank on bank.id = membership.bank_id
    join public.questions question on question.id = membership.question_id
    where membership.question_id = p_question_id
      and membership.status = 'active'
      and bank.owner_scope = 'system'
      and bank.system_key = 'official_public'
      and bank.status = 'active'
      and question.approval_status = 'approved'
      and question.deleted_at is null
  );
$$;

revoke all on function private.can_read_official_public_question_v2(uuid)
  from public, anon, authenticated;
grant execute on function private.can_read_official_public_question_v2(uuid)
  to authenticated;

drop policy if exists question_banks_official_public_read_v2 on public.question_banks;
create policy question_banks_official_public_read_v2
on public.question_banks for select to authenticated
using (
  owner_scope = 'system'
  and system_key = 'official_public'
  and status = 'active'
  and exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.status = 'active'
  )
);

drop policy if exists bank_questions_official_public_read_v2 on public.bank_questions;
create policy bank_questions_official_public_read_v2
on public.bank_questions for select to authenticated
using (
  status = 'active'
  and private.can_read_official_public_question_v2(question_id)
);

drop policy if exists questions_official_public_read_v2 on public.questions;
create policy questions_official_public_read_v2
on public.questions for select to authenticated
using (private.can_read_official_public_question_v2(id));

-- Legacy public flags are no longer an authorization source. Child rows and
-- signed assets inherit the same official-membership decision.
drop policy if exists questions_published_read on public.questions;

drop policy if exists question_rubric_steps_public_read on public.question_rubric_steps;
create policy question_rubric_steps_public_read
on public.question_rubric_steps for select to authenticated
using (private.can_read_official_public_question_v2(question_id));

drop policy if exists question_assets_public_read on public.question_assets;
create policy question_assets_public_read
on public.question_assets for select to authenticated
using (private.can_read_official_public_question_v2(question_id));

drop policy if exists question_taxonomy_assignments_public_read
  on public.question_taxonomy_assignments;
create policy question_taxonomy_assignments_public_read
on public.question_taxonomy_assignments for select to authenticated
using (
  review_status in ('approved', 'applied')
  and private.can_read_official_public_question_v2(question_id)
);

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
        private.can_read_official_public_question_v2(question.id)
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

create or replace function public.search_official_public_questions_v2(
  query_text text default null,
  difficulty_min integer default null,
  difficulty_max integer default null,
  page_limit integer default 50,
  page_offset integer default 0
)
returns table (
  question_id uuid,
  question_code text,
  title text,
  question_type text,
  content_html text,
  difficulty_rating integer,
  approval_status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.status = 'active'
  ) then
    raise exception 'An active profile is required.';
  end if;

  return query
  with filtered as materialized (
    select question.*
    from public.question_banks bank
    join public.bank_questions membership on membership.bank_id = bank.id
    join public.questions question on question.id = membership.question_id
    where bank.owner_scope = 'system'
      and bank.system_key = 'official_public'
      and bank.status = 'active'
      and membership.status = 'active'
      and question.approval_status = 'approved'
      and question.deleted_at is null
      and (difficulty_min is null or question.difficulty_rating >= difficulty_min)
      and (difficulty_max is null or question.difficulty_rating <= difficulty_max)
      and (
        nullif(btrim(query_text), '') is null
        or to_tsvector('simple'::regconfig, coalesce(question.question_code, '') || ' ' || coalesce(question.title, ''))
          @@ plainto_tsquery('simple'::regconfig, btrim(query_text))
        or question.question_code ilike '%' || btrim(query_text) || '%'
        or question.title ilike '%' || btrim(query_text) || '%'
      )
  )
  select
    filtered.id,
    filtered.question_code,
    filtered.title,
    filtered.question_type,
    filtered.content_html,
    filtered.difficulty_rating,
    filtered.approval_status,
    count(*) over ()
  from filtered
  order by filtered.created_at desc, filtered.id desc
  limit greatest(1, least(coalesce(page_limit, 50), 100))
  offset greatest(0, coalesce(page_offset, 0));
end;
$$;

revoke all on function public.search_official_public_questions_v2(
  text, integer, integer, integer, integer
) from public, anon;
grant execute on function public.search_official_public_questions_v2(
  text, integer, integer, integer, integer
) to authenticated;

-- Library workbenches must filter approval before limit/offset. Keeping this as
-- a v2 RPC avoids changing the established search_bank_question_rows contract.
create or replace function public.search_bank_question_rows_v2(
  p_bank_id uuid,
  p_approval_status text,
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
  if p_approval_status not in ('pending', 'approved') then
    raise exception 'Invalid question approval filter.';
  end if;
  if p_readiness not in ('active', 'archived') then
    raise exception 'Invalid Library readiness filter.';
  end if;

  return query
  select
    membership.id,
    membership.added_at,
    membership.metadata,
    membership.source_kind,
    membership.status,
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
        ) order by taxonomy.label, assignment.tag_id
      )
      from public.question_taxonomy_assignments assignment
      left join public.taxonomy_nodes taxonomy on taxonomy.tag_id = assignment.tag_id
      where assignment.question_id = question.id
        and assignment.review_status = 'approved'
    ), '[]'::jsonb),
    count(*) over()
  from public.bank_questions membership
  join public.questions question on question.id = membership.question_id
  where membership.bank_id = p_bank_id
    and membership.status = p_readiness
    and question.approval_status = p_approval_status
    and question.deleted_at is null
    and (
      nullif(btrim(coalesce(p_source_kind, '')), '') is null
      or membership.source_kind = p_source_kind
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
  order by membership.added_at desc, membership.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$$;

create or replace function public.count_bank_question_rows_v2(
  p_bank_id uuid,
  p_approval_status text,
  p_query text default null,
  p_readiness text default 'active',
  p_source_kind text default null,
  p_taxonomy_tag_id text default null
)
returns bigint
language sql
stable
security definer
set search_path = public, private
as $$
  select count(*)
  from public.bank_questions membership
  join public.questions question on question.id = membership.question_id
  where auth.uid() is not null
    and private.can_read_question_bank(p_bank_id)
    and p_approval_status in ('pending', 'approved')
    and p_readiness in ('active', 'archived')
    and membership.bank_id = p_bank_id
    and membership.status = p_readiness
    and question.approval_status = p_approval_status
    and question.deleted_at is null
    and (nullif(btrim(coalesce(p_source_kind, '')), '') is null or membership.source_kind = p_source_kind)
    and (
      nullif(btrim(coalesce(p_query, '')), '') is null
      or question.question_code ilike '%' || btrim(p_query) || '%'
      or question.title ilike '%' || btrim(p_query) || '%'
    )
    and (
      nullif(btrim(coalesce(p_taxonomy_tag_id, '')), '') is null
      or exists (
        select 1 from public.question_taxonomy_assignments filter_assignment
        where filter_assignment.question_id = question.id
          and filter_assignment.tag_id = btrim(p_taxonomy_tag_id)
          and filter_assignment.review_status = 'approved'
      )
    );
$$;

revoke all on function public.search_bank_question_rows_v2(
  uuid, text, text, text, text, text, integer, integer
) from public, anon;
grant execute on function public.search_bank_question_rows_v2(
  uuid, text, text, text, text, text, integer, integer
) to authenticated;
revoke all on function public.count_bank_question_rows_v2(
  uuid, text, text, text, text, text
) from public, anon;
grant execute on function public.count_bank_question_rows_v2(
  uuid, text, text, text, text, text
) to authenticated;

-- Every new global Review Draft belongs to the official governance queue.
alter function public.create_global_manual_question_draft(text, text)
  rename to create_global_manual_question_draft_pre_official_v2;
revoke all on function public.create_global_manual_question_draft_pre_official_v2(text, text)
  from public, anon, authenticated;

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
  question_id uuid;
  official_bank_id uuid;
begin
  question_id := public.create_global_manual_question_draft_pre_official_v2(
    p_question_code,
    p_title
  );

  select id into official_bank_id
  from public.question_banks
  where owner_scope = 'system'
    and system_key = 'official_public'
    and status = 'active';
  if official_bank_id is null then
    raise exception 'The official Public Library is unavailable.';
  end if;

  insert into public.bank_questions (
    bank_id, question_id, status, source_kind, added_by, metadata
  )
  values (
    official_bank_id,
    question_id,
    'active',
    'manual',
    auth.uid(),
    jsonb_build_object('lineageKind', 'official_review_draft')
  )
  on conflict (bank_id, question_id) do nothing;

  return question_id;
end;
$$;

revoke all on function public.create_global_manual_question_draft(text, text)
  from public, anon;
grant execute on function public.create_global_manual_question_draft(text, text)
  to authenticated;

create or replace function public.attach_official_question_revision_assets_v2(
  p_target_question_id uuid,
  p_source_question_id uuid,
  p_copied_assets jsonb,
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  official_bank_id uuid;
  target_question public.questions%rowtype;
  source_question public.questions%rowtype;
  source_asset public.question_assets%rowtype;
  asset_row jsonb;
  source_asset_count integer;
  attached_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Official revision asset attachment is server-only.';
  end if;

  if p_actor_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_id
      and profile.status = 'active'
      and profile.role in ('admin', 'super_admin')
  ) then
    raise exception 'A real active Admin actor is required.';
  end if;

  if jsonb_typeof(coalesce(p_copied_assets, '[]'::jsonb)) <> 'array' then
    raise exception 'Official revision asset evidence must be a JSON array.';
  end if;

  select id into official_bank_id
  from public.question_banks
  where owner_scope = 'system'
    and system_key = 'official_public'
    and status = 'active'
  for update;

  if official_bank_id is null then
    raise exception 'The official Public Library is unavailable.';
  end if;

  select * into target_question
  from public.questions
  where id = p_target_question_id
  for update;

  select * into source_question
  from public.questions
  where id = p_source_question_id
  for update;

  if target_question.id is null
    or target_question.owner_bank_id is not null
    or target_question.revision_of_question_id is distinct from p_source_question_id
    or target_question.approval_status <> 'pending'
    or target_question.status <> 'draft'
    or target_question.deleted_at is not null
  then
    raise exception 'The target must be a pending official revision Draft.';
  end if;

  if source_question.id is null
    or source_question.owner_bank_id is not null
    or source_question.approval_status <> 'approved'
    or source_question.deleted_at is not null
  then
    raise exception 'The source must be an approved official question.';
  end if;

  if not exists (
    select 1 from public.bank_questions membership
    where membership.bank_id = official_bank_id
      and membership.question_id = target_question.id
      and membership.status = 'active'
  ) or not exists (
    select 1 from public.bank_questions membership
    where membership.bank_id = official_bank_id
      and membership.question_id = source_question.id
      and membership.status = 'active'
  ) then
    raise exception 'Both revision questions must have active official Library membership.';
  end if;

  if exists (
    select 1 from public.question_assets asset
    where asset.question_id = target_question.id
  ) then
    raise exception 'The target revision already has attached assets.';
  end if;

  select count(*) into source_asset_count
  from public.question_assets asset
  where asset.question_id = source_question.id;

  if jsonb_array_length(coalesce(p_copied_assets, '[]'::jsonb)) <> source_asset_count then
    raise exception 'Every source asset must be copied for the official revision.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
    where copied->>'bucket' <> 'question-assets'
      or btrim(coalesce(copied->>'path', '')) not like
        'official-revisions/' || p_source_question_id::text || '/' || p_target_question_id::text || '/%'
      or nullif(copied->>'assetId', '') is null
      or nullif(copied->>'sourceAssetId', '') is null
      or not exists (
        select 1 from public.question_assets source_row
        where source_row.question_id = source_question.id
          and source_row.id::text = copied->>'sourceAssetId'
      )
  ) then
    raise exception 'An official revision asset has an invalid server manifest.';
  end if;

  if (
    select count(distinct copied->>'sourceAssetId')
    from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
  ) <> source_asset_count
    or (
      select count(distinct copied->>'assetId')
      from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb)) copied
    ) <> jsonb_array_length(coalesce(p_copied_assets, '[]'::jsonb))
  then
    raise exception 'Official revision assets must map one-to-one.';
  end if;

  for asset_row in
    select value
    from jsonb_array_elements(coalesce(p_copied_assets, '[]'::jsonb))
  loop
    select * into source_asset
    from public.question_assets asset
    where asset.question_id = source_question.id
      and asset.id = (asset_row->>'sourceAssetId')::uuid;

    insert into public.question_assets (
      id,
      question_id,
      asset_kind,
      storage_bucket,
      storage_path,
      label,
      alt_text,
      display_order,
      display_on_detail,
      created_by
    )
    values (
      (asset_row->>'assetId')::uuid,
      target_question.id,
      source_asset.asset_kind,
      asset_row->>'bucket',
      asset_row->>'path',
      coalesce(nullif(asset_row->>'label', ''), source_asset.label),
      coalesce(nullif(asset_row->>'altText', ''), source_asset.alt_text),
      coalesce(nullif(asset_row->>'displayOrder', '')::integer, source_asset.display_order),
      source_asset.display_on_detail,
      p_actor_id
    );

    update public.questions
    set
      content_html = replace(
        content_html,
        '/api/question-assets/' || source_asset.id::text,
        '/api/question-assets/' || (asset_row->>'assetId')
      ),
      solution_html = case when solution_html is null then null else replace(
        solution_html,
        '/api/question-assets/' || source_asset.id::text,
        '/api/question-assets/' || (asset_row->>'assetId')
      ) end,
      content_source = replace(
        content_source,
        '/api/question-assets/' || source_asset.id::text,
        '/api/question-assets/' || (asset_row->>'assetId')
      ),
      solution_source = replace(
        solution_source,
        '/api/question-assets/' || source_asset.id::text,
        '/api/question-assets/' || (asset_row->>'assetId')
      ),
      options = replace(
        options::text,
        '/api/question-assets/' || source_asset.id::text,
        '/api/question-assets/' || (asset_row->>'assetId')
      )::jsonb,
      answer_spec = replace(
        answer_spec::text,
        '/api/question-assets/' || source_asset.id::text,
        '/api/question-assets/' || (asset_row->>'assetId')
      )::jsonb,
      updated_by = p_actor_id,
      updated_at = now()
    where id = target_question.id;

    attached_count := attached_count + 1;
  end loop;

  update public.bank_questions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'revisionAssetLineage', coalesce(p_copied_assets, '[]'::jsonb),
    'revisionAssetsAttachedAt', now(),
    'revisionAssetsAttachedBy', p_actor_id
  )
  where bank_id = official_bank_id
    and question_id = target_question.id
    and status = 'active';

  return attached_count;
end;
$$;

revoke all on function public.attach_official_question_revision_assets_v2(
  uuid, uuid, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.attach_official_question_revision_assets_v2(
  uuid, uuid, jsonb, uuid
) to service_role;

create or replace function public.approve_library_questions_v2(
  p_target_bank_id uuid,
  p_target_question_ids uuid[]
)
returns table (
  question_id uuid,
  bank_question_id uuid,
  approval_status text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_bank public.question_banks%rowtype;
  requested_count integer;
  target_question_id uuid;
  revision_source_question_id uuid;
  revision_source_membership_id uuid;
  approved_row record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into target_bank
  from public.question_banks bank
  where bank.id = p_target_bank_id and bank.status = 'active'
  for update;

  if target_bank.id is null then
    raise exception 'Library was not found or is inactive.';
  end if;

  if target_bank.owner_scope = 'system' then
    if not private.is_admin() then
      raise exception 'Only Admin can approve official Public Library questions.';
    end if;
  elsif not private.is_question_bank_content_editor(p_target_bank_id) then
    raise exception 'Only Library owners or editors can approve questions.';
  end if;

  requested_count := coalesce(array_length(p_target_question_ids, 1), 0);
  if requested_count = 0 or requested_count > 25
    or requested_count <> (
      select count(distinct selected.id)
      from unnest(coalesce(p_target_question_ids, '{}'::uuid[])) selected(id)
      where selected.id is not null
    )
  then
    raise exception 'Select between 1 and 25 unique questions.';
  end if;

  perform question.id
  from public.questions question
  left join public.bank_questions membership
    on membership.question_id = question.id
   and membership.bank_id = p_target_bank_id
  where question.id = any(p_target_question_ids)
    and question.deleted_at is null
  order by question.id
  for update of question;

  if (
    select count(*)
    from public.questions question
    left join public.bank_questions membership
      on membership.question_id = question.id
     and membership.bank_id = p_target_bank_id
    where question.id = any(p_target_question_ids)
      and question.deleted_at is null
      and question.approval_status = 'pending'
      and (
        (
          target_bank.owner_scope = 'system'
          and membership.status = 'active'
        )
        or (
          target_bank.owner_scope <> 'system'
          and question.owner_bank_id = p_target_bank_id
        )
      )
      and private.question_grading_capability_v2(question.id) <> 'needs_configuration'
      and (
        target_bank.owner_scope <> 'system'
        or exists (
          select 1 from public.question_taxonomy_assignments taxonomy
          where taxonomy.question_id = question.id
            and taxonomy.review_status in ('approved', 'applied')
        )
      )
      and (
        target_bank.owner_scope <> 'system'
        or question.revision_of_question_id is null
        or (
          membership.metadata ? 'revisionAssetLineage'
          and jsonb_typeof(membership.metadata->'revisionAssetLineage') = 'array'
          and (
            select count(*) from public.question_assets target_asset
            where target_asset.question_id = question.id
          ) = (
            select count(*) from public.question_assets source_asset
            where source_asset.question_id = question.revision_of_question_id
          )
          and exists (
          select 1
          from public.questions source_question
          join public.bank_questions source_membership
            on source_membership.question_id = source_question.id
           and source_membership.bank_id = p_target_bank_id
          where source_question.id = question.revision_of_question_id
            and source_question.approval_status = 'approved'
            and source_question.deleted_at is null
            and source_membership.status = 'active'
          )
        )
      )
  ) <> requested_count then
    raise exception 'Every selected question must be pending, active, taxonomy-ready when public, and fully configured for grading.';
  end if;

  for target_question_id in
    select selected.id from unnest(p_target_question_ids) selected(id) order by selected.id
  loop
    if target_bank.owner_scope <> 'system' then
      select * into approved_row
      from public.approve_bank_review_question(target_question_id, p_target_bank_id);
    else
      select question.revision_of_question_id
      into revision_source_question_id
      from public.questions question
      where question.id = target_question_id;

      revision_source_membership_id := null;
      if revision_source_question_id is not null then
        select membership.id
        into revision_source_membership_id
        from public.bank_questions membership
        join public.questions source_question
          on source_question.id = membership.question_id
        where membership.bank_id = p_target_bank_id
          and membership.question_id = revision_source_question_id
          and membership.status = 'active'
          and source_question.approval_status = 'approved'
          and source_question.deleted_at is null
        for update of membership, source_question;

        if revision_source_membership_id is null then
          raise exception 'The original approved official question is no longer active.';
        end if;
      end if;
    end if;

    update public.questions question
    set
      approval_status = 'approved',
      reviewed_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
    where question.id = target_question_id;

    if target_bank.owner_scope = 'system'
      and revision_source_membership_id is not null
    then
      update public.bank_questions
      set
        status = 'archived',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'replacedByQuestionId', target_question_id,
          'replacedAt', now(),
          'replacedBy', auth.uid()
        )
      where id = revision_source_membership_id;

      update public.bank_questions
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'lineageKind', 'official_revision',
        'revisionOfQuestionId', revision_source_question_id,
        'replacesBankQuestionId', revision_source_membership_id
      )
      where bank_id = p_target_bank_id
        and question_id = target_question_id
        and status = 'active';
    end if;

    return query
    select question.id, membership.id, question.approval_status
    from public.questions question
    join public.bank_questions membership
      on membership.question_id = question.id
     and membership.bank_id = p_target_bank_id
    where question.id = target_question_id;
  end loop;
end;
$$;

revoke all on function public.approve_library_questions_v2(uuid, uuid[])
  from public, anon;
grant execute on function public.approve_library_questions_v2(uuid, uuid[])
  to authenticated;

create or replace function public.archive_library_questions_v2(
  p_target_bank_id uuid,
  p_target_bank_question_ids uuid[]
)
returns table (
  bank_question_id uuid,
  question_id uuid,
  bank_question_status text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_bank public.question_banks%rowtype;
  requested_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into target_bank
  from public.question_banks bank
  where bank.id = p_target_bank_id and bank.status = 'active'
  for update;

  if target_bank.owner_scope = 'system' then
    if not private.is_admin() then
      raise exception 'Only Admin can archive official Public Library questions.';
    end if;
  elsif not private.is_question_bank_content_editor(p_target_bank_id) then
    raise exception 'Only Library owners or editors can archive questions.';
  end if;

  requested_count := coalesce(array_length(p_target_bank_question_ids, 1), 0);
  if target_bank.id is null or requested_count = 0 or requested_count > 25
    or requested_count <> (
      select count(distinct selected.id)
      from unnest(coalesce(p_target_bank_question_ids, '{}'::uuid[])) selected(id)
      where selected.id is not null
    )
  then
    raise exception 'Select between 1 and 25 unique Library questions.';
  end if;

  if (
    select count(*) from public.bank_questions membership
    where membership.id = any(p_target_bank_question_ids)
      and membership.bank_id = p_target_bank_id
      and membership.status = 'active'
  ) <> requested_count then
    raise exception 'Every selected Library question must still be active.';
  end if;

  return query
  update public.bank_questions membership
  set
    status = 'archived',
    metadata = coalesce(membership.metadata, '{}'::jsonb)
      || jsonb_build_object('archivedAt', now(), 'archivedBy', auth.uid())
  where membership.id = any(p_target_bank_question_ids)
    and membership.bank_id = p_target_bank_id
  returning membership.id, membership.question_id, membership.status;
end;
$$;

revoke all on function public.archive_library_questions_v2(uuid, uuid[])
  from public, anon;
grant execute on function public.archive_library_questions_v2(uuid, uuid[])
  to authenticated;

-- Reuse the mature immutable-snapshot and asset-safety review implementation.
-- The v2 wrapper then atomically attaches accepted copies to the official bank.
create or replace function public.review_public_question_submission_v2(
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
  official_bank_id uuid;
begin
  if reviewer_id is null or not private.is_admin() then
    raise exception 'Only Admin can review public submissions.';
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
    raise exception 'A public submission must be reviewed by a different Admin.';
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

  if private.question_grading_capability_v2(v_published_question_id) = 'needs_configuration' then
    raise exception 'The public question is not fully configured for grading.';
  end if;

  if not exists (
    select 1
    from public.question_taxonomy_assignments taxonomy
    where taxonomy.question_id = v_published_question_id
      and taxonomy.review_status in ('approved', 'applied')
  ) then
    raise exception 'The public question requires approved taxonomy.';
  end if;

  select id into official_bank_id
  from public.question_banks
  where owner_scope = 'system'
    and system_key = 'official_public'
    and status = 'active';

  if official_bank_id is null then
    raise exception 'The official Public Library is unavailable.';
  end if;

  update public.questions
  set approval_status = 'approved'
  where id = v_published_question_id;

  insert into public.bank_questions (
    bank_id,
    question_id,
    status,
    source_kind,
    added_by,
    metadata
  )
  values (
    official_bank_id,
    v_published_question_id,
    'active',
    'review_draft',
    reviewer_id,
    jsonb_build_object(
      'lineageKind', 'public_submission_copy',
      'publicSubmissionId', submission_row.id,
      'sourceBankId', submission_row.source_bank_id,
      'sourceBankQuestionId', submission_row.source_bank_question_id,
      'sourceQuestionId', submission_row.source_question_id,
      'sourceQuestionOwnershipPreserved', true
    )
  );

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

revoke all on function public.review_public_question_submission_v2(
  uuid, text, text, jsonb
) from public, anon;
grant execute on function public.review_public_question_submission_v2(
  uuid, text, text, jsonb
) to authenticated;

-- Public pulls now require current official membership; legacy visibility is
-- retained only because the mature copy transaction still consumes it.
alter function public.pull_public_question_to_bank(uuid, uuid, jsonb, uuid)
  rename to pull_public_question_to_bank_pre_official_v2;

revoke all on function public.pull_public_question_to_bank_pre_official_v2(
  uuid, uuid, jsonb, uuid
) from public, anon, authenticated;

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
  copied_question_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Official Public Library pulls are server-only.';
  end if;

  if p_actor_id is null then
    raise exception 'A real Library actor is required.';
  end if;

  if not exists (
    select 1
    from public.bank_questions membership
    join public.question_banks bank on bank.id = membership.bank_id
    join public.questions question on question.id = membership.question_id
    where membership.question_id = p_public_question_id
      and membership.status = 'active'
      and bank.owner_scope = 'system'
      and bank.system_key = 'official_public'
      and bank.status = 'active'
      and question.approval_status = 'approved'
      and question.deleted_at is null
  ) then
    raise exception 'Only an active approved official Public Library question can be pulled.';
  end if;

  copied_question_id := public.pull_public_question_to_bank_pre_official_v2(
    p_bank_id,
    p_public_question_id,
    p_copied_assets,
    p_actor_id
  );

  -- The source is already governed and approved. Preserve that readiness on
  -- the private copy created by the mature pull transaction.
  update public.questions
  set approval_status = 'approved'
  where id = copied_question_id;

  return copied_question_id;
end;
$$;

revoke all on function public.pull_public_question_to_bank(
  uuid, uuid, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.pull_public_question_to_bank(
  uuid, uuid, jsonb, uuid
) to service_role;

-- New Assignments must use the two-state approval gate. The renamed function
-- keeps all established classroom, membership, and snapshot behavior.
alter function public.create_assignment_from_bank(
  uuid, uuid, text, text, timestamptz, uuid[], boolean
) rename to create_assignment_from_bank_pre_approval_v2;

revoke all on function public.create_assignment_from_bank_pre_approval_v2(
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
begin
  selected_count := coalesce(array_length(p_selected_bank_question_ids, 1), 0);

  if selected_count = 0 or (
    select count(*)
    from public.bank_questions membership
    join public.questions question on question.id = membership.question_id
    where membership.id = any(coalesce(p_selected_bank_question_ids, '{}'::uuid[]))
      and membership.bank_id = p_target_bank_id
      and membership.status = 'active'
      and question.approval_status = 'approved'
      and question.deleted_at is null
      and private.question_grading_capability_v2(question.id) <> 'needs_configuration'
  ) <> selected_count then
    raise exception 'Every selected question must be approved, active, and configured for grading.';
  end if;

  return public.create_assignment_from_bank_pre_approval_v2(
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

revoke all on function public.create_assignment_from_bank(
  uuid, uuid, text, text, timestamptz, uuid[], boolean
) from public, anon;
grant execute on function public.create_assignment_from_bank(
  uuid, uuid, text, text, timestamptz, uuid[], boolean
) to authenticated;

comment on column public.questions.approval_status is
  'Canonical two-state approval: pending or approved. Legacy status/visibility are compatibility-only.';
comment on column public.question_banks.system_key is
  'Stable identity for a system-owned Library. official_public is globally unique.';
