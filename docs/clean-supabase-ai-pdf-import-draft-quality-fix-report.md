# Clean Supabase AI PDF Import Draft Quality Fix Report

Branch: `codex/ai-pdf-import-draft-quality-fixes`

## Scope

This fix targets future AI PDF imports on the clean Supabase runtime. It does not
retroactively rewrite existing Review Drafts.

## Root Causes Addressed

1. Batch import trusted a provider-supplied `answer_spec.kind` even when the
   normalized item clearly had multiple-choice options. This allowed MCQ drafts
   to remain stored with FRQ answer specs.
2. AI PDF import did not surface a clear review warning when Gemini omitted a
   solution/explanation.
3. AI PDF crop uploads still inserted old `question_assets` columns such as
   `display_on_detail`, `object_path`, `mime_type`, `size_bytes`, and
   `original_filename`.
4. The clean disposable project was missing the `question-assets` storage bucket
   and storage policies needed after the table insert path was fixed.

## Changes

- MCQ normalization now forces MCQ answer specs when options are present.
- Correct option IDs are resolved from provider answer fields and MCQ answer
  spec fields by matching visible option ids/labels.
- MCQ drafts with options but no reliable correct answer remain draft-only and
  receive a reviewer warning.
- Missing solution/explanation now produces an explicit Review warning rather
  than silently appearing approval-ready.
- AI PDF prompt instructions now ask for solution fields when visible/reliable
  and explicitly forbid invented solutions.
- AI PDF crop attachments now write the clean `question_assets` schema:
  `asset_kind`, `storage_bucket`, `storage_path`, `label`, `alt_text`.
- Review, admin question, question detail, reset, and bulk asset views now read
  clean `question_assets` fields.
- Added clean migration
  `supabase/clean-migrations/0015_question_assets_storage_bucket.sql`.

## Disposable Migration Apply

Migration `0015_question_assets_storage_bucket.sql` was applied to the
disposable clean Supabase project using a temporary workspace containing only
clean migrations. Migration list showed local and remote aligned through `0015`.

No seeds were applied. No provider credentials were changed.

## Safety

- No generated question is auto-published.
- Review Draft and pending-review boundaries remain unchanged.
- No old Supabase project was touched.
- No provider API keys, gateway tokens, encryption keys, or service-role keys
  were printed or committed.
- No real provider call was made in this fix pass.

## Remaining Manual QA

- Existing drafts from the earlier 41-question Gemini run are not retroactively
  repaired. Re-run AI PDF import or reset/reimport to exercise the new
  normalization.
- If Gemini still omits a solution, the draft should now carry a clear Review
  warning instead of looking approval-ready.
- `question-assets` remains a public bucket by product design; known public URL
  access is still possible and is reported by the asset security smoke as a
  risk note.
- Student-specific question asset checks were skipped because the clean local
  environment does not currently have valid student smoke credentials.

## Validation

- `npm.cmd run lint`: passed
- `npm.cmd run build`: passed
- `node scripts/security-smoke.mjs`: passed
- `node scripts/supabase-rls-smoke.mjs`: passed with network access
- `node scripts/route-smoke.mjs`: passed
- `node scripts/batch-import-smoke.mjs`: passed with network access
- `node scripts/question-assets-security-smoke.mjs`: passed with network access;
  student-only checks skipped due missing/invalid student credentials
- `node scripts/bulk-asset-import-smoke.mjs`: passed
- `node scripts/package-import-smoke.mjs`: passed
- `node scripts/markdown-latex-editor-smoke.mjs`: passed
- `npm.cmd run smoke`: passed with network access
