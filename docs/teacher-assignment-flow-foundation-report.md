# Teacher Assignment Flow Foundation Report

## Executive Summary

Teacher Assignment Flow Foundation adds the first product UI for assigning
published Question Bank questions to a classroom. Teachers can open a managed
classroom, create draft or assigned work, select published questions, inspect
assignment details, and hand students to the existing My Work surface.

No schema migration was needed. The implementation uses the existing clean
assignment schema from Student My Work:

- `assignments`
- `assignment_items`
- `student_assignment_progress`
- `assignment_practice_sessions`

## Routes And Pages Added

- `/teacher/classrooms/[id]/assignments`
  - Lists assignments for the managed classroom.
  - Shows title, status, due date, and item count.

- `/teacher/classrooms/[id]/assignments/new`
  - Creates a classroom assignment.
  - Supports title, instructions, optional due date, published question
    selection, draft save, and assign-to-class submit.

- `/teacher/classrooms/[id]/assignments/[assignmentId]`
  - Shows assignment status, instructions, item list, and a student-view link.

The existing `/teacher/classrooms/[id]` page now links to assignment creation
and assignment list pages.

## Teacher Assignment Creation Behavior

The server action `createTeacherAssignment` requires a teacher/admin role,
loads the managed classroom through current RLS, validates selected questions,
and inserts:

- one `assignments` row
- ordered `assignment_items` rows for selected question IDs

Teachers can save an assignment as:

- `draft`: teacher-side only
- `assigned`: visible to active classroom students through `/student/work`

## Question Selection Behavior

Question selection is intentionally narrow:

- only `questions.status = "published"` rows are listed
- selected question IDs are revalidated server-side before insert
- Review Drafts and unpublished questions cannot be assigned

The creation page includes a bounded title/code search over published
questions.

## Student My Work Integration Result

Assigned work uses the same rows already consumed by Student My Work. After a
teacher creates an `assigned` assignment:

- `/student/work` lists the work for active classroom members
- `/student/work/[id]` loads assignment items and question summaries
- the existing Practice entry link remains `/practice?assignmentId=...`

Draft assignments remain hidden from students.

## RLS And Security Result

The flow relies on the existing clean Supabase RLS:

- teachers/admins can create assignments only for managed classrooms
- students can read only assigned work for active classroom memberships
- anonymous users cannot write assignments
- unrelated students cannot read another classroom's assigned work

No provider credentials, old Supabase migrations, Review Draft approvals, or
auto-publish behavior were touched.

## Smoke Coverage

Added `scripts/teacher-assignment-flow-smoke.mjs`.

The smoke verifies:

- teacher/admin sign-in
- student sign-in
- smoke classroom creation
- student active membership
- published smoke question creation
- draft assignment remains teacher-side
- assigned assignment is visible to the teacher
- teacher can inspect assignment detail items
- student sees assigned work through assignment RLS
- student can load assignment item data
- student cannot read assignment for an unjoined classroom
- smoke-created rows are cleaned up safely

The new smoke is included in `scripts/smoke-all.mjs`.

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/student-my-work-smoke.mjs`
- `node scripts/teacher-assignment-flow-smoke.mjs`
- `node scripts/batch-import-smoke.mjs`
- `node scripts/question-assets-security-smoke.mjs`
- `node scripts/bulk-asset-import-smoke.mjs`
- `node scripts/package-import-smoke.mjs`
- `node scripts/markdown-latex-editor-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Some Supabase-backed smoke tests required normal network access because the
sandboxed run reported `fetch failed`.

## Remaining Blockers

No blockers for this foundation slice.

Future product work remains intentionally outside this PR:

- Course Builder assignment bridge
- Google Classroom sync
- teacher bulk scheduling
- assignment grading analytics
- rubric scoring workflow
- full assignment-aware Practice execution
- wearable or state-aware UI

## Explicit Non-goals Preserved

- No Course Builder bridge
- No Google Classroom
- No wearable UI
- No full assignment-aware Practice execution
- No old Supabase migration changes
- No provider credential changes
- No Review Draft approval or auto-publish behavior
