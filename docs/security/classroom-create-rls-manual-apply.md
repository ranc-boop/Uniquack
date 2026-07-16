# P0-CLS-01 Manual Apply: Classroom Creation RLS Hardening

## Hold: Failed 0043 Apply Requires Classification

Do **not** rerun `0043_classroom_creation_rls_hardening.sql` in the clean
Supabase project. A prior SQL Editor attempt stopped with PostgreSQL error
`42723` because a `public.create_teacher_classroom` function with the same
UUID-request signature already existed.

Current classification is **C. UNKNOWN**, not a successful 0043 apply. The
matching public RPC has the expected safe return contract, security-definer
status, fixed `public, private, extensions` search path, and no anonymous
EXECUTE grant. That metadata does not prove whether earlier 0043 statements
committed before the failure.

Run the following catalog-only checks first. They return only schema metadata,
policy names, privilege booleans, and definition hashes; they do not read
Classroom, join-code, profile, or user rows.

```sql
-- Every 0043 change ordered before the failing CREATE FUNCTION statement.
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'classrooms'
      and column_name = 'creation_request_id'
      and data_type = 'uuid'
  ) as creation_request_id_exists,
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.classrooms'::regclass
      and conname = 'classrooms_owner_creation_request_key'
      and pg_get_constraintdef(oid) = 'UNIQUE (owner_id, creation_request_id)'
  ) as creation_request_constraint_exists;

select
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'classrooms' and policyname = 'classrooms_teacher_create')
    or (
      tablename = 'classroom_members'
      and policyname in (
        'classroom_members_teacher_write',
        'classroom_members_teacher_update'
      )
    )
  )
order by tablename, policyname;

select
  has_table_privilege('anon', 'public.classrooms', 'insert') as anon_classroom_insert,
  has_table_privilege('authenticated', 'public.classrooms', 'insert') as authenticated_classroom_insert,
  has_table_privilege('service_role', 'public.classrooms', 'insert') as service_classroom_insert,
  has_table_privilege('anon', 'public.classroom_members', 'insert') as anon_member_insert,
  has_table_privilege('anon', 'public.classroom_members', 'update') as anon_member_update,
  has_table_privilege('authenticated', 'public.classroom_members', 'insert') as authenticated_member_insert,
  has_table_privilege('authenticated', 'public.classroom_members', 'update') as authenticated_member_update,
  has_table_privilege('service_role', 'public.classroom_members', 'insert') as service_member_insert,
  has_table_privilege('service_role', 'public.classroom_members', 'update') as service_member_update;

select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute,
  md5(pg_get_functiondef(p.oid)) as definition_hash
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'private' and p.proname = 'can_create_classroom_in_organization')
   or (n.nspname = 'public' and p.proname = 'create_teacher_classroom')
order by n.nspname, identity_arguments;
```

Interpretation:

- Any existing `creation_request_id`, matching constraint, private helper,
  missing legacy direct-write policy, or revoked normal-client insert/update
  privilege is evidence of **B. PARTIALLY APPLIED**.
- If none of those transitions are present, the UUID RPC still needs a
  documented predecessor before **A. FULLY ROLLED BACK** can be claimed.
- Until that provenance is established, remain at **C. UNKNOWN** and do not
  run, drop, or manually replace the function.

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

## Conditional Apply Procedure

Only follow this section after the repository owner records an evidence-backed
classification and provides the matching reviewed migration. The original 0043
file is currently on hold; it must not be pasted again merely to retry the
42723 failure.

1. If the classification is **A**, the reviewed correction may replace the
   never-successfully-applied 0043. It must use an explicit transaction,
   preflight the exact RPC identity/return contract, use `CREATE OR REPLACE`
   only for the compatible contract, and explicitly restore intended grants.
2. If the classification is **B**, apply the separately reviewed forward-only
   0044 reconciliation migration once. Do not edit historical applied files.
3. Save only the SQL Editor result category, reviewed filename, and date. Do
   not save or publish connection strings, service keys, user rows, or join
   codes.

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
