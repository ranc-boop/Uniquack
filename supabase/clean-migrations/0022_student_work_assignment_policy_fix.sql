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
  );
$$;

drop policy if exists assignments_teacher_insert on public.assignments;
create policy assignments_teacher_insert
on public.assignments for insert
with check (
  exists (
    select 1
    from public.classrooms classroom
    where classroom.id = assignments.classroom_id
      and classroom.organization_id = assignments.organization_id
      and private.can_manage_classroom(classroom.id)
  )
);

drop policy if exists assignments_teacher_update on public.assignments;
create policy assignments_teacher_update
on public.assignments for update
using (private.can_manage_assignment(id))
with check (
  exists (
    select 1
    from public.classrooms classroom
    where classroom.id = assignments.classroom_id
      and classroom.organization_id = assignments.organization_id
      and private.can_manage_classroom(classroom.id)
  )
);

comment on function private.can_manage_assignment(uuid) is
  'Assignment management follows the scoped classroom manager contract. Classroom RLS controls teacher/co-teacher/admin access.';
