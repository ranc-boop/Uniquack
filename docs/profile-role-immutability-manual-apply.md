# Profile Privileged Fields Immutability Manual Apply

## Scope

`0039_profile_privileged_fields_immutability.sql` and
`0040_profile_insert_and_role_transition_hardening.sql` were each applied
once already. Do **not** edit or rerun either migration. Apply only the
following forward correction:

```text
supabase/clean-migrations/0041_profile_delete_privilege_hardening.sql
```

This is a forward-only least-privilege fix for the clean Supabase project. Do
not edit or reapply 0001, 0039, or 0040. Do not run anything under
`supabase/migrations`.

0041:

- revokes direct `profiles` DELETE for `anon` and `authenticated`; and
- idempotently revokes direct `user_profiles` DELETE for the same client roles.

There is no user-facing direct profile deletion feature. Canonical cleanup
deletes `auth.users` through the service role; `public.profiles.id` references
that user with `ON DELETE CASCADE`. No client replacement DELETE path is added.

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

## Apply record

The clean-project administrator confirmed that
`0041_profile_delete_privilege_hardening.sql` was applied **exactly once** on
2026-07-14. Do not rerun it. Keep the SQL Editor result as the migration-
application record. Do not paste credentials, connection strings, or results
containing user data into chat.

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
  has_table_privilege('authenticated', 'public.user_profiles', 'INSERT') as authenticated_user_profiles_insert,
  has_table_privilege('anon', 'public.user_profiles', 'UPDATE') as anon_user_profiles_update,
  has_table_privilege('authenticated', 'public.user_profiles', 'UPDATE') as authenticated_user_profiles_update,
  has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as authenticated_profiles_table_update,
  has_table_privilege('anon', 'public.profiles', 'DELETE') as anon_profiles_delete,
  has_table_privilege('authenticated', 'public.profiles', 'DELETE') as authenticated_profiles_delete,
  has_table_privilege('anon', 'public.user_profiles', 'DELETE') as anon_user_profiles_delete,
  has_table_privilege('authenticated', 'public.user_profiles', 'DELETE') as authenticated_user_profiles_delete;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;

select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.profiles'::regclass
  and not tgisinternal
  and tgname in (
    'profiles_enforce_insert_immutability',
    'profiles_enforce_privileged_field_immutability'
  )
order by tgname;

select
  n.nspname as function_schema,
  p.proname as function_name,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '') as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('private', 'enforce_profile_insert_immutability'),
  ('private', 'enforce_profile_privileged_field_immutability'),
  ('public', 'transition_profile_role_as_super_admin')
)
order by function_schema, function_name;

select pg_get_functiondef(
  'private.enforce_profile_privileged_field_immutability()'::regprocedure
) as profile_update_trigger_definition;

select
  has_function_privilege(
    'anon',
    'public.transition_profile_role_as_super_admin(uuid,text)',
    'EXECUTE'
  ) as anon_transition_execute,
  has_function_privilege(
    'authenticated',
    'public.transition_profile_role_as_super_admin(uuid,text)',
    'EXECUTE'
  ) as authenticated_transition_execute,
  exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f'::"char", p.proowner))
    ) privilege
    where p.oid =
      'public.transition_profile_role_as_super_admin(uuid,text)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) as public_transition_execute;

select
  has_table_privilege(
    'anon',
    'private.profile_privileged_change_audit_log',
    'SELECT'
  ) as anon_audit_select,
  has_table_privilege(
    'authenticated',
    'private.profile_privileged_change_audit_log',
    'SELECT'
  ) as authenticated_audit_select;

select count(*) as role_transition_audit_events
from private.profile_privileged_change_audit_log;
```

Expected result:

- `authenticated` has UPDATE only for `full_name`, `avatar_url`, and
  `display_name`;
- there is no table-wide authenticated UPDATE privilege for `profiles`;
- all four INSERT privilege booleans are `false`;
- both `user_profiles` write booleans and table-wide `profiles` UPDATE are
  `false`;
- all four profile/view DELETE privilege booleans are `false`;
- `profiles_super_admin_insert` is absent;
- `profiles_self_safe_update` is the only relevant UPDATE policy;
- no `profiles` policy has `cmd = 'DELETE'` or `cmd = 'ALL'`;
- both profile immutability triggers exist and show `tgenabled = 'O'`;
- all three functions show `security_definer = true` and a fixed
  `search_path` containing only `public, private`;
- the returned update-trigger definition has no `pg_trigger_depth` exception;
- only `authenticated` has execute on the guarded role-transition RPC;
- anon and authenticated cannot select the private audit table; and
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

The live mode requires existing disposable Student credentials and the clean
service role. When dedicated Teacher, Admin, or Super-admin test credentials
are absent or no longer match their intended role, it creates temporary
synthetic fixtures for those negative and guarded-RPC checks, then deletes
them. It prints only pass/fail labels and aggregate role/status counts, never
credentials or profile identities.

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
`0039_profile_privileged_fields_immutability.sql` and
`0040_profile_insert_and_role_transition_hardening.sql` were each applied
**once** through the Supabase SQL Editor. This branch did not reapply or modify
either migration.

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

The SQL Editor metadata review completed the 0039/0040 verification. It
confirmed that anon/authenticated have no `profiles` INSERT privilege, that
authenticated UPDATE is limited to `full_name`, `avatar_url`, and
`display_name`, and that `user_profiles` has no client INSERT, UPDATE, or
DELETE privilege. Both profile immutability triggers are enabled, their
security-definer functions use fixed search paths, the generic
`pg_trigger_depth` Google exception is absent, the guarded role RPC is
security-definer with a fixed search path, and the private audit table has RLS
with no anon/authenticated privileges.

The same review found residual table-level DELETE grants on
`public.profiles` for both anon and authenticated. There is no DELETE policy,
so RLS likely blocks current exploitation, but the grants violate least
privilege and must be revoked by 0041 before the formal P0 gate closes.

`node scripts/profile-role-immutability-smoke.mjs --live` remains strict and
fails when that metadata connection is unavailable. The explicit
`--live-http-only` mode is diagnostic-only: it records the safe PostgREST and
RPC behavior above but must not be used by itself to close the P0 gate.

## 0041 live-validation status

0041 was applied exactly once. The local embedded-Postgres smoke and the
controlled live `--live-http-only` PostgREST/RPC smoke passed after the apply.
The live smoke used only disposable `@example.invalid` fixtures for
Teacher/Admin/Super-admin checks, restored the configured Student's safe
presentation fields, and deleted every temporary Auth user through the
service-role cleanup path.

The strict `--live` metadata mode remains blocked at the direct/pooler database
metadata connection with safe error category `XX000`. This is not a behavioral
failure, but it means this worktree cannot independently verify the final
catalog booleans. The SQL Editor query above is the source of truth and has now
confirmed:

- anon `profiles` DELETE is `false`;
- authenticated `profiles` DELETE is `false`;
- anon `user_profiles` DELETE is `false`;
- authenticated `user_profiles` DELETE is `false`;
- no DELETE or ALL policy exists for normal clients on `profiles` or
  `user_profiles`;
- safe authenticated UPDATE remains exactly `full_name`, `avatar_url`, and
  `display_name`; and
- direct profiles INSERT and all user_profiles writes remain denied.

For a future repeat validation, run the local smoke followed by strict live
mode:

```powershell
node scripts/profile-role-immutability-smoke.mjs

$env:PROFILE_ROLE_IMMUTABILITY_CONFIRM = "RUN_DISPOSABLE_P0_LIVE_SMOKE"
node scripts/profile-role-immutability-smoke.mjs --live
Remove-Item Env:PROFILE_ROLE_IMMUTABILITY_CONFIRM
```

The live smoke proved anonymous, Student self/cross-user, Teacher self, Admin
normal-client, and `user_profiles` DELETE attempts are denied; service-role
Auth-user fixture cleanup still cascades safely; existing INSERT/UPDATE and
guarded-transition protections remain intact. The embedded local smoke also
proves the concurrent last-Super-admin and generic nested-trigger cases.

The pre-apply embedded smoke has already passed these 0041 contracts. It does
not replace the required live PostgREST and SQL Editor checks after the manual
one-time apply.

The confirmed profile role self-promotion, direct profile identity insertion,
and client profile deletion security gate is closed.

This does not make the overall website deployment-ready.
