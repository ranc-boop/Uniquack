-- Student My Work Foundation.
-- Adds classroom assignments, assignment items, student progress, and practice-session linkage.

create unique index if not exists classrooms_id_organization_unique_idx
  on public.classrooms(id, organization_id);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 180),
  instructions text not null default '' check (length(instructions) <= 4000),
  status text not null default 'draft'
    check (status in ('draft', 'assigned', 'archived')),
  assigned_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignments_classroom_org_match
    foreign key (classroom_id, organization_id)
    references public.classrooms(id, organization_id)
    on delete cascade
);

create table if not exists public.assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  item_type text not null default 'question'
    check (item_type in ('question', 'practice_set', 'note')),
  order_index integer not null check (order_index > 0),
  points numeric(8, 2) check (points is null or points >= 0),
  created_at timestamptz not null default now(),
  unique (assignment_id, order_index),
  constraint assignment_items_question_required
    check (item_type <> 'question' or question_id is not null)
);

create table if not exists public.student_assignment_progress (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  last_practice_session_id uuid references public.practice_sessions(id) on delete set null,
  evidence_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_summary) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table if not exists public.assignment_practice_sessions (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  practice_session_id uuid not null references public.practice_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (assignment_id, student_id, practice_session_id)
);

create index if not exists assignments_classroom_status_idx
  on public.assignments(classroom_id, status, due_at);

create index if not exists assignments_org_status_idx
  on public.assignments(organization_id, status, created_at desc);

create index if not exists assignment_items_assignment_order_idx
  on public.assignment_items(assignment_id, order_index);

create index if not exists student_assignment_progress_student_status_idx
  on public.student_assignment_progress(student_id, status, updated_at desc);

create index if not exists assignment_practice_sessions_student_idx
  on public.assignment_practice_sessions(student_id, created_at desc);

drop trigger if exists assignments_set_updated_at on public.assignments;
create trigger assignments_set_updated_at
before update on public.assignments
for each row execute function private.set_updated_at();

drop trigger if exists student_assignment_progress_set_updated_at
on public.student_assignment_progress;
create trigger student_assignment_progress_set_updated_at
before update on public.student_assignment_progress
for each row execute function private.set_updated_at();

create or replace function private.can_manage_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.assignments assignment
    where assignment.id = target_assignment_id
      and private.can_manage_classroom(assignment.classroom_id)
      and private.is_org_staff(assignment.organization_id)
  );
$$;

create or replace function private.can_read_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.can_manage_assignment(target_assignment_id)
    or exists (
      select 1
      from public.assignments assignment
      join public.classroom_members member
        on member.classroom_id = assignment.classroom_id
      where assignment.id = target_assignment_id
        and assignment.status = 'assigned'
        and member.user_id = auth.uid()
        and member.role = 'student'
        and member.status = 'active'
    );
$$;

alter table public.assignments enable row level security;
alter table public.assignment_items enable row level security;
alter table public.student_assignment_progress enable row level security;
alter table public.assignment_practice_sessions enable row level security;

drop policy if exists assignments_read_scoped on public.assignments;
create policy assignments_read_scoped
on public.assignments for select
using (private.can_read_assignment(id));

drop policy if exists assignments_teacher_insert on public.assignments;
create policy assignments_teacher_insert
on public.assignments for insert
with check (
  private.can_manage_classroom(classroom_id)
  and private.is_org_staff(organization_id)
);

drop policy if exists assignments_teacher_update on public.assignments;
create policy assignments_teacher_update
on public.assignments for update
using (private.can_manage_assignment(id))
with check (
  private.can_manage_classroom(classroom_id)
  and private.is_org_staff(organization_id)
);

drop policy if exists assignments_teacher_delete on public.assignments;
create policy assignments_teacher_delete
on public.assignments for delete
using (private.can_manage_assignment(id));

drop policy if exists assignment_items_read_scoped on public.assignment_items;
create policy assignment_items_read_scoped
on public.assignment_items for select
using (private.can_read_assignment(assignment_id));

drop policy if exists assignment_items_teacher_insert on public.assignment_items;
create policy assignment_items_teacher_insert
on public.assignment_items for insert
with check (private.can_manage_assignment(assignment_id));

drop policy if exists assignment_items_teacher_update on public.assignment_items;
create policy assignment_items_teacher_update
on public.assignment_items for update
using (private.can_manage_assignment(assignment_id))
with check (private.can_manage_assignment(assignment_id));

drop policy if exists assignment_items_teacher_delete on public.assignment_items;
create policy assignment_items_teacher_delete
on public.assignment_items for delete
using (private.can_manage_assignment(assignment_id));

drop policy if exists student_assignment_progress_read_scoped on public.student_assignment_progress;
create policy student_assignment_progress_read_scoped
on public.student_assignment_progress for select
using (
  student_id = auth.uid()
  or private.can_manage_assignment(assignment_id)
);

drop policy if exists student_assignment_progress_student_insert on public.student_assignment_progress;
create policy student_assignment_progress_student_insert
on public.student_assignment_progress for insert
with check (
  student_id = auth.uid()
  and private.can_read_assignment(assignment_id)
);

drop policy if exists student_assignment_progress_student_update on public.student_assignment_progress;
create policy student_assignment_progress_student_update
on public.student_assignment_progress for update
using (
  student_id = auth.uid()
  and private.can_read_assignment(assignment_id)
)
with check (
  student_id = auth.uid()
  and private.can_read_assignment(assignment_id)
);

drop policy if exists assignment_practice_sessions_read_scoped on public.assignment_practice_sessions;
create policy assignment_practice_sessions_read_scoped
on public.assignment_practice_sessions for select
using (
  student_id = auth.uid()
  or private.can_manage_assignment(assignment_id)
);

drop policy if exists assignment_practice_sessions_student_insert on public.assignment_practice_sessions;
create policy assignment_practice_sessions_student_insert
on public.assignment_practice_sessions for insert
with check (
  student_id = auth.uid()
  and private.can_read_assignment(assignment_id)
);

comment on table public.assignments is
  'Teacher-created classroom assignments. MVP supports assigned question work for Student My Work.';

comment on table public.assignment_items is
  'Ordered assignment contents. MVP uses approved/published question items while leaving space for practice sets and notes.';

comment on table public.student_assignment_progress is
  'Student-owned assignment progress rows. Students write only their own progress; teachers read through classroom scope.';

comment on table public.assignment_practice_sessions is
  'Optional linkage between assignments and Practice Agent sessions. Student My Work links to Practice before full execution integration.';

revoke all on function private.can_manage_assignment(uuid) from public;
revoke all on function private.can_read_assignment(uuid) from public;
grant execute on function private.can_manage_assignment(uuid) to anon, authenticated;
grant execute on function private.can_read_assignment(uuid) to anon, authenticated;
