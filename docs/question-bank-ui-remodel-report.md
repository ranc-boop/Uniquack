# Question Bank UI Remodel Report

## Executive summary

Phase 2 remodels the teacher Question Bank experience into a repository workbench. The updated pages keep the bank-first product rule explicit: teachers organize owned/shared content in banks first, then deliver selected approved items through assignments.

No migrations, provider calls, Review Draft bypasses, or student UI changes were added.

## `/teacher/banks` library UI

- Page title is now `Question Bank Library`.
- Copy states: banks are teacher content repositories; classrooms and assignments deliver selected approved items.
- Primary action: `Create Question Bank`.
- Secondary action: `Join Bank by Code`.
- Added segmented filters for All, Private, Shared, Organization, Public, Needs Review, Recently Updated, and Assignment Ready.
- Bank rows now show visibility, status, role, member signal, question count, Review Draft count, import count, assignment-ready count, and updated date.
- Empty state now says: `No banks yet. Create your first Question Bank or join a shared bank by code.`

## Bank detail IA

- `/teacher/banks/[bankId]` now renders as a bank operating surface.
- Added repository tabs for Questions, Imports, Review Drafts, Blueprints, Members, Sources, and Settings.
- Added summary cards for questions, Review Drafts, imports, and members.
- Added quick actions for Import Material, Review Drafts, Questions, Create Assignment, and Members / Share.
- Safety copy is visible:
  - AI drafts stay private until reviewed.
  - Assignments expose selected approved items, not the full bank.
  - Public movement requires a separate review gate.

## Question database UI

- `/teacher/banks/[bankId]/questions` now reads as a question database.
- Rows show type, difficulty, visibility, added date, taxonomy status, source lineage, review status, and assignment readiness.
- Missing taxonomy displays as `Not tagged yet`.
- Missing difficulty displays as `Not set`.
- The page does not use Practice as the primary teacher action.

## Import UI

- `/teacher/banks/[bankId]/imports` is AI Parsing-first.
- It shows target bank context, review safety copy, recent imports, and an `Open AI Parsing` action.
- The JSON fixture remains available only inside `Advanced / developer import fixture`.
- Imported output remains Review Draft-only until approved into the bank.

## Review UI

- `/teacher/banks/[bankId]/review` is framed as teacher QA.
- Copy states: `Approve drafts into this bank. This does not publish them to the public library.`
- Draft cards show review status, warning count, taxonomy suggestion state, and source lineage.
- Approval remains bank-scoped and does not create assignments.

## Members UI

- `/teacher/banks/[bankId]/members` now shares the workbench shell and tabs.
- It shows active members, active share codes, owner/viewer/editor controls, and classroom/bank boundary copy.
- Student bank browsing is not implied.

## Blueprints / Sources / Settings placeholders

- Added read-only placeholder routes:
  - `/teacher/banks/[bankId]/blueprints`
  - `/teacher/banks/[bankId]/sources`
  - `/teacher/banks/[bankId]/settings`
- These routes are non-mutating and only clarify future IA.
- Blueprint output still routes through Review Drafts.
- Settings mutation is intentionally deferred.

## Teacher shell separation

Bank routes continue using `requireTeacher()` and the teacher workflow nav. This main branch does not yet contain `scripts/teacher-workspace-shell-smoke.mjs` or the later teacher-shell route set from the finalization branch, so this PR does not broaden scope into a full shell reconciliation.

## Security and boundaries

- Owner/editor/viewer role distinctions remain server-side.
- Viewer mutation controls stay hidden where applicable.
- Student UI was not touched.
- Anonymous/student/teacher private bank boundaries continue to be covered by the existing bank foundation, share, import-review, and assignment-from-bank smokes.
- No public pull/private push was implemented.
- No bank question editing/versioning was implemented.
- No Blueprint generation was implemented.
- No full Publish Center was implemented.
- No Google Classroom integration was implemented.
- No wearable/state-aware UI was implemented.
- No provider calls were added.

## Smoke coverage

Added `scripts/question-bank-ui-remodel-smoke.mjs` and wired it into `scripts/smoke-all.mjs`.

The new smoke verifies:

- Library title, copy, CTAs, filters, and empty state.
- Bank route tabs and safety copy.
- Bank detail operating surface.
- Question database language.
- AI Parsing-first import page with JSON hidden behind an advanced section.
- Bank/private Review Draft QA language.
- Members/share code copy.
- Read-only blueprints/sources/settings placeholders.
- Bounded helper metadata counts and taxonomy labels.

## Tests

Completed:

- `npm.cmd run lint` — passed.
- `npm.cmd run build` — passed.
- `node scripts/security-smoke.mjs` — passed.
- `node scripts/route-smoke.mjs` — passed against an isolated local server on port 3001.
- `node scripts/supabase-rls-smoke.mjs` — passed.
- `node scripts/question-bank-foundation-smoke.mjs` — passed with real teacher credentials.
- `node scripts/bank-share-members-smoke.mjs` — passed.
- `node scripts/bank-import-review-smoke.mjs` — passed.
- `node scripts/assignment-from-bank-smoke.mjs` — passed.
- `node scripts/question-bank-ui-remodel-smoke.mjs` — passed.
- `npm.cmd run smoke` — passed with the isolated local server on port 3001.
- `npm.cmd run perf:budget` — passed.

Unavailable on this main branch:

- `node scripts/teacher-role-bank-boundary-smoke.mjs`
- `node scripts/teacher-workspace-shell-smoke.mjs`

Both are referenced in the task text, but neither file exists on the current branch from `main`.

## Remaining blockers

- The task text references Teacher Workspace Shell Finalization as merged, but current `main` does not include `scripts/teacher-workspace-shell-smoke.mjs` or the full teacher-shell modules. This PR reports that branch dependency and keeps scope limited to bank routes.

## Rollback risk

Low. Changes are UI/helper/report/smoke only. No schema, provider, Review Draft persistence, or assignment behavior was changed.
