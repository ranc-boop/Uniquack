# P0-CLS-01 Teacher Classroom Creation RLS Report

## Status

**COMPLETED / LIVE VALIDATED.** Migration `0043` is partially applied and must
not be replayed. Forward-only reconciliation `0044` was applied exactly once
through SQL Editor. Sanitized catalog evidence and the approved disposable
Teacher/Student role E2E confirm the intended RPC, direct-write, roster, and
content-isolation boundaries. This closes P0-CLS-01 only; it does not declare
the overall website deployment-ready.

## Post-Failure Remote Apply Audit (2026-07-16)

**Confirmed classification: B. PARTIALLY APPLIED. Do not run `0043` again.**

The first manual attempt to apply
`0043_classroom_creation_rls_hardening.sql` ended with PostgreSQL error
`42723`, reporting that `create_teacher_classroom` already existed with the
same argument types. The supplied read-only catalog metadata proves that the
live project currently has this RPC contract:

```text
public.create_teacher_classroom(
  p_name text,
  p_subject text,
  p_description text,
  p_organization_id uuid,
  p_request_id uuid
) returns table(classroom_id uuid, display_code text)
security definer: true
search_path: public, private, extensions
execute: anon=false, authenticated=true, service_role=true
definition hash: e7a8c8b698fb0224505841c8a78597d8
```

This is compatible with the intended 0043 application contract. The supplied
catalog metadata also confirms that
`private.can_create_classroom_in_organization(uuid)` exists with its fixed
`public, private` search path and no normal-client EXECUTE grant. That helper
is introduced before the failed public `CREATE FUNCTION` statement in 0043 and
does not exist in earlier canonical Classroom migrations. At least part of
0043 therefore reached the live schema; no SQL Editor transaction assumption
is needed for this classification.

`0030_teacher_classroom_rls_fix.sql` first defined the documented canonical
RPC. Its fifth argument was `p_join_code text` and it returned the same
`table(classroom_id uuid, display_code text)` contract. The UUID-request shape
was introduced by 0043, which intended to retire the 0030 text-join-code
overload rather than add a parallel public contract. The current Teacher
server action already calls the UUID-request shape and requires the same safe
return fields.

The local clean-schema smoke did not detect this collision because its
pre-0043 fixture starts from the canonical 0030 text-join-code overload. It
does not seed a pre-existing UUID-request overload, which is a live-state
drift condition outside the canonical migration sequence.

### Exact Read-Only Classification Checks

Run the catalog-only block in
`docs/security/classroom-create-rls-manual-apply.md` before any new SQL is
applied. It checks every 0043 object or privilege transition that precedes the
failing `CREATE FUNCTION` statement: the idempotency column and constraint,
direct-write policies and grants, the private organization helper, and both
the retired 0030 and current UUID RPC overloads.

Classify the result as follows:

- **A. FULLY ROLLED BACK:** no 0043-specific column, constraint, helper,
  policy/grant transition, or old-overload retirement is present, and a
  separately documented earlier source accounts for the current UUID RPC.
- **B. PARTIALLY APPLIED:** any 0043-specific column, constraint, helper,
  policy/grant transition, or old-overload retirement is present.
- **C. UNKNOWN:** the current state cannot establish the source or atomicity
  of the matching UUID RPC. This was the temporary classification before the
  0043-specific helper metadata was supplied.

### Migration Decision

No remote migration was changed or rerun for this audit.

- If the read-only evidence establishes **A** and proves 0043 was never
  successfully applied, correct the un-applied 0043 before its first successful
  run: use `CREATE OR REPLACE FUNCTION` for the same input and return contract,
  retain `security definer` and the fixed search path, and explicitly reapply
  the intended EXECUTE revokes/grants inside an explicit transaction.
- **B is confirmed.** `0043` remains the failed-attempt artifact and
  `0044_classroom_creation_rpc_reconciliation.sql` is the only reviewed remote
  apply candidate. It uses an explicit transaction and a catalog preflight for
  the existing UUID RPC/return contract, then uses `CREATE OR REPLACE` to
  replace the compatible function body. It never drops the UUID RPC and never
  uses `CASCADE`.

The disposable PostgreSQL harness now covers a clean canonical application
through 0043, reproduces the 42723 collision by applying 0043 over an existing
UUID RPC, applies 0044, applies 0044 a second time, and asserts the Server
Action return contract remains `TABLE(classroom_id uuid, display_code text)`.
The existing role, direct-write, membership, server-generated join-code, and
Bank-isolation checks remain part of that matrix.

## Post-0044 Live Schema Evidence

`0044_classroom_creation_rpc_reconciliation.sql` is
**APPLIED_MANUALLY_NOT_LEDGERED**. It was applied exactly once; no Supabase
internal migration-ledger row is claimed or fabricated.

The supplied sanitized post-apply catalog results confirm:

- only the UUID-request `public.create_teacher_classroom(text, text, text,
  uuid, uuid)` contract exists;
- it returns `TABLE(classroom_id uuid, display_code text)`, is security
  definer, has fixed `public, private, extensions` search path, denies anon
  EXECUTE, and permits authenticated/service-role EXECUTE;
- its recorded definition hash is `4ca996b5d78c040c67fd96d23bafea40`;
- `private.can_create_classroom_in_organization(uuid)` is security definer,
  has fixed `public, private` search path, and permits only service-role
  EXECUTE;
- the constrained co-teacher and student-status RPCs are security definer,
  have fixed search paths, deny anon, and permit authenticated/service-role;
- anon and authenticated lack direct Classroom INSERT and direct
  Classroom-member INSERT/UPDATE, while service role retains those grants;
- `classrooms_teacher_create`, `classroom_members_teacher_write`, and
  `classroom_members_teacher_update` are absent.

This catalog evidence was initially schema-only. It is now supplemented by one
approved, sanitized disposable role-E2E execution. The validation created only
the harness-owned role categories and one disposable Classroom as needed,
checked the positive and negative authorization matrix through the real RPC
and supported roster paths, then completed exact-ID cleanup. No fixture
identity, credential, URL, project reference, or row content is retained in
this report.

## Final Disposable Role E2E Validation

The approved disposable process-only role-E2E was executed exactly once using
the dedicated harness. It passed all required P0-CLS-01 workflow checks:

- an active Teacher created one atomic Classroom and creator membership through
  the RPC, with the actor derived from `auth.uid()`;
- repeated use of the same request UUID was idempotent, with no duplicate
  Classroom or creator membership;
- anonymous, Student, inactive Teacher, and unrelated Teacher foreign-
  organization creation attempts were denied;
- direct Teacher inserts to `classrooms` and direct Teacher insert/update
  attempts to `classroom_members` were denied;
- valid Student join-code enrollment worked, while a removed Student could not
  silently rejoin;
- unrelated Teacher management and removed co-teacher management were denied,
  while supported owner/co-teacher roster operations preserved authorization;
- Classroom operations created no Bank membership and granted no source-Bank
  access; they also caused no Review Draft, Blueprint, Assignment, publication,
  source-asset, or Practice-evidence side effect; and
- `finally` cleanup removed only the harness-captured fixture rows. No fixture
  or credential remained.

Fixture categories were a primary disposable organization, a foreign
organization, active Teacher, Student, unrelated active Teacher, inactive
Teacher, the minimum organization memberships, join-code rows, and at most one
disposable Classroom. No fixture identities are recorded.

## Root Cause

The Classroom foundation (`0018`) allowed authenticated Classroom managers to
write `public.classrooms` and `public.classroom_members` directly under RLS.
Migration `0030` added `public.create_teacher_classroom`, but its older RPC
shape still accepted a caller-provided join code and live validation found
stale-function/schema mismatches. Aggregate smoke therefore reached a
Classroom-creation failure rather than proving the Teacher-to-Classroom path.

The risk was broader than a missing create policy: a Classroom manager could
also attempt to insert a membership row directly. That is not an acceptable
initial-creation or roster-authority contract.

## Reviewed Creation Architecture

```text
Teacher create form
  -> server action requires Teacher access
  -> public.create_teacher_classroom(..., request_id)
  -> auth.uid(), active profile, and allowed organization rechecked in PostgreSQL
  -> Classroom + exactly one creator teacher membership + hashed join code
  -> safe Classroom id and display code only
```

The browser submits only name, subject, description, and a server-rendered
non-privileged idempotency key. It does not submit creator, owner, membership
user, role, status, organization authority, or a join code. The server action
passes no organization id because the RPC derives and validates the allowed
scope itself.

## Forward Migrations

`0043_classroom_creation_rls_hardening.sql`:

- retires direct authenticated `INSERT` access to `public.classrooms`;
- retires direct authenticated `INSERT` and `UPDATE` access to
  `public.classroom_members`;
- preserves service-role table access for trusted workers and disposable test
  cleanup;
- replaces the old join-code parameter with a UUID idempotency key;
- generates the raw display join code only inside the RPC and stores only the
  existing hash/hint fields;
- adds narrowly-scoped authenticated RPCs for owner co-teacher add/remove and
  manager student active/removed status changes;
- preserves the existing student `join_classroom_by_code` enrollment path.

The RPCs use security definer with fixed search paths and recheck the
authenticated actor. Co-teacher and Classroom membership are operational
permissions only: they never insert `bank_members`, expose a source Bank, make
an Assignment, publish a question, expose Review Drafts, expose Blueprints, or
write Practice evidence.

`0044_classroom_creation_rpc_reconciliation.sql` is the forward-only repair
for the confirmed partial state. It transactionally preflights the existing
UUID RPC's return contract, uses `CREATE OR REPLACE` only for that compatible
contract, explicitly reapplies safe grants, and does not drop the live UUID
RPC or use `CASCADE`.

## Organization Contract

An active `teacher`, `admin`, or `super_admin` may create only in an active
organization permitted by current product rules:

- `super_admin` may use an active organization;
- other teacher-capable users must have that organization as their default
  organization or hold active `teacher`/`admin` organization membership.

Inactive profiles and inactive organizations are denied inside PostgreSQL. The
initial membership always belongs to `auth.uid()` and has the `teacher` role,
even when an administrator acts through the teacher workflow.

## Validation Added

`scripts/classroom-create-rls-smoke.mjs` checks the source contract and runs
the core authorization matrix against an embedded PostgreSQL instance built
from the canonical Classroom migrations. When the disposable environment is
available, it also runs the same boundary checks against the live clean
project. The matrix verifies:

1. active Teacher creation succeeds and is idempotent;
2. the creator has exactly one active teacher membership;
3. direct Classroom and membership inserts are denied;
4. Student and anonymous create calls are denied;
5. server-generated join codes continue to enroll Students;
6. removed Students cannot silently rejoin;
7. no Assignment or Bank membership is created by Classroom creation;
8. an unrelated Teacher is denied a foreign-organization create attempt when
   dedicated credentials are configured.

The aggregate harness imports the focused smoke. Classroom foundation and
operations smokes use the creation/co-teacher roster RPC paths rather than
direct Teacher fixture inserts.

## Local Results

Completed in the isolated worktree:

- `npm.cmd install`
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/route-smoke.mjs`
- `node scripts/security-smoke.mjs`
- `node scripts/migration-reconciliation-smoke.mjs`
- `node scripts/classroom-create-rls-smoke.mjs` (passed source assertions plus
  clean-through-0043 apply, a reproduced 42723 collision, twice-applied 0044
  reconciliation, and the embedded canonical PostgreSQL RLS matrix; live phase
  skipped because the isolated worktree has no disposable environment)
- `node scripts/migration-reconciliation-smoke.mjs` after registering 0044
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/classroom-operations-smoke.mjs` (source assertions)
- `node scripts/classroom-ui-rebuild-smoke.mjs` (source assertions)
- `node scripts/teacher-workspace-shell-smoke.mjs` (source assertions)
- `node scripts/teacher-beta-readiness-smoke.mjs`
- `npm.cmd run perf:budget`
- `npm.cmd run perf:audit`
- `npm.cmd run analyze`

The aggregate `npm.cmd run smoke` passed its earlier static and embedded
Postgres harnesses, then stopped at `scripts/supabase-rls-smoke.mjs` because
this isolated worktree has no ignored Supabase URL/anon-key environment. The
individually invoked `classroom-foundation`, `supabase-rls`, Student My Work,
assignment-Practice, assignment-from-Bank, and Bank-review smokes were blocked
by the same local environment condition. Those historical local results are
not a substitute for live proof. The subsequently approved disposable role-E2E
provides the required live P0-CLS-01 proof.

### Disposable Role-Fixture Harness

`scripts/classroom-live-role-e2e.mjs` now provides the reviewed live path for
this remaining proof. It is deliberately separate from the older Classroom
smokes: those scripts may read their legacy ignored test configuration, while
this command never imports `dotenv`, never reads an environment file, never
uses pre-existing test users, and never writes generated credentials anywhere.

Required **process-only** variable names are:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
CLEAN_SUPABASE_SERVICE_ROLE_KEY
CLASSROOM_LIVE_E2E_ENVIRONMENT
CLASSROOM_LIVE_E2E_EXPECTED_PROJECT_REF
CLASSROOM_LIVE_E2E_CONFIRM_CLEANUP
```

The command refuses to start if any required variable is absent, if `NODE_ENV`
is production, if the disposable acknowledgement is absent, if the explicit
destructive-cleanup acknowledgement is absent, or if the configured Supabase
project reference does not match the independently supplied expected project
reference. It never logs variable values, URLs, credentials, generated emails,
passwords, join codes, user IDs, or raw request errors.

For a single opaque run identifier, the harness creates only:

- a primary disposable organization and a separate foreign organization;
- an active Teacher, Student, unrelated active Teacher, and disabled Teacher;
- the minimum active/disabled organization memberships required by the current
  Classroom authorization contract; and
- one Classroom through `public.create_teacher_classroom` if the active Teacher
  authorization succeeds.

The generated credentials and join code exist only in process memory. The
command verifies creator derivation from `auth.uid()`, atomic creator
membership, request-UUID idempotency, Student/anonymous/inactive/unrelated
denials, direct table-write denials, valid Student enrollment, removed-Student
rejoin denial, owner/co-teacher roster behavior, Bank-membership isolation, and
unchanged Review Draft, Blueprint, Assignment, publication, source-file, and
Practice-evidence counts for the disposable fixture scope.

Cleanup is in `finally` and uses only captured exact IDs. It removes join-code
rows, Classroom memberships, the disposable Classroom, captured organization
memberships, captured profiles, captured organizations, and captured auth users
in dependency order. Cleanup verification is part of the command. A cleanup
failure fails the run and reports only fixture categories plus the opaque run
identifier.

`scripts/classroom-live-role-e2e-smoke.mjs` is a non-live source check for the
production guard, explicit acknowledgements, project identity match, no-env
loading rule, no broad delete predicates, `finally` cleanup, and the required
role/isolation coverage. It passed locally. The live harness was subsequently
executed exactly once through approved process-only environment injection and
passed with exact-ID cleanup.

### Regression Validation Execution

Passed in the final evidence pass:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/classroom-create-rls-smoke.mjs` local/embedded phase
- `node scripts/classroom-live-role-e2e-smoke.mjs` (non-live safety source
  check)
- `node scripts/classroom-operations-smoke.mjs` (source checks; its separate
  live phase skipped because this isolated worktree has no injected Supabase
  process environment)
- `node scripts/security-smoke.mjs`
- `node scripts/migration-reconciliation-smoke.mjs`
- `node scripts/teacher-beta-readiness-smoke.mjs` source phase
- `npm.cmd run perf:budget`
- `npm.cmd run perf:audit`
- `npm.cmd run analyze`

Some broader local-only commands remain environment-dependent when run from an
isolated worktree without injected process variables: `classroom-foundation`,
`supabase-rls`, Student My Work, assignment-Practice evidence,
assignment-from-Bank, and bank-import-review smokes. Their absence from that
local pass is not a missing P0-CLS-01 role-E2E proof; the approved disposable
role harness recorded that proof separately. `route-smoke` also requires a
local server. Aggregate `npm.cmd run smoke` may stop at the same local missing-
environment gate.

The final aggregate `npm.cmd run smoke` did pass its preceding static and
embedded checks, including the profile, migration-reconciliation, provider-
gateway, Markdown, asset-import, and package-import checks. It then stopped at
`scripts/supabase-rls-smoke.mjs` because the isolated worktree has no
`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` process values.
That aggregate stop is recorded as environment-blocked, not as a passing live
RLS result and not as a regression in the separately completed role E2E.

## Scope and Non-Goals

This change does not modify historical migrations, migrations `0039` through
`0042`, provider gateway behavior, Google Login, AI execution, Practice or
self-study behavior, Storage, source Bank visibility, or assignments. It does
not create Bank membership automatically.

## P0 Closure Decision

P0-CLS-01 is **COMPLETED / LIVE VALIDATED**. `0044` was applied exactly once
after the partial `0043` state; the live RPC, role-denial, direct-write,
membership, join/removal/rejoin, roster-authorization, Bank/content-isolation,
and exact-cleanup conditions all passed in the approved disposable validation.

No Supabase migration ledger history is fabricated: `0043` remains
`PARTIALLY_APPLIED_FAILED`, and `0044` remains
`APPLIED_MANUALLY_NOT_LEDGERED`. This closes P0-CLS-01 only. It does not make
the overall website deployment-ready.
