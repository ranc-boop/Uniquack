-- Clean Supabase MVP v1 compatibility patch.
-- Align practice session/thread state columns with the current Practice Agent runtime.

alter table public.practice_sessions
  add column if not exists session_plan jsonb,
  add column if not exists session_thread_messages jsonb,
  add column if not exists session_state jsonb,
  add column if not exists next_user_notes text,
  add column if not exists preference_dirty_at timestamptz;

update public.practice_sessions
set
  session_plan = case
    when jsonb_typeof(session_plan) = 'object' then session_plan
    else '{}'::jsonb
  end,
  session_thread_messages = case
    when jsonb_typeof(session_thread_messages) = 'array' then session_thread_messages
    else '[]'::jsonb
  end,
  session_state = case
    when jsonb_typeof(session_state) = 'object' then session_state
    else '{}'::jsonb
  end,
  next_user_notes = coalesce(next_user_notes, '')
where
  session_plan is null
  or session_thread_messages is null
  or session_state is null
  or next_user_notes is null
  or jsonb_typeof(session_plan) <> 'object'
  or jsonb_typeof(session_thread_messages) <> 'array'
  or jsonb_typeof(session_state) <> 'object';

alter table public.practice_sessions
  alter column session_plan set default '{}'::jsonb,
  alter column session_plan set not null,
  alter column session_thread_messages set default '[]'::jsonb,
  alter column session_thread_messages set not null,
  alter column session_state set default '{}'::jsonb,
  alter column session_state set not null,
  alter column next_user_notes set default '',
  alter column next_user_notes set not null,
  alter column cache_prefix_version set default 'practice-session-v2';

alter table public.practice_sessions
  drop constraint if exists practice_sessions_session_plan_object_check,
  drop constraint if exists practice_sessions_session_thread_messages_array_check,
  drop constraint if exists practice_sessions_session_state_object_check,
  drop constraint if exists practice_sessions_next_user_notes_length_check;

alter table public.practice_sessions
  add constraint practice_sessions_session_plan_object_check
    check (jsonb_typeof(session_plan) = 'object'),
  add constraint practice_sessions_session_thread_messages_array_check
    check (jsonb_typeof(session_thread_messages) = 'array'),
  add constraint practice_sessions_session_state_object_check
    check (jsonb_typeof(session_state) = 'object'),
  add constraint practice_sessions_next_user_notes_length_check
    check (length(next_user_notes) <= 4000);

alter table public.practice_agent_episodes
  add column if not exists cache_thread_entry jsonb;

update public.practice_agent_episodes
set cache_thread_entry = '{}'::jsonb
where cache_thread_entry is null or jsonb_typeof(cache_thread_entry) <> 'object';

alter table public.practice_agent_episodes
  alter column cache_thread_entry set default '{}'::jsonb,
  alter column cache_thread_entry set not null;

alter table public.practice_agent_episodes
  drop constraint if exists practice_agent_episodes_cache_thread_entry_object_check;

alter table public.practice_agent_episodes
  add constraint practice_agent_episodes_cache_thread_entry_object_check
    check (jsonb_typeof(cache_thread_entry) = 'object');

alter table public.practice_preference_merge_jobs
  add column if not exists source_summary jsonb;

update public.practice_preference_merge_jobs
set source_summary = '{}'::jsonb
where source_summary is null or jsonb_typeof(source_summary) <> 'object';

alter table public.practice_preference_merge_jobs
  alter column source_summary set default '{}'::jsonb,
  alter column source_summary set not null;

alter table public.practice_preference_merge_jobs
  drop constraint if exists practice_preference_merge_jobs_source_summary_object_check;

alter table public.practice_preference_merge_jobs
  add constraint practice_preference_merge_jobs_source_summary_object_check
    check (jsonb_typeof(source_summary) = 'object');

create index if not exists practice_sessions_preference_dirty_idx
  on public.practice_sessions(user_id, preference_dirty_at)
  where preference_dirty_at is not null;

comment on column public.practice_sessions.session_plan is
  'Current Practice Agent compatibility: cache-stable session outline/plan for recommendation and review prompts.';
comment on column public.practice_sessions.session_thread_messages is
  'Current Practice Agent compatibility: append-only cache-friendly practice thread entries and checkpoints.';
comment on column public.practice_sessions.session_state is
  'Current Practice Agent compatibility: volatile per-session state kept near the prompt tail.';
comment on column public.practice_sessions.next_user_notes is
  'Current Practice Agent compatibility: latest user note for the next round after review.';
comment on column public.practice_sessions.preference_dirty_at is
  'Current Practice Agent compatibility: marks sessions with post-merge evidence that should be merged again.';
comment on column public.practice_agent_episodes.cache_thread_entry is
  'Current Practice Agent compatibility: compact episode evidence inherited by later recommendation/review calls.';
comment on column public.practice_preference_merge_jobs.source_summary is
  'Current Practice Agent compatibility: bounded source session summary used for long-term preference merging.';
