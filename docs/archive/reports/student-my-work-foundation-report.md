# Student My Work Foundation Report

Date: 2026-07-04

Branch: `codex/student-my-work-foundation`

## Executive Summary

Implemented the first Student My Work slice on top of the native classroom foundation.

This PR adds:

- assignment schema and scoped RLS
- student assigned-work dashboard at `/student/work`
- student assignment detail route at `/student/work/[id]`
- read-only student work helpers
- practice entry link from an assignment detail page
- Student My Work smoke coverage

It does not add the full Teacher Assignment Flow, Course Builder assignment bridge, Google Classroom, or wearable/state-aware UI.

## Schema Added

Clean migration history now includes the already-applied classroom follow-up migration versions for disposable DB alignment:

```text
supabase/clean-migrations/0019_classroom_join_code_display_and_roster_removal.sql
supabase/clean-migrations/0020_classroom_removed_member_rejoin_block.sql
```

Student My Work schema is added by:

```text
supabase/clean-migrations/0021_student_work_assignments.sql
supabase/clean-migrations/0022_student_work_assignment_policy_fix.sql
supabase/clean-migrations/0023_student_work_assignment_manager_scope_fix.sql
```

Tables:

- `public.assignments`
- `public.assignment_items`
- `public.student_assignment_progress`
- `public.assignment_practice_sessions`

The disposable clean Supabase project was migrated through `0023`, and the migration list showed local/remote alignment from `0001` through `0023`.

## RLS Model

Assignments:

- Teachers/co-teachers can manage assignments for classrooms they own or teach.
- Organization admins can manage assignments for classrooms in their organization.
- Students can read only `assigned` assignments for classrooms where they have an active student membership.
- Anonymous users cannot read or write assignments.

Assignment items:

- Students can read items only through readable assigned assignments.
- Teachers/admins can manage items only through assignment manager scope.

Progress:

- Students can insert/update only their own `student_assignment_progress` rows.
- Teachers/admins can read progress through assignment manager scope.
- Viewing My Work does not create progress rows.

Practice linkage:

- `assignment_practice_sessions` is present for the future Practice evidence bridge.
- This PR does not automatically create practice sessions from assignments.

## Student Routes Added

`/student/work`

- lists assigned work for the signed-in student
- shows classroom name, assignment title, due date, item count, and progress status
- shows the empty state `No assigned work yet`
- links to assignment detail

`/student/work/[id]`

- shows assignment title, classroom, instructions, due date, progress status, and item list
- shows question item summaries when available
- links to `/practice?assignmentId=<assignmentId>`
- clearly says Practice integration is coming next

`/student` now redirects to `/student/work`, making My Work the student dashboard surface.

## Assignment Read/Progress Behavior

Server-only helper:

```text
src/lib/student-work.ts
```

Helpers:

- `listStudentAssignedWork`
- `getStudentAssignedWorkDetail`

The helpers read assigned work and progress only. They do not insert, update, approve, publish, or mutate student work.

## Practice Entry Behavior

The assignment detail page includes an `Open Practice` button pointing to:

```text
/practice?assignmentId=<assignmentId>
```

The existing Practice page remains the learning engine. Full assignment-aware practice execution and progress updates are intentionally left for the next Practice Evidence Linkage slice.

## Smoke Coverage

Added:

```text
scripts/student-my-work-smoke.mjs
```

Updated:

```text
scripts/security-smoke.mjs
scripts/supabase-rls-smoke.mjs
scripts/route-smoke.mjs
scripts/smoke-all.mjs
```

Runtime smoke verifies:

- teacher/admin can create a smoke classroom assignment with one question item
- student sees assigned work for an active classroom membership
- student can read assignment item detail
- student can write own progress
- student cannot see work for a classroom they have not joined
- smoke-created data is scoped and cleaned up

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/student-my-work-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

## Remaining Blockers

- No full Teacher Assignment Flow yet.
- No Course Builder assignment bridge yet.
- Practice does not yet consume `assignmentId` to create assignment-linked practice sessions.
- Teacher progress dashboards are not implemented in this slice.
- Google Classroom and Google Login are still future work.
- Wearable/state-aware UI is intentionally not part of My Work foundation.

## Explicit Non-Goals Preserved

- No full teacher assignment builder.
- No Course Builder bridge.
- No Google Classroom.
- No wearable UI.
- No provider changes.
- No AI Parsing changes.
- No Review Draft approval or publishing changes.
- No auto-published questions.
