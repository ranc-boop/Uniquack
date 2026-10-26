# Teacher Progress UI Polish Report

## Executive Summary

This PR polishes the teacher-facing assignment progress view without adding a full analytics dashboard.

The assignment detail page now presents a compact teacher progress workspace: summary cards, one row per active classroom student, linked Practice evidence, and clearer draft/assigned states. The classroom assignment list also shows lightweight progress counts so teachers can scan assignments before opening details.

## Routes / Pages Changed

- `/teacher/classrooms/[id]/assignments`
- `/teacher/classrooms/[id]/assignments/[assignmentId]`

Supporting helper:

- `src/lib/teacher-assignments.ts`

Smoke coverage:

- `scripts/teacher-progress-ui-smoke.mjs`
- `scripts/smoke-all.mjs`
- `scripts/security-smoke.mjs`
- `scripts/route-smoke.mjs`

## Progress Summary Behavior

Assignment detail now shows summary cards for:

- assignment status: live or draft
- active classroom student count
- not started count
- in progress count
- completed count
- linked Practice session count and latest activity timestamp

The assignment list now shows:

- assignment status
- due date
- item count
- completed / total students
- latest practice activity
- not started / active / done counts

## Student Progress Table Behavior

The assignment detail page shows one row per active classroom student:

- display name with email/username fallback
- progress status
- started timestamp
- completed timestamp
- linked Practice session count
- Practice attempt count and correct count when available
- latest Practice activity timestamp
- muted linked Practice session id for traceability

## Evidence Fields Shown

The UI uses existing clean schema only:

- `classroom_members`
- `student_assignment_progress`
- `assignment_practice_sessions`
- `practice_sessions`
- `practice_attempts`

Evidence is intentionally compact. It displays counts and bounded summaries, not raw practice logs or a full analytics dashboard.

## Empty / Loading / Error States

Added or improved copy for:

- draft assignment is teacher-only
- assigned classroom has no active students yet
- students are on roster but no linked Practice evidence exists yet
- assignment item references unavailable content

No new client-side loading state was required because these routes are server-rendered and already route-protected.

## RLS / Security Result

The implementation relies on existing clean Supabase RLS and teacher route guards:

- teacher must pass `requireTeacher()`
- classroom and assignment queries remain scoped through current policies
- student progress reads are only surfaced through managed classroom assignment pages
- anonymous writes remain blocked
- unrelated classroom assignments remain hidden from students

The new smoke verifies teacher progress visibility and unrelated classroom isolation.

## Smoke Coverage

Added `scripts/teacher-progress-ui-smoke.mjs`.

It verifies:

- teacher progress UI source includes summary/table copy
- teacher can read student assignment progress
- linked Practice evidence is preserved
- unrelated classroom assignment is not visible to the student
- smoke-created rows are cleaned up or archived safely

`npm run smoke` now includes the teacher progress UI smoke.

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/student-my-work-smoke.mjs`
- `node scripts/teacher-assignment-flow-smoke.mjs`
- `node scripts/assignment-practice-evidence-smoke.mjs`
- `node scripts/teacher-progress-ui-smoke.mjs`
- `node scripts/question-assets-security-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Known existing note from question asset smoke:

- public bucket URLs remain directly readable when known, including draft assets.

## Remaining Blockers

No blockers for this UI polish slice.

Future work can add a richer analytics dashboard, gradebook, exports, or session drill-down pages, but those remain outside this PR.

## Explicit Non-goals Preserved

- No Google Classroom.
- No wearable UI.
- No Course Builder generation change.
- No full analytics dashboard.
- No grading system.
- No rubric scoring workflow.
- No provider calls.
- No schema changes.
- No Review Draft approval or auto-publish behavior.
