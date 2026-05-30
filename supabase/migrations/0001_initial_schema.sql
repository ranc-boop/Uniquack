create extension if not exists pgcrypto;

create schema if not exists private;
comment on schema private is 'Internal schema. Do not add this schema to Supabase API exposed schemas.';

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (length(btrim(username)) > 0),
  email text unique,
  full_name text,
  avatar_url text,
  role text not null default 'student'
    check (role in ('super_admin', 'admin', 'student')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.tags(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  slug text not null check (length(btrim(slug)) > 0),
  description text,
  tag_type text not null default 'knowledge'
    check (tag_type in ('knowledge', 'attribute')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id),
  constraint tags_attribute_must_be_root
    check (tag_type = 'knowledge' or (tag_type = 'attribute' and parent_id is null))
);

create unique index tags_root_slug_unique
  on public.tags(slug)
  where parent_id is null;

create unique index tags_sibling_slug_unique
  on public.tags(parent_id, slug)
  where parent_id is not null;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  question_code text not null unique check (length(btrim(question_code)) > 0),
  title text not null check (length(btrim(title)) > 0),
  content_html text not null,
  solution_html text,
  options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array'),
  question_type text not null default 'frq'
    check (question_type in ('mcq', 'frq', 'mixed')),
  difficulty_rating int not null
    check (difficulty_rating between 0 and 1000),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  source text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.questions.content_html is
  'Tiptap HTML. Sanitize through src/lib/sanitize/html.ts before saving/rendering; dangerouslySetInnerHTML must only receive sanitized HTML.';

comment on column public.questions.solution_html is
  'Tiptap HTML. Sanitize through src/lib/sanitize/html.ts before saving/rendering.';

create table public.question_tags (
  question_id uuid not null references public.questions(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (question_id, tag_id)
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.questions(id) on delete cascade,
  title text,
  video_url text not null check (length(btrim(video_url)) > 0),
  embed_url text not null check (length(btrim(embed_url)) > 0),
  thumbnail_url text,
  provider text,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.video_tags (
  video_id uuid not null references public.videos(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (video_id, tag_id)
);

create table public.question_rubric_steps (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  step_order int not null check (step_order > 0),
  content_html text not null,
  max_points numeric(6, 2) not null default 0 check (max_points >= 0),
  linked_tag_id uuid references public.tags(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, step_order)
);

comment on column public.question_rubric_steps.content_html is
  'Tiptap HTML. Sanitize through src/lib/sanitize/html.ts before saving/rendering; dangerouslySetInnerHTML must only receive sanitized HTML.';

create table public.user_question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  step_id uuid references public.question_rubric_steps(id) on delete set null,
  submitted_answer_html text,
  error_type text check (
    error_type is null or error_type in (
      'conceptual_error',
      'calculation_error',
      'format_error',
      'incomplete_reasoning',
      'other'
    )
  ),
  is_correct boolean,
  score numeric(6, 2) check (score is null or score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_question_attempts is
  'Phase 2 table. MVP does not allow student insert/update through RLS.';

comment on column public.user_question_attempts.submitted_answer_html is
  'Phase 2 answer HTML. Sanitize before saving/rendering.';

create index tags_parent_id_idx on public.tags(parent_id);
create index tags_status_idx on public.tags(status);
create index questions_status_difficulty_idx on public.questions(status, difficulty_rating);
create index question_tags_tag_id_idx on public.question_tags(tag_id);
create index videos_status_question_id_idx on public.videos(status, question_id);
create index video_tags_tag_id_idx on public.video_tags(tag_id);
create index rubric_steps_question_id_idx on public.question_rubric_steps(question_id);
create index attempts_user_question_idx on public.user_question_attempts(user_id, question_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger tags_set_updated_at
before update on public.tags
for each row execute function private.set_updated_at();

create trigger questions_set_updated_at
before update on public.questions
for each row execute function private.set_updated_at();

create trigger question_tags_set_updated_at
before update on public.question_tags
for each row execute function private.set_updated_at();

create trigger videos_set_updated_at
before update on public.videos
for each row execute function private.set_updated_at();

create trigger video_tags_set_updated_at
before update on public.video_tags
for each row execute function private.set_updated_at();

create trigger rubric_steps_set_updated_at
before update on public.question_rubric_steps
for each row execute function private.set_updated_at();

create trigger attempts_set_updated_at
before update on public.user_question_attempts
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, email, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    'student'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_user_role()) in ('admin', 'super_admin'), false);
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_user_role()) = 'super_admin', false);
$$;

alter table public.profiles enable row level security;
alter table public.tags enable row level security;
alter table public.questions enable row level security;
alter table public.question_tags enable row level security;
alter table public.videos enable row level security;
alter table public.video_tags enable row level security;
alter table public.question_rubric_steps enable row level security;
alter table public.user_question_attempts enable row level security;

grant usage on schema public to anon, authenticated;

grant select on table
  public.tags,
  public.questions,
  public.question_tags,
  public.videos,
  public.video_tags,
  public.question_rubric_steps
to anon;

grant select, insert, update, delete on table
  public.profiles,
  public.tags,
  public.questions,
  public.question_tags,
  public.videos,
  public.video_tags,
  public.question_rubric_steps,
  public.user_question_attempts
to authenticated;

create policy profiles_read_own
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_super_admin_read_all
on public.profiles for select
to authenticated
using ((select private.is_super_admin()));

create policy profiles_insert_own_student
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()) and role = 'student');

create policy profiles_update_own_without_role_change
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (
  id = (select auth.uid())
  and role = (select private.current_user_role())
);

create policy profiles_super_admin_manage
on public.profiles for all
to authenticated
using ((select private.is_super_admin()))
with check ((select private.is_super_admin()));

create policy tags_public_read_published
on public.tags for select
to anon, authenticated
using (status = 'published');

create policy tags_admin_crud
on public.tags for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy questions_public_read_published
on public.questions for select
to anon, authenticated
using (status = 'published');

create policy questions_admin_crud
on public.questions for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy question_tags_public_read_published
on public.question_tags for select
to anon, authenticated
using (
  exists (
    select 1
    from public.questions q
    where q.id = question_id
      and q.status = 'published'
  )
  and exists (
    select 1
    from public.tags t
    where t.id = tag_id
      and t.status = 'published'
  )
);

create policy question_tags_admin_crud
on public.question_tags for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy videos_public_read_published
on public.videos for select
to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.questions q
    where q.id = question_id
      and q.status = 'published'
  )
);

create policy videos_admin_crud
on public.videos for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy video_tags_public_read_published
on public.video_tags for select
to anon, authenticated
using (
  exists (
    select 1
    from public.videos v
    join public.questions q on q.id = v.question_id
    where v.id = video_id
      and v.status = 'published'
      and q.status = 'published'
  )
  and exists (
    select 1
    from public.tags t
    where t.id = tag_id
      and t.status = 'published'
  )
);

create policy video_tags_admin_crud
on public.video_tags for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy rubric_public_read_published
on public.question_rubric_steps for select
to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.questions q
    where q.id = question_id
      and q.status = 'published'
  )
);

create policy rubric_admin_crud
on public.question_rubric_steps for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy attempts_admin_manage
on public.user_question_attempts for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- Phase 2 only:
-- create policy attempts_student_insert_own ...
-- create policy attempts_student_update_own ...
