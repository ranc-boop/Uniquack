create table public.practice_course_frameworks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0 and length(title) <= 160),
  description text not null default '' check (length(description) <= 1000),
  framework_prompt text not null check (length(btrim(framework_prompt)) > 0 and length(framework_prompt) <= 12000),
  learning_path jsonb not null default '[]'::jsonb check (jsonb_typeof(learning_path) = 'array'),
  allowed_tag_ids text[] not null default '{}',
  priority_rules text not null default '' check (length(priority_rules) <= 4000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practice_sessions
  add column course_framework_id uuid references public.practice_course_frameworks(id) on delete set null,
  add column course_framework_snapshot jsonb check (
    course_framework_snapshot is null or jsonb_typeof(course_framework_snapshot) = 'object'
  );

create table public.practice_agent_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  round_id uuid references public.practice_rounds(id) on delete cascade,
  episode_index int not null default 1 check (episode_index > 0),
  recommend_context jsonb not null default '{}'::jsonb check (jsonb_typeof(recommend_context) = 'object'),
  tool_trace_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_trace_summary) = 'array'),
  student_attempt_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(student_attempt_summary) = 'array'),
  review_diagnosis jsonb not null default '{}'::jsonb check (jsonb_typeof(review_diagnosis) = 'object'),
  memory_update text not null default '' check (length(memory_update) <= 4000),
  llm_usage jsonb not null default '[]'::jsonb check (jsonb_typeof(llm_usage) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id)
);

comment on table public.practice_agent_episodes is
  'Per-round main-thread evidence chain: recommendation context, tool trace, student attempt, review diagnosis, memory update, and provider usage.';
comment on table public.practice_course_frameworks is
  'Teacher/admin-authored course frameworks that can constrain practice session direction without disabling personalization.';

create index practice_course_frameworks_status_idx
  on public.practice_course_frameworks(status, updated_at desc);
create index practice_sessions_course_framework_idx
  on public.practice_sessions(course_framework_id);
create index practice_agent_episodes_session_idx
  on public.practice_agent_episodes(session_id, episode_index);
create index practice_agent_episodes_user_idx
  on public.practice_agent_episodes(user_id, created_at desc);

create trigger practice_course_frameworks_set_updated_at
before update on public.practice_course_frameworks
for each row execute function private.set_updated_at();

create trigger practice_agent_episodes_set_updated_at
before update on public.practice_agent_episodes
for each row execute function private.set_updated_at();

alter table public.practice_course_frameworks enable row level security;
alter table public.practice_agent_episodes enable row level security;

grant select, insert, update, delete on table
  public.practice_course_frameworks,
  public.practice_agent_episodes
to authenticated;

create policy practice_course_frameworks_select_active_or_admin
on public.practice_course_frameworks for select
to authenticated
using (
  status = 'active'
  or exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'super_admin')
  )
);

create policy practice_course_frameworks_insert_admin
on public.practice_course_frameworks for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'super_admin')
  )
);

create policy practice_course_frameworks_update_admin
on public.practice_course_frameworks for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'super_admin')
  )
);

create policy practice_course_frameworks_delete_admin
on public.practice_course_frameworks for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'super_admin')
  )
);

create policy practice_agent_episodes_select_own
on public.practice_agent_episodes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy practice_agent_episodes_insert_own
on public.practice_agent_episodes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy practice_agent_episodes_update_own
on public.practice_agent_episodes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy practice_agent_episodes_delete_own
on public.practice_agent_episodes for delete
to authenticated
using ((select auth.uid()) = user_id);
