# Course Builder Assignment Bridge Report

## Summary

This slice connects existing Course Builder outputs to teacher-owned classroom assignments.

Teachers can open `/teacher/course-builder`, choose a Course Builder run or practice framework, and create an assignment from the published Question Bank questions referenced by that source. The bridge saves assignments as drafts by default. Teachers can explicitly choose `Assign now` to make the assignment visible in Student My Work.

## Files

- `src/lib/course-builder/assignment-bridge.ts`
- `src/app/teacher/course-builder/page.tsx`
- `src/app/teacher/course-builder/actions.ts`
- `src/lib/teacher-assignments.ts`
- `src/app/teacher/classrooms/[id]/page.tsx`
- `src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx`
- `supabase/clean-migrations/0024_assignment_source_metadata.sql`
- `scripts/course-builder-assignment-bridge-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/route-smoke.mjs`
- `scripts/supabase-rls-smoke.mjs`
- `scripts/smoke-all.mjs`

## Behavior

- Lists teacher-visible `practice_course_frameworks` and `course_generation_runs`.
- Extracts referenced candidate question IDs from source columns and JSON payloads.
- Filters candidates to `questions.status = published`.
- Blocks assignment creation when no published questions are available.
- Shows draft/unreviewed source questions as unavailable and routes teachers to Review Drafts.
- Creates `assignment_items` only for published questions.
- Keeps draft assignments teacher-only.
- Makes assigned assignments visible in Student My Work through the existing assignment status/RLS behavior.

## Source Metadata

Migration `0024_assignment_source_metadata.sql` adds:

- `assignments.source_kind`
- `assignments.source_record_id`
- `assignments.source_summary`

Supported source kinds:

- `manual`
- `course_builder_run`
- `practice_framework`

The assignment detail page displays source title, source status, published item count, unavailable item count, and a muted raw source ID for traceability.

The migration was applied to the disposable clean Supabase project during verification.

## Safety

- No provider calls.
- No Course Builder AI generation.
- No Google Classroom integration.
- No wearable/state-aware integration.
- No old Supabase usage.
- No auto-publish of assignments or questions.
- No Review Draft mutation.
- No student-visible write unless a teacher explicitly chooses `Assign now`.

## Smoke Coverage

Added `scripts/course-builder-assignment-bridge-smoke.mjs` to verify:

- Only published source questions become assignable.
- Draft Course Builder assignments remain teacher-only.
- Assigned Course Builder assignments appear in Student My Work.
- Source metadata is preserved.
- Temporary smoke data is cleaned up or archived safely.

Static smoke coverage was added to:

- `security-smoke`
- `route-smoke`
- `supabase-rls-smoke`

## Remaining Notes

The bridge is intentionally conservative. It does not generate Course Builder content or approve Review Drafts. Course Builder sources must reference already published Question Bank questions before they can become assignment items.
