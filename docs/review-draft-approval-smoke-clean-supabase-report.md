# Review Draft Approval Workflow Smoke on Clean Supabase

Date: 2026-07-03

## Executive summary

The Review Draft approval workflow blocker on the clean Supabase database is fixed.

Previous blocker: publishing a synthetic AI-import draft through the normal Review Draft bulk publish path failed on the clean schema constraint:

```text
questions_ai_or_blueprint_requires_review_lineage
```

Root cause: AI-import-created questions had `source_kind = "ai_import"` but no `source_review_item_id`. The bulk publish action also approved taxonomy assignments before the question publish update failed, leaving a partial state.

Fix: added a transactional clean-schema RPC, `public.publish_review_draft_questions(uuid[])`, and routed Review/Admin publish actions through it. The RPC attaches real review lineage, publishes the question, approves pending taxonomy assignments, updates review item/action state, and writes a status event in one database transaction.

No secrets were printed or committed. `.env.local` was not modified.

## Draft selected for approval

- Import batch: `f3ebacf3-5c21-4c3e-b11e-8417201e9c8a`
- Source file: `real-gemini-qa-1783035823724.pdf`
- Question ID: `13ebfc76-7f5f-48cb-8d79-cd55880bf2da`
- Question code: `AI-F3EBACF3-001`
- Title: `Solve linear equation`
- Source type: `ai_pdf`
- Question source kind: `ai_import`

This is the tiny synthetic Gemini QA import batch, not a `calc_3.1_packet.pdf` batch.

## Review lineage fix

Added clean migration:

```text
supabase/clean-migrations/0016_review_draft_publish_lineage.sql
```

The migration creates:

```text
public.publish_review_draft_questions(question_ids uuid[])
```

For `ai_import` / `blueprint_generation` questions, the RPC requires review lineage before publish. If the question already has `source_review_item_id`, it validates that the review item is accessible and belongs to the same organization. If not, it resolves real lineage from `import_batch_items.created_question_id` and creates a bounded `review_batches` / `review_draft_items` lineage record for the existing imported draft.

It does not remove or weaken `questions_ai_or_blueprint_requires_review_lineage`.

## Transaction/order safety fix

Publishing now happens inside one database transaction through the RPC:

1. Resolve or create review lineage.
2. Update `questions.source_review_item_id`, `status`, `published_at`, and `reviewed_by`.
3. Approve pending/needs-review taxonomy assignments.
4. Mark the review draft item approved.
5. Insert a `review_actions` audit row.
6. Insert a `question_status_events` row.

If lineage cannot be resolved, the RPC raises before publishing and before taxonomy approval.

`bulkUpdateQuestions`, `updateQuestionStatus`, and direct question edit publish paths now call this RPC for publish actions instead of pre-approving taxonomy assignments in app code.

The Review UI error redirect query composition was also fixed so return URLs that already contain query parameters use `&error=...` behavior via `URLSearchParams`.

## Migration status

The clean migration was applied to the disposable clean Supabase project.

Verification:

- `migration_applied=true`
- `migration_record=recorded_version_name_statements`
- `rpc_present=true`

The local machine could not use the IPv6 direct DB host, so the migration was applied through the working Supabase pooler host for the disposable project. No old Supabase project was touched.

## Previous partial state handling

The previous failed smoke left the selected synthetic QA draft with:

- question status: `draft`
- `source_review_item_id`: null
- taxonomy assignments: already `approved`

For the re-test, the same isolated synthetic QA draft was reused. This validated that the new RPC can safely handle the previous partial synthetic state by attaching real review lineage and publishing the question without touching calc packet drafts. Because taxonomy assignments were already approved from the previous failed run, the runtime re-test did not need to change their state again; static smoke now verifies that the RPC publishes the question before taxonomy approval for fresh cases.

## Approval smoke result

The approval smoke published exactly one synthetic question:

- Question ID: `13ebfc76-7f5f-48cb-8d79-cd55880bf2da`
- Question code: `AI-F3EBACF3-001`
- Publish RPC rows returned: 1
- Batch linked question count: 1
- Batch published question count: 1

Post-publish state:

- `status`: `published`
- `source_kind`: `ai_import`
- `source_review_item_id`: non-null
- Review draft item count for the question: 1
- Review draft item status: `approved`
- Taxonomy assignment states: `approved`, `approved`
- Public taxonomy search for `AI-F3EBACF3-001`: found 1 row

## No bulk approval / calc packet safety

No bulk approval was performed.

The smoke targeted only:

```text
13ebfc76-7f5f-48cb-8d79-cd55880bf2da
```

Calc packet verification after the publish:

- `calc_3.1_packet.pdf` batches found: 2
- Linked calc packet questions: 41
- Published linked calc packet questions: 0

## Regression coverage added

`scripts/security-smoke.mjs` now verifies:

- clean migration contains `publish_review_draft_questions`
- generated questions require/attach review lineage before publish
- question publish update appears before taxonomy approval in the RPC
- review action audit is recorded
- admin publish actions call the transactional RPC
- old app-side pre-approval helper is not present

`scripts/supabase-rls-smoke.mjs` now verifies:

- the publish RPC is `security definer`
- teacher/admin and org-staff guards are present
- anon/public execution is revoked
- authenticated execution is granted

## Tests run

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `node scripts/security-smoke.mjs` passed.
- `node scripts/supabase-rls-smoke.mjs` passed with network access.
- `node scripts/route-smoke.mjs` passed.
- `npm.cmd run smoke` passed with network access.

## Safety confirmations

- `.env.local` was not modified.
- No provider credentials were read or printed.
- No gateway/encryption/anon/service-role key values were printed.
- No raw provider response or full prompt was printed.
- No old Supabase project was touched.
- No auth users were created.
- No seeds were applied.
- No calc packet drafts were approved.
- No `.codex_tmp/` or `output/` files were committed.

## Remaining blockers

No blocker remains for the synthetic Review Draft approval path. Future import creation could attach `source_review_item_id` earlier, but the current app still presents import drafts through `import_batch_items`, so the approval transaction is the governance boundary that attaches lineage safely.
