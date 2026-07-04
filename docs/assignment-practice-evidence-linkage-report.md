# Assignment Practice Evidence Linkage Report

## Summary

This change links assigned Student My Work items to the Practice Agent without adding a new product surface or changing provider behavior.

Students can open `/practice?assignmentId=...` from My Work. The Practice page validates the assignment through existing RLS, starts an owned practice session from the assignment question items, records the assignment/session link, and writes student-owned progress evidence.

## Files Changed

- `src/lib/practice/assignment-linkage.ts`
- `src/app/api/practice/assignments/start/route.ts`
- `src/app/practice/page.tsx`
- `src/components/practice/practice-agent-loader.tsx`
- `src/components/practice/practice-agent-client.tsx`
- `src/app/api/practice/review/route.ts`
- `src/app/api/practice/grade/route.ts`
- `src/lib/practice/types.ts`
- `src/lib/teacher-assignments.ts`
- `src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx`
- `src/app/student/work/[id]/page.tsx`
- `scripts/assignment-practice-evidence-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/route-smoke.mjs`
- `scripts/smoke-all.mjs`

## Behavior

- Student My Work now labels the Practice entry as `Start Practice` or `Continue Practice`.
- `/practice?assignmentId=<id>` starts a deterministic assignment practice round from assigned published question items.
- The assignment launch path requires an active student profile.
- Assignment reads remain scoped by existing classroom assignment RLS.
- `assignment_practice_sessions` links the assignment, student, and Practice session.
- `student_assignment_progress` records `in_progress` when Practice starts and `completed` when assigned questions have evidence.
- Practice review and deterministic grade paths update linked assignment progress when a session is linked to an assignment.
- Teacher assignment detail now shows student count, not started, in progress, completed, and latest Practice evidence timestamp.

## Safety

- No DB migration was added.
- No provider call behavior changed.
- No Course Builder, Google Classroom, wearable, or analytics integration was added.
- No Review Draft, publishing, or auto-approval behavior changed.
- No `.env.local`, provider credentials, or Supabase credentials were modified.
- Existing `assignment_practice_sessions` and `student_assignment_progress` RLS policies remain the enforcement layer.

## Smoke Coverage

Added `scripts/assignment-practice-evidence-smoke.mjs`.

The smoke verifies:

- A teacher can create an assigned question assignment.
- A student with active classroom membership can link an owned Practice session to that assignment.
- The student can write own assignment progress evidence.
- The teacher can read linked assignment Practice evidence.
- Cleanup stays scoped to the smoke classroom, assignment, question, and student-owned session.

`scripts/smoke-all.mjs` now includes the new smoke.

## Test Results

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `node scripts/security-smoke.mjs` passed.
- `node scripts/route-smoke.mjs` passed.
- `node scripts/supabase-rls-smoke.mjs` passed with network permission.
- `node scripts/student-my-work-smoke.mjs` passed with network permission.
- `node scripts/teacher-assignment-flow-smoke.mjs` passed with network permission.
- `node scripts/assignment-practice-evidence-smoke.mjs` passed with network permission.
- `node scripts/batch-import-smoke.mjs` passed with network permission.
- `node scripts/question-assets-security-smoke.mjs` passed with the known public-bucket URL risk note.
- `node scripts/bulk-asset-import-smoke.mjs` passed.
- `node scripts/package-import-smoke.mjs` passed.
- `node scripts/markdown-latex-editor-smoke.mjs` passed.
- `npm.cmd run smoke` passed with network permission.
- `npm.cmd run perf:budget` passed.

## Remaining Notes

The teacher evidence view is intentionally compact. A fuller analytics dashboard, Course Builder bridge, classroom export, wearable signal integration, and Google Classroom-style flows remain out of scope.
