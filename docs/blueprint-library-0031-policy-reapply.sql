-- Blueprint Library 0031 post-apply policy correction.
-- Use only if migration 0031 and the grant correction were already applied but
-- live smoke still fails while a real teacher inserts question_blueprint_folders.
-- This file only replaces Blueprint Library helper functions and insert policies.
-- It does not create, update, or delete application data.

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

grant execute on function private.can_use_question_blueprint_library() to authenticated;
grant execute on function private.can_admin_question_blueprint_library() to authenticated;
grant execute on function private.can_read_question_blueprint(uuid) to authenticated;
grant execute on function private.can_manage_question_blueprint(uuid) to authenticated;
grant execute on function private.can_read_question_blueprint_folder(uuid) to authenticated;
grant execute on function private.can_manage_question_blueprint_folder(uuid) to authenticated;
