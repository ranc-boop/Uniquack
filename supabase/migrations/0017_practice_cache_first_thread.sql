-- Cache-first Practice Agent thread state and user-managed memory support.

alter table public.practice_sessions
  add column if not exists session_plan jsonb not null default '{}'::jsonb
    check (jsonb_typeof(session_plan) = 'object'),
  add column if not exists session_thread_messages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(session_thread_messages) = 'array'),
  add column if not exists session_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(session_state) = 'object'),
  add column if not exists outline_user_notes text not null default '' check (length(outline_user_notes) <= 4000),
  add column if not exists next_user_notes text not null default '' check (length(next_user_notes) <= 4000),
  add column if not exists cache_prefix_version text not null default 'practice-core-v1' check (length(cache_prefix_version) <= 80),
  add column if not exists preference_dirty_at timestamptz;

alter table public.practice_agent_episodes
  add column if not exists round_contract jsonb not null default '{}'::jsonb
    check (jsonb_typeof(round_contract) = 'object'),
  add column if not exists episode_card jsonb not null default '{}'::jsonb
    check (jsonb_typeof(episode_card) = 'object'),
  add column if not exists cache_thread_entry jsonb not null default '{}'::jsonb
    check (jsonb_typeof(cache_thread_entry) = 'object');

alter table public.practice_preference_merge_jobs
  add column if not exists source_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_summary) = 'object');

comment on column public.practice_sessions.session_plan is
  'Cache-stable session outline/plan. AI draft plus framework snapshot-derived route. User notes are stored separately to avoid rewriting this prefix.';
comment on column public.practice_sessions.session_thread_messages is
  'Append-only cache-friendly practice thread entries: current tasks, episode cards, and immutable checkpoints.';
comment on column public.practice_sessions.session_state is
  'Volatile current session state injected near the prompt tail.';
comment on column public.practice_sessions.outline_user_notes is
  'User comments on the AI/session outline. Injected at the dynamic tail, not used to rewrite the outline.';
comment on column public.practice_sessions.next_user_notes is
  'Latest user note for the next round after review. Injected at the dynamic tail.';
comment on column public.practice_sessions.preference_dirty_at is
  'Marks sessions that already merged into long-term memory but later gained new review/user-note evidence.';
comment on column public.practice_agent_episodes.round_contract is
  'Per-round recommendation intent: why these questions were selected and what this round diagnoses.';
comment on column public.practice_agent_episodes.episode_card is
  'Append-only evidence card inherited by future rounds without full tool logs.';

create index if not exists practice_sessions_preference_dirty_idx
  on public.practice_sessions(user_id, preference_dirty_at)
  where preference_dirty_at is not null;
