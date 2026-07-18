-- P1-STUDENT-01: private Practice evidence is Student-owned by default.
-- Teacher read access is limited to sessions explicitly linked to assignments the
-- caller currently manages. This migration changes policy only; it does not
-- alter data, Bank access, Classroom membership, provider routing, or Storage.

create or replace function private.can_read_practice_session_evidence(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.practice_sessions session_row
    where session_row.id = target_session_id
      and (
        session_row.user_id = auth.uid()
        or exists (
          select 1
          from public.assignment_practice_sessions assignment_session
          where assignment_session.practice_session_id = session_row.id
            and assignment_session.student_id = session_row.user_id
            and private.can_manage_assignment(assignment_session.assignment_id)
        )
      )
  );
$$;

create or replace function private.can_manage_practice_session_evidence(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.practice_sessions session_row
    where session_row.id = target_session_id
      and session_row.user_id = auth.uid()
  );
$$;

create or replace function private.practice_session_matches_owner(
  target_session_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.practice_sessions session_row
    where session_row.id = target_session_id
      and session_row.user_id = target_user_id
  );
$$;

alter function private.can_read_practice_session_evidence(uuid) owner to postgres;
alter function private.can_manage_practice_session_evidence(uuid) owner to postgres;
alter function private.practice_session_matches_owner(uuid, uuid) owner to postgres;

revoke all on function private.can_read_practice_session_evidence(uuid) from public, anon;
revoke all on function private.can_manage_practice_session_evidence(uuid) from public, anon;
revoke all on function private.practice_session_matches_owner(uuid, uuid) from public, anon;
grant execute on function private.can_read_practice_session_evidence(uuid) to authenticated;
grant execute on function private.can_manage_practice_session_evidence(uuid) to authenticated;
grant execute on function private.practice_session_matches_owner(uuid, uuid) to authenticated;

alter table public.practice_sessions enable row level security;
alter table public.practice_rounds enable row level security;
alter table public.practice_round_questions enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.practice_hint_events enable row level security;
alter table public.practice_reflection_records enable row level security;
alter table public.practice_wrong_questions enable row level security;
alter table public.practice_weakness_links enable row level security;
alter table public.user_practice_preferences enable row level security;
alter table public.practice_preference_merge_jobs enable row level security;
alter table public.practice_agent_episodes enable row level security;

drop policy if exists practice_sessions_select_own_or_staff on public.practice_sessions;
drop policy if exists practice_sessions_insert_own on public.practice_sessions;
drop policy if exists practice_sessions_update_own_or_staff on public.practice_sessions;
drop policy if exists practice_sessions_delete_own_or_staff on public.practice_sessions;
create policy practice_sessions_student_select on public.practice_sessions
  for select to authenticated using (user_id = auth.uid());
create policy practice_sessions_assignment_manager_select on public.practice_sessions
  for select to authenticated using (
    user_id <> auth.uid()
    and private.can_read_practice_session_evidence(id)
  );
create policy practice_sessions_student_insert on public.practice_sessions
  for insert to authenticated with check (user_id = auth.uid());
create policy practice_sessions_student_update on public.practice_sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy practice_sessions_student_delete on public.practice_sessions
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists practice_rounds_select_own_or_staff on public.practice_rounds;
drop policy if exists practice_rounds_insert_own on public.practice_rounds;
drop policy if exists practice_rounds_update_own_or_staff on public.practice_rounds;
drop policy if exists practice_rounds_delete_own_or_staff on public.practice_rounds;
create policy practice_rounds_student_select on public.practice_rounds
  for select to authenticated using (user_id = auth.uid());
create policy practice_rounds_assignment_manager_select on public.practice_rounds
  for select to authenticated using (
    user_id <> auth.uid()
    and private.practice_session_matches_owner(session_id, user_id)
    and private.can_read_practice_session_evidence(session_id)
  );
create policy practice_rounds_student_insert on public.practice_rounds
  for insert to authenticated with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_rounds_student_update on public.practice_rounds
  for update to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  ) with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_rounds_student_delete on public.practice_rounds
  for delete to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );

drop policy if exists practice_round_questions_select_own_or_staff on public.practice_round_questions;
drop policy if exists practice_round_questions_insert_own on public.practice_round_questions;
drop policy if exists practice_round_questions_update_own_or_staff on public.practice_round_questions;
drop policy if exists practice_round_questions_delete_own_or_staff on public.practice_round_questions;
create policy practice_round_questions_student_select on public.practice_round_questions
  for select to authenticated using (user_id = auth.uid());
create policy practice_round_questions_assignment_manager_select on public.practice_round_questions
  for select to authenticated using (
    user_id <> auth.uid()
    and private.practice_session_matches_owner(session_id, user_id)
    and private.can_read_practice_session_evidence(session_id)
  );
create policy practice_round_questions_student_insert on public.practice_round_questions
  for insert to authenticated with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_round_questions_student_update on public.practice_round_questions
  for update to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  ) with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_round_questions_student_delete on public.practice_round_questions
  for delete to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );

drop policy if exists practice_attempts_select_own_or_staff on public.practice_attempts;
drop policy if exists practice_attempts_insert_own on public.practice_attempts;
drop policy if exists practice_attempts_update_own_or_staff on public.practice_attempts;
drop policy if exists practice_attempts_delete_own_or_staff on public.practice_attempts;
create policy practice_attempts_student_select on public.practice_attempts
  for select to authenticated using (user_id = auth.uid());
create policy practice_attempts_assignment_manager_select on public.practice_attempts
  for select to authenticated using (
    user_id <> auth.uid()
    and private.practice_session_matches_owner(session_id, user_id)
    and private.can_read_practice_session_evidence(session_id)
  );
create policy practice_attempts_student_insert on public.practice_attempts
  for insert to authenticated with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_attempts_student_update on public.practice_attempts
  for update to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  ) with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_attempts_student_delete on public.practice_attempts
  for delete to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );

drop policy if exists practice_hint_events_own_or_staff on public.practice_hint_events;
create policy practice_hint_events_student_select on public.practice_hint_events
  for select to authenticated using (user_id = auth.uid());
create policy practice_hint_events_assignment_manager_select on public.practice_hint_events
  for select to authenticated using (
    user_id <> auth.uid()
    and private.practice_session_matches_owner(session_id, user_id)
    and private.can_read_practice_session_evidence(session_id)
  );
create policy practice_hint_events_student_insert on public.practice_hint_events
  for insert to authenticated with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_hint_events_student_update on public.practice_hint_events
  for update to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  ) with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_hint_events_student_delete on public.practice_hint_events
  for delete to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );

drop policy if exists practice_reflection_records_own_or_staff on public.practice_reflection_records;
create policy practice_reflection_records_student_select on public.practice_reflection_records
  for select to authenticated using (user_id = auth.uid());
create policy practice_reflection_records_assignment_manager_select on public.practice_reflection_records
  for select to authenticated using (
    user_id <> auth.uid()
    and private.practice_session_matches_owner(session_id, user_id)
    and private.can_read_practice_session_evidence(session_id)
  );
create policy practice_reflection_records_student_insert on public.practice_reflection_records
  for insert to authenticated with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_reflection_records_student_update on public.practice_reflection_records
  for update to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  ) with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_reflection_records_student_delete on public.practice_reflection_records
  for delete to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );

drop policy if exists practice_agent_episodes_own_or_staff on public.practice_agent_episodes;
create policy practice_agent_episodes_student_select on public.practice_agent_episodes
  for select to authenticated using (user_id = auth.uid());
create policy practice_agent_episodes_assignment_manager_select on public.practice_agent_episodes
  for select to authenticated using (
    user_id <> auth.uid()
    and private.practice_session_matches_owner(session_id, user_id)
    and private.can_read_practice_session_evidence(session_id)
  );
create policy practice_agent_episodes_student_insert on public.practice_agent_episodes
  for insert to authenticated with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_agent_episodes_student_update on public.practice_agent_episodes
  for update to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  ) with check (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );
create policy practice_agent_episodes_student_delete on public.practice_agent_episodes
  for delete to authenticated using (
    user_id = auth.uid() and private.can_manage_practice_session_evidence(session_id)
  );

drop policy if exists practice_wrong_questions_own_or_staff on public.practice_wrong_questions;
create policy practice_wrong_questions_student_select on public.practice_wrong_questions
  for select to authenticated using (user_id = auth.uid());
create policy practice_wrong_questions_student_insert on public.practice_wrong_questions
  for insert to authenticated with check (user_id = auth.uid());
create policy practice_wrong_questions_student_update on public.practice_wrong_questions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy practice_wrong_questions_student_delete on public.practice_wrong_questions
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists practice_weakness_links_own_or_staff on public.practice_weakness_links;
create policy practice_weakness_links_student_select on public.practice_weakness_links
  for select to authenticated using (user_id = auth.uid());
create policy practice_weakness_links_assignment_manager_select on public.practice_weakness_links
  for select to authenticated using (
    user_id <> auth.uid()
    and (
      (
        session_id is not null
        and private.practice_session_matches_owner(session_id, user_id)
        and private.can_read_practice_session_evidence(session_id)
      )
      or exists (
        select 1
        from public.practice_attempts attempt_row
        where attempt_row.id = practice_weakness_links.attempt_id
          and attempt_row.user_id = practice_weakness_links.user_id
          and private.practice_session_matches_owner(attempt_row.session_id, practice_weakness_links.user_id)
          and private.can_read_practice_session_evidence(attempt_row.session_id)
      )
    )
  );
create policy practice_weakness_links_student_insert on public.practice_weakness_links
  for insert to authenticated with check (user_id = auth.uid());
create policy practice_weakness_links_student_update on public.practice_weakness_links
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy practice_weakness_links_student_delete on public.practice_weakness_links
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists user_practice_preferences_own_or_staff on public.user_practice_preferences;
create policy user_practice_preferences_student_select on public.user_practice_preferences
  for select to authenticated using (user_id = auth.uid());
create policy user_practice_preferences_student_insert on public.user_practice_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy user_practice_preferences_student_update on public.user_practice_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_practice_preferences_student_delete on public.user_practice_preferences
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists practice_preference_merge_jobs_own_or_staff on public.practice_preference_merge_jobs;
create policy practice_preference_merge_jobs_student_select on public.practice_preference_merge_jobs
  for select to authenticated using (user_id = auth.uid());
create policy practice_preference_merge_jobs_student_insert on public.practice_preference_merge_jobs
  for insert to authenticated with check (user_id = auth.uid());
create policy practice_preference_merge_jobs_student_update on public.practice_preference_merge_jobs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy practice_preference_merge_jobs_student_delete on public.practice_preference_merge_jobs
  for delete to authenticated using (user_id = auth.uid());

comment on function private.can_read_practice_session_evidence(uuid) is
  'Read-only Practice evidence access: session owner or a current manager of an explicitly linked assignment. Organization membership alone is insufficient.';
comment on function private.can_manage_practice_session_evidence(uuid) is
  'Practice evidence mutation is reserved for the owning Student. Assignment managers receive no raw answer mutation capability.';
comment on table public.user_practice_preferences is
  'Student-owned long-term Practice preferences. Assignment managers do not receive access because preferences are not assignment evidence.';
comment on table public.practice_preference_merge_jobs is
  'Student-owned preference merge records. Assignment managers do not receive access because merge input/output may contain private preference state.';
comment on table public.practice_wrong_questions is
  'Student-owned aggregate mistake history. It can span self-study and assignments, so assignment managers do not receive access to avoid leaking non-assignment history.';
