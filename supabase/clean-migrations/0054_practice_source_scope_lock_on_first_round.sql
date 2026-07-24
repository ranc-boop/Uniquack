-- Lock self-study Practice sources when the first round is initiated, not when
-- an empty conversation/session shell is created.

alter table public.practice_sessions
  add column if not exists source_scope_locked_at timestamptz;

-- Assignment scope is fixed by the delivery event. Existing self-study
-- sessions become locked only if they already contain round evidence.
update public.practice_sessions session
set source_scope_locked_at = coalesce(
  session.source_scope_locked_at,
  (
    select min(round.created_at)
    from public.practice_rounds round
    where round.session_id = session.id
  ),
  case
    when exists (
      select 1
      from public.practice_session_sources source
      where source.session_id = session.id
        and source.source_kind = 'assignment'
    ) then session.created_at
    else null
  end
)
where session.source_scope_locked_at is null
  and (
    exists (
      select 1
      from public.practice_rounds round
      where round.session_id = session.id
    )
    or exists (
      select 1
      from public.practice_session_sources source
      where source.session_id = session.id
        and source.source_kind = 'assignment'
    )
  );

create or replace function public.lock_practice_session_sources_for_round(
  p_session_id uuid,
  p_bank_ids uuid[] default '{}'::uuid[],
  p_include_public boolean default true
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
  locked_at timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  select session.source_scope_locked_at
  into locked_at
  from public.practice_sessions session
  where session.id = p_session_id
    and session.user_id = actor_id
    and session.status = 'active'
  for update;

  if not found then
    raise exception 'Active practice session not found.';
  end if;

  if exists (
    select 1
    from public.practice_session_sources source
    where source.session_id = p_session_id
      and source.source_kind = 'assignment'
  ) then
    raise exception 'Assignment Practice scope is managed by the assignment.';
  end if;

  if locked_at is not null then
    return query
    select
      source.source_kind,
      source.bank_id,
      source.assignment_id,
      source.source_snapshot
    from public.practice_session_sources source
    where source.session_id = p_session_id
    order by source.created_at, source.id;
    return;
  end if;

  -- Sources written by 0052 for an empty, round-less session are provisional.
  -- The browser still cannot mutate them directly; this owner-checked RPC is
  -- the only pre-round replacement path.
  delete from public.practice_session_sources source
  where source.session_id = p_session_id;

  return query
  select
    bound.source_kind,
    bound.bank_id,
    bound.assignment_id,
    bound.source_snapshot
  from public.initialize_practice_session_sources(
    p_session_id,
    p_bank_ids,
    p_include_public,
    null
  ) bound;

  update public.practice_sessions session
  set source_scope_locked_at = now()
  where session.id = p_session_id
    and session.user_id = actor_id
    and session.source_scope_locked_at is null;
end;
$$;

revoke all on function public.lock_practice_session_sources_for_round(uuid, uuid[], boolean)
from public, anon;
grant execute on function public.lock_practice_session_sources_for_round(uuid, uuid[], boolean)
to authenticated;

comment on column public.practice_sessions.source_scope_locked_at is
  'Set atomically when the first self-study round is initiated; empty session shells remain source-editable.';

comment on function public.lock_practice_session_sources_for_round(uuid, uuid[], boolean) is
  'Owner-checked first-round source binding. Revalidates active Library membership, replaces only an unlocked pre-round scope, and returns the immutable locked scope thereafter.';
