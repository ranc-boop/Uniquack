# Teacher-private Import to Review Drafts to Bank

## Executive Summary

This PR adds the first bank-scoped import and review-to-bank slice. Teachers can
start an import from a selected Question Bank, review draft questions scoped to
that bank, and approve reviewed drafts into `bank_questions` without publishing
them globally.

## Schema / Migration

Added clean migration:

- `supabase/clean-migrations/0027_bank_import_review_scope.sql`

The migration adds:

- `import_batches.target_bank_id`
- `review_batches.target_bank_id`
- `review_draft_items.target_bank_id`
- `questions.owner_bank_id`
- `questions.visibility`
- bank-aware RLS for import batches/items/assets, review batches/items/actions,
  and bank-owned questions
- `public.approve_bank_review_question(question_id, bank_id)`
- `public.approve_review_item_to_bank(review_item_id, bank_id)`

If migration apply tooling is unavailable, use:

- `docs/bank-import-review-migration-0027-manual-apply.md`

## Import-to-Bank Behavior

The first teacher import surface is:

- `/teacher/banks/[bankId]/imports`

It uses the existing normalized batch import service with a `targetBankId`.
Created draft questions are owned by the target bank and remain private review
drafts. No provider settings are changed and no real provider call is added.

## Review Draft Bank Scope

The bank review surface is:

- `/teacher/banks/[bankId]/review`

It lists draft questions owned by the selected bank. Owners and editors can
approve drafts; viewers do not receive mutation controls.

## Approval Into Bank

Approval uses `approve_bank_review_question`. It:

- requires authenticated bank owner/editor access
- verifies the question and bank share an organization
- requires bank-scoped import/review lineage
- creates or attaches Review Draft item lineage
- inserts/updates `bank_questions`
- approves pending taxonomy assignments
- records review action/status event
- keeps `questions.status` non-published
- keeps `published_at` null

## Private / Global Leakage Prevention

Bank-approved questions are read through `bank_questions` membership, not global
published search. Public/global question routes still rely on published status.
The bank approval RPC does not call the global Review Draft publish RPC.

## Routes / Pages Implemented

- `/teacher/banks/[bankId]/imports`
- `/teacher/banks/[bankId]/review`
- `/teacher/banks/[bankId]/questions`
- `/teacher/banks/[bankId]` now links the bank workflow directly

## RLS / Security

Expected RLS behavior:

- owner/editor can import and approve
- viewer can inspect bank-owned content only through explicit bank membership
- non-members cannot read private bank questions/import/review rows
- students do not gain bank access through classroom membership
- anonymous users cannot call approval RPCs

## Smoke Coverage

Added:

- `scripts/bank-import-review-smoke.mjs`

Updated:

- `scripts/route-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/supabase-rls-smoke.mjs`
- `scripts/smoke-all.mjs`

The workflow smoke creates a private smoke bank, creates a bank-scoped import
fixture, approves a Review Draft into the bank, verifies the `bank_questions`
row, and confirms the question is not globally published.

## Non-goals

- no assignment-from-bank
- no public pull/private push
- no student bank browsing UI
- no Google Classroom
- no wearable UI
- no provider configuration changes
- no AI auto-publish

## Remaining Blockers

Migration 0027 was manually applied to the clean Supabase project. The first
post-apply live smoke reached the approval RPC and found a PL/pgSQL ambiguity in
the manually applied function body:

- `column reference "question_id" is ambiguous`

The branch migration has been corrected to use
`on conflict on constraint bank_questions_bank_id_question_id_key` in
`approve_bank_review_question`. Re-run the corrected migration SQL, or at least
the corrected `create or replace function public.approve_bank_review_question`
block, in the Supabase SQL Editor before re-running the live approval smoke.

## Validation Results

Checks passed before remote approval validation:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/bank-share-members-smoke.mjs`
- `npm.cmd run perf:budget`

Live clean Supabase status:

- Existing question bank foundation smoke passed with real teacher credentials.
- Existing bank share/member smoke passed.
- Migration 0027 was manually applied and the expected columns/functions were
  verified in Supabase.
- New bank import/review smoke no longer skipped the live path. It created the
  private smoke bank, bank-scoped import batch, bank-owned private draft
  question, and bank-scoped import item, then failed at approval because the
  remote `approve_bank_review_question` function still has the ambiguous
  `question_id` conflict target from the earlier SQL.
- The smoke cleanup removed the smoke-created bank/import/question rows.
- Private/global leakage checks after approval are still blocked until the
  corrected approval RPC is applied remotely.

Post-apply correction:

- `supabase/clean-migrations/0027_bank_import_review_scope.sql` now uses
  `on conflict on constraint bank_questions_bank_id_question_id_key`.
- `node scripts/security-smoke.mjs` passed after the correction.
- `node scripts/supabase-rls-smoke.mjs` passed after the correction.
- `npm.cmd run lint` passed after the correction.
- `npm.cmd run build` passed after the correction.
- `node scripts/route-smoke.mjs` passed after the correction.
- `node scripts/question-bank-foundation-smoke.mjs` passed after the correction.
- `node scripts/bank-share-members-smoke.mjs` passed after the correction.
- `npm.cmd run perf:budget` passed after the correction.
- `node scripts/bank-import-review-smoke.mjs` and `npm.cmd run smoke` still
  fail on the remote `question_id` ambiguity until the corrected function body
  is applied in Supabase.

Migration apply tooling:

- `supabase` CLI was not available on PATH.
- `psql` was not available on PATH.
- Manual SQL apply instructions are in
  `docs/bank-import-review-migration-0027-manual-apply.md`.
