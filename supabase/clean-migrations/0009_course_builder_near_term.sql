-- Clean Supabase MVP v1 draft migration.
-- Near-term teacher Course Builder runs, framework previews, and videos.
-- Draft only: review before applying to any database.

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  question_id uuid not null unique references public.questions(id) on delete cascade,
  title text,
  video_url text not null check (length(btrim(video_url)) > 0),
  embed_url text not null check (length(btrim(embed_url)) > 0),
  thumbnail_url text,
  provider text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.videos is
  'Video records bind approved video explanations to published questions. Taxonomy comes from the bound question assignments.';

create table if not exists public.practice_course_frameworks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0 and length(title) <= 160),
  description text not null default '' check (length(description) <= 1000),
  framework_prompt text not null default 'Teacher-guided practice framework'
    check (length(btrim(framework_prompt)) > 0 and length(framework_prompt) <= 12000),
  learning_path jsonb not null default '[]'::jsonb check (jsonb_typeof(learning_path) = 'array'),
  allowed_tag_ids text[] not null default '{}'::text[],
  priority_rules text not null default '' check (length(priority_rules) <= 4000),
  status text not null default 'active'
    check (status in ('active', 'draft', 'preview', 'published', 'archived')),
  framework_payload jsonb not null default '{}'::jsonb,
  assigned_question_ids uuid[] not null default '{}'::uuid[],
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  teacher_id uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.practice_sessions
  add column if not exists course_framework_id uuid references public.practice_course_frameworks(id) on delete set null,
  add column if not exists course_framework_snapshot jsonb check (
    course_framework_snapshot is null or jsonb_typeof(course_framework_snapshot) = 'object'
  );

create table if not exists public.course_generation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'sources_ready', 'analyzing', 'content_ready', 'course_ready', 'preview_ready', 'published', 'report_ready', 'follow_up_ready', 'failed', 'archived')),
  generation_mode text not null default 'simulation'
    check (generation_mode in ('simulation', 'live_ai')),
  source_bundle jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_bundle) = 'object'),
  public_question_ids uuid[] not null default '{}'::uuid[],
  course_material_question_ids uuid[] not null default '{}'::uuid[],
  exam_style_question_ids uuid[] not null default '{}'::uuid[],
  generated_question_ids uuid[] not null default '{}'::uuid[],
  blueprint_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(blueprint_summary) = 'object'),
  teacher_prompt text not null default '',
  framework_id uuid references public.practice_course_frameworks(id) on delete set null,
  follow_up_framework_id uuid references public.practice_course_frameworks(id) on delete set null,
  report_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(report_snapshot) = 'object'),
  review_batch_id uuid references public.review_batches(id) on delete set null,
  source_import_batch_id uuid references public.import_batches(id) on delete set null,
  provider_operation_log_id uuid references public.ai_provider_operation_logs(id) on delete set null,
  error_message text check (error_message is null or length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.course_plan_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  course_generation_run_id uuid references public.course_generation_runs(id) on delete cascade,
  practice_course_framework_id uuid references public.practice_course_frameworks(id) on delete cascade,
  source_kind text not null
    check (source_kind in ('import_job', 'import_batch', 'review_batch', 'question', 'blueprint', 'practice_session', 'practice_weakness')),
  source_record_id uuid not null,
  evidence_role text not null default 'supporting'
    check (evidence_role in ('primary', 'supporting', 'generated_from', 'practice_evidence')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace view public.course_builder_runs as
select *
from public.course_generation_runs;

comment on table public.course_generation_runs is
  'Current app-facing teacher-owned course generation runs. Full course unit/module hierarchy is intentionally deferred.';

comment on view public.course_builder_runs is
  'Compatibility view for clean naming. Current runtime writes to course_generation_runs.';

create index if not exists videos_status_question_id_idx
  on public.videos(status, question_id);

create index if not exists practice_course_frameworks_status_idx
  on public.practice_course_frameworks(status, updated_at desc)
  where deleted_at is null;

create index if not exists practice_sessions_course_framework_idx
  on public.practice_sessions(course_framework_id);

create index if not exists course_generation_runs_teacher_updated_idx
  on public.course_generation_runs(teacher_id, updated_at desc);

create index if not exists course_generation_runs_framework_idx
  on public.course_generation_runs(framework_id)
  where framework_id is not null;

create index if not exists course_plan_sources_run_idx
  on public.course_plan_sources(course_generation_run_id, source_kind);

drop trigger if exists videos_set_updated_at on public.videos;
create trigger videos_set_updated_at
before update on public.videos
for each row execute function private.set_updated_at();

drop trigger if exists practice_course_frameworks_set_updated_at on public.practice_course_frameworks;
create trigger practice_course_frameworks_set_updated_at
before update on public.practice_course_frameworks
for each row execute function private.set_updated_at();

drop trigger if exists course_generation_runs_set_updated_at on public.course_generation_runs;
create trigger course_generation_runs_set_updated_at
before update on public.course_generation_runs
for each row execute function private.set_updated_at();

alter table public.videos enable row level security;
alter table public.practice_course_frameworks enable row level security;
alter table public.course_generation_runs enable row level security;
alter table public.course_plan_sources enable row level security;

drop policy if exists videos_public_read_published on public.videos;
create policy videos_public_read_published
on public.videos for select
using (status = 'published');

drop policy if exists videos_staff_manage on public.videos;
create policy videos_staff_manage
on public.videos for all
using (
  private.is_admin()
  or (organization_id is not null and private.is_org_staff(organization_id))
)
with check (
  private.is_admin()
  or (organization_id is not null and private.is_org_staff(organization_id))
);

drop policy if exists practice_course_frameworks_select_active_or_staff on public.practice_course_frameworks;
create policy practice_course_frameworks_select_active_or_staff
on public.practice_course_frameworks for select
using (
  status in ('active', 'published')
  or created_by = auth.uid()
  or teacher_id = auth.uid()
  or (organization_id is not null and private.is_org_staff(organization_id))
  or private.is_admin()
);

drop policy if exists practice_course_frameworks_teacher_insert on public.practice_course_frameworks;
create policy practice_course_frameworks_teacher_insert
on public.practice_course_frameworks for insert
with check (
  (created_by = auth.uid() or teacher_id = auth.uid())
  and private.is_teacher_or_admin()
);

drop policy if exists practice_course_frameworks_teacher_update on public.practice_course_frameworks;
create policy practice_course_frameworks_teacher_update
on public.practice_course_frameworks for update
using (
  created_by = auth.uid()
  or teacher_id = auth.uid()
  or (organization_id is not null and private.is_org_staff(organization_id))
  or private.is_admin()
)
with check (
  created_by = auth.uid()
  or teacher_id = auth.uid()
  or (organization_id is not null and private.is_org_staff(organization_id))
  or private.is_admin()
);

drop policy if exists practice_course_frameworks_staff_delete on public.practice_course_frameworks;
create policy practice_course_frameworks_staff_delete
on public.practice_course_frameworks for delete
using (
  created_by = auth.uid()
  or teacher_id = auth.uid()
  or private.is_admin()
);

drop policy if exists course_generation_runs_select_own_or_staff on public.course_generation_runs;
create policy course_generation_runs_select_own_or_staff
on public.course_generation_runs for select
using (
  teacher_id = auth.uid()
  or (organization_id is not null and private.is_org_staff(organization_id))
  or private.is_admin()
);

drop policy if exists course_generation_runs_insert_teacher on public.course_generation_runs;
create policy course_generation_runs_insert_teacher
on public.course_generation_runs for insert
with check (
  teacher_id = auth.uid()
  and private.is_teacher_or_admin()
);

drop policy if exists course_generation_runs_update_own_or_staff on public.course_generation_runs;
create policy course_generation_runs_update_own_or_staff
on public.course_generation_runs for update
using (
  teacher_id = auth.uid()
  or (organization_id is not null and private.is_org_staff(organization_id))
  or private.is_admin()
)
with check (
  teacher_id = auth.uid()
  or (organization_id is not null and private.is_org_staff(organization_id))
  or private.is_admin()
);

drop policy if exists course_generation_runs_delete_own_or_staff on public.course_generation_runs;
create policy course_generation_runs_delete_own_or_staff
on public.course_generation_runs for delete
using (
  teacher_id = auth.uid()
  or (organization_id is not null and private.is_org_staff(organization_id))
  or private.is_admin()
);

drop policy if exists course_plan_sources_staff_access on public.course_plan_sources;
create policy course_plan_sources_staff_access
on public.course_plan_sources for all
using (
  private.is_admin()
  or (organization_id is not null and private.is_org_staff(organization_id))
)
with check (
  private.is_admin()
  or (organization_id is not null and private.is_org_staff(organization_id))
);

drop policy if exists practice_sessions_teacher_select_course on public.practice_sessions;
create policy practice_sessions_teacher_select_course
on public.practice_sessions for select
using (
  exists (
    select 1
    from public.practice_course_frameworks framework
    where framework.id = practice_sessions.course_framework_id
      and (
        framework.created_by = auth.uid()
        or framework.teacher_id = auth.uid()
        or private.is_admin()
      )
  )
);

drop policy if exists practice_agent_episodes_teacher_select_course on public.practice_agent_episodes;
create policy practice_agent_episodes_teacher_select_course
on public.practice_agent_episodes for select
using (
  exists (
    select 1
    from public.practice_sessions session
    join public.practice_course_frameworks framework
      on framework.id = session.course_framework_id
    where session.id = practice_agent_episodes.session_id
      and (
        framework.created_by = auth.uid()
        or framework.teacher_id = auth.uid()
        or private.is_admin()
      )
  )
);
