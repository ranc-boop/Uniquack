-- Assignment from Bank Questions
-- Lets teachers assign selected approved bank questions to managed classrooms
-- without publishing the questions globally or exposing the full bank to students.

alter table public.assignments
  drop constraint if exists assignments_source_kind_check;

alter table public.assignments
  add constraint assignments_source_kind_check
  check (source_kind in ('manual', 'course_builder_run', 'practice_framework', 'question_bank'));

alter table public.assignment_items
  add column if not exists bank_question_id uuid references public.bank_questions(id) on delete set null,
  add column if not exists source_bank_id uuid references public.question_banks(id) on delete set null;

create index if not exists assignment_items_bank_question_id_idx
  on public.assignment_items(bank_question_id)
  where bank_question_id is not null;

create index if not exists assignment_items_source_bank_id_idx
  on public.assignment_items(source_bank_id)
  where source_bank_id is not null;

create or replace function private.can_read_assignment_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.assignment_items item
    join public.assignments assignment
      on assignment.id = item.assignment_id
    join public.classroom_members member
      on member.classroom_id = assignment.classroom_id
    where item.question_id = p_question_id
      and item.item_type = 'question'
      and assignment.status = 'assigned'
      and member.user_id = auth.uid()
      and member.role = 'student'
      and member.status = 'active'
  )
  or exists (
    select 1
    from public.assignment_items item
    join public.assignments assignment
      on assignment.id = item.assignment_id
    where item.question_id = p_question_id
      and item.item_type = 'question'
      and private.can_manage_assignment(assignment.id)
  );
$$;

revoke all on function private.can_read_assignment_question(uuid) from public;
grant execute on function private.can_read_assignment_question(uuid) to anon, authenticated;

drop policy if exists questions_assignment_item_read on public.questions;
create policy questions_assignment_item_read
on public.questions
for select
using (
  deleted_at is null
  and private.can_read_assignment_question(id)
);

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
  actor_id uuid := auth.uid();
  actor_profile public.profiles%rowtype;
  bank_row public.question_banks%rowtype;
  classroom_row public.classrooms%rowtype;
  created_assignment_id uuid;
  selected_count integer := 0;
  usable_count integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
    into actor_profile
    from public.profiles
   where id = actor_id
     and status = 'active';

  if actor_profile.id is null
     or actor_profile.role not in ('teacher', 'admin', 'super_admin') then
    raise exception 'Only active teachers and admins can create assignments from banks.';
  end if;

  if nullif(trim(coalesce(p_assignment_title, '')), '') is null then
    raise exception 'Assignment title is required.';
  end if;

  select *
    into bank_row
    from public.question_banks
   where id = p_target_bank_id
     and status = 'active';

  if bank_row.id is null then
    raise exception 'Question Bank was not found or is not active.';
  end if;

  if not private.can_read_question_bank(p_target_bank_id) then
    raise exception 'You do not have access to this Question Bank.';
  end if;

  select *
    into classroom_row
    from public.classrooms
   where id = p_target_classroom_id
     and status = 'active';

  if classroom_row.id is null then
    raise exception 'Classroom was not found or is not active.';
  end if;

  if classroom_row.organization_id <> bank_row.organization_id then
    raise exception 'Question Bank and classroom must belong to the same organization.';
  end if;

  if not private.can_manage_classroom(p_target_classroom_id) then
    raise exception 'You cannot manage this classroom.';
  end if;

  with selected as (
    select selected_id as bank_question_id, min(ord) as first_order
      from unnest(coalesce(p_selected_bank_question_ids, '{}'::uuid[]))
        with ordinality as selected_rows(selected_id, ord)
     group by selected_id
  )
  select count(*) into selected_count
    from selected;

  if selected_count = 0 then
    raise exception 'Choose at least one approved bank question.';
  end if;

  with selected as (
    select selected_id as bank_question_id, min(ord) as first_order
      from unnest(coalesce(p_selected_bank_question_ids, '{}'::uuid[]))
        with ordinality as selected_rows(selected_id, ord)
     group by selected_id
  )
  select count(*) into usable_count
    from selected
    join public.bank_questions bank_question
      on bank_question.id = selected.bank_question_id
     and bank_question.bank_id = p_target_bank_id
     and bank_question.status = 'active'
    join public.questions question
      on question.id = bank_question.question_id
     and question.deleted_at is null
     and question.status <> 'draft'
     and question.organization_id = bank_row.organization_id;

  if usable_count <> selected_count then
    raise exception 'Selected items must be active approved questions in this bank.';
  end if;

  insert into public.assignments (
    organization_id,
    classroom_id,
    created_by,
    title,
    instructions,
    status,
    assigned_at,
    due_at,
    source_kind,
    source_record_id,
    source_summary
  )
  values (
    classroom_row.organization_id,
    classroom_row.id,
    actor_id,
    trim(p_assignment_title),
    coalesce(p_assignment_instructions, ''),
    case when p_assign_now then 'assigned' else 'draft' end,
    case when p_assign_now then now() else null end,
    p_assignment_due_at,
    'question_bank',
    bank_row.id,
    jsonb_build_object(
      'sourceTitle', bank_row.name,
      'bankId', bank_row.id,
      'bankName', bank_row.name,
      'bankVisibility', bank_row.visibility,
      'itemCount', selected_count,
      'assignmentVisibility', 'assignment_only',
      'selectedBankQuestionIds', p_selected_bank_question_ids
    )
  )
  returning id into created_assignment_id;

  with selected as (
    select selected_id as bank_question_id, min(ord) as first_order
      from unnest(coalesce(p_selected_bank_question_ids, '{}'::uuid[]))
        with ordinality as selected_rows(selected_id, ord)
     group by selected_id
  ),
  ordered_questions as (
    select
      selected.bank_question_id,
      bank_question.bank_id,
      bank_question.question_id,
      row_number() over (order by selected.first_order)::integer as item_order
    from selected
    join public.bank_questions bank_question
      on bank_question.id = selected.bank_question_id
     and bank_question.bank_id = p_target_bank_id
     and bank_question.status = 'active'
    join public.questions question
      on question.id = bank_question.question_id
     and question.deleted_at is null
     and question.status <> 'draft'
  )
  insert into public.assignment_items (
    assignment_id,
    question_id,
    item_type,
    order_index,
    points,
    bank_question_id,
    source_bank_id
  )
  select
    created_assignment_id,
    question_id,
    'question',
    item_order,
    1,
    bank_question_id,
    bank_id
  from ordered_questions
  order by item_order;

  return created_assignment_id;
end;
$$;

revoke all on function public.create_assignment_from_bank(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  uuid[],
  boolean
) from public;

grant execute on function public.create_assignment_from_bank(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  uuid[],
  boolean
) to authenticated;

comment on function public.create_assignment_from_bank(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  uuid[],
  boolean
) is 'Creates a draft or assigned classroom assignment from selected active bank questions without publishing them globally.';
