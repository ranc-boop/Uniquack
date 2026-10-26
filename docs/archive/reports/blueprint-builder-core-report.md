# Blueprint Builder Core Report

## Summary

Branch: `codex/blueprint-builder-core`

This PR adds the first teacher-facing Blueprint Builder core. Teachers can build a private, reusable Blueprint planning asset from selected approved questions inside a Question Bank. The Blueprint captures source lineage, structure guidance, answer expectations, originality constraints, and a non-generating preview/readiness checklist.

## Product Workflow Touched

```text
Question Bank approved questions
-> Create Blueprint from selected source examples
-> Structured Blueprint editor
-> Blueprint Library / bank-linked Blueprint view
-> Future Review Draft generation remains gated
```

## Non-Goals

- No AI provider calls.
- No question generation.
- No Review Draft creation.
- No assignment publishing.
- No student delivery.
- No public library promotion.
- No provider/admin settings changes.

## Files Changed

- `src/lib/teacher-blueprint-builder.ts`
- `src/lib/question-banks.ts`
- `src/app/teacher/blueprints/actions.ts`
- `src/app/teacher/blueprints/new/page.tsx`
- `src/app/teacher/blueprints/[blueprintId]/page.tsx`
- `src/app/teacher/blueprints/blueprint-library-ui.tsx`
- `src/app/teacher/banks/[bankId]/blueprints/page.tsx`
- `scripts/blueprint-builder-core-smoke.mjs`
- `scripts/smoke-all.mjs`
- `docs/blueprint-builder-core-report.md`

## Behavior Added

- Teachers can open a bank Blueprint entry point and create a Blueprint from selected active approved bank questions.
- Source questions are restricted to active `bank_questions` rows whose underlying question is draft/private and not globally published.
- The create flow records:
  - source bank
  - selected source question lineage
  - observed question type and difficulty hints
  - required elements
  - answer pattern guidance
  - distractor guidance
  - originality constraints
  - teacher notes
- The detail page includes a structured editor and a non-generating preview/readiness checklist.
- Saving Blueprint planning edits invalidates generation readiness and marks calibration as invalidated.
- Bank-linked Blueprint cards show source example count and readiness status.

## Schema Decision

No migration was needed.

The existing clean schema already supports the builder through:

- `question_blueprints.source_refs`
- `question_blueprints.source_bank_id`
- `question_blueprints.blueprint_kind`
- `question_blueprints.metadata`
- `question_blueprints.generation_constraints`
- `question_blueprints.generation_ready`
- `question_blueprints.generation_readiness`
- `question_blueprints.generation_blocking_reasons`
- `bank_blueprints`

## Role And Ownership Boundaries

- Teacher creates and edits their own private/shared/organization/public-review Blueprint library assets.
- Bank source examples require teacher owner/editor capability.
- Student classroom membership does not grant bank or Blueprint library browsing.
- Blueprint visibility and bank membership remain separate.
- Admin provider settings are untouched.

## Review Safety Gates

The Builder preserves these boundaries:

- `generation_ready` starts false.
- `generation_readiness` remains uncalibrated until a later gated workflow.
- Builder metadata records `noProviderCall`, `noReviewDraftCreation`, `noDirectStudentDelivery`, and `reviewDraftGateRequired`.
- Blueprint output is explicitly copy-gated through future Review Draft and bank approval flows.
- Source questions are not mutated by Blueprint creation or editing.

## Smoke Coverage Added

`scripts/blueprint-builder-core-smoke.mjs` verifies:

- Builder helper is server-only and provider-free.
- Create action uses active approved bank questions only.
- Teacher owner/editor bank capability is required.
- Source questions must be non-published draft/private bank questions.
- Structured create/edit fields exist in the UI.
- Detail page exposes preview/readiness and collapsed internal details.
- Existing schema supports the builder without a migration.
- Live smoke, when clean Supabase credentials are present, creates a smoke bank, source question, bank Blueprint, and bank link, then verifies private boundary and cleanup.

The script is included in `scripts/smoke-all.mjs`.

## Verification

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/blueprint-builder-core-smoke.mjs`
- `node scripts/blueprint-library-foundation-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/question-bank-ui-remodel-smoke.mjs`
- `node scripts/bank-share-members-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/publish-center-foundation-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Notes:

- Network-dependent live smokes were rerun with network access after sandboxed runs hit `fetch failed` / `EACCES`.
- `route-smoke` was run against a temporary local dev server on port 3000, then the temporary server was stopped.
- `blueprint-builder-core-smoke` live validation created and cleaned up a smoke bank, source question, bank Blueprint, and bank link.
- Provider log read is intentionally best-effort because teacher accounts do not read provider operation logs.

## Old Demo Overlap

Old demo branch was not used. This implementation follows the current bank-first product model:

```text
Bank source examples -> Blueprint planning asset -> later Review Draft generation
```

## Remaining Work

- Later PR: Blueprint generation through Review Drafts.
- Later PR: Blueprint calibration/readiness execution.
- Later PR: public/verified Blueprint governance.
- Later PR: richer taxonomy target editing if source questions are missing taxonomy.
