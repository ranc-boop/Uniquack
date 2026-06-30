-- Clean Supabase MVP v1 draft migration.
-- Practice Agent sessions, rounds, attempts, thread episodes, preferences, and weakness evidence.
-- Draft only: review before applying to any database.

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Practice session'
    check (length(btrim(title)) > 0 and length(title) <= 160),
  goal text not null default '' check (length(goal) <= 500),
  session_memory text not null default '',
  tag_context jsonb not null default '{"confirmedTagIds":[],"usefulTags":[],"version":1}'::jsonb
    check (jsonb_typeof(tag_context) = 'object'),
  completed_question_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned', 'archived')),
  current_recommendation jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  outline_user_notes text not null default '',
  long_term_memory_snapshot text not null default '',
  cache_prefix_version text not null default 'practice-session-v1',
  preference_merged_at timestamptz,
  last_activity_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practice_rounds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  round_index integer not null check (round_index > 0),
  round_goal text not null default '' check (length(round_goal) <= 500),
  review_summary text,
  next_round_goal text,
  score_correct integer not null default 0 check (score_correct >= 0),
  score_total integer not null default 0 check (score_total >= 0),
  mode text,
  provider_label text,
  target_taxonomy_node_ids text[] not null default '{}'::text[],
  status text not null default 'active'
    check (status in ('active', 'completed', 'skipped')),
  trace jsonb not null default '[]'::jsonb check (jsonb_typeof(trace) = 'array'),
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, round_index)
);

create table if not exists public.practice_round_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  round_id uuid not null references public.practice_rounds(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  source_question_id uuid not null,
  question_code text,
  title text not null default '',
  content_html text not null default '',
  question_type text,
  difficulty_rating integer,
  position integer not null check (position > 0),
  question_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(question_snapshot) = 'object'),
  reason text,
  expected_skill text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, source_question_id)
);

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  round_id uuid not null references public.practice_rounds(id) on delete cascade,
  practice_round_question_id uuid references public.practice_round_questions(id) on delete set null,
  question_id uuid references public.questions(id) on delete set null,
  source_question_id uuid not null,
  question_code text,
  question_title text not null default '',
  question_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(question_snapshot) = 'object'),
  answer jsonb not null default '""'::jsonb,
  answer_payload jsonb not null default '{}'::jsonb,
  correctness text not null default 'unknown'
    check (correctness in ('correct', 'incorrect', 'partial', 'unknown')),
  is_correct boolean,
  score numeric(6, 3) check (score is null or score >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  hint_count integer not null default 0 check (hint_count >= 0),
  hints jsonb not null default '[]'::jsonb check (jsonb_typeof(hints) = 'array'),
  grading_mode text not null default 'manual'
    check (grading_mode in ('auto', 'manual')),
  feedback jsonb not null default '{}'::jsonb,
  explanation text,
  solution_html text,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, source_question_id)
);

create table if not exists public.practice_hint_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  round_id uuid references public.practice_rounds(id) on delete set null,
  attempt_id uuid references public.practice_attempts(id) on delete set null,
  hint_kind text not null default 'standard'
    check (hint_kind in ('standard', 'scaffold', 'conceptual', 'worked_step')),
  hint_level integer not null default 1 check (hint_level >= 1),
  prompt_context jsonb not null default '{}'::jsonb,
  response_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.practice_reflection_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  round_id uuid references public.practice_rounds(id) on delete set null,
  reflection_kind text not null default 'round_review'
    check (reflection_kind in ('round_review', 'session_review', 'student_note', 'agent_summary')),
  body text,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.practice_wrong_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  source_question_id uuid not null,
  question_code text,
  question_title text not null default '',
  question_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(question_snapshot) = 'object'),
  last_session_id uuid references public.practice_sessions(id) on delete set null,
  last_round_id uuid references public.practice_rounds(id) on delete set null,
  last_attempt_id uuid references public.practice_attempts(id) on delete set null,
  miss_count integer not null default 1 check (miss_count > 0),
  last_answer jsonb not null default '""'::jsonb,
  last_explanation text,
  last_missed_at timestamptz not null default now(),
  mastered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_question_id)
);

create table if not exists public.practice_weakness_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  taxonomy_node_id text not null references public.taxonomy_nodes(tag_id) on delete restrict,
  session_id uuid references public.practice_sessions(id) on delete set null,
  attempt_id uuid references public.practice_attempts(id) on delete set null,
  evidence_kind text not null
    check (evidence_kind in ('missed_question', 'hint_usage', 'reflection', 'review_summary')),
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now()
);

create table if not exists public.user_practice_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  long_term_preference text not null default '' check (length(long_term_preference) <= 1000),
  preferences jsonb not null default '{}'::jsonb,
  summary text,
  last_agent_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.practice_preference_merge_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_session_id uuid references public.practice_sessions(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  previous_preference text not null default '',
  source_session_memory text not null default '',
  result_preference text,
  error_message text check (error_message is null or length(error_message) <= 1000),
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practice_agent_episodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  round_id uuid references public.practice_rounds(id) on delete cascade,
  episode_index integer not null default 1 check (episode_index > 0),
  recommend_context jsonb not null default '{}'::jsonb check (jsonb_typeof(recommend_context) = 'object'),
  tool_trace_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_trace_summary) = 'array'),
  student_attempt_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(student_attempt_summary) = 'array'),
  review_diagnosis jsonb not null default '{}'::jsonb check (jsonb_typeof(review_diagnosis) = 'object'),
  memory_update text not null default '' check (length(memory_update) <= 4000),
  llm_usage jsonb not null default '[]'::jsonb check (jsonb_typeof(llm_usage) = 'array'),
  round_contract jsonb not null default '{}'::jsonb check (jsonb_typeof(round_contract) = 'object'),
  episode_card jsonb not null default '{}'::jsonb check (jsonb_typeof(episode_card) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id)
);

comment on table public.practice_agent_episodes is
  'Per-round Practice Agent evidence chain for recommendations, tool summaries, student attempts, review diagnosis, and memory updates.';

create index if not exists practice_sessions_user_activity_idx
  on public.practice_sessions(user_id, last_activity_at desc);

create index if not exists practice_sessions_user_status_idx
  on public.practice_sessions(user_id, status);

create index if not exists practice_rounds_session_idx
  on public.practice_rounds(session_id, round_index);

create index if not exists practice_rounds_user_idx
  on public.practice_rounds(user_id, created_at desc);

create index if not exists practice_round_questions_session_idx
  on public.practice_round_questions(session_id, position);

create index if not exists practice_attempts_session_idx
  on public.practice_attempts(session_id, created_at desc);

create index if not exists practice_attempts_user_question_idx
  on public.practice_attempts(user_id, source_question_id, created_at desc);

create index if not exists practice_wrong_questions_user_active_idx
  on public.practice_wrong_questions(user_id, mastered_at, last_missed_at desc);

create index if not exists practice_wrong_questions_source_question_idx
  on public.practice_wrong_questions(user_id, source_question_id);

create index if not exists practice_weakness_links_user_node_idx
  on public.practice_weakness_links(user_id, taxonomy_node_id, created_at desc);

create index if not exists practice_preference_merge_jobs_user_status_idx
  on public.practice_preference_merge_jobs(user_id, status, created_at);

create index if not exists practice_agent_episodes_session_idx
  on public.practice_agent_episodes(session_id, episode_index);

create index if not exists practice_agent_episodes_user_idx
  on public.practice_agent_episodes(user_id, created_at desc);

drop trigger if exists practice_sessions_set_updated_at on public.practice_sessions;
create trigger practice_sessions_set_updated_at
before update on public.practice_sessions
for each row execute function private.set_updated_at();

drop trigger if exists practice_rounds_set_updated_at on public.practice_rounds;
create trigger practice_rounds_set_updated_at
before update on public.practice_rounds
for each row execute function private.set_updated_at();

drop trigger if exists practice_round_questions_set_updated_at on public.practice_round_questions;
create trigger practice_round_questions_set_updated_at
before update on public.practice_round_questions
for each row execute function private.set_updated_at();

drop trigger if exists practice_attempts_set_updated_at on public.practice_attempts;
create trigger practice_attempts_set_updated_at
before update on public.practice_attempts
for each row execute function private.set_updated_at();

drop trigger if exists practice_wrong_questions_set_updated_at on public.practice_wrong_questions;
create trigger practice_wrong_questions_set_updated_at
before update on public.practice_wrong_questions
for each row execute function private.set_updated_at();

drop trigger if exists user_practice_preferences_set_updated_at on public.user_practice_preferences;
create trigger user_practice_preferences_set_updated_at
before update on public.user_practice_preferences
for each row execute function private.set_updated_at();

drop trigger if exists practice_preference_merge_jobs_set_updated_at on public.practice_preference_merge_jobs;
create trigger practice_preference_merge_jobs_set_updated_at
before update on public.practice_preference_merge_jobs
for each row execute function private.set_updated_at();

drop trigger if exists practice_agent_episodes_set_updated_at on public.practice_agent_episodes;
create trigger practice_agent_episodes_set_updated_at
before update on public.practice_agent_episodes
for each row execute function private.set_updated_at();

create or replace function private.validate_practice_weakness_taxonomy_node()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not exists (
    select 1
    from public.taxonomy_nodes
    where tag_id = new.taxonomy_node_id
      and status = 'active'
      and node_kind = 'tag'
      and is_assignable = true
  ) then
    raise exception 'Practice weakness links require an active assignable taxonomy tag.';
  end if;

  return new;
end;
$$;

drop trigger if exists practice_weakness_links_validate_taxonomy
on public.practice_weakness_links;
create trigger practice_weakness_links_validate_taxonomy
before insert or update of taxonomy_node_id on public.practice_weakness_links
for each row execute function private.validate_practice_weakness_taxonomy_node();

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
create policy practice_sessions_select_own_or_staff
on public.practice_sessions for select
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_sessions_insert_own on public.practice_sessions;
create policy practice_sessions_insert_own
on public.practice_sessions for insert
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_sessions_update_own_or_staff on public.practice_sessions;
create policy practice_sessions_update_own_or_staff
on public.practice_sessions for update
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_sessions_delete_own_or_staff on public.practice_sessions;
create policy practice_sessions_delete_own_or_staff
on public.practice_sessions for delete
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_rounds_select_own_or_staff on public.practice_rounds;
create policy practice_rounds_select_own_or_staff
on public.practice_rounds for select
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_rounds_insert_own on public.practice_rounds;
create policy practice_rounds_insert_own
on public.practice_rounds for insert
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_rounds_update_own_or_staff on public.practice_rounds;
create policy practice_rounds_update_own_or_staff
on public.practice_rounds for update
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_rounds_delete_own_or_staff on public.practice_rounds;
create policy practice_rounds_delete_own_or_staff
on public.practice_rounds for delete
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_round_questions_select_own_or_staff on public.practice_round_questions;
create policy practice_round_questions_select_own_or_staff
on public.practice_round_questions for select
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_round_questions_insert_own on public.practice_round_questions;
create policy practice_round_questions_insert_own
on public.practice_round_questions for insert
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_round_questions_update_own_or_staff on public.practice_round_questions;
create policy practice_round_questions_update_own_or_staff
on public.practice_round_questions for update
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_round_questions_delete_own_or_staff on public.practice_round_questions;
create policy practice_round_questions_delete_own_or_staff
on public.practice_round_questions for delete
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_attempts_select_own_or_staff on public.practice_attempts;
create policy practice_attempts_select_own_or_staff
on public.practice_attempts for select
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_attempts_insert_own on public.practice_attempts;
create policy practice_attempts_insert_own
on public.practice_attempts for insert
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_attempts_update_own_or_staff on public.practice_attempts;
create policy practice_attempts_update_own_or_staff
on public.practice_attempts for update
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_attempts_delete_own_or_staff on public.practice_attempts;
create policy practice_attempts_delete_own_or_staff
on public.practice_attempts for delete
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_hint_events_own_or_staff on public.practice_hint_events;
create policy practice_hint_events_own_or_staff
on public.practice_hint_events for all
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_reflection_records_own_or_staff on public.practice_reflection_records;
create policy practice_reflection_records_own_or_staff
on public.practice_reflection_records for all
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_wrong_questions_own_or_staff on public.practice_wrong_questions;
create policy practice_wrong_questions_own_or_staff
on public.practice_wrong_questions for all
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_weakness_links_own_or_staff on public.practice_weakness_links;
create policy practice_weakness_links_own_or_staff
on public.practice_weakness_links for all
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists user_practice_preferences_own_or_staff on public.user_practice_preferences;
create policy user_practice_preferences_own_or_staff
on public.user_practice_preferences for all
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_preference_merge_jobs_own_or_staff on public.practice_preference_merge_jobs;
create policy practice_preference_merge_jobs_own_or_staff
on public.practice_preference_merge_jobs for all
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));

drop policy if exists practice_agent_episodes_own_or_staff on public.practice_agent_episodes;
create policy practice_agent_episodes_own_or_staff
on public.practice_agent_episodes for all
using (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)))
with check (user_id = auth.uid() or (organization_id is not null and private.is_org_staff(organization_id)));
