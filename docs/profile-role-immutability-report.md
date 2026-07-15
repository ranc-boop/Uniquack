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
3. Google account-link sync uses a trusted nested trigger to update its
   denormalized identity fields.
4. No normal self-profile update Server Action or route was found.
5. Direct table/view writes remained possible at the database layer because
   the old policy and broad API UPDATE grant were not column-safe.

## Implementation

Added:

```text
supabase/clean-migrations/0039_profile_privileged_fields_immutability.sql
```

The migration provides defense in depth:

1. Revokes broad UPDATE from `anon` and `authenticated`.
2. Grants authenticated UPDATE only for the safe presentation columns.
3. Revokes writes through `public.user_profiles` so its exposed role/status
   columns cannot become an alternate write path.
4. Replaces the broad self-update policy with an authenticated self-only policy.
5. Restricts direct self-created profiles to active students with no default
   organization.
6. Adds a trigger that rejects any privileged-field change by default.
7. Leaves service-role profile creation/bootstrap available.
8. Allows only the trusted nested Google identity-sync trigger to change its
   own denormalized identity fields; Google source code was not modified.
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

## Application compatibility

`src/app/admin/users/actions.ts` now calls the guarded RPC. The admin page
and form behavior remain server-action based; no client role-management handler
was introduced.

The migration retains:

- service-role bootstrap/profile creation;
- safe presentation edits;
- existing read policies;
- Google denormalized profile synchronization;
- route guards that use the trusted role field.

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
- trusted nested identity synchronization remains compatible;
- authenticated retains only the three intended UPDATE column grants.

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
| Fixture cleanup | Four exact `p0-smoke-...@example.invalid` fixtures were deleted. The dedicated Student's presentation-only fields were reset after a harness cleanup bug; role, status, and organization were verified unchanged. |

No real user role, status, default organization, identity field, Bank,
Review Draft, Blueprint, Classroom, Assignment, Practice record, provider
setting, or AI job was modified.

### Metadata and audit evidence still blocked

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

The migration source and local embedded-Postgres smoke cover each of those
contracts. Run the read-only SQL Editor checks in
`profile-role-immutability-manual-apply.md` and record their results before
changing the P0 deployment status to closed.

### Existing-account aggregate review

After temporary fixture cleanup, a service-role aggregate-only read returned:

| Role | Active | Suspended/disabled |
| --- | ---: | ---: |
| Super-admin | 1 | 0 |
| Admin | 0 | 0 |
| Teacher | 2 | 0 |
| Student | 1 | 0 |

No names, email addresses, IDs, or profile values were read into the report.
The configured `TEST_ADMIN` credential currently resolves to a non-Admin
profile and `TEST_SUPER_ADMIN` could not establish a session; disposable
Admin/Super-admin fixtures were used for the authorization tests instead.
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

Blocked, unrelated to this migration:

```text
node scripts/assignment-practice-evidence-smoke.mjs
npm.cmd run smoke
```

Both stopped at the known teacher Classroom create RLS violation. The first
no-environment aggregate invocation also stopped at missing isolated-worktree
Supabase environment categories, as expected; the process-only rerun reached
the actual Classroom blocker.

## Deployment status

**P0 behavior is strongly validated but the deployment gate remains blocked.**
Do not call the overall website deployment-ready merely because the profile
role path is hardened. Close this P0 only after the SQL Editor metadata/audit
queries confirm the live schema state.

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
