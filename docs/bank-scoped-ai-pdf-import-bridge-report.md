# Bank-Scoped AI PDF Import Bridge Report

## Executive Summary

This PR bridges the existing AI PDF import service into teacher-owned Question Banks. Teachers can upload a private PDF from a bank import page, run the existing server-side AI Parsing path, and receive bank-scoped Review Drafts. The flow remains review-gated and does not publish generated questions or expose private bank content to students.

## Service Bridge Result

- `processAIPdfImport` now accepts `targetBankId`.
- Both single-pass and chunked AI PDF import paths forward `targetBankId` into `importBatchImportJson`.
- Existing admin AI PDF actions preserve any `import_batches.target_bank_id` on queued/retry processing.
- No extraction behavior, provider routing, or Review Draft approval behavior was changed.

## Teacher Action Behavior

- Added `importBankPdfDrafts` as a teacher server action.
- Requires `requireTeacher()`.
- Requires the current teacher to be an owner/editor of the target bank.
- Rejects inactive banks, non-PDF files, empty files, and files over the existing AI PDF size limit.
- Selects an enabled AI PDF provider server-side only.
- Creates an `ai_pdf` import batch with `target_bank_id`.
- Uploads the source PDF to the existing AI import source bucket.
- Calls `processAIPdfImport` with `targetBankId`.
- Redirects teachers to the bank Review Drafts page after import.

## Admin Guard Preservation

- `/admin/imports/pdf` actions still require admin/super-admin guards.
- No teacher action imports or calls admin PDF actions.
- Provider profile selection remains server-side and does not expose provider credentials to the client.

## Bank-Scoped Review Draft Result

- Generated AI PDF outputs flow through `importBatchImportJson` with the target bank context.
- Draft questions remain private, review-scoped, and non-published.
- Existing bank Review Draft approval remains the gate before assignment.
- Existing JSON fixture import remains available as an advanced/developer path.

## UI Behavior

- `/teacher/banks/[bankId]/imports` now shows a PDF upload panel for owner/editor users.
- The panel clearly states that Review is required before assignment and that import does not publish questions.
- Viewers see the import button disabled.
- The advanced JSON fixture remains collapsed and unchanged.

## Safety Boundaries

- No database migration was added.
- No provider keys or gateway tokens are printed or exposed.
- No `.env.local` changes.
- No AI auto-publish.
- No student-visible direct write.
- No full bank exposure to students.
- No old Supabase work.

## Provider Testing Status

No real paid provider call was executed as part of this PR. Validation used source/static smoke coverage plus live clean Supabase non-provider workflow smokes. The new teacher action uses the existing provider path when submitted manually by a teacher.

## Smoke Coverage

Added `scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs` and included it in `npm.cmd run smoke`.

Coverage verifies:

- `processAIPdfImport` carries `targetBankId`.
- `importBatchImportJson` receives bank scope.
- Admin PDF import guards remain admin-only.
- Teacher bank PDF import requires teacher and owner/editor role.
- Teacher UI exposes PDF import without admin links.
- Draft outputs remain review-gated and non-published.
- Provider credentials are not exposed in the teacher path.

## Tests

Passed:

- `node --check scripts\bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `node scripts\bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/teacher-ai-parsing-bank-targeting-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/teacher-dashboard-real-data-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Note: Live Supabase smokes required network access outside the restricted sandbox. The sandboxed run failed with `fetch failed`; the escalated network run passed.

## Remaining Blockers

No code blockers found. Manual end-to-end teacher PDF upload still depends on an enabled AI PDF provider and clean Supabase storage/RLS configuration being available in the target environment.
