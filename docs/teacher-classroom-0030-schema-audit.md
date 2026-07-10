# Teacher Classroom RPC Schema Audit

## Scope

This audit anchors `public.create_teacher_classroom(...)` to the clean classroom schema before another manual Supabase reapply.

Schema sources inspected:

- `supabase/clean-migrations/0018_classroom_foundation.sql`
- `supabase/clean-migrations/0019_classroom_join_code_display_and_roster_removal.sql`
- `supabase/clean-migrations/0020_classroom_removed_member_rejoin_block.sql`
- `supabase/clean-migrations/0030_teacher_classroom_rls_fix.sql`

## Actual Tables

`public.classrooms` columns:

- `id`
- `organization_id`
- `owner_id`
- `name`
- `description`
- `subject`
- `status`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

`public.classroom_members` columns:

- `id`
- `classroom_id`
- `user_id`
- `role`
- `status`
- `joined_at`
- `created_at`
- `updated_at`

`public.classroom_members` does not have:

- `created_by`
- `updated_by`
- `removed_at`

`public.classroom_members` constraints:

- primary key on `id`
- foreign key `classroom_id` to `public.classrooms(id)`
- foreign key `user_id` to `auth.users(id)`
- role check: `teacher`, `co_teacher`, `student`
- status check: `active`, `invited`, `removed`
- unique `(classroom_id, user_id)`, expected PostgreSQL name: `classroom_members_classroom_id_user_id_key`

`public.classroom_join_codes` columns after migration 0019:

- `id`
- `classroom_id`
- `code_hash`
- `code_hint`
- `status`
- `expires_at`
- `created_by`
- `created_at`
- `updated_at`
- `display_code`

`public.classroom_join_codes` constraints:

- primary key on `id`
- foreign key `classroom_id` to `public.classrooms(id)`
- unique `code_hash`
- check `length(code_hash) = 64`
- status check: `active`, `revoked`, `expired`
- display-code format check `classroom_join_codes_display_code_format`

## Removed Bad References

The previous remote function bodies failed because they referenced clean-schema mismatches or ambiguous names:

- Removed `classroom_members.created_by`; the table does not have that column.
- Removed `classroom_members.removed_at`; the table does not have that column.
- Avoided `on conflict (classroom_id, user_id)` because the output return field `classroom_id` is visible inside PL/pgSQL and made the conflict target ambiguous.

## Final RPC Shape

The final RPC in `docs/teacher-classroom-0030-create-function-reapply.sql` is schema-anchored because it:

- uses `v_` internal variables, including `v_created_classroom_id`, `v_display_code`, `v_code_hash`, and `v_join_code_id`;
- inserts into `classrooms` using real columns only;
- inserts/upserts `classroom_members` using real columns only: `classroom_id`, `user_id`, `role`, `status`, `joined_at`, and `updated_at` on conflict;
- uses `on conflict on constraint classroom_members_classroom_id_user_id_key`;
- inserts `classroom_join_codes` using real columns only, including `display_code`;
- stores only the hash and display copy of the join code, not a raw validation code column.

## Manual Reapply File

Run only this file in the clean Supabase SQL Editor:

```text
docs/teacher-classroom-0030-create-function-reapply.sql
```

Do not rerun the full 0030 migration unless explicitly needed later.
