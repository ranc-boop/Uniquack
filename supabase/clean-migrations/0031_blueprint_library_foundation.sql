-- Blueprint Library Foundation
-- Extends the existing question_blueprints tables into teacher-owned library assets
-- and adds safe bank-to-blueprint linkage. No provider calls or question generation.

alter table public.question_blueprints
  add column if not exists description text
    check (description is null or length(description) <= 2000),
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'organization', 'public')),
  add column if not exists blueprint_kind text not null default 'manual'
    check (blueprint_kind in ('manual', 'bank_generated', 'imported', 'course_builder')),
  add column if not exists source_bank_id uuid references public.question_banks(id) on delete set null,
  add column if not exists source_kind text,
  add column if not exists source_record_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.question_blueprint_folders
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'organization', 'public')),
  add column if not exists status text not null default 'active'
    check (status in ('active', 'archived'));

create table if not exists public.bank_blueprints (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  blueprint_id uuid not null references public.question_blueprints(id) on delete cascade,
  relation_kind text not null default 'linked'
    check (relation_kind in ('linked', 'generated_from_bank', 'imported_to_bank')),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  added_by uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (bank_id, blueprint_id)
);

create index if not exists question_blueprints_visibility_status_idx
  on public.question_blueprints(organization_id, visibility, status, updated_at desc)
  where deleted_at is null;

create index if not exists question_blueprints_source_bank_idx
  on public.question_blueprints(source_bank_id, updated_at desc)
  where deleted_at is null;

create index if not exists question_blueprint_folders_library_idx
  on public.question_blueprint_folders(organization_id, visibility, status, sort_order, name)
  where deleted_at is null;

create index if not exists bank_blueprints_bank_status_idx
  on public.bank_blueprints(bank_id, status, added_at desc);

create index if not exists bank_blueprints_blueprint_idx
  on public.bank_blueprints(blueprint_id, status);

create or replace function private.can_use_question_blueprint_library()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.role in ('teacher', 'admin', 'super_admin')
  );
$$;

create or replace function private.can_admin_question_blueprint_library()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.role in ('admin', 'super_admin')
  );
$$;

create or replace function private.can_read_question_blueprint(p_blueprint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.question_blueprints blueprint
    where blueprint.id = p_blueprint_id
      and blueprint.deleted_at is null
      and (
        private.is_super_admin()
        or blueprint.owner_id = auth.uid()
        or blueprint.created_by = auth.uid()
        or (
          blueprint.owner_scope = 'system'
          and private.can_use_question_blueprint_library()
        )
        or (
          blueprint.visibility in ('shared', 'organization')
          and blueprint.organization_id is not null
          and private.is_org_staff(blueprint.organization_id)
        )
        or (
          blueprint.visibility = 'public'
          and private.can_use_question_blueprint_library()
        )
        or (
          blueprint.source_bank_id is not null
          and private.can_read_question_bank(blueprint.source_bank_id)
        )
      )
  );
$$;

create or replace function private.can_manage_question_blueprint(p_blueprint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.question_blueprints blueprint
    where blueprint.id = p_blueprint_id
      and blueprint.deleted_at is null
      and (
        private.can_admin_question_blueprint_library()
        or blueprint.owner_id = auth.uid()
        or blueprint.created_by = auth.uid()
        or (
          blueprint.source_bank_id is not null
          and private.can_manage_question_bank(blueprint.source_bank_id)
        )
      )
  );
$$;

create or replace function private.can_read_question_blueprint_folder(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.question_blueprint_folders folder
    where folder.id = p_folder_id
      and folder.deleted_at is null
      and (
        private.can_admin_question_blueprint_library()
        or folder.owner_id = auth.uid()
        or folder.created_by = auth.uid()
        or (
          folder.visibility in ('shared', 'organization')
          and folder.organization_id is not null
          and private.is_org_staff(folder.organization_id)
        )
        or (
          folder.visibility = 'public'
          and private.can_use_question_blueprint_library()
        )
      )
  );
$$;

create or replace function private.can_manage_question_blueprint_folder(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.question_blueprint_folders folder
    where folder.id = p_folder_id
      and folder.deleted_at is null
      and (
        private.can_admin_question_blueprint_library()
        or folder.owner_id = auth.uid()
        or folder.created_by = auth.uid()
      )
  );
$$;

alter table public.bank_blueprints enable row level security;

drop policy if exists question_blueprints_staff_read on public.question_blueprints;
drop policy if exists question_blueprints_staff_write on public.question_blueprints;
drop policy if exists question_blueprints_library_read on public.question_blueprints;
create policy question_blueprints_library_read
on public.question_blueprints for select
using (private.can_read_question_blueprint(id));

drop policy if exists question_blueprints_library_insert on public.question_blueprints;
create policy question_blueprints_library_insert
on public.question_blueprints for insert
with check (
  private.can_use_question_blueprint_library()
  and (
    private.can_admin_question_blueprint_library()
    or owner_id = auth.uid()
    or created_by = auth.uid()
    or (
      source_bank_id is not null
      and private.can_manage_question_bank(source_bank_id)
    )
  )
);

drop policy if exists question_blueprints_library_update on public.question_blueprints;
create policy question_blueprints_library_update
on public.question_blueprints for update
using (private.can_manage_question_blueprint(id))
with check (private.can_manage_question_blueprint(id));

drop policy if exists question_blueprints_library_delete on public.question_blueprints;
create policy question_blueprints_library_delete
on public.question_blueprints for delete
using (private.is_super_admin());

drop policy if exists question_blueprint_folders_staff_read on public.question_blueprint_folders;
drop policy if exists question_blueprint_folders_staff_write on public.question_blueprint_folders;
drop policy if exists question_blueprint_folders_library_read on public.question_blueprint_folders;
create policy question_blueprint_folders_library_read
on public.question_blueprint_folders for select
using (private.can_read_question_blueprint_folder(id));

drop policy if exists question_blueprint_folders_library_insert on public.question_blueprint_folders;
create policy question_blueprint_folders_library_insert
on public.question_blueprint_folders for insert
with check (
  private.can_use_question_blueprint_library()
  and (
    private.can_admin_question_blueprint_library()
    or owner_id = auth.uid()
    or created_by = auth.uid()
  )
);

drop policy if exists question_blueprint_folders_library_update on public.question_blueprint_folders;
create policy question_blueprint_folders_library_update
on public.question_blueprint_folders for update
using (private.can_manage_question_blueprint_folder(id))
with check (private.can_manage_question_blueprint_folder(id));

drop policy if exists question_blueprint_folders_library_delete on public.question_blueprint_folders;
create policy question_blueprint_folders_library_delete
on public.question_blueprint_folders for delete
using (private.is_super_admin());

drop policy if exists bank_blueprints_member_read on public.bank_blueprints;
create policy bank_blueprints_member_read
on public.bank_blueprints for select
using (
  status = 'active'
  and private.can_read_question_bank(bank_id)
  and private.can_read_question_blueprint(blueprint_id)
);

drop policy if exists bank_blueprints_member_insert on public.bank_blueprints;
create policy bank_blueprints_member_insert
on public.bank_blueprints for insert
with check (
  private.can_manage_question_bank(bank_id)
  and private.can_manage_question_blueprint(blueprint_id)
  and added_by = auth.uid()
);

drop policy if exists bank_blueprints_member_update on public.bank_blueprints;
create policy bank_blueprints_member_update
on public.bank_blueprints for update
using (
  private.can_manage_question_bank(bank_id)
  and private.can_manage_question_blueprint(blueprint_id)
)
with check (
  private.can_manage_question_bank(bank_id)
  and private.can_manage_question_blueprint(blueprint_id)
);

drop policy if exists bank_blueprints_member_delete on public.bank_blueprints;
create policy bank_blueprints_member_delete
on public.bank_blueprints for delete
using (
  private.can_manage_question_bank(bank_id)
  and private.can_manage_question_blueprint(blueprint_id)
);

drop policy if exists question_blueprint_examples_staff_access on public.question_blueprint_examples;
create policy question_blueprint_examples_staff_access
on public.question_blueprint_examples for all
using (private.can_read_question_blueprint(blueprint_id))
with check (private.can_manage_question_blueprint(blueprint_id));

drop policy if exists question_blueprint_versions_staff_read on public.question_blueprint_versions;
create policy question_blueprint_versions_staff_read
on public.question_blueprint_versions for select
using (private.can_read_question_blueprint(blueprint_id));

drop policy if exists question_blueprint_versions_staff_insert on public.question_blueprint_versions;
create policy question_blueprint_versions_staff_insert
on public.question_blueprint_versions for insert
with check (private.can_manage_question_blueprint(blueprint_id));

drop policy if exists question_blueprint_calibration_runs_staff_access on public.question_blueprint_calibration_runs;
create policy question_blueprint_calibration_runs_staff_access
on public.question_blueprint_calibration_runs for all
using (private.can_read_question_blueprint(blueprint_id))
with check (private.can_manage_question_blueprint(blueprint_id));

grant select, insert, update, delete on public.question_blueprints to authenticated;
grant select, insert, update, delete on public.question_blueprint_folders to authenticated;
grant select, insert, update, delete on public.question_blueprint_examples to authenticated;
grant select, insert on public.question_blueprint_versions to authenticated;
grant select, insert, update, delete on public.question_blueprint_calibration_runs to authenticated;
grant select, insert, update, delete on public.bank_blueprints to authenticated;
grant execute on function private.can_use_question_blueprint_library() to authenticated;
grant execute on function private.can_admin_question_blueprint_library() to authenticated;
grant execute on function private.can_read_question_blueprint(uuid) to authenticated;
grant execute on function private.can_manage_question_blueprint(uuid) to authenticated;
grant execute on function private.can_read_question_blueprint_folder(uuid) to authenticated;
grant execute on function private.can_manage_question_blueprint_folder(uuid) to authenticated;
