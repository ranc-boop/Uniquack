# Real Gemini Review Drafts QA Report

Date: 2026-07-02

Branch: `codex/real-gemini-review-drafts-qa`

## Executive Summary

The real Gemini Native PDF import for `calc_3.1_packet.pdf` successfully created 41 private draft questions for admin review. The previous clean-schema persistence blockers are fixed: draft rows now carry organization ownership and non-null question source metadata.

Safety checks passed:

- No generated question was auto-published.
- All generated questions remain `draft`.
- All taxonomy assignments remain `pending_review`.
- Draft rows align to the clean Supabase organization `edustruct-clean-mvp`.

Quality is not approval-ready yet. The drafts are suitable for teacher review, but they should not be bulk-approved without cleanup because solutions are empty, MCQ answer specs are not structured as MCQ answers, and figure/table crop attachment failed due a question asset schema mismatch.

## Import Summary

- Source file: `calc_3.1_packet.pdf`
- Batch prefix: `4f7908a7`
- Provider profile: Gemini Native PDF
- Provider kind: `gemini_native`
- Model: `gemini-2.5-flash`
- Import status: `imported`
- AI PDF phase: `completed`
- Drafts imported: 41
- Warning count: 15
- Uploaded crop count: 0
- Organization: `edustruct-clean-mvp`

The import summary reported:

```text
Imported 41 draft question(s). Review failed chunks separately if needed.
```

## Draft Count / Status Verification

Read-only inspection found:

- Import batch items: 41
- Imported item rows: 41
- Linked question rows: 41
- Question status counts: `draft: 41`
- Duplicate generated question codes: none
- Missing question rows: 0
- Missing question text: 0
- Missing answer spec objects: 0

## No-Auto-Publish Confirmation

No generated question from this batch was published automatically:

- Published generated questions: 0
- Non-draft generated questions: 0
- Auto-approved taxonomy assignments: 0

The draft questions are not student-visible through the published question bank unless a later human review/publish action occurs.

## Source / Provenance Metadata Verification

The clean source metadata contract passed:

- `content_source`: non-null for all 41
- `content_source_format`: non-null for all 41
- `solution_source`: non-null for all 41
- `solution_source_format`: non-null for all 41
- `source`: populated with `ai_pdf_import:<batchId>` style provenance for all 41
- `source_kind`: `ai_import` for all 41
- Page refs in normalized import metadata: present for all 41

Important quality note: `solution_source` is non-null but empty for all 41 drafts, because Gemini did not provide usable solution text in this run.

## Organization Alignment Verification

All 41 generated draft questions have the same organization as the import batch:

- Batch organization prefix: `56851ea8`
- Organization slug: `edustruct-clean-mvp`
- Organization mismatch count: 0

## Taxonomy Review-State Verification

Taxonomy assignment inspection found:

- Total taxonomy assignments: 123
- Assignments per sampled question: 3
- Assignment source: `batch_import`
- Assignment review status: `pending_review`
- Approved assignments: 0

This is the expected safe state for AI-imported draft content.

## Warning Summary

Warning categories from the import summary:

- Schema repair warning: 1
- Duplicate visible question number warnings: 7
- Missing/specific taxonomy tag warnings: 4
- Crop/asset warnings: 3

Warnings observed:

- The provider response was repaired after schema validation failed.
- Several visible question numbers repeated in the source packet, so server-generated codes such as `AI-4F7908A7-011` were used.
- The allowed taxonomy catalog did not include specific derivative/chain-rule tags Gemini wanted to use, so tags were downgraded to available pending-review assignments.
- Three crop attempts failed because the runtime expected a `question_assets.display_on_detail` column that is not present in the clean schema cache.

The crop failure is not a blocker to reviewing text-only drafts, but it is a blocker for figure/table fidelity.

## Quality Sample Summary

Sampled drafts: first 3, middle 3, last 3.

### First Drafts

Examples:

- `AI-4F7908A7-001`: derivative of `(x^2 - 5)^4`
- `AI-4F7908A7-002`: derivative of `sqrt(4x - 3)`
- `AI-4F7908A7-003`: derivative of `sin^2(5x)`

Quality notes:

- Stem quality is clear and bounded.
- Math is preserved in editable source with LaTeX-style formatting.
- Question type is FRQ, which is reasonable.
- Answer specs are minimal `frq` grading shells.
- Solutions/explanations are empty.
- Taxonomy assignments exist but remain broad/pending review.

### Middle Drafts

Examples:

- `AI-4F7908A7-020`: derivative of `3sqrt(x)`
- `AI-4F7908A7-021`: derivative of `sin^3(4x)`
- `AI-4F7908A7-022`: derivative of `e^{sqrt(1-cos x)}`

Quality notes:

- Stem extraction remains readable.
- Question types are FRQ.
- Answer specs are present but shallow.
- Solutions/explanations are empty.
- Taxonomy state is safe but not approval-ready.

### Last Drafts

Examples:

- `AI-4F7908A7-039`: tangent-line slope MCQ
- `AI-4F7908A7-040`: rate-of-change comparison MCQ
- `AI-4F7908A7-041`: product/chain-rule MCQ

Quality notes:

- Stems are readable.
- Options are present for MCQs.
- However, `answer_spec.kind` is still `frq` for MCQs.
- No correct option guidance was imported.
- Solutions/explanations are empty.

## Cross-Cut Quality Metrics

- Empty `solution_source`: 41 / 41
- Empty `solution_html`: 41 / 41
- MCQ rows: 4
- MCQ rows with options: 4
- MCQ rows with non-MCQ answer spec: 4
- Answer spec kinds: `frq: 41`
- Asset placeholders in normalized metadata: 10
- Question assets created: 0

## UI Route Check Summary

Local dev server was already running and responded:

- `/`: HTTP 200
- `/admin/review`: unauthenticated auth redirect, not a 500
- `node scripts/route-smoke.mjs`: passed `/admin/review` and related admin route checks

The in-app browser automation connection timed out during this QA pass, so no authenticated visual screenshot was captured. Read-only database inspection confirms the Review route has 41 linked draft question rows to show for the imported batch.

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run smoke`

## Blockers / Non-Blockers

### Blocker Before Teacher Review

None found. The generated questions exist as private drafts and are reachable by the review workflow data model.

### Blocker Before Approval / Publishing

- Solutions/explanations are empty for all 41 drafts.
- MCQ drafts have options but `answer_spec.kind` is `frq`, so automatic MCQ grading/correct-answer review is not ready.
- Figure/table crop attachment failed due `question_assets.display_on_detail` schema mismatch.

### Non-Blocking Quality Issues

- Duplicate visible source numbers were handled safely by generated question codes.
- Taxonomy assignments are broad and pending review because more specific derivative/chain-rule tags were unavailable in the allowed taxonomy catalog.

### Expected Warnings

- One schema repair warning is expected for this early real-provider import path.
- Pending-review taxonomy state is expected and safe.

## Recommended Next Task

AI parsing prompt/normalization quality improvement.

Focus areas:

1. Require Gemini extraction to include solution/explanation source when visible or mark it explicitly missing.
2. Normalize MCQ answer specs when options are present.
3. Align AI PDF crop attachment with the clean `question_assets` schema or update the asset helper to use the clean contract.

After that, run a teacher/manual review of generated drafts and an approval workflow smoke on a small selected subset.

## Safety Confirmations

- Old Supabase was not used.
- `.env.local` was not modified.
- Provider credentials were not changed.
- No provider API keys, gateway token, encryption key, anon key, service-role key, passwords, raw provider responses, or full prompts were printed or committed.
- No Review Drafts were approved, rejected, edited, or published.
- No migrations or seeds were modified or applied.
- `.codex_tmp/` and `output/` were not committed.
