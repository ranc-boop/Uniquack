# Bank-first Runtime Reconciliation Report

Date: 2026-07-05

Branch: `codex/bank-first-runtime-reconciliation`

## Executive Summary

This PR performs the first code-only runtime reconciliation from classroom-first to bank-first.

The main change is that `/teacher` is now a real **Teacher Studio** hub. It no longer redirects straight to `/teacher/classrooms`. The page makes Question Bank / Library the teacher starting point, while preserving existing classroom and assignment routes as delivery-layer surfaces.

No database migrations were added or modified. No Supabase data was mutated.

## Routes Changed Or Added

Changed:

- `/teacher`
- `/teacher/classrooms`
- `/teacher/classrooms/[id]`
- `/teacher/classrooms/[id]/assignments`
- `/teacher/classrooms/[id]/assignments/new`
- `/teacher/classrooms/[id]/assignments/[assignmentId]`
- `/teacher/course-builder`

Added placeholder routes:

- `/teacher/banks`
- `/teacher/banks/new`
- `/teacher/banks/join`

## Teacher Studio Behavior

`/teacher` now renders a bank-first Teacher Studio hub with:

- My Question Banks / Library
- Create Question Bank
- Join Bank by Share Code
- Recent Imports
- Review Drafts
- Classrooms as delivery layer
- Assignments as delivery events
- Course Builder as future bank/package generator
- Progress/evidence positioning

The page explicitly states:

```text
Start by creating or joining a Question Bank. Classrooms and assignments deliver selected bank content.
```

The page does not show fake bank data and does not write any bank records.

## Bank Placeholder Behavior

The new bank placeholder pages are stable, guarded, and non-mutating:

- `/teacher/banks` explains private/shared/public bank concepts.
- `/teacher/banks/new` explains planned bank creation without an active form.
- `/teacher/banks/join` explains teacher-to-teacher bank share-code behavior without an active join form.

These placeholders set up the next PR: **Question Bank / Library Foundation**.

## Navigation Changes

Teacher users can now discover `/teacher` through the authenticated top navigation as **Teacher Studio**.

Admin and super admin users see **Teacher Studio preview** so admin access is explicit and not confused with normal teacher validation.

Admin sidebar also includes **Teacher Studio preview** as a support/workspace preview link.

## Classroom And Assignment Demotion Behavior

Existing classroom and assignment routes were preserved so direct URLs keep working.

Copy now frames these routes as delivery-layer surfaces:

- Classes are delivery spaces.
- Assignments are delivery events.
- Assignment visibility is not global publishing.
- Students do not gain access to a full teacher bank by joining a classroom.
- Future assignment creation should start from teacher bank content.

No classroom or assignment migrations were removed.

## Course Builder Handling

`/teacher/course-builder` remains available but is no longer positioned as a primary start point.

The page now states that Course Builder should generate bank packages before assignment. The existing direct bridge remains for compatibility only.

No generation behavior was added. No provider calls were added.

## Security And Access

Existing role guards remain in use:

- anonymous users are redirected to login for teacher routes
- student users are blocked by teacher role checks
- teacher users can access Teacher Studio and placeholders
- admin/super_admin access is explicit preview/support behavior

`requireTeacher()` now uses `/teacher` as its login return target instead of `/teacher/classrooms`.

Teacher sign-in now lands at `/teacher`.

## Smoke And Route Coverage

Updated smoke/source checks verify:

- `/teacher` no longer depends on the classroom redirect.
- `/teacher` renders bank-first Teacher Studio content.
- `/teacher/banks` renders.
- `/teacher/banks/new` renders.
- `/teacher/banks/join` renders.
- Teacher bank placeholder pages do not perform writes.
- Existing classroom/assignment routes still render as delivery-layer surfaces.
- Course Builder remains provider-free and framed as a future bank/package generator.

Existing classroom-first workflow mutation smokes remain in place as delivery-layer regression tests, not product acceptance for the bank-first architecture.

## Tests Run

```bash
npm.cmd run lint                      # passed
npm.cmd run build                     # passed
node scripts/security-smoke.mjs       # passed
node scripts/route-smoke.mjs          # passed
npm.cmd run perf:budget               # passed
```

## Remaining Blockers

- Full bank schema is not implemented.
- Bank create/join/share-code mutations are not implemented.
- Teacher-private import targeting into banks is not implemented.
- Review Draft approval into a selected bank is not implemented.
- Assignment-from-bank question selection is not implemented.
- Student assignment Practice "Key is not allowed" targeted fix remains a later PR.
- Course Builder still needs a bank/package generator rebuild.

## Explicit Non-goals

This PR does not include:

- bank schema
- bank share code mutation
- teacher-private import
- assignment-from-bank
- Student Practice bug fix
- Google Classroom
- wearable UI
- database migration
- Supabase mutation
- provider or AI calls
- Review Draft approval or publishing
