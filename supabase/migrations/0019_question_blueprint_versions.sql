-- Question Blueprint edit/version history.
-- Version snapshots preserve blueprint lineage before meaningful admin edits.

begin;

create table if not exists public.question_blueprint_versions (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.question_blueprints(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  change_reason text not null check (length(btrim(change_reason)) between 1 and 800),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists question_blueprint_versions_blueprint_version_idx
  on public.question_blueprint_versions(blueprint_id, version);

create index if not exists question_blueprint_versions_blueprint_created_idx
  on public.question_blueprint_versions(blueprint_id, created_at desc);

alter table public.question_blueprint_versions enable row level security;

grant select, insert, update, delete on table
  public.question_blueprint_versions
to authenticated;

drop policy if exists question_blueprint_versions_admin_crud on public.question_blueprint_versions;
create policy question_blueprint_versions_admin_crud
on public.question_blueprint_versions for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

comment on table public.question_blueprint_versions is
  'Admin-only immutable-style snapshots created before meaningful blueprint edits, split, merge, or replacement actions.';

commit;
