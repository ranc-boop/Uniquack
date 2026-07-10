-- Teacher Feedback Notes MVP
-- Keeps feedback assignment-scoped. Private notes remain manager-only; a note
-- becomes student-visible only when explicitly sent to its target student.

create table if not exists public.teacher_feedback_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  practice_attempt_id uuid references public.practice_attempts(id) on delete set null,
  author_id uuid not null references public.profiles(id) on delete restrict,
  visibility text not null default 'private_teacher'
    check (visibility in ('private_teacher', 'sent_to_student')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'archived')),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (visibility = 'private_teacher' and status in ('draft', 'archived') and sent_at is null)
    or (
      visibility = 'sent_to_student'
      and status = 'sent'
      and student_id is not null
      and sent_at is not null
    )
  )
);

create index if not exists teacher_feedback_notes_assignment_updated_idx
  on public.teacher_feedback_notes(assignment_id, updated_at desc);

create index if not exists teacher_feedback_notes_student_sent_idx
  on public.teacher_feedback_notes(student_id, assignment_id, sent_at desc)
  where visibility = 'sent_to_student' and status = 'sent';

create index if not exists teacher_feedback_notes_attempt_idx
  on public.teacher_feedback_notes(practice_attempt_id)
  where practice_attempt_id is not null;

drop trigger if exists teacher_feedback_notes_set_updated_at on public.teacher_feedback_notes;
create trigger teacher_feedback_notes_set_updated_at
before update on public.teacher_feedback_notes
for each row execute function private.set_updated_at();

create or replace function private.can_manage_teacher_feedback_assignment(
  p_assignment_id uuid,
  p_classroom_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.assignments assignment
    where assignment.id = p_assignment_id
      and assignment.classroom_id = p_classroom_id
      and assignment.organization_id = p_organization_id
      and private.can_manage_assignment(assignment.id)
  );
$$;

create or replace function private.is_active_teacher_feedback_student(
  p_classroom_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.classroom_members member
    where member.classroom_id = p_classroom_id
      and member.user_id = p_student_id
      and member.role = 'student'
      and member.status = 'active'
  );
$$;

create or replace function private.is_teacher_feedback_assignment_question(
  p_assignment_id uuid,
  p_question_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.assignment_items item
    where item.assignment_id = p_assignment_id
      and item.question_id = p_question_id
      and item.item_type = 'question'
  );
$$;

create or replace function private.is_teacher_feedback_assignment_attempt(
  p_assignment_id uuid,
  p_student_id uuid,
  p_question_id uuid,
  p_practice_attempt_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.assignment_practice_sessions assignment_session
    join public.practice_attempts attempt
      on attempt.session_id = assignment_session.practice_session_id
    where assignment_session.assignment_id = p_assignment_id
      and assignment_session.student_id = p_student_id
      and attempt.id = p_practice_attempt_id
      and attempt.user_id = p_student_id
      and (p_question_id is null or attempt.source_question_id = p_question_id)
  );
$$;

create or replace function private.can_write_teacher_feedback_note(
  p_assignment_id uuid,
  p_classroom_id uuid,
  p_organization_id uuid,
  p_student_id uuid,
  p_question_id uuid,
  p_practice_attempt_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.can_manage_teacher_feedback_assignment(
      p_assignment_id,
      p_classroom_id,
      p_organization_id
    )
    and (
      p_student_id is null
      or private.is_active_teacher_feedback_student(p_classroom_id, p_student_id)
    )
    and (
      p_question_id is null
      or private.is_teacher_feedback_assignment_question(p_assignment_id, p_question_id)
    )
    and (
      p_practice_attempt_id is null
      or (
        p_student_id is not null
        and private.is_teacher_feedback_assignment_attempt(
          p_assignment_id,
          p_student_id,
          p_question_id,
          p_practice_attempt_id
        )
      )
    );
$$;

revoke all on function private.can_manage_teacher_feedback_assignment(uuid, uuid, uuid) from public;
revoke all on function private.is_active_teacher_feedback_student(uuid, uuid) from public;
revoke all on function private.is_teacher_feedback_assignment_question(uuid, uuid) from public;
revoke all on function private.is_teacher_feedback_assignment_attempt(uuid, uuid, uuid, uuid) from public;
revoke all on function private.can_write_teacher_feedback_note(uuid, uuid, uuid, uuid, uuid, uuid) from public;

grant execute on function private.can_manage_teacher_feedback_assignment(uuid, uuid, uuid) to authenticated;
grant execute on function private.is_active_teacher_feedback_student(uuid, uuid) to authenticated;
grant execute on function private.is_teacher_feedback_assignment_question(uuid, uuid) to authenticated;
grant execute on function private.is_teacher_feedback_assignment_attempt(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function private.can_write_teacher_feedback_note(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;

alter table public.teacher_feedback_notes enable row level security;

drop policy if exists teacher_feedback_notes_teacher_read on public.teacher_feedback_notes;
create policy teacher_feedback_notes_teacher_read
on public.teacher_feedback_notes for select
to authenticated
using (private.can_manage_teacher_feedback_assignment(assignment_id, classroom_id, organization_id));

drop policy if exists teacher_feedback_notes_student_sent_read on public.teacher_feedback_notes;
create policy teacher_feedback_notes_student_sent_read
on public.teacher_feedback_notes for select
to authenticated
using (
  student_id = auth.uid()
  and visibility = 'sent_to_student'
  and status = 'sent'
  and sent_at is not null
  and exists (
    select 1
    from public.assignments assignment
    join public.classroom_members member
      on member.classroom_id = assignment.classroom_id
    where assignment.id = teacher_feedback_notes.assignment_id
      and assignment.classroom_id = teacher_feedback_notes.classroom_id
      and assignment.status = 'assigned'
      and member.user_id = auth.uid()
      and member.role = 'student'
      and member.status = 'active'
  )
);

drop policy if exists teacher_feedback_notes_teacher_insert on public.teacher_feedback_notes;
create policy teacher_feedback_notes_teacher_insert
on public.teacher_feedback_notes for insert
to authenticated
with check (
  author_id = auth.uid()
  and private.can_write_teacher_feedback_note(
    assignment_id,
    classroom_id,
    organization_id,
    student_id,
    question_id,
    practice_attempt_id
  )
);

drop policy if exists teacher_feedback_notes_teacher_update on public.teacher_feedback_notes;
create policy teacher_feedback_notes_teacher_update
on public.teacher_feedback_notes for update
to authenticated
using (
  author_id = auth.uid()
  and private.can_manage_teacher_feedback_assignment(assignment_id, classroom_id, organization_id)
)
with check (
  author_id = auth.uid()
  and private.can_write_teacher_feedback_note(
    assignment_id,
    classroom_id,
    organization_id,
    student_id,
    question_id,
    practice_attempt_id
  )
);

drop policy if exists teacher_feedback_notes_teacher_delete on public.teacher_feedback_notes;
create policy teacher_feedback_notes_teacher_delete
on public.teacher_feedback_notes for delete
to authenticated
using (
  author_id = auth.uid()
  and private.can_manage_teacher_feedback_assignment(assignment_id, classroom_id, organization_id)
);

comment on table public.teacher_feedback_notes is
  'Teacher-authored assignment feedback. Private notes remain manager-only; only explicitly sent notes are visible to their target student.';
