-- Question Blueprint folder organization.
-- Folders are soft-deleted; blueprints keep folder_id for lineage and can be
-- viewed from All blueprints even when a folder is archived.

begin;

create table if not exists public.question_blueprint_folders (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null default 'system'
    check (owner_scope in ('system', 'school', 'teacher', 'private')),
  owner_id uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.question_blueprint_folders(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null check (length(btrim(slug)) between 1 and 140),
  description text check (description is null or length(description) <= 500),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (parent_id is null or parent_id <> id)
);

alter table public.question_blueprints
  add column if not exists folder_id uuid references public.question_blueprint_folders(id) on delete set null;

create index if not exists question_blueprint_folders_parent_idx
  on public.question_blueprint_folders(parent_id, sort_order, name)
  where deleted_at is null;

create index if not exists question_blueprint_folders_scope_slug_idx
  on public.question_blueprint_folders(owner_scope, owner_id, slug)
  where deleted_at is null;

create index if not exists question_blueprints_folder_idx
  on public.question_blueprints(folder_id, status, updated_at desc)
  where deleted_at is null;

drop trigger if exists question_blueprint_folders_set_updated_at on public.question_blueprint_folders;
create trigger question_blueprint_folders_set_updated_at
before update on public.question_blueprint_folders
for each row execute function private.set_updated_at();

alter table public.question_blueprint_folders enable row level security;

grant select, insert, update, delete on table
  public.question_blueprint_folders
to authenticated;

drop policy if exists question_blueprint_folders_admin_crud on public.question_blueprint_folders;
create policy question_blueprint_folders_admin_crud
on public.question_blueprint_folders for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

comment on table public.question_blueprint_folders is
  'Admin-managed soft-deletable folder tree for organizing approved question blueprints. Deleting a folder does not delete blueprints.';
comment on column public.question_blueprints.folder_id is
  'Optional folder assignment for organizing approved blueprints. Folder soft delete preserves this value for lineage.';

commit;
