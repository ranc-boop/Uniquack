create table if not exists public.five_facet_video_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  tag_id text not null references public.five_facet_tag_nodes(tag_id) on delete restrict,
  category text not null check (category in ('curriculum', 'concept', 'method', 'task', 'form')),
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source text not null default 'manual' check (source in ('manual', 'ai_suggestion', 'batch_import', 'review_action')),
  review_status text not null default 'pending_review' check (review_status in ('pending_review', 'approved', 'rejected', 'needs_review', 'archived')),
  evidence jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  deprecated_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tag_id !~ '^difficulty(\.|$)'),
  check (tag_id !~ '^error_pattern(\.|$)')
);

comment on table public.five_facet_video_tag_assignments is
  'Official five-facet tag assignments for videos. Legacy video_tags remain compatibility-only.';

create unique index if not exists five_facet_video_tag_assignments_unique_active
  on public.five_facet_video_tag_assignments(video_id, tag_id)
  where review_status <> 'archived' and deleted_at is null;

create index if not exists five_facet_video_tag_assignments_video_idx
  on public.five_facet_video_tag_assignments(video_id, category, review_status)
  where deleted_at is null;

create index if not exists five_facet_video_tag_assignments_tag_idx
  on public.five_facet_video_tag_assignments(tag_id, review_status)
  where deleted_at is null;

drop trigger if exists five_facet_video_tag_assignments_set_updated_at
on public.five_facet_video_tag_assignments;
create trigger five_facet_video_tag_assignments_set_updated_at
before update on public.five_facet_video_tag_assignments
for each row execute function private.set_updated_at();

alter table public.five_facet_video_tag_assignments enable row level security;

grant select, insert, update, delete on table public.five_facet_video_tag_assignments
  to authenticated;

drop policy if exists five_facet_video_tag_assignments_admin_crud
on public.five_facet_video_tag_assignments;
create policy five_facet_video_tag_assignments_admin_crud
on public.five_facet_video_tag_assignments for all
using ((select private.is_admin()))
with check ((select private.is_admin()));
