create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0 and length(title) <= 160),
  goal text not null default '' check (length(goal) <= 500),
  session_memory text not null default '',
  tag_context jsonb not null default '{"confirmedTagIds":[],"usefulTags":[],"version":1}'::jsonb
    check (jsonb_typeof(tag_context) = 'object'),
  completed_question_ids uuid[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'archived')),
  preference_merged_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.practice_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  round_index int not null check (round_index > 0),
  round_goal text not null default '' check (length(round_goal) <= 500),
  review_summary text,
  next_round_goal text,
  score_correct int not null default 0 check (score_correct >= 0),
  score_total int not null default 0 check (score_total >= 0),
  mode text,
  provider_label text,
  trace jsonb not null default '[]'::jsonb check (jsonb_typeof(trace) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, round_index)
);

create table public.practice_round_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  round_id uuid not null references public.practice_rounds(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  source_question_id uuid not null,
  question_code text,
  title text not null default '',
  content_html text not null default '',
  question_type text,
  difficulty_rating int,
  position int not null check (position > 0),
  question_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(question_snapshot) = 'object'),
  reason text,
  expected_skill text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, source_question_id)
);

create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  round_id uuid not null references public.practice_rounds(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  source_question_id uuid not null,
  question_code text,
  question_title text not null default '',
  question_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(question_snapshot) = 'object'),
  answer jsonb not null default '""'::jsonb,
  hint_count int not null default 0 check (hint_count >= 0),
  hints jsonb not null default '[]'::jsonb check (jsonb_typeof(hints) = 'array'),
  grading_mode text not null default 'manual'
    check (grading_mode in ('auto', 'manual')),
  is_correct boolean,
  score numeric(6, 3) check (score is null or score >= 0),
  explanation text,
  solution_html text,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, source_question_id)
);

create table public.practice_wrong_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  source_question_id uuid not null,
  question_code text,
  question_title text not null default '',
  question_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(question_snapshot) = 'object'),
  last_session_id uuid references public.practice_sessions(id) on delete set null,
  last_round_id uuid references public.practice_rounds(id) on delete set null,
  last_attempt_id uuid references public.practice_attempts(id) on delete set null,
  miss_count int not null default 1 check (miss_count > 0),
  last_answer jsonb not null default '""'::jsonb,
  last_explanation text,
  last_missed_at timestamptz not null default now(),
  mastered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_question_id)
);

create table public.user_practice_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  long_term_preference text not null default ''
    check (length(long_term_preference) <= 1000),
  last_agent_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.practice_preference_merge_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_session_id uuid references public.practice_sessions(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  previous_preference text not null default '',
  source_session_memory text not null default '',
  result_preference text,
  error_message text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.practice_sessions is
  'User-owned persistent practice sessions for the Practice Agent.';
comment on table public.practice_attempts is
  'Full user answer, hint, and grading history for practice rounds.';
comment on table public.practice_wrong_questions is
  'User-level aggregate active and mastered wrong-question records. Question snapshots preserve display if the source question is deleted, archived, or no longer readable.';
comment on column public.user_practice_preferences.long_term_preference is
  'User-editable long-term practice preference, capped at 1000 characters.';

create index practice_sessions_user_activity_idx
  on public.practice_sessions(user_id, last_activity_at desc);
create index practice_sessions_user_status_idx
  on public.practice_sessions(user_id, status);
create index practice_rounds_session_idx
  on public.practice_rounds(session_id, round_index);
create index practice_rounds_user_idx
  on public.practice_rounds(user_id, created_at desc);
create index practice_round_questions_session_idx
  on public.practice_round_questions(session_id, position);
create index practice_attempts_user_question_idx
  on public.practice_attempts(user_id, source_question_id, created_at desc);
create index practice_attempts_session_idx
  on public.practice_attempts(session_id, created_at desc);
create index practice_wrong_questions_user_active_idx
  on public.practice_wrong_questions(user_id, mastered_at, last_missed_at desc);
create index practice_wrong_questions_source_question_idx
  on public.practice_wrong_questions(user_id, source_question_id);
create index practice_preference_merge_jobs_user_status_idx
  on public.practice_preference_merge_jobs(user_id, status, created_at);

create trigger practice_sessions_set_updated_at
before update on public.practice_sessions
for each row execute function private.set_updated_at();

create trigger practice_rounds_set_updated_at
before update on public.practice_rounds
for each row execute function private.set_updated_at();

create trigger practice_round_questions_set_updated_at
before update on public.practice_round_questions
for each row execute function private.set_updated_at();

create trigger practice_attempts_set_updated_at
before update on public.practice_attempts
for each row execute function private.set_updated_at();

create trigger practice_wrong_questions_set_updated_at
before update on public.practice_wrong_questions
for each row execute function private.set_updated_at();

create trigger user_practice_preferences_set_updated_at
before update on public.user_practice_preferences
for each row execute function private.set_updated_at();

create trigger practice_preference_merge_jobs_set_updated_at
before update on public.practice_preference_merge_jobs
for each row execute function private.set_updated_at();

alter table public.practice_sessions enable row level security;
alter table public.practice_rounds enable row level security;
alter table public.practice_round_questions enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.practice_wrong_questions enable row level security;
alter table public.user_practice_preferences enable row level security;
alter table public.practice_preference_merge_jobs enable row level security;

grant select, insert, update, delete on table
  public.practice_sessions,
  public.practice_rounds,
  public.practice_round_questions,
  public.practice_attempts,
  public.practice_wrong_questions,
  public.user_practice_preferences,
  public.practice_preference_merge_jobs
to authenticated;

create policy practice_sessions_select_own
on public.practice_sessions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_sessions_insert_own
on public.practice_sessions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy practice_sessions_update_own
on public.practice_sessions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy practice_sessions_delete_own
on public.practice_sessions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_rounds_select_own
on public.practice_rounds for select
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_rounds_insert_own
on public.practice_rounds for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy practice_rounds_update_own
on public.practice_rounds for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy practice_rounds_delete_own
on public.practice_rounds for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_round_questions_select_own
on public.practice_round_questions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_round_questions_insert_own
on public.practice_round_questions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy practice_round_questions_update_own
on public.practice_round_questions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy practice_round_questions_delete_own
on public.practice_round_questions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_attempts_select_own
on public.practice_attempts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_attempts_insert_own
on public.practice_attempts for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy practice_attempts_update_own
on public.practice_attempts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy practice_attempts_delete_own
on public.practice_attempts for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_wrong_questions_select_own
on public.practice_wrong_questions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_wrong_questions_insert_own
on public.practice_wrong_questions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy practice_wrong_questions_update_own
on public.practice_wrong_questions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy practice_wrong_questions_delete_own
on public.practice_wrong_questions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy user_practice_preferences_select_own
on public.user_practice_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

create policy user_practice_preferences_insert_own
on public.user_practice_preferences for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy user_practice_preferences_update_own
on public.user_practice_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy user_practice_preferences_delete_own
on public.user_practice_preferences for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_preference_merge_jobs_select_own
on public.practice_preference_merge_jobs for select
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_preference_merge_jobs_insert_own
on public.practice_preference_merge_jobs for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy practice_preference_merge_jobs_update_own
on public.practice_preference_merge_jobs for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy practice_preference_merge_jobs_delete_own
on public.practice_preference_merge_jobs for delete
to authenticated
using ((select auth.uid()) = user_id);
