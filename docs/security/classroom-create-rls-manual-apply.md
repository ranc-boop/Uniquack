# P0-CLS-01 Manual Apply: Classroom Creation RLS Hardening

## Recorded Live Apply Status

Do **not** rerun `0043_classroom_creation_rls_hardening.sql` in the clean
Supabase project. A prior SQL Editor attempt stopped with PostgreSQL error
`42723` because a `public.create_teacher_classroom` function with the same
UUID-request signature already existed.

Current classification is **B. PARTIALLY APPLIED**, not a successful 0043
apply. The matching public RPC has the expected safe return contract,
security-definer status, fixed `public, private, extensions` search path, and
no anonymous EXECUTE grant. The 0043-only private helper
`can_create_classroom_in_organization(uuid)` also exists, proving that
statements before the failed public function creation reached the live schema.

Forward-only `0044_classroom_creation_rpc_reconciliation.sql` has now been
**applied exactly once** through the clean Supabase SQL Editor. Do not replay
0043 or 0044. The recorded post-0044 metadata confirms the UUID RPC contract,
security-definer/fixed-search-path settings, anon denial, authenticated and
service-role EXECUTE, service-role-only private helper, revoked normal-client
direct-write grants, and absence of the three legacy broad policies.

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

Historical interpretation:

- Any existing `creation_request_id`, matching constraint, private helper,
  missing legacy direct-write policy, or revoked normal-client insert/update
  privilege is evidence of **B. PARTIALLY APPLIED**.
- If none of those transitions are present, the UUID RPC still needs a
  documented predecessor before **A. FULLY ROLLED BACK** can be claimed.
- The supplied helper metadata establishes **B. PARTIALLY APPLIED**. Do not
  run, drop, or manually replace the existing UUID RPC.

## Scope

Historical reconciliation file applied once to the **clean Supabase project**:

```text
supabase/clean-migrations/0044_classroom_creation_rpc_reconciliation.sql
```

Do not apply the legacy migration directory. Do not replay `0018`, `0030`,
the partially applied `0043`, or the already applied `0044`.

This guide contains no credentials and does not require altering `.env.local`.

## Historical Pre-Apply Read-Only Checks

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

## Historical Conditional Apply Procedure

This procedure is retained for release evidence only. It is complete: 0044
was applied exactly once. The original 0043 file remains on hold and must not
be pasted again merely to retry the 42723 failure.

1. Do not replay either migration.
2. Retain only the reviewed filename, SQL Editor success category, and
   sanitized catalog metadata as release evidence. Do not save or publish
   connection strings, service keys, user rows, or join codes.

## Recorded Post-Apply Checks

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
- `authenticated` and `service_role` have execute on the creation RPC; `anon`
  never does.

Recorded result: the sanitized catalog checks passed after the one 0044 apply.
The final creation-RPC definition hash is
`4ca996b5d78c040c67fd96d23bafea40`.

## Live Verification

Run from the reviewed branch only when approved disposable Teacher/Student test
credentials and a service-role cleanup client are supplied as process-only
environment variables:

```powershell
node scripts/classroom-create-rls-smoke.mjs
node scripts/classroom-foundation-smoke.mjs
node scripts/classroom-operations-smoke.mjs
node scripts/supabase-rls-smoke.mjs
node scripts/assignment-from-bank-smoke.mjs
node scripts/teacher-beta-readiness-smoke.mjs
npm.cmd run smoke
```

The focused smoke has not run its live phase from this isolated worktree because
those approved disposable environment variables are unavailable. When enabled,
it creates a uniquely named disposable Classroom and removes its rows with the
service-role test client. It does not call providers, publish questions, create
assignments, or change Bank membership.

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
client writes, edit historical migrations, or replay `0043`/`0044`. Record the
sanitized error category and create a separately reviewed forward-only
migration. P0-CLS-01 remains open until the closure conditions in
`docs/security/classroom-create-rls-report.md` are met.
