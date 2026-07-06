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

Migration 0030 was manually applied through the clean Supabase Dashboard SQL Editor. Verification confirmed:

```text
public.create_teacher_classroom exists
private.is_org_staff exists
classroom_join_codes.display_code exists
```

Live smoke then found a clean-schema compatibility issue in the first function body: it inserted `classroom_members.created_by`, but `classroom_members` does not have that column in migration 0018. The branch migration has been corrected, and a copy-paste-safe function-only reapply file was added:

```text
docs/teacher-classroom-0030-create-function-reapply.sql
```

Apply that SQL file in the Supabase Dashboard SQL Editor, then rerun the live teacher workspace smoke.

After the first function reapply, live smoke advanced to the next function-body issue:

```text
column reference "classroom_id" is ambiguous
```

That confirmed the remote function no longer referenced `classroom_members.created_by`. The branch migration and reapply file were corrected again to use an internal `created_classroom_id` variable before assigning the returned `classroom_id` field.

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

Passed after the branch-side function correction:

```text
npm.cmd run lint
npm.cmd run build
node scripts/security-smoke.mjs
node scripts/supabase-rls-smoke.mjs
node scripts/route-smoke.mjs
node scripts/teacher-role-bank-boundary-smoke.mjs
node scripts/question-bank-foundation-smoke.mjs
node scripts/bank-share-members-smoke.mjs
node scripts/bank-import-review-smoke.mjs
node scripts/assignment-from-bank-smoke.mjs
npm.cmd run perf:budget
```

Notes:

- `node scripts/supabase-rls-smoke.mjs` and live workflow smokes required network access to the clean Supabase project.
- `node scripts/route-smoke.mjs` was run against `npm.cmd run start` in the same shell session after `npm.cmd run build`.
- After migration 0030 was manually applied, `node scripts/teacher-workspace-shell-smoke.mjs` reached the live RPC and failed on the stale remote function body with `column "created_by" of relation "classroom_members" does not exist`.
- The first function reapply removed that invalid column reference.
- The next live run reached the corrected remote function and failed with `column reference "classroom_id" is ambiguous`.
- The latest branch migration and `docs/teacher-classroom-0030-create-function-reapply.sql` remove that PL/pgSQL ambiguity by using `created_classroom_id` internally.
- `node scripts/teacher-workspace-shell-smoke.mjs` and `npm.cmd run smoke` remain blocked until the latest reapply SQL is run in Supabase.

## Remaining Step

Apply `docs/teacher-classroom-0030-create-function-reapply.sql` to the clean Supabase project, then rerun:

```powershell
node scripts/teacher-workspace-shell-smoke.mjs
npm.cmd run smoke
```

The expected live result after function reapply is:

- real teacher can create a classroom through `public.create_teacher_classroom`;
- teacher owner membership is created;
- active display join code is returned and remains available;
- student classroom creation remains blocked.
