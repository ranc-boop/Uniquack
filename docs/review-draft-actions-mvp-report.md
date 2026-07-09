# Review Draft Actions MVP Report

Date: 2026-07-09

## Executive Summary

This PR makes bank-scoped Review Drafts actionable beyond approval.

Teachers who are bank owners or editors can now:

- edit a private Review Draft before approval
- mark a draft as needs-fix
- reject/archive a draft
- approve into the selected bank through the existing bank approval path

The workflow remains:

```text
Teacher private source
-> AI Parsing / import
-> bank-scoped Review Draft
-> teacher edit / needs-fix / reject / approve
-> approved bank question
-> assignment later
```

No generated content is auto-published, assigned, made public, or exposed to students.

## Schema And Status Audit

Draft questions are stored as `questions` rows with:

- `status = "draft"`
- `owner_bank_id` set for bank-scoped drafts
- `visibility` kept non-public
- `published_at = null`
- `source_review_item_id` when Review Draft lineage exists

Review workflow state is represented by existing Review Draft tables:

- `review_batches`
- `review_draft_items`
- `review_actions`

The current schema safely supports:

- `review_draft_items.status = "pending_review"`
- `review_draft_items.status = "needs_more_evidence"`
- `review_draft_items.status = "rejected"`
- `questions.status = "archived"` for rejected draft questions

No new enum values were invented. No migration was needed.

The implementation preserves or reconstructs missing Review Draft lineage for older bank-owned drafts using existing `import_batch_items`, `import_batches`, `review_batches`, and `review_draft_items` fields.

## Edit Draft Behavior

The edit action is implemented by `editBankReviewDraftQuestion`.

Editable fields are limited to safe draft content fields:

- title
- prompt/body source
- prompt/body HTML rendered from Markdown/LaTeX
- solution/explanation source
- solution/explanation HTML rendered from Markdown/LaTeX
- difficulty rating

The edit action does not allow changing:

- `owner_bank_id`
- `published_at`
- public visibility
- source/provider metadata
- source lineage
- approved `bank_questions` rows

Saving an edit resets the Review Draft item to `pending_review` and returns to the same bank Review Draft page.

## Needs-Fix And Reject Behavior

Needs-fix is implemented by `markBankReviewDraftNeedsFix`.

- Sets `review_draft_items.status = "needs_more_evidence"`.
- Records a `review_actions` row with `request_more_evidence`.
- Keeps the draft private and visible only in the bank Review Draft context.
- Does not call a provider, publish, assign, or add the draft to `bank_questions`.

Reject/archive is implemented by `rejectBankReviewDraftQuestion`.

- Sets `review_draft_items.status = "rejected"`.
- Sets the draft question `status = "archived"` while keeping `published_at = null`.
- Records a `review_actions` row with `reject`.
- Records a `question_status_events` row.
- Removes the draft from the normal pending queue.
- Preserves source/import/review lineage.
- Does not delete source assets, import batches, or approved bank questions.

## Permission Model

All new actions require:

- authenticated teacher
- selected bank exists
- selected bank is active
- current user is bank owner or editor
- Review Draft question belongs to the selected bank
- draft is not deleted
- draft has `status = "draft"`
- draft has `published_at = null`
- draft is not public

The actions block:

- bank viewers
- unrelated teachers
- students
- anonymous users

Admin provider settings and admin import routes are unchanged.

## UI Behavior

The bank Review Draft page now includes an expandable `Edit Review Draft before approval` panel for each draft.

The panel shows:

- editable title
- editable question prompt
- editable solution/explanation
- editable difficulty
- needs-fix action with optional reason
- reject/archive action with optional reason

The page copy states:

- editing changes the private draft only
- approval still moves the reviewed draft into the bank
- needs-fix and reject do not publish anything
- students never see Review Drafts

Existing QA preview behavior remains in place:

- warning details
- prompt preview
- answer/options preview
- correct-option highlighting when available
- solution/explanation preview
- taxonomy suggestions
- source lineage

## Safety Boundaries

Confirmed:

- no auto-publish
- no Review Draft bypass
- no provider calls
- no student-visible draft route
- no generated question public visibility
- no automatic assignment
- no Blueprint generation
- no Google Login/Classroom changes
- no provider credential changes
- no `.env.local` changes
- no migration
- no old demo branch work

The existing `approveBankReviewQuestion` path remains bank-scoped and continues to use the existing approval RPC.

## Files Changed

- `src/app/teacher/banks/actions.ts`
- `src/app/teacher/banks/[bankId]/review/page.tsx`
- `src/lib/question-banks.ts`
- `scripts/review-draft-actions-mvp-smoke.mjs`
- `scripts/ai-parsing-status-review-qa-smoke.mjs`
- `scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/smoke-all.mjs`
- `docs/review-draft-actions-mvp-report.md`

## Smoke Coverage

Added `scripts/review-draft-actions-mvp-smoke.mjs`.

Coverage verifies:

- edit action exists
- edit action requires teacher and owner/editor bank role
- draft must belong to the selected bank
- draft must remain draft/private/non-published
- editable fields are limited
- edit does not change ownership, visibility, published state, provider metadata, source lineage, or approved bank rows
- needs-fix uses existing `needs_more_evidence` Review Draft status
- reject uses existing `rejected` Review Draft status and archives the draft question
- approve path remains bank-scoped
- no provider call is introduced
- no migration is added

Updated existing smokes to account for the new safe `published_at = null` checks while still blocking public/published write patterns.

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/review-draft-actions-mvp-smoke.mjs`
- `node scripts/ai-parsing-status-review-qa-smoke.mjs`
- `node scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Notes:

- `route-smoke` was run with a temporary local Next dev server job.
- Live Supabase workflow smokes required approved network access outside the restricted filesystem sandbox.

## Remaining Blockers

No blocker remains for this MVP.

Future follow-ups:

- richer option/answer-spec editing for MCQ-specific structures
- batch-level Review Draft filters for needs-fix/rejected history
- source PDF/image evidence preview beside each draft
- human-readable taxonomy correction controls before approval

## Explicit Non-Goals

- no auto-publish
- no Review Draft bypass
- no provider calls
- no student workspace changes
- no Blueprint generation
- no Google Login/Classroom
- no public/global publish
