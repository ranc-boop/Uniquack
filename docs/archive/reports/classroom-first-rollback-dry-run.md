# Classroom-first Runtime Rollback Dry Run

Date: 2026-07-05

Branch used for this dry run: `codex/classroom-first-rollback-dry-run`

Main commit inspected: `abe7169 Merge pull request #145 from 1650512585qq-collab/codex/teacher-assignment-ui-polish`

## Executive Summary

This was a dry-run planning pass only. No rollback was applied to the real working tree, no runtime source was changed, no migrations were edited or removed, no SQL was applied, and no Supabase data was mutated.

The current main branch contains a classroom-first teacher/student workflow:

- teacher classroom creation and roster management
- student classroom join and My Work pages
- teacher assignment creation from published Question Bank questions
- assignment-to-practice evidence linkage
- a lightweight Course Builder to assignment bridge
- teacher/student UI polish around those flows

The requested product correction is bank-first:

- teachers own or join question banks/libraries
- banks can be private, shared, or public
- classroom assignments are a delivery layer, not the primary content model
- AI import, Review Drafts, and Course Builder should feed bank content first
- assignments should be created from bank questions or generated packages

The safest recommendation is not a blanket `git revert` and not a database rollback. The clean Supabase schema may already include classroom and assignment migrations, so migration files should remain in history. Runtime reconciliation should be a forward code change that hides or demotes classroom-first product surfaces while preserving schema compatibility and then rebuilds bank-first workflows on top.

## Inputs Reviewed

The following project artifacts were inspected or referenced:

- current `main`
- `docs/school-workflow-mvp-checkpoint.md`
- prior emergency audit artifacts from `codex/emergency-demo-reconciliation-audit`
- recent classroom, assignment, student work, practice evidence, Course Builder bridge, and UI polish commits
- current teacher/student/classroom/assignment routes and libraries
- clean migration files `0018` through `0024`

The emergency audit docs are not currently on `main`; they remain on `codex/emergency-demo-reconciliation-audit`.

## Recent Commit Inventory

Merge hashes were not always distinct in the inspected local history. Where no separate merge commit was identified, the listed hash is the inspected commit used for classification.

### `6a36a95 Add native classroom foundation`

Added native classroom routes, auth role helpers, classroom library code, classroom smoke coverage, and clean migration `0018_classroom_foundation.sql`.

Key areas:

- `src/app/teacher/classrooms/**`
- `src/app/student/classrooms/**`
- `src/lib/classrooms.ts`
- `src/lib/auth/guards.ts`
- `src/lib/auth/roles.ts`
- `supabase/clean-migrations/0018_classroom_foundation.sql`

Added smoke/docs:

- `scripts/classroom-foundation-smoke.mjs`
- `docs/native-classroom-foundation-report.md`

Decision: partially reuse. Preserve schema and reusable auth/RLS helpers; rewrite teacher entry and product routing so classroom is delivery layer, not teacher home.

### `18161ff Complete classroom e2e validation`

Documentation/report update for classroom validation.

Decision: supersede. Keep as historical report only; do not treat as current product architecture.

### `2bf7b1d Add student my work foundation`

Added student assignment/work routes, student work library, student smoke coverage, and migrations `0019` through `0023`.

Key areas:

- `src/app/student/work/**`
- `src/lib/student-work.ts`
- `scripts/student-my-work-smoke.mjs`
- `supabase/clean-migrations/0019_classroom_join_code_display_and_roster_removal.sql`
- `supabase/clean-migrations/0020_classroom_removed_member_rejoin_block.sql`
- `supabase/clean-migrations/0021_student_work_assignments.sql`
- `supabase/clean-migrations/0022_student_work_assignment_policy_fix.sql`
- `supabase/clean-migrations/0023_student_work_assignment_manager_scope_fix.sql`

Added smoke/docs:

- `scripts/student-my-work-smoke.mjs`
- `docs/student-my-work-foundation-report.md`

Decision: partially reuse. Preserve assignment/student work schema as future delivery layer; rewrite UI once bank-first assignment creation exists.

### `e6553f7 Add teacher assignment flow foundation`

Added teacher assignment creation and detail routes from published Question Bank questions.

Key areas:

- `src/app/teacher/classrooms/[id]/assignments/**`
- `src/lib/teacher-assignments.ts`
- `scripts/teacher-assignment-flow-smoke.mjs`

Added docs:

- `docs/teacher-assignment-flow-foundation-report.md`

Decision: rewrite. Assignment flow should start from teacher/private/shared/public bank content, not only global published questions.

### `be70607 Link assignments to practice evidence`

Connected assignment launch/evidence into the Practice Agent flow.

Key areas:

- `src/app/api/practice/assignments/start/route.ts`
- `src/lib/practice/assignment-linkage.ts`
- `src/components/practice/practice-agent-loader.tsx`
- teacher assignment progress surfaces

Added smoke/docs:

- `scripts/assignment-practice-evidence-smoke.mjs`
- `docs/assignment-practice-evidence-linkage-report.md`

Decision: partially reuse. Evidence linkage is useful, but must be revalidated after assignment creation becomes bank-first.

### `d9b13fe Bridge Course Builder to assignments`

Added Course Builder to assignment bridge and migration `0024_assignment_source_metadata.sql`.

Key areas:

- `src/app/teacher/course-builder/**`
- `src/lib/course-builder/assignment-bridge.ts`
- `supabase/clean-migrations/0024_assignment_source_metadata.sql`

Added smoke/docs:

- `scripts/course-builder-assignment-bridge-smoke.mjs`
- `docs/course-builder-assignment-bridge-report.md`

Decision: rewrite runtime, preserve migration. The bridge currently points Course Builder toward classroom assignment delivery too early. Course Builder should create bank/package material first, then optionally assign later.

### UI polish commits

- `61cdaf4 Polish teacher assignment progress UI`
- `7592a5a Polish Student My Work UI`
- `ce74a46 Polish teacher assignment UI`

These mostly alter UI and smoke coverage on top of the classroom-first flow.

Added/modified smoke/docs include:

- `scripts/teacher-progress-ui-smoke.mjs`
- `docs/teacher-progress-ui-polish-report.md`
- `docs/student-my-work-ui-polish-report.md`
- `docs/teacher-assignment-ui-polish-report.md`

Decision: rollback or supersede when runtime is reconciled. The polish assumes the classroom-first product path remains primary.

### `7d06441 Document school workflow MVP checkpoint`

Added `docs/school-workflow-mvp-checkpoint.md`.

Decision: supersede. It accurately documents the current classroom-first checkpoint, but the accepted architecture correction is bank-first.

### `6b1c997 Add emergency demo reconciliation audit`

This commit was found on branch `codex/emergency-demo-reconciliation-audit`, not current `main`.

Decision: preserve as audit input. Do not merge blindly into runtime; use it as context for the bank-first reconciliation plan.

## Current Runtime Shape

Current runtime is classroom-first:

- `/teacher` redirects to `/teacher/classrooms`
- teacher work starts with classroom management
- student work starts with classroom membership and assignments
- assignments are created inside a classroom
- assignment questions are pulled from globally published Question Bank questions
- Course Builder bridge creates assignment packages, not a full bank/package publishing flow

This is functional but not aligned with the desired bank-first architecture.

## Migration Safety

The following clean migrations exist and must not be removed as part of a runtime rollback:

| Migration | Current decision | Applied status | Reason |
| --- | --- | --- | --- |
| `0018_classroom_foundation.sql` | Keep | Treat as possibly applied to clean disposable environments | Classroom schema can remain as delivery-layer capability. Deleting creates migration drift. |
| `0019_classroom_join_code_display_and_roster_removal.sql` | Keep | Treat as possibly applied | Join-code/roster adjustments are schema history. Future changes should be forward-only. |
| `0020_classroom_removed_member_rejoin_block.sql` | Keep | Treat as possibly applied | Rejoin blocking can remain even if classroom-first UI is demoted. |
| `0021_student_work_assignments.sql` | Keep | Treat as possibly applied | Assignment/student work schema can support bank-first assignments later. |
| `0022_student_work_assignment_policy_fix.sql` | Keep | Treat as possibly applied | RLS policy history should not be deleted. |
| `0023_student_work_assignment_manager_scope_fix.sql` | Keep | Treat as possibly applied | Manager scope fix is schema/security history. |
| `0024_assignment_source_metadata.sql` | Keep | Treat as possibly applied | Source metadata can be useful for bank/package-to-assignment lineage. |

Reason: these migrations may already be applied to the disposable clean Supabase project or future environments. Deleting or reverting migration files would create schema drift and make the repository harder to reason about. If any schema correction is needed, it should be done by a forward-only migration.

## Dry-run Strategy A: Revert UI Polish Only

Dry-run command used in a temporary worktree only:

```bash
git revert --no-commit ce74a46 7592a5a 61cdaf4
```

Result: applied without conflicts in the temp worktree.

Observed dry-run file impact:

```text
D  docs/student-my-work-ui-polish-report.md
D  docs/teacher-assignment-ui-polish-report.md
D  docs/teacher-progress-ui-polish-report.md
M  scripts/route-smoke.mjs
M  scripts/security-smoke.mjs
M  scripts/smoke-all.mjs
D  scripts/teacher-progress-ui-smoke.mjs
M  src/app/student/classrooms/page.tsx
M  src/app/student/work/[id]/page.tsx
M  src/app/student/work/page.tsx
M  src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx
M  src/app/teacher/classrooms/[id]/assignments/new/page.tsx
M  src/app/teacher/classrooms/[id]/assignments/page.tsx
M  src/app/teacher/classrooms/[id]/page.tsx
M  src/components/practice/practice-agent-loader.tsx
D  src/components/teacher/assignment-selection-summary.tsx
M  src/lib/teacher-assignments.ts
```

Assessment:

- Low conflict risk.
- Does not touch migrations.
- Only removes polish on top of the classroom-first flow.
- Does not solve the product architecture mismatch.

Conclusion: Strategy A is not enough.

## Dry-run Strategy B: Remove Classroom-first Runtime Surface

Dry-run command used in a temporary worktree only:

```bash
git rm -r -n scripts/assignment-practice-evidence-smoke.mjs scripts/classroom-foundation-smoke.mjs scripts/course-builder-assignment-bridge-smoke.mjs scripts/student-my-work-smoke.mjs scripts/teacher-assignment-flow-smoke.mjs src/app/api/practice/assignments/start/route.ts src/app/student/classrooms src/app/student/work src/app/teacher/classrooms src/app/teacher/course-builder src/lib/course-builder/assignment-bridge.ts src/lib/student-work.ts src/lib/teacher-assignments.ts
```

Observed dry-run file impact:

```text
rm 'scripts/assignment-practice-evidence-smoke.mjs'
rm 'scripts/classroom-foundation-smoke.mjs'
rm 'scripts/course-builder-assignment-bridge-smoke.mjs'
rm 'scripts/student-my-work-smoke.mjs'
rm 'scripts/teacher-assignment-flow-smoke.mjs'
rm 'src/app/api/practice/assignments/start/route.ts'
rm 'src/app/student/classrooms/join/actions.ts'
rm 'src/app/student/classrooms/join/page.tsx'
rm 'src/app/student/classrooms/page.tsx'
rm 'src/app/student/work/[id]/page.tsx'
rm 'src/app/student/work/page.tsx'
rm 'src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx'
rm 'src/app/teacher/classrooms/[id]/assignments/actions.ts'
rm 'src/app/teacher/classrooms/[id]/assignments/new/page.tsx'
rm 'src/app/teacher/classrooms/[id]/assignments/page.tsx'
rm 'src/app/teacher/classrooms/[id]/page.tsx'
rm 'src/app/teacher/classrooms/actions.ts'
rm 'src/app/teacher/classrooms/page.tsx'
rm 'src/app/teacher/course-builder/actions.ts'
rm 'src/app/teacher/course-builder/page.tsx'
rm 'src/lib/course-builder/assignment-bridge.ts'
rm 'src/lib/student-work.ts'
rm 'src/lib/teacher-assignments.ts'
```

Assessment:

- Better aligned with bank-first rebuild.
- Must be implemented as a forward runtime cleanup, not a commit revert.
- Cannot delete migrations.
- Would require route/nav placeholders or redirects in the same change.
- Would require smoke cleanup or replacement bank-first smoke coverage.
- Compile risk is high unless all imports, nav links, and route expectations are updated together.

Conclusion: Strategy B is the safer direction, but only as a deliberate future implementation PR.

## File Category Matrix

### A. Preserve

Keep these areas untouched during rollback:

- taxonomy runtime
- AI parsing and Review Drafts
- provider gateway
- Question Bank core
- Practice Agent core
- clean migrations already committed
- auth and role helpers needed by the app generally

Examples:

- `src/app/admin/**`
- `src/app/admin/imports/**`
- `src/app/admin/review/**`
- `src/app/admin/questions/**`
- `src/lib/auth/guards.ts`
- `src/lib/auth/roles.ts`
- `src/lib/practice/**` except assignment-only entry points
- `supabase/clean-migrations/**`

### B. Keep but Demote

Keep schema and some backend concepts for future use, but demote classroom-first UX:

- classroom tables
- assignment tables
- assignment source metadata
- classroom membership concepts
- assignment evidence concepts

These can remain as database capability while the product rebuilds bank-first UI.

Examples:

- classroom tables from `0018`
- assignment tables from `0021`
- assignment source metadata from `0024`
- assignment evidence concepts from `src/lib/practice/assignment-linkage.ts`

### C. Roll Back or Rewrite Runtime Surface

Candidates for future runtime cleanup:

- `/teacher/classrooms/**`
- `/student/classrooms/**`
- `/student/work/**`
- `/teacher/course-builder/**`
- assignment creation pages that start from classrooms
- classroom-first smoke scripts
- teacher/student navigation that implies classroom-first is the primary flow

Examples:

- `src/app/teacher/page.tsx`
- `src/app/teacher/classrooms/**`
- `src/app/student/classrooms/**`
- `src/app/student/work/**`
- `src/app/teacher/course-builder/**`
- `src/app/api/practice/assignments/start/route.ts`
- `src/lib/teacher-assignments.ts`
- `src/lib/student-work.ts`
- `src/lib/course-builder/assignment-bridge.ts`

### D. Replace Later With Bank-first Features

Replace with:

- Teacher Library / Question Banks
- private/shared/public bank boundaries
- bank share codes and member roles
- teacher-private import to Review Drafts to bank
- public pull into private/shared bank
- push/share to public bank with review gate
- assignment builder from bank questions
- Course Builder package generation into bank/library first

Examples:

- replace `scripts/classroom-foundation-smoke.mjs` with bank/library smoke coverage
- replace `scripts/teacher-assignment-flow-smoke.mjs` with assignment-from-bank smoke coverage
- supersede `docs/school-workflow-mvp-checkpoint.md`
- supersede classroom-first UI polish reports

## Recommended Rollback Approach

Do not use a blanket revert.

The bridge commit `d9b13fe` was not included in the no-commit revert sequence because it introduced migration `0024_assignment_source_metadata.sql`. A future implementation should manually rewrite or remove the runtime bridge while preserving the migration file.

Recommended future implementation:

1. Create a backup branch/tag from current main.
2. Create a new branch such as `codex/bank-first-runtime-reconciliation`.
3. Preserve all clean migrations.
4. Remove or hide classroom-first routes from primary navigation.
5. Replace removed teacher/student surfaces with bank-first placeholders or redirects.
6. Replace classroom-first smoke assertions with bank-first smoke assertions.
7. Keep DB cleanup out of the rollback PR.
8. Rebuild bank-first workflows in small sequenced PRs.

Suggested backup commands for the future rollback implementation:

```bash
git checkout main
git pull
git branch backup/pre-bank-first-reconciliation-main
git tag backup/pre-bank-first-reconciliation-2026-07-05
```

No rollback should be performed without explicit user approval.

## Risks

- Current main may be demo-functional but conceptually misleading because teacher flow starts from classrooms.
- Removing routes without replacement can break route-smoke and navigation.
- Reverting migration commits can create schema drift.
- Existing smoke scripts encode classroom-first assumptions and need coordinated cleanup.
- Practice assignment linkage may still be useful later, but should be reattached to bank-first assignment creation.

## Dry-run Outcome

No actual rollback was performed.

Best next step: approve a forward-only runtime reconciliation PR that preserves schema and replaces classroom-first primary UX with bank-first architecture.
