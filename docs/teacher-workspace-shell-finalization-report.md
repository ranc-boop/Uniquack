# Teacher Workspace Shell Finalization Report

## Summary

Phase 1 teacher workspace finalization was implemented from the teacher product IA plan.

The teacher workspace now exposes the accepted module map:

- Dashboard
- Question Bank
- AI Parsing
- Blueprint
- Classroom
- Publish
- Progress

The teacher IA remains bank-first: teachers start with private/shared question banks, import/review owned material, approve questions into banks, then deliver selected bank content through classrooms and assignments.

## Classroom RLS Fix

Added forward clean migration:

```text
supabase/clean-migrations/0030_teacher_classroom_rls_fix.sql
```

The migration:

- updates `private.is_org_staff` to recognize active teacher/admin/super-admin profiles with matching `default_organization_id`;
- preserves teacher/admin organization membership checks;
- keeps student and anonymous classroom creation blocked;
- adds authenticated-only `public.create_teacher_classroom(...)`;
- creates classroom, teacher owner membership, and persistent display join code in one transaction.

The local environment does not have `supabase` CLI or `psql` on PATH, so migration 0030 was not applied by Codex. Manual apply instructions are in:

```text
docs/teacher-classroom-rls-0030-manual-apply.md
```

## Teacher Shell / Navigation

Implemented teacher visual tokens and shared teacher shell primitives:

- `TeacherWorkspaceShell`
- `TeacherModuleCard`
- `TeacherComingSoonPanel`
- updated `TeacherWorkspaceNav`

The root header is now role-aware:

- teacher/admin/super-admin users see teacher workspace modules;
- student/anonymous users keep the existing student practice navigation;
- admin platform access remains available separately.

## Teacher Module Routes

Added lightweight teacher module shells:

- `/teacher/ai-parsing`
- `/teacher/blueprints`
- `/teacher/publish`
- `/teacher/progress`

These are IA shells only. They do not add provider calls, generation behavior, Review Draft mutation, or new DB writes.

## Classroom UX

Teacher classroom pages now use teacher visual tokens instead of student shell classes.

Classroom detail now exposes:

- Overview
- People
- Assignments
- Analytics / Feedback
- Linked Blueprints
- Settings

Active join codes stay visible to teachers through `classroom_join_codes.display_code` while validation still uses the hashed code path.

## Safety Confirmations

- Student UI routes were not redesigned.
- No AI provider calls were added.
- No Review Draft write path was added or weakened.
- No assignment auto-publish was added.
- Bank-first ownership boundaries are preserved.
- Student classroom visibility remains assignment/classroom scoped.
- No old Supabase migrations were edited.
- No `.env.local` or secrets were modified.

## Smoke / Test Results

Passed:

```text
npm.cmd run lint
npm.cmd run build
node scripts/security-smoke.mjs
node scripts/supabase-rls-smoke.mjs
node scripts/route-smoke.mjs
node scripts/teacher-role-bank-boundary-smoke.mjs
node scripts/teacher-workspace-shell-smoke.mjs
npm.cmd run smoke
node scripts/question-bank-foundation-smoke.mjs
node scripts/bank-share-members-smoke.mjs
node scripts/bank-import-review-smoke.mjs
node scripts/assignment-from-bank-smoke.mjs
npm.cmd run perf:budget
```

Notes:

- `node scripts/supabase-rls-smoke.mjs` and live workflow smokes required network access to the clean Supabase project.
- `node scripts/route-smoke.mjs` was run against `npm.cmd run start` in the same shell session after `npm.cmd run build`.
- `node scripts/teacher-workspace-shell-smoke.mjs` passed source checks and skipped the live RPC create check because migration 0030 is not yet applied remotely.

## Remaining Step

Apply `supabase/clean-migrations/0030_teacher_classroom_rls_fix.sql` to the clean Supabase project, then rerun:

```powershell
node scripts/teacher-workspace-shell-smoke.mjs
npm.cmd run smoke
```

The expected live result after manual apply is:

- real teacher can create a classroom through `public.create_teacher_classroom`;
- teacher owner membership is created;
- active display join code is returned and remains available;
- student classroom creation remains blocked.
