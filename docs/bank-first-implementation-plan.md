# Bank-first Implementation Plan

Date: 2026-07-05

This plan slices the bank-first rebuild into small PRs. It is not an implementation.

## Planning Inputs

Available on current `main`:

- `docs/archive/reports/classroom-first-rollback-dry-run.md`
- `docs/archive/reports/bank-first-reconciliation-execution-plan.md`
- `docs/archive/reports/school-workflow-mvp-checkpoint.md`
- `docs/product-role-classroom-assignment-plan.md`

Missing from current `main` during this task:

- `docs/emergency-old-demo-reconciliation-audit.md`
- `docs/recent-feature-rollback-plan.md`
- `docs/rebuilt-teacher-workflow-architecture-plan.md`

Those missing docs were not checked out from random branches for this docs-only task.

## PR 1: Guardrails Merge

Goal: add repo-level guardrails, product context, design guidance, PRD, domain model, and implementation plan.

Non-goals: runtime features, migrations, provider changes, Supabase mutation.

Likely files:

- `AGENTS.md`
- `CONTEXT.md`
- `DESIGN.md`
- `docs/bank-first-product-prd.md`
- `docs/bank-first-domain-model.md`
- `docs/bank-first-implementation-plan.md`

Migration expected: no.

Smoke expected: docs-only git diff/status.

Rollback risk: low.

## PR 2: Runtime Reconciliation Branch

Goal: demote classroom-first primary routes and replace `/teacher` with bank-first dashboard placeholder.

Non-goals: deleting migrations, DB rollback, rebuilding all bank features.

Likely files:

- `src/app/teacher/page.tsx`
- teacher/student nav files
- classroom-first route copy or redirects
- route/security smoke scripts

Migration expected: no.

Smoke expected:

- route smoke for teacher dashboard placeholder
- no classroom-first primary navigation assertion

Rollback risk: medium because routes and smoke expectations change.

## PR 3: Bank Foundation

Goal: create/list/detail banks.

Non-goals: import integration, assignment flow, public push.

Likely files:

- bank routes under teacher workspace
- bank helper library
- clean migration for `question_banks`
- route/security/RLS smoke

Migration expected: yes.

Smoke expected:

- teacher can list banks
- empty state
- RLS/admin-only support behavior

Rollback risk: medium.

## PR 4: Bank Share Code, Members, Roles

Goal: allow teachers to share/join banks and manage roles.

Non-goals: student access, classroom join behavior.

Likely files:

- bank members/share code migration
- teacher bank member UI
- share/join actions
- RLS smoke

Migration expected: yes.

Smoke expected:

- owner can create/rotate/revoke code
- teacher can join
- removed member loses access
- no student bank browse

Rollback risk: medium.

## PR 5: Teacher-private Import To Bank Review Drafts

Goal: target AI import and batch import outputs to a teacher bank.

Non-goals: public publishing, assignment creation.

Likely files:

- AI import ownership/target selectors
- Review Draft target bank metadata
- import/review smoke

Migration expected: maybe, depending on existing review table fields.

Smoke expected:

- import creates Review Drafts with target bank
- no auto-publish
- source lineage preserved

Rollback risk: medium/high because Review Drafts are safety-critical.

## PR 6: Approve Review Drafts Into Bank

Goal: approval writes canonical questions and bank membership rows.

Non-goals: public bank promotion.

Likely files:

- Review Draft approval actions
- bank question helper
- security smoke

Migration expected: maybe.

Smoke expected:

- approved draft appears in target bank
- unapproved draft cannot be assigned
- lineage preserved

Rollback risk: high if approval path is touched broadly.

## PR 7: Pull Public Questions Into Bank

Goal: copy/reference public approved questions into teacher private/shared bank.

Non-goals: editing public source, public promotion.

Likely files:

- public library UI/actions
- bank question copy/reference helper
- route/security smoke

Migration expected: maybe.

Smoke expected:

- teacher can pull approved public item
- provenance preserved
- private copy not globally published

Rollback risk: medium.

## PR 8: Push/Promote Bank Questions To Public Review

Goal: submit private/shared bank questions to public review gate.

Non-goals: direct public publish.

Likely files:

- contribution review tables or fields
- admin review UI
- bank contribution actions

Migration expected: likely.

Smoke expected:

- teacher submit creates review item
- public publish requires review
- rejected item remains private/shared

Rollback risk: high because public visibility is safety-critical.

## PR 9: Assignment From Bank Questions

Goal: assignment builder starts from selected bank questions/packages.

Non-goals: rebuilding Practice engine.

Likely files:

- teacher assignment routes
- `src/lib/teacher-assignments.ts`
- assignment source metadata usage
- route/smoke updates

Migration expected: probably no if `0024` is sufficient.

Smoke expected:

- teacher selects bank question
- student sees assigned item only
- student cannot browse bank

Rollback risk: medium/high.

## PR 10: Student Assignment Practice Targeted Fix

Goal: reproduce and fix the student assignment Practice "Key is not allowed" issue.

Non-goals: schema cutover, new practice feature.

Likely files:

- assignment practice API
- Practice Agent loader/client
- assignment linkage helper

Migration expected: no unless blocker proves otherwise.

Smoke expected:

- failing repro captured
- assignment launch succeeds
- evidence links to assignment

Rollback risk: medium.

## PR 11: Course Builder As Bank / Package Generator

Goal: rebuild Course Builder so it produces reviewable bank/package content before assignment.

Non-goals: direct assignment shortcut, raw AI publish.

Likely files:

- teacher Course Builder routes
- package/bank helpers
- Review Draft integration

Migration expected: maybe.

Smoke expected:

- generated package is reviewable
- approved package enters bank
- optional assignment happens after bank/package approval

Rollback risk: high because AI/review/course flows intersect.

## PR 12: Teacher Progress / Reporting Polish

Goal: polish teacher evidence and reporting once bank-first assignments are stable.

Non-goals: new evidence schema.

Likely files:

- teacher progress pages
- assignment detail
- route smoke

Migration expected: no.

Smoke expected:

- teacher sees progress by assignment and bank source
- empty states and status cards work

Rollback risk: low/medium.

## PR 13: Google Login / Classroom Later

Goal: add optional Google login and later Google Classroom import.

Non-goals: replacing native classroom/bank model.

Migration expected: yes for account linking and classroom import metadata.

Smoke expected:

- native flows still work without Google
- imported classrooms map into internal tables

Rollback risk: high due external integration.

