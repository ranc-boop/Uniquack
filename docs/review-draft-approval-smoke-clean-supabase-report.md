# Review Draft Approval Workflow Smoke on Clean Supabase

Date: 2026-07-03

## Executive summary

The controlled Review Draft approval smoke was run against the clean Supabase local dev environment using the normal admin Review Draft UI bulk publish workflow.

Result: **failed / blocked**. The selected synthetic QA draft was correctly identified and the normal Review UI action was attempted, but publishing was blocked by the clean schema constraint:

```text
questions_ai_or_blueprint_requires_review_lineage
```

The question remained `draft`, but the workflow had already approved its taxonomy assignments before the question status update failed. This reveals a real workflow blocker and a non-atomic partial-update risk in the current Review Draft publish path.

No secrets were printed or committed. `.env.local` was not modified.

## Draft selected for approval

- Import batch: `f3ebacf3-5c21-4c3e-b11e-8417201e9c8a`
- Source file: `real-gemini-qa-1783035823724.pdf`
- Question ID: `13ebfc76-7f5f-48cb-8d79-cd55880bf2da`
- Question code: `AI-F3EBACF3-001`
- Title: `Solve linear equation`
- Source type: `ai_pdf`
- Batch status: `imported`
- AI PDF phase: `completed`

This is the tiny synthetic Gemini QA import batch, not a `calc_3.1_packet.pdf` batch.

## Pre-approval draft integrity summary

Before the approval attempt:

- Batch contained exactly 1 imported item.
- Batch contained exactly 1 linked draft question.
- Draft status: `draft`
- Question text existed.
- Solution/explanation existed.
- Question type: `mcq`
- `answer_spec.kind`: `mcq`
- Options: 4
- Source/provenance fields existed.
- Organization matched the authenticated clean admin profile default organization.
- Taxonomy assignments: 2
- Taxonomy review state: `pending_review`

## Approval workflow path used

The smoke used the normal admin Review Draft UI path:

```text
/admin/review?batch=f3ebacf3-5c21-4c3e-b11e-8417201e9c8a
```

Actions performed:

1. Signed into the local dev app as the clean Supabase admin test account.
2. Opened the Review Draft batch filter page.
3. Confirmed the page showed only `AI-F3EBACF3-001`.
4. Selected the single checkbox for that question.
5. Submitted the existing bulk status form with status `Published`.

The normal UI form calls `bulkUpdateQuestions` from `src/app/admin/questions/actions.ts`.

## Approval result

The approval did not complete.

The browser returned this action error:

```text
new row for relation "questions" violates check constraint "questions_ai_or_blueprint_requires_review_lineage"
```

Post-attempt state:

- Question status: `draft`
- `published_at`: null
- `source_kind`: `ai_import`
- `source_review_item_id`: null
- Matching `review_draft_items`: 0
- Public search result for `AI-F3EBACF3-001`: not found

## Partial taxonomy update result

The same workflow did update taxonomy assignments before the publish failure:

- Taxonomy assignments: 2
- Assignment states after failed publish: `approved`
- Assignment source: `batch_import`

This means the publish action is not atomic for AI-imported questions. It approves taxonomy assignments before the final question status update can fail.

## Post-approval Question Bank result

The selected synthetic question did **not** become a published Question Bank question.

- Published synthetic question count: 0
- Question remains visible as a draft/admin review item, not public content.
- No student-visible publish occurred for the selected question.

## Source/provenance result

Source/provenance metadata remained attached to the question:

- `source`: present
- `source_kind`: `ai_import`

However, clean schema publication requires review lineage for `ai_import` questions:

```text
source_review_item_id is not null
```

The imported draft does not currently have a matching `review_draft_items` row, so the clean schema correctly blocks publish.

## Taxonomy review-state result

Before approval attempt:

- 2 assignments were `pending_review`.

After failed approval attempt:

- 2 assignments became `approved`.

This is a blocker because tag review state can advance even when the question remains unpublished.

## Search/practice read result

Public taxonomy search did not return the synthetic question after the failed publish attempt.

- Public search for `AI-F3EBACF3-001`: not found
- Practice read path was not exercised with this question because it remained `draft`.
- Taxonomy search path itself remains covered by route and smoke tests.

## No bulk approval confirmation

No bulk/calc approval occurred.

- Only one checkbox was selected in the filtered Review UI.
- The selected batch contained exactly one linked question.
- `calc_3.1_packet.pdf` batches found: 2
- Linked calc packet questions: 41
- Published linked calc packet questions: 0

## Tests run

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `node scripts/security-smoke.mjs` passed.
- `node scripts/supabase-rls-smoke.mjs` passed after rerun with network access.
- `node scripts/route-smoke.mjs` passed.
- `npm.cmd run smoke` passed after rerun with network access.

Initial sandboxed Supabase RLS calls hit `fetch failed`; the same checks passed with network access to the clean Supabase project.

## Remaining blockers

1. AI PDF import-created questions use `source_kind = "ai_import"` but currently have no `source_review_item_id`.
2. Clean schema blocks publishing `ai_import` questions without review lineage.
3. The Review Draft publish action approves taxonomy assignments before updating question status, so a failed publish can leave partial approved taxonomy state.
4. The Review UI error redirect appends the error to the existing batch URL with a second `?`, producing a malformed URL:

```text
/admin/review?batch=...?...error=...
```

## Recommended next task

Fix the Review Draft publish contract for AI-imported questions:

1. Either create real `review_batches` / `review_draft_items` lineage during AI import handoff, or adjust the publish workflow to create/attach the required review lineage before publishing.
2. Make bulk publish transactional or reorder it so taxonomy assignment approval only happens after the question status update succeeds.
3. Fix error redirect query composition for return URLs that already contain query parameters.
4. Rerun this same approval smoke after the fix.

## Safety confirmations

- `.env.local` was not modified.
- No provider credentials were read or printed.
- No gateway/encryption/anon/service-role key values were printed.
- No auth users were created.
- No migrations or seeds were modified or applied.
- No calc packet drafts were approved.
- No output or `.codex_tmp` files were committed.
