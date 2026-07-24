-- Forward-only correction for the applied 0052 source-binding RPC.
-- Qualify the deduplicated bank_id column so it cannot collide with the
-- RETURNS TABLE output variable of the same name in PL/pgSQL.

create or replace function public.initialize_practice_session_sources(
  p_session_id uuid,
  p_bank_ids uuid[] default '{}'::uuid[],
  p_include_public boolean default true,
  p_assignment_id uuid default null
)
returns table (
  source_kind text,
  bank_id uuid,
  assignment_id uuid,
  source_snapshot jsonb
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid := auth.uid();
  requested_bank_ids uuid[];
  requested_count integer := 0;
  authorized_count integer := 0;
  assignment_row public.assignments%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.practice_sessions session
    where session.id = p_session_id
      and session.user_id = actor_id
      and session.status = 'active'
  ) then
    raise exception 'Active practice session not found.';
  end if;

  if exists (
    select 1
    from public.practice_session_sources source
    where source.session_id = p_session_id
  ) then
    raise exception 'Practice session sources are already initialized.';
  end if;

  select coalesce(
    array_agg(deduplicated.bank_id order by deduplicated.bank_id),
    '{}'::uuid[]
  )
  into requested_bank_ids
  from (
    select distinct requested.requested_id as bank_id
    from unnest(coalesce(p_bank_ids, '{}'::uuid[])) requested(requested_id)
    where requested.requested_id is not null
  ) deduplicated;

  requested_count := coalesce(array_length(requested_bank_ids, 1), 0);

  if requested_count > 10 then
    raise exception 'Choose at most 10 Libraries.';
  end if;

  if p_assignment_id is not null then
    if p_include_public or requested_count > 0 then
      raise exception 'Assignment practice cannot add Library or public catalog sources.';
    end if;

    select assignment.*
    into assignment_row
    from public.assignments assignment
    join public.classroom_members member
      on member.classroom_id = assignment.classroom_id
     and member.user_id = actor_id
     and member.role = 'student'
     and member.status = 'active'
    where assignment.id = p_assignment_id
      and assignment.status = 'assigned';

    if assignment_row.id is null then
      raise exception 'Assigned work is not available to this student.';
    end if;

    insert into public.practice_session_sources (
      session_id,
      source_kind,
      assignment_id,
      source_snapshot,
      created_by
    )
    values (
      p_session_id,
      'assignment',
      p_assignment_id,
      jsonb_build_object(
        'assignmentId', assignment_row.id,
        'title', assignment_row.title,
        'scope', 'assignment_only'
      ),
      actor_id
    );
  else
    if not p_include_public and requested_count = 0 then
      raise exception 'Choose at least one practice source.';
    end if;

    select count(*)
    into authorized_count
    from public.question_banks bank
    join public.bank_members member
      on member.bank_id = bank.id
     and member.user_id = actor_id
     and member.status = 'active'
    where bank.id = any(requested_bank_ids)
      and bank.status = 'active';

    if authorized_count <> requested_count then
      raise exception 'One or more selected Libraries are unavailable.';
    end if;

    if p_include_public then
      insert into public.practice_session_sources (
        session_id,
        source_kind,
        source_snapshot,
        created_by
      )
      values (
        p_session_id,
        'public_catalog',
        jsonb_build_object('name', 'Public Question Bank'),
        actor_id
      );
    end if;

    insert into public.practice_session_sources (
      session_id,
      source_kind,
      bank_id,
      source_snapshot,
      created_by
    )
    select
      p_session_id,
      'question_bank',
      bank.id,
      jsonb_build_object(
        'bankId', bank.id,
        'name', bank.name,
        'visibility', bank.visibility,
        'membershipRole', member.role
      ),
      actor_id
    from public.question_banks bank
    join public.bank_members member
      on member.bank_id = bank.id
     and member.user_id = actor_id
     and member.status = 'active'
    where bank.id = any(requested_bank_ids)
      and bank.status = 'active'
    order by bank.name, bank.id;
  end if;

  return query
  select
    source.source_kind,
    source.bank_id,
    source.assignment_id,
    source.source_snapshot
  from public.practice_session_sources source
  where source.session_id = p_session_id
  order by source.created_at, source.id;
end;
$$;

revoke all on function public.initialize_practice_session_sources(uuid, uuid[], boolean, uuid)
from public, anon;
grant execute on function public.initialize_practice_session_sources(uuid, uuid[], boolean, uuid)
to authenticated;

comment on function public.initialize_practice_session_sources(uuid, uuid[], boolean, uuid) is
  'Atomically binds immutable Practice sources after server-side ownership, membership, and assignment validation; 0053 qualifies the bank-id aggregation to avoid PL/pgSQL output-variable ambiguity.';
