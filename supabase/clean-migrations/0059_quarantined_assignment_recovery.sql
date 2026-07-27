-- Recover evidence-preserving Assignment deliveries after Library Review.
--
-- 0057 deliberately withdrew invalid student delivery without deleting the
-- Assignment, its items, or progress. This RPC lets the managing teacher resume
-- that same Assignment only after every bank-owned item is reviewed and active.

create or replace function public.resume_quarantined_assignment(
  p_assignment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  assignment_row public.assignments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into assignment_row
  from public.assignments assignment
  where assignment.id = p_assignment_id
  for update;

  if assignment_row.id is null
    or not private.can_manage_assignment(assignment_row.id)
  then
    raise exception 'You cannot manage this Assignment.';
  end if;

  if assignment_row.status <> 'draft'
    or assignment_row.source_summary->>'deliveryQuarantineReason'
      is distinct from 'unreviewed_library_question'
  then
    raise exception 'This Assignment is not paused by the Library Review gate.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'edustruct.assignment_library_readiness',
      0
    )
  );

  perform private.assert_assignment_library_questions_ready(
    assignment_row.id
  );

  update public.assignments
  set
    status = 'assigned',
    assigned_at = now(),
    source_summary = source_summary || jsonb_build_object(
      'deliveryResumedAt',
      now(),
      'deliveryResumedBy',
      auth.uid()
    )
  where id = assignment_row.id;

  return assignment_row.id;
end;
$$;

revoke all on function public.resume_quarantined_assignment(uuid)
  from public, anon, authenticated;
grant execute on function public.resume_quarantined_assignment(uuid)
  to authenticated;

comment on function public.resume_quarantined_assignment(uuid) is
  'Resumes an evidence-preserving Assignment quarantined by 0057 after all Library items pass Review; rechecks manager scope and readiness atomically.';
