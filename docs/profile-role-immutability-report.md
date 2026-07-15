# SEC-P0 Profile Privileged Fields Immutability Report

## Goal

Close the confirmed self-promotion P0: normal authenticated callers could
update their own `public.profiles.role`, while middleware, route guards, and
SQL authorization helpers trusted that field.

## Product and security scope

**Workflow touched:** authentication and every role-gated part of the
Bank-first learning workflow. No content workflow behavior was changed.

**Role boundary:** Student, Teacher, Admin, and Super-admin authorization now
depends on immutable server-managed fields rather than a client-writable row.

**Data ownership:** no Bank, Review Draft, Blueprint, Classroom, Assignment, or
Practice ownership policy was changed.

**Old-demo overlap:** not applicable. No competition-demo behavior was reused.

**Non-goals:** Google Login, Classroom RLS, Practice RLS, provider/queue
configuration, migrations before 0039, and P1/P2 security findings were not
changed.

## Actual profile schema and mutation-path audit

The canonical base schema contains:

| Classification | Actual fields |
| --- | --- |
| Safe self-editable presentation fields | `full_name`, `avatar_url`, `display_name` |
| Privileged or server-managed fields | `id`, `username`, `email`, `role`, `status`, `default_organization_id`, `created_at`, `updated_at` |
| Conditionally present identity fields | `google_sub`, `google_email_at_link`, `google_linked_at` when the Google migration is installed |
| Profile preference fields | none on `public.profiles`; Practice preferences use their own table |

The trigger compares the whole row as JSON after removing only the three safe
presentation fields and the automatically maintained timestamp. This protects
any later added column by default until it is deliberately classified safe.

Observed mutation paths:

1. `src/app/admin/users/actions.ts` previously made a direct role update
   after a server-side `requireSuperAdmin()` check.
2. `scripts/clean-supabase-auth-bootstrap.mjs` uses service-role profile
   upsert for trusted bootstrap.
3. No normal self-profile update Server Action, signup route, or canonical
   `auth.users` profile trigger was found.
4. Google account-link SQL exists only in an unapplied/non-live 0032 draft;
   it is not a trusted profile creation or identity-update path.
5. 0039 closed the broad UPDATE issue, but its retained INSERT grant and
   `profiles_super_admin_insert` policy left identity insertion too broad
   until 0040.

## Implementation

Added:

```text
supabase/clean-migrations/0039_profile_privileged_fields_immutability.sql
```

At the time of its one-time application, 0039 provided these defenses (items 5
and 8 are superseded by 0040):

1. Revokes broad UPDATE from `anon` and `authenticated`.
2. Grants authenticated UPDATE only for the safe presentation columns.
3. Revokes writes through `public.user_profiles` so its exposed role/status
   columns cannot become an alternate write path.
4. Replaces the broad self-update policy with an authenticated self-only policy.
5. Restricted direct self-created profiles to active students with no default
   organization; 0040 now removes direct client creation entirely.
6. Adds a trigger that rejects any privileged-field change by default.
7. Leaves service-role profile creation/bootstrap available.
8. Included a generic nested-trigger identity exception; 0040 removes it
   because Google Login is not live and trigger depth is not a trust boundary.
9. Adds the guarded
   `public.transition_profile_role_as_super_admin(uuid, text)` RPC.
10. Records role transitions in
    `private.profile_privileged_change_audit_log`.

The role RPC rechecks the caller's **existing** active super-admin row in the
database before changing a target user. A transaction-local marker is set only
after that check; the trigger verifies the old row state again. A caller cannot
become authorized by submitting a new super-admin role in the same UPDATE.

The RPC does not allow a super-admin to change their own role and refuses to
demote the only active super-admin.

## 0040 follow-up: profile creation and role-transition hardening

The clean-project SQL Editor metadata review after the one-time 0039 apply
confirmed that its UPDATE protections are present:

- `authenticated` UPDATE is limited to `full_name`, `avatar_url`, and
  `display_name`;
- privileged UPDATE is denied;
- the old `profiles_self_update` policy is absent;
- the privileged-field trigger is enabled;
- the role-transition RPC has the expected execution properties; and
- an audit event exists.

It also found a remaining P0 creation-path weakness: both `anon` and
`authenticated` retained table INSERT privileges for every `profiles` column,
and `profiles_super_admin_insert` allowed an authenticated caller to create
their own `student` profile. That policy prevented role escalation but still
allowed caller-selected identity-like fields (`email`, `username`, `id`) and
timestamps during initial profile creation.

### Profile creation audit

The canonical clean migration and runtime audit found these creation paths:

| Path | Current behavior | Selected treatment |
| --- | --- | --- |
| Username/password product flow | `src/app/auth/actions.ts` signs existing users in only; it has no signup or profile INSERT path. | No client bootstrap needed. |
| Supabase Auth signup | No app `auth.signUp()` call or canonical `auth.users` to `profiles` trigger exists in clean migrations 0001–0039. Auth user creation alone is not a supported profile bootstrap path. | Do not infer permission for browser profile INSERT. |
| Service bootstrap / admin-created accounts | `scripts/clean-supabase-auth-bootstrap.mjs` calls the Auth Admin API then service-role-upserts the profile. | Preserved. |
| Test fixtures | Clean smoke scripts use the service role or isolated embedded Postgres. | Preserved. |
| Direct authenticated browser/client INSERT | No legitimate runtime caller was found. | Removed. |
| Profile-creation RPC | No canonical live RPC creates profiles. | None added. |
| Google account linking | `0032_google_account_links.sql` is not live and is not a valid production bootstrap path. | Not implemented or trusted here. |

The selected architecture is therefore **service-role-only profile creation**.
It is narrower than a self-bootstrap RPC: no browser client, nested trigger,
or client-supplied identity can create a profile. A future product signup flow
must add a separately reviewed server-owned bootstrap contract rather than
restore table INSERT.

### Forward migration

Added:

```text
supabase/clean-migrations/0040_profile_insert_and_role_transition_hardening.sql
```

It is forward-only and leaves 0039 unchanged. It:

1. Revokes INSERT on `public.profiles` and `public.user_profiles` from `anon`
   and `authenticated`.
2. Drops `profiles_super_admin_insert`; service-role bootstrap bypasses RLS
   and remains available.
3. Adds `profiles_enforce_insert_immutability`, which denies all non-service
   profile INSERTs even if a future migration accidentally grants table
   INSERT. This covers role, status, default organization, identity,
   timestamps, and unknown future columns without trusting client IDs.
4. Replaces the 0039 update trigger definition to remove its broad
   `pg_trigger_depth()` Google identity exception. A generic nested trigger
   can no longer change protected identity fields. Future Google work needs an
   explicit audited mutation context after verified OAuth/OIDC implementation.
5. Replaces the guarded role-transition RPC with the same authorization,
   self-demotion, audit, and error behavior plus a transaction-scoped advisory
   lock before actor/target reads, last-super-admin counting, and update. Two
   concurrent demotions cannot both act on the same stale count.

No runtime, Google Login, Classroom, Practice, provider, or old-migration file
changed in this follow-up.

### Local 0040 verification

The isolated embedded-Postgres smoke passed after applying clean migrations
0001, 0039, and 0040 in order. It verifies:

- anonymous direct `profiles` INSERT is denied;
- authenticated direct `profiles` INSERT is denied, including spoofed
  identity/timestamp fields;
- authenticated `user_profiles` INSERT is denied;
- service-role Auth/profile bootstrap succeeds;
- safe presentation updates still succeed while role, status, default-org,
  mixed, and future-column updates fail;
- Student, Teacher, and Admin cannot use the role RPC;
- an active Super-admin transition writes an audit event;
- two simultaneous cross-demotions of the last two active Super-admins yield
  one rejection and retain one active Super-admin; and
- a generic nested trigger cannot alter protected Google identity fields.

## 0041 follow-up: client profile deletion hardening

### SQL Editor metadata reconciliation

The clean-project administrator supplied safe SQL Editor metadata after 0040.
The following controls passed:

- anon/authenticated have no INSERT privilege on any `profiles` column;
- authenticated UPDATE is limited to `full_name`, `avatar_url`, and
  `display_name`;
- `user_profiles` has no anon/authenticated INSERT, UPDATE, or DELETE
  privilege;
- `profiles_enforce_insert_immutability` and
  `profiles_enforce_privileged_field_immutability` are enabled;
- both trigger functions use fixed search paths and the generic
  `pg_trigger_depth` Google identity exception is absent;
- the role-transition RPC is security-definer with a fixed search path; and
- the audit table has RLS enabled with no anon/authenticated privileges.

The review also found that anon and authenticated retain table-level DELETE on
`public.profiles`. There is no active DELETE policy, so RLS blocks ordinary
PostgREST deletion today. The grants are still a least-privilege defect: a
future broad DELETE policy could reactivate them. The formal gate therefore
remains open.

### Deletion-path audit

| Path | Result | Treatment |
| --- | --- | --- |
| Browser/client `public.profiles` DELETE | No runtime call or supported product feature found. | Remove grants; no replacement client path. |
| Browser/client `public.user_profiles` DELETE | No runtime call found; view is not a deletion contract. | Keep revoke idempotent. |
| Service-role smoke cleanup | `scripts/profile-role-immutability-smoke.mjs` deletes temporary `auth.users` through the Auth Admin API. | Preserve. |
| Auth-user deletion | `public.profiles.id` references `auth.users(id) ON DELETE CASCADE`. | Preserve cascade behavior. |
| Admin account deletion | No supported admin action or direct profile DELETE path found. | No new product feature. |
| Profile deletion triggers | No profile DELETE trigger found in the canonical clean migration chain. | Do not add one without a proven deletion workflow. |

Many dependent tables reference `public.profiles` with existing `CASCADE`,
`SET NULL`, or `RESTRICT` behavior. 0041 does not change any foreign key or
retention policy; it only removes ordinary client DELETE authority.

### Forward migration

Added:

```text
supabase/clean-migrations/0041_profile_delete_privilege_hardening.sql
```

0041 is forward-only and consists solely of idempotent revocations:

1. `revoke delete on table public.profiles from anon, authenticated;`
2. `revoke delete on table public.user_profiles from anon, authenticated;`

No DELETE trigger or client-facing RPC was added. RLS already has no DELETE
policy; the grant revocation closes the least-privilege gap without changing
service-role Auth-user cleanup or bootstrap.

### Local 0041 verification

The isolated embedded-Postgres smoke applies 0001, 0039, 0040, and 0041 in
order. It passed these additional checks:

- anonymous profile DELETE is denied;
- authenticated cross-user profile DELETE is denied;
- Student self and cross-user profile DELETE are denied;
- Teacher self DELETE and normal Admin DELETE are denied;
- DELETE through `public.user_profiles` is denied;
- safe presentation updates, privileged UPDATE/INSERT denials, and guarded
  super-admin role transitions still pass; and
- trusted service-role deletion of the disposable `auth.users` fixture still
  cascades to remove its profile.

0041 is **not yet applied** to the clean Supabase project. No live DELETE test
has been run against the clean project, and the formal profile-security gate
remains open until the one-time apply and SQL Editor/PostgREST checks complete.

Pre-apply checks passed:

```text
npm.cmd install
npm.cmd run lint
npm.cmd run build
node scripts/profile-role-immutability-smoke.mjs
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node --env-file=<ignored clean env> scripts/supabase-rls-smoke.mjs
node scripts/student-workspace-shell-smoke.mjs
node --env-file=<ignored clean env> scripts/assignment-practice-evidence-smoke.mjs
node --env-file=<ignored clean env> scripts/bank-import-review-smoke.mjs (source pass; live skip: TEST_TEACHER unset)
node scripts/teacher-beta-readiness-smoke.mjs
npm.cmd run perf:budget
npm.cmd run perf:audit
npm.cmd run analyze
```

### Current isolated-worktree checks

Passed for this forward migration:

```text
npm.cmd install
npm.cmd run lint
npm.cmd run build
node scripts/profile-role-immutability-smoke.mjs
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node scripts/student-workspace-shell-smoke.mjs
node scripts/teacher-beta-readiness-smoke.mjs
npm.cmd run perf:budget
npm.cmd run perf:audit
npm.cmd run analyze
```

The isolated worktree intentionally has no copied `.env.local` or disposable
smoke environment. The following live-data checks therefore stopped before
they could contact the clean project: `supabase-rls-smoke`,
`assignment-practice-evidence-smoke`, `bank-import-review-smoke`, and the
aggregate `npm.cmd run smoke` (at its RLS step). This is not a pass and does
not replace post-0040 live validation. No environment file was read, copied,
or modified to work around that boundary.

## Application compatibility

`src/app/admin/users/actions.ts` now calls the guarded RPC. The admin page
and form behavior remain server-action based; no client role-management handler
was introduced.

0039 originally retained:

- service-role bootstrap/profile creation;
- safe presentation edits;
- existing read policies;
- route guards that use the trusted role field.

0040 preserves the first, second, third, and fourth items. It deliberately
does **not** preserve generic Google-trigger identity synchronization because
Google Login is not live and the old exception trusted trigger depth rather
than a verified OAuth/OIDC mutation boundary.

## Tests completed before live apply

Passed locally:

```text
node --check scripts/profile-role-immutability-smoke.mjs
node scripts/profile-role-immutability-smoke.mjs
```

The embedded-Postgres smoke verified:

- student safe display update succeeds;
- student role changes to teacher/admin/super-admin fail;
- student cannot use the exposed profile view as a role-write bypass;
- student status/default-organization changes fail;
- mixed display-name plus role change is fully rejected;
- failed escalation leaves `private.is_admin()` and
  `private.is_teacher_or_admin()` false;
- teacher, admin, anonymous, unrelated-user, and direct super-admin table
  writes fail;
- teacher and admin calls to the authenticated RPC fail before any role
  transition;
- an authorized super-admin transition through only the guarded RPC succeeds;
- self-demotion through that RPC fails;
- each role transition writes a private audit event;
- service-role profile creation still succeeds;
- authenticated retains only the three intended UPDATE column grants.

The 0040 local verification supersedes the direct-insert and nested-trigger
portions of this pre-0040 list.

The smoke supports a separate `--live` mode for clean disposable Supabase.
It is intentionally not run before the SQL is manually applied.

## Verification in the isolated worktree

Passed:

```text
npm.cmd install
node --check scripts/profile-role-immutability-smoke.mjs
node scripts/profile-role-immutability-smoke.mjs
npm.cmd run lint
npm.cmd run build
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node scripts/student-workspace-shell-smoke.mjs
node scripts/teacher-beta-readiness-smoke.mjs
node scripts/classroom-operations-smoke.mjs (source checks; live portion skipped)
npm.cmd run perf:budget
```

The aggregate `npm.cmd run smoke` ran the new embedded-Postgres P0 smoke and
the preceding source checks successfully, then stopped at the pre-existing
live `supabase-rls-smoke` requirement because the isolated worktree contains
no `.env.local`. The same absence blocked the live portions of
`supabase-rls-smoke`, `assignment-practice-evidence-smoke`, and
`bank-import-review-smoke`; none contacted Supabase or mutated data. This is
not a pass for those live checks. Run them after the manual apply from a
process with the ignored clean-project test environment.

`route-smoke` passed its source assertions and its local route/auth-redirect
checks. The existing guard source checks continue to confirm teacher, student,
and admin routes call the role guards; live authenticated route validation is
part of the post-apply checklist.

## Existing-account aggregate audit

**Not run against live Supabase in this implementation pass.** The required
read-only aggregate SQL is in
`docs/profile-role-immutability-manual-apply.md`. Do not change accounts
automatically. If unexpected active admin/super-admin counts appear, open a
separate incident-review task before deployment.

## Remote apply status

The clean-project administrator confirmed that
`0039_profile_privileged_fields_immutability.sql` was manually applied once.
This branch did not reapply it and did not modify it after the live apply.
`0040_profile_insert_and_role_transition_hardening.sql` was manually applied
**once** to the clean Supabase project on 2026-07-14. This branch did not
reapply it and did not modify 0039 or 0040 after that application.

## Post-apply live validation (2026-07-14)

### Result

The live **PostgREST and guarded-RPC behavior** is correct for the dedicated
disposable fixtures. The strict metadata/audit verification could not complete
from this isolated worktree, so the P0 is **not yet closed as a deployment
gate**. This is an evidence gap, not a reason to weaken the migration.

### Live behavior confirmed

| Check | Result |
| --- | --- |
| Safe Student self-edit | `full_name`, `display_name`, and `avatar_url` each updated successfully. |
| Student privileged writes | Role to Teacher/Admin/Super-admin, status, default organization, and optional identity-field writes were denied. |
| Atomicity | A combined `full_name` plus role change was denied as one operation; neither field partially changed. |
| Direct/browser-equivalent client path | Direct Supabase/PostgREST mutations were denied. |
| View bypass | `public.user_profiles` could not update role and did not alter the backing profile. |
| Other identities | Teacher, Admin, anonymous, and unrelated-user self/cross-profile privileged writes were denied. |
| Service role | Temporary Auth user/profile bootstrap succeeded. |
| Guarded RPC | Student, Teacher, Admin, and inactive Super-admin calls were denied; an active Super-admin fixture could transition a different fixture only. |
| Self transition | Super-admin self role change through the RPC was denied. |
| Fixture cleanup | All temporary `p0-smoke-...@example.invalid` and unprofiled fixtures created by the smoke were deleted. The dedicated Student's presentation-only fields were restored; role, status, and organization were verified unchanged. |

No real user role, status, default organization, identity field, Bank,
Review Draft, Blueprint, Classroom, Assignment, Practice record, provider
setting, or AI job was modified.

### Original automated metadata transport limitation

The strict live mode attempted two safe direct metadata connection paths:

1. the direct database hostname did not resolve (`ENOTFOUND`); and
2. the configured Supabase pooler fallback returned a connection-level
   `XX000` category.

No credentials, hostnames, connection strings, or database error text were
logged. Because of that transport block, the worktree could not independently
query:

- exact remote `profiles` column grants and absence of table-wide UPDATE;
- `profiles_self_safe_update` and the immutability trigger;
- future-field trigger source invariant;
- `user_profiles` database grant revocation;
- private audit-event count for the temporary transition; or
- `private.is_admin()` / `private.is_teacher_or_admin()` after the denied
  Student escalation.

The migration source and local embedded-Postgres smoke covered each of those
contracts. The later SQL Editor reconciliation recorded in the 0041 section
above supplied the safe 0039/0040 metadata evidence. The remaining P0 gap is
now specifically the residual client DELETE grants, which 0041 revokes.

### Existing-account aggregate review

During the controlled validation, a service-role aggregate-only read returned
role/status counts while fixtures were active. The smoke then deleted its
temporary fixtures. This is test telemetry only, not an account inventory:

| Role | Active | Suspended/disabled |
| --- | ---: | ---: |
| Super-admin | 1 | 0 |
| Admin | 0 | 0 |
| Teacher | 2 | 0 |
| Student | 1 | 0 |

No names, email addresses, IDs, or profile values were read into the report.
`TEST_TEACHER` credentials are currently unset. The configured `TEST_ADMIN`
credential currently resolves to a non-Admin profile and `TEST_SUPER_ADMIN`
could not establish a session; disposable Teacher/Admin/Super-admin fixtures
were used for the authorization tests instead.
This is a test-environment/account-inventory issue, not a self-promotion
result. A founder-reviewed account inventory should confirm the intended two
Teacher / zero Admin distribution before launch. The new audit table cannot
establish whether role changes occurred before migration 0039, so this task
does **not** claim that historical exploitation did not occur.

### Compatibility regression results

- Service-role profile bootstrap and signed-in temporary fixture creation
  passed.
- Student, Teacher, and configured Admin password/session login completed;
  the Admin role label and Super-admin login need test-fixture repair as noted
  above.
- Static Student/Teacher/Admin route-guard coverage passed in route and
  workspace smokes.
- Bank import -> Review Draft -> private bank approval passed live, including
  cleanup and no public leakage.
- Classroom Operations source/live coverage passed; co-teacher coverage was
  skipped because no second-Teacher fixture is configured.
- Assignment -> Practice live smoke remains blocked by the pre-existing
  teacher Classroom RLS failure (`42501` while creating `classrooms`). This
  branch did not alter Classroom policies and did not introduce the failure.
- Teacher feedback, AI queue, and the later aggregate-smoke modules were not
  reached because aggregate smoke stops at the same pre-existing Classroom
  foundation failure.

### Tests after live apply

Passed:

```text
npm.cmd install
npm.cmd run lint
npm.cmd run build
node scripts/profile-role-immutability-smoke.mjs
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node scripts/supabase-rls-smoke.mjs
node scripts/student-workspace-shell-smoke.mjs
node scripts/bank-import-review-smoke.mjs
node scripts/teacher-beta-readiness-smoke.mjs
node scripts/classroom-operations-smoke.mjs
npm.cmd run perf:budget
npm.cmd run perf:audit
npm.cmd run analyze
```

Controlled live `--live-http-only` behavior checks passed through the role
transition and cleanup verification. Strict `--live` metadata mode remains
blocked as described above.

Earlier baseline observation, unrelated to this migration:

```text
node scripts/assignment-practice-evidence-smoke.mjs
npm.cmd run smoke
```

Those historical invocations stopped at a teacher Classroom create RLS
violation. The current validation refresh below reran the Assignment-to-Practice
and Classroom operations paths successfully; it does not modify or close that
separately reported RLS risk.

### Current validation refresh (2026-07-14)

0040 was confirmed as manually applied once before this refresh. The following
current checks passed in this isolated worktree:

```text
npm.cmd install
npm.cmd run lint
npm.cmd run build
node scripts/profile-role-immutability-smoke.mjs
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node --env-file=<ignored clean env> scripts/supabase-rls-smoke.mjs
node scripts/student-workspace-shell-smoke.mjs
node --env-file=<ignored clean env> scripts/assignment-practice-evidence-smoke.mjs
node --env-file=<ignored clean env> scripts/classroom-operations-smoke.mjs
npm.cmd run perf:budget
npm.cmd run perf:audit
npm.cmd run analyze
```

The controlled `--live-http-only` profile smoke also passed its PostgREST/RPC
checks against the clean project. It used temporary Teacher, Admin, and
Super-admin fixtures because `TEST_TEACHER` is unset, the configured
`TEST_ADMIN` account is not an Admin, and the configured `TEST_SUPER_ADMIN`
account could not sign in. All such fixtures were deleted. The configured
Student account was used only for safe presentation edits, which were restored.

The same refresh found these non-profile validation limitations:

- `bank-import-review-smoke` skipped its live portion because
  `TEST_TEACHER` is unset;
- the aggregate smoke run without an environment stopped where expected in the
  isolated worktree, and the process-only environment rerun progressed through
  the passed RLS, Classroom, Assignment-to-Practice, and bank-foundation
  checks before `bank-share-members-smoke` stopped on the same missing
  `TEST_TEACHER` credentials;
- the earlier Classroom-creation RLS error was **not reproduced** in this
  refresh. It remains an independently reported launch risk until its
  reconciliation owner closes it; this branch did not change Classroom policy.

The strict `--live` profile smoke remains intentionally failed at the direct
metadata connection stage with safe code `XX000`. No remote mutation occurred
in that strict attempt. This leaves only the required SQL Editor metadata and
audit verification outstanding for the profile-security gate.

## Deployment status

**P0 behavior is strongly validated but the deployment gate remains blocked.**
The 0039/0040 SQL Editor metadata checks are confirmed; 0041 must now be
applied exactly once and its DELETE-grant metadata plus live PostgREST denial
must pass. Do not call the overall website deployment-ready merely because the
profile role path is hardened.

Remaining known launch blockers include:

- live migration/schema reconciliation;
- public question-assets bucket exposure;
- teacher Classroom creation RLS failure;
- Student self-study evidence organization scope;
- incomplete/unsafe Google Login migration;
- production AI scheduler/provider/monitoring readiness.

## Remaining security work not included

- P1: organization staff access to organization-scoped self-study
  `practice_*` evidence requires a separate forward-only RLS design/fix.
- P1: duplicate clean-migration version 0032 requires release-ledger
  reconciliation.
- P2: Student shell modules that are product placeholders need a beta-product
  decision.

## Rollback risk

This is a security-hardening migration. Do not roll it back by restoring broad
authenticated UPDATE. If a legitimate server-managed profile operation fails,
add a narrow audited forward migration/RPC after identifying the exact field
and caller contract.
