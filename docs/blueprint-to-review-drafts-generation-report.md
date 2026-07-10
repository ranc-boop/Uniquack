# Blueprint to Bank-Scoped Review Drafts Generation

## Executive Summary

This PR adds the first teacher-safe generation path from a ready Question Blueprint into bank-scoped Review Drafts.

Teachers can now open a linked Blueprint and manually generate private Review Drafts for the target Question Bank. The workflow remains:

```text
Blueprint
-> server-resolved shared AI provider
-> private bank-owned draft questions
-> bank-scoped Review Drafts
-> human approval into bank
```

No generated question is published, assigned, or made student-visible by this flow.

## Product Workflow Touched

- Teacher Blueprint detail page now shows a gated `Generate Review Drafts` action.
- The action loads the Blueprint server-side and accepts only `blueprintId` from the form.
- The server validates the linked bank, teacher owner/editor role, Blueprint readiness, source examples, and active assignable taxonomy tags.
- Generated questions are imported through the existing batch import normalizer with `targetBankId`.
- The generated questions are linked to a new `review_batches` / `review_draft_items` handoff with `source_kind = blueprint_generation`.
- Bank Review Drafts now display Blueprint lineage so teachers can see the source Blueprint before approval.

## Role Boundaries

- Teacher can manually generate Review Drafts only for a Blueprint linked to a bank they can manage.
- Provider selection, model, keys, and vendor-specific configuration remain admin-only.
- Students cannot read unapproved Blueprint-generated bank drafts.
- Admin/provider settings are unchanged.

## Data Ownership

- Generated questions are owned by the target Question Bank through `owner_bank_id`.
- Import batches and review batches carry `target_bank_id`.
- Review draft payloads include Blueprint lineage metadata: Blueprint id/title, target bank, source question count, and import batch id.
- Taxonomy assignments for generated drafts remain `pending_review`.

## Safety Gates

- No direct assignment.
- No auto-publish.
- No public/global bank write.
- No Review Draft bypass.
- No arbitrary teacher prompt or client-supplied provider config.
- Transient provider failure records a failed, retryable bank-scoped import batch with safe teacher-facing copy.
- Existing bank approval is still required before a generated draft becomes an active bank question.

## Provider Behavior

The generation helper resolves enabled provider profiles on the server with existing provider infrastructure.

Supported server paths:

- Gemini Native text generation through the existing native adapter.
- OpenAI-compatible chat completion providers.
- Existing mock provider path when explicitly allowed.

The teacher UI does not expose provider names, model names, API keys, or profile ids.

## Files Changed

- `src/lib/teacher-blueprint-generation.ts`
- `src/lib/ai-providers/gemini-native.ts`
- `src/lib/batch-import/service.ts`
- `src/lib/question-banks.ts`
- `src/app/teacher/blueprints/actions.ts`
- `src/app/teacher/blueprints/[blueprintId]/page.tsx`
- `src/app/teacher/banks/[bankId]/review/page.tsx`
- `scripts/blueprint-to-review-drafts-generation-smoke.mjs`
- `scripts/blueprint-builder-core-smoke.mjs`
- `scripts/blueprint-library-foundation-smoke.mjs`
- `scripts/smoke-all.mjs`

## Smoke Coverage Added

`scripts/blueprint-to-review-drafts-generation-smoke.mjs` verifies:

- Blueprint generation helper is server-only.
- Teacher action loads Blueprint server-side, accepts only `blueprintId`, and does not accept provider/model/key/prompt/JSON input.
- UI exposes gated Review Draft generation, not direct publish/assignment.
- Review Draft page shows Blueprint lineage.
- Generated draft stays private, bank-scoped, and pending taxonomy review.
- Student cannot read unapproved generated draft.
- Bank approval creates an active `bank_questions` row without global publishing.
- Source question remains unchanged.

## Pre-merge Provider E2E Validation

Result: blocked by provider availability before a full final pass.

A bounded real-provider validation was attempted against the configured clean Supabase environment using the existing shared provider path. The temporary runner did not commit helper files and did not print provider keys, gateway tokens, Supabase keys, DB passwords, raw prompts, or raw provider responses.

Confirmed during the pre-merge validation:

- Enabled AI-capable provider profiles were available.
- The selected server strategy was `gemini_native`.
- The real provider path was reached.
- In partial runs, Gemini returned one generated draft and the generated import batch preserved the selected `target_bank_id`.
- No Assignment creation path was invoked.
- No public/global publish path was invoked.
- Synthetic smoke artifacts created during the temporary validation were cleaned up.

The full end-to-end pass did not complete because subsequent bounded provider attempts returned transient provider failures before draft creation. Earlier partial-success attempts stopped at a runner assertion that expected `import_batches.status = ready`; the actual safe status for this path can be `imported`. That runner issue was corrected, but the provider then returned transient failures before a complete Review Draft and approval verification could rerun.

What still needs a later real-provider rerun:

- Generated question `owner_bank_id`, draft/private status, and `published_at = null` verification after provider success.
- Review Draft row lineage verification from the real generated question.
- Approval into the target bank through `approve_bank_review_question`.
- `bank_questions` active row confirmation after approval.
- Source question unchanged confirmation after the full pass.

Existing source and live non-provider smokes continue to cover the bank-scoped Review Draft, approval, no-publish, no-assignment, and source-mutation safety boundaries without invoking a paid provider.

## Test Results

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/blueprint-to-review-drafts-generation-smoke.mjs`
- `node scripts/blueprint-builder-core-smoke.mjs`
- `node scripts/blueprint-library-foundation-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/ai-parsing-status-review-qa-smoke.mjs`
- `node scripts/ai-pdf-provider-failure-status-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/publish-center-foundation-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Notes:

- Route smoke was run with a temporary local dev server in the same PowerShell invocation.
- Live Supabase smokes needed network access outside the sandbox; after network access was allowed, the live bank/review, question bank, publish center, Blueprint generation, RLS, and aggregate smoke checks passed.

## Remaining Warnings

- Real provider validation was attempted and reached Gemini Native, but the final complete pass was blocked by transient provider availability.
- Do not treat this as a fully completed paid-provider E2E until the later rerun completes the generated question, Review Draft, approval, and cleanup checks in one pass.

## Recommendation

Rerun the real-provider Blueprint generation E2E when Gemini availability is stable. If that pass completes, proceed to teacher-facing polish. If transient provider failures continue, keep the PR behavior but document the provider availability blocker before merge.
