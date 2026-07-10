# Publish Center Foundation Report

## Summary

The teacher Publish Center foundation is implemented at `/teacher/publish` as the normal bank-first distribution workflow for reviewed Question Bank content.

Teachers can select a source Question Bank, choose approved active bank questions, target one or more managed classrooms, then either save teacher-only draft assignments or assign immediately. The workflow uses the existing `create_assignment_from_bank` RPC contract and preserves bank-private ownership boundaries.

No database migration was needed.

## Product Workflow

- Source of truth: Question Banks.
- Delivery layer: Classrooms and assignments.
- Student visibility: assignment-only access to selected items.
- Review gate: only active approved bank questions are selectable.
- Blueprint and Package sources are shown as coming-next placeholders, not active publish paths.

The page copy states that Publish distributes selected bank content to classes and that students see assigned items only, not the full source bank.

## Implementation

- Added `/teacher/publish` UI with source selection, question selection, classroom targeting, assignment details, draft/assign actions, and review-boundary notes.
- Added `publishQuestionBankAssignments` server action.
- The server action:
  - requires a teacher session,
  - validates selected bank questions and classroom targets,
  - calls `create_assignment_from_bank` once per selected classroom,
  - supports draft and assigned modes,
  - revalidates teacher/student assignment surfaces,
  - does not publish questions globally.
- Updated bank and classroom assignment CTAs to point teachers toward Publish Center while keeping compatibility copy for assignment workflows.

## Visibility And Safety

- Draft assignments remain teacher-only.
- Assigned work appears in Student My Work only for active classroom membership.
- Students can read selected assigned private bank questions through assignment scope.
- Students cannot browse the source bank.
- Unassigned private bank questions remain hidden.
- Created questions remain non-published and `published_at` stays null.
- No AI provider calls were added.
- No Review Draft bypass was added.
- No global/public publishing was added.

## Smoke Coverage

Added `scripts/publish-center-foundation-smoke.mjs` and included it in `scripts/smoke-all.mjs`.

The new smoke verifies:

- Publish Center source code exposes bank-first distribution workflow.
- Draft publish actions remain teacher-only.
- Assigned publish actions can create assignments for multiple managed classrooms.
- Assignment items preserve bank lineage.
- Students see assigned work only for class membership.
- Source banks remain private while selected assigned items are visible.
- Smoke-created rows are cleaned up.

Existing route and security smokes were updated to cover `/teacher/publish` and the new bank/classroom CTA routing.

## Tests

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/bank-share-members-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/assignment-from-bank-smoke.mjs`
- `node scripts/teacher-workspace-shell-smoke.mjs`
- `node scripts/question-bank-ui-remodel-smoke.mjs`
- `node scripts/teacher-ai-parsing-bank-targeting-smoke.mjs`
- `node scripts/blueprint-library-foundation-smoke.mjs`
- `node scripts/classroom-ui-rebuild-smoke.mjs`
- `node scripts/publish-center-foundation-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

## Remaining Work

- Individual-student targeting is intentionally not implemented yet.
- Blueprint and Package sources are intentionally placeholders until generation/package review workflows are ready.
- Multi-class publish currently calls the existing assignment RPC sequentially per classroom; broad batch transaction orchestration can be considered later if needed.
