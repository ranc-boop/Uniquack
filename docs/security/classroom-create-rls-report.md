# P0-CLS-01 Teacher Classroom Creation RLS Report

## Status

**PENDING MANUAL APPLY AND LIVE VALIDATION.** This branch prepares the
forward-only fix, but the P0 is not closed until migration `0043` is applied
once to the clean Supabase project and the dedicated Teacher/Student checks
pass against that project.

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

## Forward Migration

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
  the embedded canonical PostgreSQL RLS matrix; live phase skipped because the
  isolated worktree has no disposable environment)
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

Live RLS checks cannot be claimed yet: the isolated worktree has no disposable
Supabase credentials, and `0043` has not been manually applied. The full
requested suite must be rerun after the one-time manual apply.

## Scope and Non-Goals

This change does not modify historical migrations, migrations `0039` through
`0042`, provider gateway behavior, Google Login, AI execution, Practice or
self-study behavior, Storage, source Bank visibility, or assignments. It does
not create Bank membership automatically.

## P0 Closure Gate

P0-CLS-01 may close only after all of the following are recorded:

1. `0043_classroom_creation_rls_hardening.sql` was applied exactly once.
2. A real disposable Teacher creates a Classroom through the RPC.
3. Student, anonymous, inactive, and unrelated-organization negative cases
   are denied as applicable to available fixtures.
4. Direct authenticated inserts remain denied for both Classroom tables.
5. Creator membership, join-code enrollment, removal/rejoin behavior, Bank
   isolation, and the Classroom/assignment smoke suite pass.

Until then, deployment remains blocked for this P0 workflow.
