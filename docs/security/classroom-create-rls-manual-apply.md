# P0-CLS-01 Manual Apply: Classroom Creation RLS Hardening

## Scope

Apply exactly one forward-only file to the **clean Supabase project**:

```text
supabase/clean-migrations/0043_classroom_creation_rls_hardening.sql
```

Do not apply the legacy migration directory. Do not replay `0018`, `0030`, or
any previous Classroom migration. Do not apply this file more than once.

This guide contains no credentials and does not require altering `.env.local`.

## Pre-Apply Read-Only Checks

In the Supabase SQL Editor, run these read-only queries and record object
names/results only. Do not copy user rows, source content, or credentials into
the release record.

```sql
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('classrooms', 'classroom_members')
order by tablename, policyname;

select routine_schema, routine_name, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and p.proname in (
    'create_teacher_classroom',
    'join_classroom_by_code',
    'can_manage_classroom'
  )
order by routine_schema, routine_name;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('classrooms', 'classroom_members')
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;
```

## Apply Once

1. Open `0043_classroom_creation_rls_hardening.sql` from the reviewed branch.
2. Paste its complete contents into the clean project SQL Editor.
3. Execute it once and save the SQL Editor result with the exact filename and
   date. Do not save or publish connection strings, service keys, or user data.
4. Do not rerun it to troubleshoot a failure. Record the safe error category
   and prepare a new forward-only migration if correction is required.

## Post-Apply Checks

Run the following sanitized catalog checks:

```sql
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('classrooms', 'classroom_members')
order by tablename, policyname;

select has_table_privilege('anon', 'public.classrooms', 'insert') as anon_classroom_insert,
       has_table_privilege('authenticated', 'public.classrooms', 'insert') as authenticated_classroom_insert,
       has_table_privilege('service_role', 'public.classrooms', 'insert') as service_classroom_insert,
       has_table_privilege('anon', 'public.classroom_members', 'insert') as anon_member_insert,
       has_table_privilege('anon', 'public.classroom_members', 'update') as anon_member_update,
       has_table_privilege('authenticated', 'public.classroom_members', 'insert') as authenticated_member_insert,
       has_table_privilege('authenticated', 'public.classroom_members', 'update') as authenticated_member_update,
       has_table_privilege('service_role', 'public.classroom_members', 'insert') as service_member_insert,
       has_table_privilege('service_role', 'public.classroom_members', 'update') as service_member_update;

select routine_schema, routine_name, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_teacher_classroom',
    'add_classroom_co_teacher',
    'set_classroom_student_membership_status',
    'remove_classroom_co_teacher'
  )
order by routine_name;

select has_function_privilege(
         'anon',
         'public.create_teacher_classroom(text, text, text, uuid, uuid)',
         'execute'
       ) as anon_create_execute,
       has_function_privilege(
         'authenticated',
         'public.create_teacher_classroom(text, text, text, uuid, uuid)',
         'execute'
       ) as authenticated_create_execute;
```

Expected results:

- no `classrooms_teacher_create` or `classroom_members_teacher_write` policy;
- `anon` and `authenticated` lack direct Classroom/member write privileges;
- `service_role` retains the listed write privileges;
- the four listed public functions are security-definer functions with fixed
  search paths;
- only `authenticated` has execute on the creation RPC, never `anon`.

## Live Verification

Run from the reviewed branch with disposable Teacher/Student test credentials:

```powershell
node scripts/classroom-create-rls-smoke.mjs
node scripts/classroom-foundation-smoke.mjs
node scripts/classroom-operations-smoke.mjs
node scripts/supabase-rls-smoke.mjs
node scripts/assignment-from-bank-smoke.mjs
node scripts/teacher-beta-readiness-smoke.mjs
npm.cmd run smoke
```

The focused smoke creates a uniquely named disposable Classroom and removes its
rows with the service-role test client. It does not call providers, publish
questions, create assignments, or change Bank membership.

When manually testing a fixture, retain its Classroom UUID and clean only that
fixture in dependency order:

```sql
-- Replace only the placeholder with the UUID of the disposable fixture.
delete from public.classroom_join_codes where classroom_id = '<fixture-classroom-uuid>'::uuid;
delete from public.classroom_members where classroom_id = '<fixture-classroom-uuid>'::uuid;
delete from public.classrooms where id = '<fixture-classroom-uuid>'::uuid;
```

Do not use broad deletes and do not delete any production Classroom.

## Failure and Forward Fix Rule

If application or live validation fails, do not weaken RLS, restore broad
client writes, edit historical migrations, or replay `0043`. Record the
sanitized error category and create a separately reviewed forward-only
migration. P0-CLS-01 remains open until the closure conditions in
`docs/security/classroom-create-rls-report.md` are met.
