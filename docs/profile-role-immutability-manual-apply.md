# Profile Privileged Fields Immutability Manual Apply

## Scope

Apply only:

```text
supabase/clean-migrations/0039_profile_privileged_fields_immutability.sql
```

This is a forward-only fix for the clean Supabase project. Do not edit or
reapply migration 0001. Do not run anything under `supabase/migrations`.

The migration:

- removes broad authenticated updates on `public.profiles`;
- permits self-edits only for `full_name`, `avatar_url`, and
  `display_name`;
- rejects privileged profile-field writes in a database trigger;
- blocks the updatable `public.user_profiles` view as a write bypass;
- adds the guarded `public.transition_profile_role_as_super_admin` RPC;
- records role transitions in a private audit table.

## Pre-apply aggregate audit

Run these read-only queries in the clean project SQL Editor. They return no
names, emails, keys, or tokens.

```sql
select role, status, count(*) as profile_count
from public.profiles
group by role, status
order by role, status;

select
  count(*) filter (where default_organization_id is null) as without_default_organization,
  count(*) filter (where default_organization_id is not null) as with_default_organization
from public.profiles;

select
  count(*) filter (where role = 'super_admin' and status = 'active') as active_super_admin_count,
  count(*) filter (where role = 'admin' and status = 'active') as active_admin_count,
  count(*) filter (where role = 'teacher' and status = 'active') as active_teacher_count,
  count(*) filter (where role = 'student' and status = 'active') as active_student_count
from public.profiles;
```

Record only aggregate counts. If the counts show an unexpected number of
active administrators or super-admins, stop. Do not downgrade, delete, or edit
accounts in this apply step; open a separate incident-review task.

## Apply

1. Sign in to the **clean** Supabase project as a project administrator.
2. Open SQL Editor and create a new query.
3. Copy the complete contents of
   `supabase/clean-migrations/0039_profile_privileged_fields_immutability.sql`.
4. Run it **once**.
5. Keep the SQL Editor result as the migration-application record. Do not paste
   credentials, connection strings, or results containing user data into chat.

## Post-apply SQL verification

Run these read-only checks:

```sql
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee in ('anon', 'authenticated')
  and privilege_type = 'UPDATE'
order by grantee, column_name;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;

select tgname
from pg_trigger
where tgrelid = 'public.profiles'::regclass
  and not tgisinternal
order by tgname;

select routine_schema, routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'transition_profile_role_as_super_admin';

select count(*) as role_transition_audit_events
from private.profile_privileged_change_audit_log;
```

Expected result:

- `authenticated` has UPDATE only for `full_name`, `avatar_url`, and
  `display_name`;
- there is no table-wide authenticated UPDATE privilege for `profiles`;
- `profiles_self_safe_update` and
  `profiles_enforce_privileged_field_immutability` exist;
- the guarded role-transition RPC exists;
- the audit query is safe to run, although it may return zero before the first
  role transition.

## Post-apply live validation

Run the local SQL smoke first:

```powershell
node scripts/profile-role-immutability-smoke.mjs
```

Then run the disposable clean-Supabase PostgREST smoke from a PowerShell process
that already has the ignored local test environment available. Do not paste or
write secrets:

```powershell
$env:PROFILE_ROLE_IMMUTABILITY_CONFIRM = "RUN_DISPOSABLE_P0_LIVE_SMOKE"
node scripts/profile-role-immutability-smoke.mjs --live
Remove-Item Env:PROFILE_ROLE_IMMUTABILITY_CONFIRM
```

The live mode requires existing disposable credentials for Student, Teacher,
Admin, Super-admin, and the clean service role. It creates one temporary
synthetic account to validate service-role creation and the guarded transition,
then deletes it. It prints only pass/fail labels and aggregate role/status
counts, never credentials or profile identities.

After live validation, rerun:

```powershell
node scripts/security-smoke.mjs
node scripts/supabase-rls-smoke.mjs
```

There is no dedicated current-production-security-reconciliation smoke script
in this checkout. Record the two command results above and perform the
post-apply SQL verification in this guide instead of substituting an unrelated
test.

## Failure handling

- A denied normal-user role/status/organization update is expected.
- A successful normal-user privileged update is a deployment blocker.
- A failed service-role test or guarded super-admin transition is a deployment
  blocker.
- Do not weaken RLS, add client exceptions, or use direct SQL to work around a
  failed test.
- Do not alter Google Login, Classroom, Practice, provider, or queue behavior
  while applying this narrow migration.

## Post-apply validation record (2026-07-14)

The clean-project administrator confirmed that
`0039_profile_privileged_fields_immutability.sql` was applied **once** through
the Supabase SQL Editor. This branch did not reapply or modify that migration.

The controlled PostgREST validation proved the following against the clean
project using only dedicated disposable test users:

- `full_name`, `avatar_url`, and `display_name` self-edits succeeded;
- Student role, status, default-organization, identity, and mixed
  presentation-plus-role writes were denied atomically;
- Teacher, Admin, anonymous, cross-user, direct-client, and
  `user_profiles` write-bypass attempts were denied;
- service-role bootstrap of temporary fixtures succeeded;
- Student, Teacher, Admin, and inactive-super-admin RPC calls were denied;
- a temporary active super-admin could transition another temporary profile;
- a super-admin could not transition itself; and
- every generated fixture was removed. The disposable Student presentation
  fields were reset to a neutral test state after a test-harness cleanup fix.

Automated direct database metadata verification is still unavailable from the
isolated worktree: the direct host did not resolve and the configured pooler
fallback could not establish a metadata session. Consequently, the following
must still be verified in the SQL Editor with the read-only queries above
before marking the P0 deployment gate closed:

- exact `profiles` column grants and absence of table-wide UPDATE;
- `profiles_self_safe_update` and
  `profiles_enforce_privileged_field_immutability` existence;
- narrow execute grants for
  `transition_profile_role_as_super_admin`;
- private audit-event count for the controlled transition; and
- the SQL helper result that a failed Student escalation leaves
  `private.is_admin()` and `private.is_teacher_or_admin()` false.

`node scripts/profile-role-immutability-smoke.mjs --live` remains strict and
fails when that metadata connection is unavailable. The explicit
`--live-http-only` mode is diagnostic-only: it records the safe PostgREST and
RPC behavior above but must not be used by itself to close the P0 gate.
