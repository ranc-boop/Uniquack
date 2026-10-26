# Student Workspace Shell Report

## Executive Summary

The Student Workspace IA shell has been added on `codex/student-workspace-shell`.
`/student` is now a real student dashboard instead of a redirect to My Work.

This PR is UI/shell-only. It does not implement Study Group backend, Student Library backend, self-study feedback backend, monetization, provider calls, migrations, or teacher/admin workspace changes.

## Routes Added Or Updated

- `/student`: new dashboard route.
- `/student/library`: Study Library placeholder shell.
- `/student/groups`: Study Groups placeholder shell.
- `/student/public-library`: Public Library placeholder shell.
- `/student/progress`: Progress / Feedback placeholder shell.
- `/student/work`: preserved existing My Work behavior.
- `/practice`: preserved existing Practice route and assignment query compatibility.

## Student Modules

- Dashboard
- My Work
- Practice
- Mistakes
- Study Library
- Study Groups
- Public Library
- Progress / Feedback

## Placeholder Behavior

Study Library is a shell for future saved questions, study sets, mistake sets, and public pulls/forks.

Study Groups is a shell for future peer self-study collaboration. It is separate from teacher Classroom and does not grant access to teacher private banks.

Public Library is a read/discovery placeholder. Public pull/fork behavior is not implemented in this PR.

Progress / Feedback is a shell for future assignment feedback and private self-study feedback views.

## My Work / Practice Compatibility

- `/student/work` remains preserved and still lists assigned work.
- `/student/work/[id]` remains preserved.
- `/practice?assignmentId=...` was not changed.
- No assignment Practice backend code was changed.

## Student / Teacher / Admin Separation

- Teacher and admin shells were not changed.
- Student navigation does not include teacher-only modules: Question Bank, AI Parsing, Blueprint, Classroom, Publish, or Teacher Progress.
- Student placeholder modules do not implement teacher classroom management or teacher bank management.
- Joining a classroom remains assignment-delivery only and does not expose a teacher private source bank.

## Root Layout Note

`src/app/layout.tsx` was briefly touched while testing global navigation, then reverted. The final diff does not include root layout changes. The Student Workspace shell is scoped to `/student` through `src/app/student/layout.tsx`.

## Smoke Coverage

- `scripts/route-smoke.mjs` now includes expectations for the new student routes and source-level student shell coverage.
- `scripts/student-workspace-shell-smoke.mjs` was added as a static/source smoke for the student IA shell.
- `scripts/smoke-all.mjs` imports the new student workspace shell smoke.
- The new smoke verifies that no migrations are added or edited.

## Tests Run

- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- `node scripts/security-smoke.mjs`: passed.
- `node scripts/student-workspace-shell-smoke.mjs`: passed.
- `npm.cmd run perf:budget`: passed.
- `node scripts/route-smoke.mjs`: blocked by `/questions returned 500`.
- `node scripts/supabase-rls-smoke.mjs`: blocked by `taxonomy_nodes public read failed: TypeError: fetch failed`.
- `npm.cmd run smoke`: not rerun after final RLS check because `supabase-rls-smoke` still fails; the earlier aggregate smoke stopped at the same Supabase fetch failure.

Safe connectivity check:

- `Test-NetConnection noxageqkoedbwtwhxmtu.supabase.co -Port 443`: `TcpTestSucceeded = False`.

The blocked checks appear unrelated to the Student Workspace shell diff. No Supabase, RLS, taxonomy, migration, or provider files were changed.

## Remaining Blockers

- Study Group backend is not implemented.
- Student Library backend is not implemented.
- Self-study feedback backend is not implemented.
- Entitlements are not implemented.
- Local/network access to the clean Supabase endpoint is currently blocking live RLS and route smoke checks.

## Explicit Non-Goals

- No Study Group backend.
- No Student Library backend.
- No self-study feedback backend.
- No monetization or entitlement enforcement.
- No public pull/private push implementation.
- No provider calls.
- No teacher UI redesign.
- No admin UI redesign.
- No Google Classroom.
- No wearable UI.
