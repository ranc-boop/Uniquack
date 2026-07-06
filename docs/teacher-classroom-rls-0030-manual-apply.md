# Manual Apply: Teacher Classroom RLS Fix 0030

Migration:

```text
supabase/clean-migrations/0030_teacher_classroom_rls_fix.sql
```

Apply this migration to the clean Supabase project through the Dashboard SQL Editor if live teacher classroom creation reports:

```text
SKIP teacher workspace live smoke: migration 0030 is not applied remotely.
```

The migration:

- updates `private.is_org_staff` so active teacher/admin/super-admin profiles with a matching `default_organization_id` are valid organization staff;
- keeps `classrooms_teacher_create` and `classrooms_teacher_update` scoped through `private.is_org_staff`;
- adds authenticated-only `public.create_teacher_classroom(...)`;
- creates the classroom, teacher owner membership, and persistent display join code in one transaction;
- does not grant anonymous classroom creation;
- does not touch old Supabase migrations, provider settings, AI parsing, Review Draft publishing, or assignments.

After applying, rerun:

```powershell
node scripts/teacher-workspace-shell-smoke.mjs
node scripts/supabase-rls-smoke.mjs
npm.cmd run smoke
```
