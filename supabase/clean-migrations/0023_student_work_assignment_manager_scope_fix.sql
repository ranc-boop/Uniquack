create or replace function private.can_manage_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.is_super_admin()
    or exists (
      select 1
      from public.assignments assignment
      join public.classrooms classroom
        on classroom.id = assignment.classroom_id
       and classroom.organization_id = assignment.organization_id
      where assignment.id = target_assignment_id
        and (
          classroom.owner_id = auth.uid()
          or private.is_org_admin(classroom.organization_id)
          or exists (
            select 1
            from public.classroom_members member
            where member.classroom_id = classroom.id
              and member.user_id = auth.uid()
              and member.role in ('teacher', 'co_teacher')
              and member.status = 'active'
          )
        )
    );
$$;

drop policy if exists assignments_teacher_insert on public.assignments;
create policy assignments_teacher_insert
on public.assignments for insert
with check (
  private.is_super_admin()
  or exists (
    select 1
    from public.classrooms classroom
    where classroom.id = assignments.classroom_id
      and classroom.organization_id = assignments.organization_id
      and (
        classroom.owner_id = auth.uid()
        or private.is_org_admin(classroom.organization_id)
        or exists (
          select 1
          from public.classroom_members member
          where member.classroom_id = classroom.id
            and member.user_id = auth.uid()
            and member.role in ('teacher', 'co_teacher')
            and member.status = 'active'
        )
      )
  )
);

drop policy if exists assignments_teacher_update on public.assignments;
create policy assignments_teacher_update
on public.assignments for update
using (private.can_manage_assignment(id))
with check (
  private.is_super_admin()
  or exists (
    select 1
    from public.classrooms classroom
    where classroom.id = assignments.classroom_id
      and classroom.organization_id = assignments.organization_id
      and (
        classroom.owner_id = auth.uid()
        or private.is_org_admin(classroom.organization_id)
        or exists (
          select 1
          from public.classroom_members member
          where member.classroom_id = classroom.id
            and member.user_id = auth.uid()
            and member.role in ('teacher', 'co_teacher')
            and member.status = 'active'
        )
      )
  )
);

comment on function private.can_manage_assignment(uuid) is
  'Assignment management follows explicit classroom owner, co-teacher, and organization-admin scope.';
