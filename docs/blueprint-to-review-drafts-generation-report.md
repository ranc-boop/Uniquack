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
- Teacher action loads Blueprint server-side and does not accept provider/model/key input.
- UI exposes gated Review Draft generation, not direct publish/assignment.
- Review Draft page shows Blueprint lineage.
- Generated draft stays private, bank-scoped, and pending taxonomy review.
- Student cannot read unapproved generated draft.
- Bank approval creates an active `bank_questions` row without global publishing.
- Source question remains unchanged.

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

- The new provider call path was not exercised against a real paid provider in this PR. The smoke validates the bank/review handoff without invoking an AI provider.
- Full real-provider Blueprint generation can be validated later with a tiny safe Blueprint once product wants a paid-provider E2E check.

## Recommendation

Proceed to teacher-facing polish or real-provider E2E for Blueprint generation only after this Review Draft handoff is merged.
