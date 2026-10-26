# Classroom Operations Report

## Executive summary

T-CLASSROOM2 turns the teacher Classroom area into a real operations workspace while preserving the bank-first product model. Classroom now supports settings editing, join-code lifecycle, student roster operations, owner-controlled co-teacher operations, archive/reopen lifecycle, progress views, and Blueprint planning references without granting Question Bank or Blueprint access through classroom membership.

## Existing schema and migration decision

No migration was needed. The clean schema already supports the required safe states:

- `classrooms.status`: `active` / `archived`
- `classroom_members.role`: `teacher` / `co_teacher` / `student`
- `classroom_members.status`: `active` / `invited` / `removed`
- `classroom_join_codes.status`: `active` / `revoked` / `expired`
- `classroom_join_codes.display_code`: teacher-visible code, still validated by hashed code

Assignments and Publish Center already filter target classrooms to `status = active`, so archived classrooms are blocked from new delivery without touching history.

## Classroom overview

`/teacher/classrooms/[id]` now shows:

- lifecycle status
- active student count
- active assignment count
- co-teacher count
- latest activity
- join-code status
- completion summary
- students needing attention
- class team preview
- Blueprint planning context

Archived classrooms show a reopen/settings path instead of a publish CTA.

## Settings editing

`/teacher/classrooms/[id]/settings` now supports bounded server-action editing for:

- class name
- subject / section
- description

The server rechecks teacher access through classroom RLS and never trusts client-provided organization or ownership data.

## Archive/reopen lifecycle

Archive:

- sets `classrooms.status = archived`
- revokes active join codes
- removes the classroom from new Publish targets
- preserves assignments, attempts, progress, feedback, memberships, and history

Reopen:

- sets `classrooms.status = active`
- does not automatically regenerate a join code
- leaves history unchanged

No hard delete was added.

## Join-code lifecycle

Settings now supports:

- view current active code
- copy code
- rotate code
- disable joining
- enable joining
- show latest join-code change time

Rotation and disablement revoke active codes server-side. Code generation remains server-side and uses the existing hashed-code validation path.

## Roster behavior

`/teacher/classrooms/[id]/students` now shows active and removed students with:

- status
- joined date
- assigned/completed/practice summary
- latest assignment activity
- attention signal

Student removal is a soft `classroom_members.status = removed` update. It does not delete users, assignments, progress, feedback, attempts, or bank membership. Restoring is available only when the classroom is active.

## Co-teacher behavior

`/teacher/classrooms/[id]/teachers` now shows the owner and co-teachers. The classroom owner can add or remove co-teachers by existing teacher-capable email/username.

Adding or removing co-teachers does not touch `bank_members`, provider settings, source Question Bank access, Blueprint internals, or student private self-study.

## Linked Blueprint behavior

`/teacher/classrooms/[id]/blueprints` remains a planning reference surface. It shows bank-linked planning context only. It does not generate questions, publish Blueprints, assign Blueprints, or expose Blueprint internals to students.

## Classroom activity

The overview and roster derive bounded activity from existing assignment, progress, and practice-session links. No new global event table was introduced.

## Permissions/RLS

Confirmed through source and live smoke where credentials were available:

- classroom manager paths remain server/RLS-gated
- students cannot create classrooms
- students cannot read a teacher classroom before joining
- classroom join uses `join_classroom_by_code`
- old/revoked codes are invalid
- archived classrooms reject joins
- bank membership count is unchanged by classroom operations

Co-teacher live add/remove was skipped because no second teacher test credentials were configured.

## Historical evidence preservation

The live smoke creates a smoke assignment, seeds student progress as a fixture, creates a teacher feedback note, soft-removes the student, and verifies progress and feedback rows remain.

## Design result

The pages keep the existing teacher workspace style:

- pale sky/slate background
- white panels
- blue primary actions
- amber lifecycle warnings
- red/destructive avoided except for existing destructive system styles
- compact badges
- responsive cards/tables
- visible classroom subnavigation

## Files changed

- `src/app/teacher/classrooms/actions.ts`
- `src/app/teacher/classrooms/classroom-ui.tsx`
- `src/app/teacher/classrooms/copy-join-code-button.tsx`
- `src/app/teacher/classrooms/[id]/page.tsx`
- `src/app/teacher/classrooms/[id]/people/page.tsx`
- `src/app/teacher/classrooms/[id]/settings/page.tsx`
- `src/app/teacher/classrooms/[id]/students/page.tsx`
- `src/app/teacher/classrooms/[id]/teachers/page.tsx`
- `src/app/teacher/classrooms/[id]/assignments/actions.ts`
- `src/app/teacher/classrooms/[id]/assignments/page.tsx`
- `src/app/teacher/classrooms/[id]/assignments/new/page.tsx`
- `src/app/teacher/classrooms/[id]/analytics/page.tsx`
- `src/lib/teacher-classrooms.ts`
- `scripts/classroom-operations-smoke.mjs`
- updated classroom/route/security smoke coverage

## Smoke coverage

Added `scripts/classroom-operations-smoke.mjs`.

Coverage includes:

- overview exists
- settings update is server-authorized
- archive/reopen lifecycle
- join-code rotate/disable/enable
- roster removal preserves history
- co-teacher management does not grant bank membership
- linked Blueprint does not auto-publish
- source Bank remains private
- no provider calls
- no hard classroom delete
- no historical evidence cascade delete

## Tests/results

Completed checks:

- `npm.cmd run lint` passed
- `npm.cmd run build` passed
- `node scripts/security-smoke.mjs` passed
- `node scripts/route-smoke.mjs` passed with local dev server
- `node scripts/classroom-operations-smoke.mjs` passed source + live; co-teacher live add/remove skipped due missing second teacher credentials
- `node scripts/classroom-ui-rebuild-smoke.mjs` passed
- `node scripts/assignment-from-bank-smoke.mjs` passed
- `node scripts/publish-center-v2-smoke.mjs` passed
- `node scripts/assignment-practice-evidence-smoke.mjs` passed
- `node scripts/teacher-progress-evidence-foundation-smoke.mjs` passed
- `node scripts/teacher-assignment-attempt-drilldown-smoke.mjs` passed
- `node scripts/teacher-feedback-notes-mvp-smoke.mjs` passed
- `node scripts/supabase-rls-smoke.mjs` passed
- `npm.cmd run smoke` passed
- `npm.cmd run perf:budget` passed

## Remaining blockers

- No second teacher smoke credentials are configured, so co-teacher live add/remove cannot be fully exercised automatically.
- No schema migration was needed or applied.

## Explicit non-goals

- no Google Classroom sync
- no Google Login implementation
- no grade writeback
- no notifications
- no Student Practice redesign
- no Study Groups
- no Public Library
- no automatic Bank membership
- no automatic Blueprint publishing
