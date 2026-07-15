# Profile Privileged Fields Immutability Manual Apply

## Scope

`0039_profile_privileged_fields_immutability.sql` was applied once already.
Do **not** edit or rerun it. Apply only the forward correction:

```text
supabase/clean-migrations/0040_profile_insert_and_role_transition_hardening.sql
```

This is a forward-only fix for the clean Supabase project. Do not edit or
reapply 0001 or 0039. Do not run anything under `supabase/migrations`.

0040:

- revokes direct `profiles` and `user_profiles` INSERT for `anon` and
  `authenticated`;
- removes the residual `profiles_super_admin_insert` policy;
- adds a defense-in-depth profile INSERT trigger that permits only a
  service-role JWT;
- retains 0039's authenticated SELECT and three safe presentation UPDATE
  columns;
- removes the generic nested-trigger Google identity exception; and
- serializes guarded role transitions so concurrent demotions cannot remove
  the final active Super-admin.

Canonical profile creation is service-role-only. The existing clean bootstrap
script creates Auth users through the Auth Admin API and upserts profiles with
the service role. There is no supported browser signup/profile INSERT path to
preserve. Google Login is not live and is not part of this apply.

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
   `supabase/clean-migrations/0040_profile_insert_and_role_transition_hardening.sql`.
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

select
  has_table_privilege('anon', 'public.profiles', 'INSERT') as anon_profiles_insert,
  has_table_privilege('authenticated', 'public.profiles', 'INSERT') as authenticated_profiles_insert,
  has_table_privilege('anon', 'public.user_profiles', 'INSERT') as anon_user_profiles_insert,
  has_table_privilege('authenticated', 'public.user_profiles', 'INSERT') as authenticated_user_profiles_insert;

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

select pg_get_functiondef(
  'private.enforce_profile_privileged_field_immutability()'::regprocedure
) as profile_update_trigger_definition;

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
- all four INSERT privilege booleans are `false`;
- `profiles_super_admin_insert` is absent;
- `profiles_self_safe_update`, `profiles_enforce_insert_immutability`, and
  `profiles_enforce_privileged_field_immutability` exist;
- the returned update-trigger definition has no `pg_trigger_depth` exception;
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

## 0040 pending apply and live validation

The SQL Editor metadata review after 0039 found that direct profile INSERT was
still broadly granted. `0040_profile_insert_and_role_transition_hardening.sql`
has **not** been applied by this branch. Apply it once using the steps above,
then run the local smoke followed by strict live mode:

```powershell
node scripts/profile-role-immutability-smoke.mjs

$env:PROFILE_ROLE_IMMUTABILITY_CONFIRM = "RUN_DISPOSABLE_P0_LIVE_SMOKE"
node scripts/profile-role-immutability-smoke.mjs --live
Remove-Item Env:PROFILE_ROLE_IMMUTABILITY_CONFIRM
```

After 0040, the live smoke must prove direct anonymous/authenticated profile
and view inserts are denied, service-role bootstrap remains available, safe
presentation updates remain available, privileged updates stay denied, and
the guarded transition still records an audit event. The embedded local smoke
also proves the concurrent last-Super-admin and generic nested-trigger cases.

Do not close the formal profile-security gate until the SQL Editor checks and
strict live validation both pass against the clean project.
