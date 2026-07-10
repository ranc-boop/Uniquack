# Teacher Feedback Notes MVP Report

## Executive Summary

This branch adds the first assignment-evidence feedback workflow. Classroom
managers can save a private note or explicitly send a note to one active
student. Sent feedback appears only on that student's assigned-work detail;
private notes, other students' notes, source-bank data, and provider metadata
remain unavailable to students.

## Product Scope

**Workflow touched:** assignment-linked Practice evidence -> teacher assignment
drilldown -> teacher feedback -> student My Work.

**Role and ownership boundary:** teachers/classroom managers author and read
assignment-scoped notes. A student can read only their own explicitly sent
notes for active assigned work. Assignment delivery remains separate from
Question Bank access.

**Non-goals:** no AI-generated feedback, notification system, student
self-study visibility, provider call, provider configuration, Student Library,
Study Groups, Google Login/Classroom, auto-publish, or auto-assignment.

The old competition demo was not used as an implementation source.

## Schema and Migration

Added `supabase/clean-migrations/0032_teacher_feedback_notes.sql` with:

- `public.teacher_feedback_notes`
- assignment, classroom, organization, optional student/question/attempt, and
  author linkage
- constrained `private_teacher` / `sent_to_student` visibility and
  `draft` / `sent` / `archived` states
- a consistency check that private notes cannot be marked sent and sent notes
  require a target student and timestamp
- RLS helper functions that validate assignment, classroom, organization,
  active student membership, assignment question linkage, and optional
  assignment-practice attempt linkage
- manager-only author/read/update/delete policies and a sent-note-only student
  read policy

The migration was manually applied to the disposable clean Supabase project.
The documented manual apply path is
`docs/teacher-feedback-notes-migration-0032-manual-apply.md`. It creates no
users, provider credentials, questions, assignments, or feedback rows.

## Teacher and Student UI

The teacher assignment detail now has a **Teacher feedback notes** section.
Each active student has a compact expandable form with a text area, optional
assignment question/attempt attachment, **Save private note**, and **Send to
student** actions. Existing notes display their visibility and sent state.

`/student/work/[id]` has a **Teacher feedback** panel. It reads only
`sent_to_student` + `sent` notes belonging to the current student and current
assignment. Its empty state explicitly says private teacher notes are hidden.

## Permission and Data Safety

- Actions require `requireTeacher()` and use the request-scoped server client.
- The action revalidates the assignment, active roster membership, optional
  question membership, and optional Practice-session/attempt ownership before
  insertion.
- The client cannot supply an organization ID; it is derived from the scoped
  assignment server-side.
- RLS denies anonymous access, unrelated classroom managers, private-note
  student reads, and other-student feedback reads.
- Feedback rows contain no source-bank, provider, raw source, or self-study
  fields. They cannot publish questions or create assignments.

## Smoke Coverage

`scripts/teacher-feedback-notes-mvp-smoke.mjs` covers source boundaries plus
the live path for private-note creation, sent feedback, target-student-only
read, unrelated-teacher denial, anonymous denial, and scoped cleanup. It is
registered in `scripts/smoke-all.mjs`.

`scripts/student-workspace-shell-smoke.mjs` was narrowed so its
student-shell-specific "no migration changes" guard only runs when the current
diff actually touches the student workspace shell files. This keeps that guard
valid for the original shell PR without blocking later migration-bearing feature
PRs such as this feedback-notes migration.

After migration 0032 was manually applied, the live check passed against the
clean Supabase project. It verified private-note creation, explicit
student-visible feedback, target-student-only reads, unrelated teacher denial,
anonymous denial, and cleanup of smoke-created rows.

## Checks Run

| Check | Result |
| --- | --- |
| `npm.cmd run lint` | Passed |
| `npm.cmd run build` | Passed |
| `node scripts/security-smoke.mjs` | Passed |
| `node scripts/route-smoke.mjs` against local server | Passed |
| `node scripts/teacher-feedback-notes-mvp-smoke.mjs --source-only` | Passed |
| `node scripts/teacher-feedback-notes-mvp-smoke.mjs` | Passed after migration 0032 manual apply |
| `node scripts/teacher-assignment-attempt-drilldown-smoke.mjs` | Passed |
| `node scripts/teacher-progress-evidence-foundation-smoke.mjs` | Passed |
| `node scripts/assignment-practice-evidence-smoke.mjs` | Passed |
| `npm.cmd run smoke` | Passed |
| `npm.cmd run perf:budget` | Passed |

## Remaining Blockers and Follow-up

1. The separately configured real `TEST_TEACHER` can create a classroom through
   `public.create_teacher_classroom`, but a direct fixture assignment insert was
   rejected by the current remote assignment policy. The feedback smoke uses
   the seeded manager account for its isolated assignment fixture so it can
   validate feedback after migration application. This existing teacher
   assignment-create boundary needs a focused RLS follow-up before claiming
   complete real-teacher assignment creation coverage.

## Migration and Rollback Risk

This is a narrow forward-only clean migration. It adds one table, indexes,
helper functions, trigger, and policies; it does not alter bank, provider,
student-library, or AI-import behavior. If rollback is needed before feedback
data is relied upon, remove only the new table and its related objects through
a new forward migration after assessing any feedback records that must be
preserved.
