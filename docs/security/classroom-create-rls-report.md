# P0-CLS-01 Teacher Classroom Creation RLS Report

## Status

**IN PROGRESS / SCHEMA LIVE VALIDATED / ROLE E2E BLOCKED.** Migration `0043`
is partially applied and must not be replayed. Forward-only reconciliation
`0044` was applied exactly once through SQL Editor. Sanitized catalog evidence
confirms the intended RPC and direct-write boundary. P0 remains open until the
dedicated disposable Teacher/Student role E2E can run with approved fixtures.

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

This is live schema evidence, not role-backed workflow proof. The isolated
worktree has no approved disposable `NEXT_PUBLIC_SUPABASE_URL`, anon key,
service-role cleanup key, or Teacher/Student test credentials available to the
smoke process. No live fixture was created, no real Classroom or user row was
read, and no cleanup query was run. Therefore positive Teacher creation,
idempotency, role/organization denials, Student join/removal, co-teacher,
archive/reopen, assignment compatibility, Bank/content isolation, and cleanup
remain unvalidated against the remote project.

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
this isolated worktree has no ignored Supabase URL/anon-key environment.
The individually invoked `classroom-foundation`, `supabase-rls`, Student My
Work, assignment-Practice, assignment-from-Bank, and Bank-review smokes are
blocked by the same missing disposable environment. This is not a passing live
result.

Live role E2E cannot be claimed yet: the isolated worktree has no approved
disposable Supabase process environment. The focused live suite must be rerun
with dedicated Teacher/Student credentials and a service-role cleanup client;
it must create and remove only its exact disposable Classroom fixture.

### Current Validation Execution

Passed in this final documentation pass:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/classroom-create-rls-smoke.mjs` local/embedded phase
- `node scripts/security-smoke.mjs`
- `node scripts/migration-reconciliation-smoke.mjs`
- `node scripts/teacher-beta-readiness-smoke.mjs` source phase
- `npm.cmd run perf:budget`
- `npm.cmd run perf:audit`
- `npm.cmd run analyze`

Blocked, rather than passed: `classroom-foundation`, `supabase-rls`, Student
My Work, assignment-Practice evidence, assignment-from-Bank, and bank-import
review smokes require the unavailable approved disposable Supabase process
environment. `route-smoke` also had no local server on port 3000. Aggregate
`npm.cmd run smoke` stopped at the same missing Supabase environment gate.

## Scope and Non-Goals

This change does not modify historical migrations, migrations `0039` through
`0042`, provider gateway behavior, Google Login, AI execution, Practice or
self-study behavior, Storage, source Bank visibility, or assignments. It does
not create Bank membership automatically.

## P0 Closure Gate

P0-CLS-01 may close only after all of the following are recorded:

1. `0044_classroom_creation_rpc_reconciliation.sql` was applied exactly once
   after the recorded partial 0043 state.
2. A real disposable Teacher creates a Classroom through the RPC.
3. Student, anonymous, inactive, and unrelated-organization negative cases
   are denied as applicable to available fixtures.
4. Direct authenticated inserts remain denied for both Classroom tables.
5. Creator membership, join-code enrollment, removal/rejoin behavior, Bank
   isolation, and the Classroom/assignment smoke suite pass.

Until then, deployment remains blocked for this P0 workflow. This does not make
the overall website deployment-ready.
