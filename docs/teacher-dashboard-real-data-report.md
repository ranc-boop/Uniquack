# Teacher Dashboard Real Data

## Goal

Turn `/teacher` from a module launcher into a real teacher dashboard powered by existing clean-schema teacher data.

## Product Workflow Touched

```text
Question Bank / Library
-> AI Parsing / Review Drafts
-> assignment-ready bank questions
-> classroom delivery
-> assignment-linked Practice evidence
-> Teacher dashboard
```

## Non-goals

- No schema or migration changes.
- No provider or AI Parsing behavior changes.
- No Blueprint generation changes.
- No teacher feedback-note drafting.
- No full `/teacher/progress` rebuild.
- No admin-as-teacher shortcut.

## What Changed

- Added `src/lib/teacher-dashboard.ts` as a server-only, read-only dashboard aggregator.
- Updated `/teacher` to show:
  - dashboard overview counts
  - Review Draft queue
  - assignment-ready banks
  - classroom activity
  - assignments needing attention
  - recent assignment Practice evidence
  - recent bank-targeted imports
- Added server-compatible dashboard panels in `src/components/teacher/teacher-dashboard-panels.tsx`.
- Added `scripts/teacher-dashboard-real-data-smoke.mjs` and included it in `npm run smoke`.
- Strengthened `scripts/route-smoke.mjs` to protect the real-data dashboard contract.

## Data Sources

The dashboard reads only existing teacher-scoped data:

- `bank_members`
- `question_banks`
- `questions` for bank-owned Review Drafts
- `bank_questions`
- `import_batches`
- `classrooms`
- `assignments`
- `student_assignment_progress`
- `assignment_practice_sessions`
- `practice_attempts`
- `profiles` for bounded student labels

All dashboard queries are bounded and source-scoped. The helper does not insert, update, delete, call RPCs, configure providers, or bypass Review Drafts.

## Role And Ownership Boundaries

- Teacher dashboard data remains teacher-owned or teacher-managed.
- Student self-study evidence is not mixed into teacher assignment evidence.
- Assignment evidence is scoped through `assignment_practice_sessions`.
- Student classroom membership does not grant source bank browsing.
- Assignment-ready content comes from reviewed bank questions, not global publishing.

## Old Demo Overlap

Old demo branch code was not reused. This PR implements the bank-first production teacher workflow from current clean-schema routes.

## Tests

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/teacher-dashboard-real-data-smoke.mjs`
- `node scripts/teacher-workspace-shell-smoke.mjs`
- `node scripts/classroom-ui-rebuild-smoke.mjs`
- `node scripts/publish-center-foundation-smoke.mjs`
- `node scripts/assignment-from-bank-smoke.mjs`
- `node scripts/assignment-practice-evidence-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Notes:

- Route smoke was run against a fresh isolated local dev server on `http://localhost:3001`.
- The pre-existing listener on `localhost:3000` returned a stale `/questions` 500 before the isolated rerun.
- Live Supabase-backed smokes required network escalation in the Codex sandbox and passed after escalation.

## Rollback Risk

Low. The change is read-only and page/component/helper scoped. Reverting the dashboard page, helper, panels, and smoke additions restores the prior module-launcher dashboard.
