# Bank-first Reconciliation Execution Plan

Date: 2026-07-05

This plan follows the classroom-first rollback dry run. It describes how to reconcile the product around a bank-first architecture without rolling back database migrations or mutating Supabase.

## Product Direction

The official runtime model should be bank-first:

- Question Banks are the primary teacher content workspace.
- Banks can be private, shared, or public.
- Teachers import, review, edit, and organize questions inside banks.
- Classrooms and assignments deliver selected bank content to students.
- Practice Agent consumes assigned questions, but assignment is not the source of truth for content.
- Course Builder creates reusable packages or bank entries before they become assignments.

Classrooms remain important, but they are a delivery and roster layer.

## Non-negotiable Constraints

- Do not delete committed clean migrations.
- Do not apply database rollback SQL.
- Do not mutate Supabase during reconciliation planning.
- Do not weaken Review Draft gates.
- Do not auto-publish imported or generated questions.
- Do not restore legacy tags as primary UI.
- Do not touch provider credentials or `/admin/ai-settings`.
- Keep old classroom-first code out of primary demo paths once the bank-first shell exists.

## Proposed Branch Sequence

### 1. Add Product Guardrail Docs

Create or update:

- `AGENTS.md`
- `CONTEXT.md`
- `DESIGN.md`

Required content:

- bank-first is the product source of truth
- classrooms are delivery/roster layer only
- assignments are created from bank/package content
- AI import writes to Review Drafts, then approved bank content
- no direct publish from AI import
- public/shared/private bank boundaries

This prevents future PRs from drifting back into classroom-first routing.

### 2. Bank-first PRD and Domain Model

Create a concise bank-first product spec covering:

- Bank
- Bank membership
- Bank role
- Bank visibility
- Bank share code
- Bank item
- Bank package
- Assignment from bank
- Public contribution/review workflow

Output should be a product and engineering reference, not a migration yet.

### 3. Question Bank / Library Foundation

Create runtime helpers and UI shell for:

- Teacher Library
- My Banks
- Shared With Me
- Public Library
- Bank detail
- Bank item list
- Bank ownership and role labels

If schema already supports enough of this, use existing tables. If not, add forward-only clean migrations.

### 4. Bank Share Code, Members, and Roles

Add share/join behavior for banks:

- teacher creates share code
- other teacher joins shared bank
- roles: owner, editor, viewer
- revoke/rotate code
- remove member

This should replace the "classroom join code" mental model for teacher collaboration.

### 5. Teacher Shell and Navigation

Teacher navigation should foreground:

- Library
- Imports
- Review Drafts
- Assignments
- Classes
- Progress

Classes should not be the first or only teacher destination.

The current `/teacher` redirect to `/teacher/classrooms` should be replaced with a bank-first teacher dashboard once the new shell exists.

### 6. Teacher-private Import to Review Drafts to Bank

Connect AI PDF Import and batch import into a teacher-owned bank workflow:

```text
Upload/import
-> Review Drafts
-> approve selected drafts
-> add to private/shared bank
```

Rules:

- no auto-publish
- source metadata preserved
- taxonomy remains active leaf based
- teacher can choose destination bank

### 7. Public Pull Into Private or Shared Bank

Add ability to copy approved public questions/packages into a teacher bank:

```text
Public Library
-> select items
-> copy to My Bank or Shared Bank
```

The copy should preserve provenance while creating teacher-editable bank entries.

### 8. Private or Shared Push to Public Review Gate

Add contribution workflow:

```text
Private/shared bank item
-> submit to public review
-> admin review
-> publish to public library
```

Never allow direct public publish by ordinary teacher action.

### 9. Assignment From Bank Questions

Rebuild assignment creation so teacher starts from a bank or package:

```text
Choose bank/package
-> select questions
-> choose class/students
-> set due date
-> assign
```

This preserves useful classroom/assignment tables while correcting the UX and source-of-truth model.

### 10. Practice Assignment Fix

Fix the student assignment Practice issue in a targeted PR:

- reproduce the "Key is not allowed" error
- verify assignment launch payload
- keep Practice Agent normal practice mode intact
- keep assignment evidence linked to assignment attempt/session

This should be done after bank-first assignment creation is stable.

### 11. Course Builder Rebuild

Rebuild Course Builder as a bank/package generator:

```text
Course material
-> blueprint/package plan
-> generated/reviewable questions
-> Review Drafts
-> bank package
-> optional assignment
```

Course Builder should not be a classroom-first assignment shortcut.

## Runtime Rollback Implementation Plan

The future rollback/reconciliation PR should be code-only unless a forward migration is absolutely required.

Recommended actions:

1. Keep clean migrations `0018` through `0024`.
2. Hide or replace classroom-first teacher/student routes from navigation.
3. Keep direct URLs from crashing with placeholder or redirect pages while bank-first routes are built.
4. Remove classroom-first smoke scripts or mark them obsolete.
5. Add bank-first smoke coverage before deleting route expectations.
6. Update docs that currently describe classroom-first MVP as the current product.

Potential files to rewrite or remove in a future implementation:

- `src/app/teacher/classrooms/**`
- `src/app/student/classrooms/**`
- `src/app/student/work/**`
- `src/app/teacher/course-builder/**`
- `src/app/api/practice/assignments/start/route.ts`
- `src/lib/teacher-assignments.ts`
- `src/lib/student-work.ts`
- `src/lib/course-builder/assignment-bridge.ts`
- classroom-first smoke scripts

Do not remove these in a planning-only PR.

## Smoke and Test Plan

For the actual reconciliation implementation, run:

```bash
npm.cmd run lint
npm.cmd run build
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node scripts/supabase-rls-smoke.mjs
npm.cmd run smoke
```

Add focused bank-first smoke coverage for:

- teacher library route
- bank creation/listing
- bank share/join flow
- import to Review Drafts to bank
- assignment created from bank
- student assignment launch once fixed

## Acceptance Criteria

The reconciliation is complete when:

- Teacher starts in a bank/library workspace, not classroom management.
- Question Bank is visibly the source of truth.
- AI import and Review Draft approval can target a bank.
- Shared/public/private boundaries are visible.
- Assignment creation starts from bank content.
- Classrooms are clearly a roster/delivery layer.
- Existing classroom schema remains compatible but not product-primary.
- No migrations were deleted.
- No old Supabase rollback was attempted.

## Explicit Approval Gate

This plan is not an implementation.

Before any actual route removal, code rollback, or smoke rewrite, get explicit user approval for the concrete implementation branch and file list.

