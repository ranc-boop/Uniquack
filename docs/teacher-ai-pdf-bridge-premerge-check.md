# Teacher AI PDF Bridge Pre-Merge Check

## Purpose

This is the same-PR pre-merge validation checklist for the Bank-Scoped AI PDF Import Bridge.

The bridge goal is:

```text
Teacher private PDF
-> selected Question Bank
-> existing server-side AI PDF provider path
-> bank-scoped Review Drafts
-> teacher review
-> approve into bank
-> assignment from approved bank content
```

## Code-Path Verification

- Teacher action path: `/teacher/banks/[bankId]/imports` posts to `importBankPdfDrafts`.
- Shared service path: `processAIPdfImport` accepts `targetBankId` and forwards it to `importBatchImportJson`.
- Single-pass path: AI PDF single-pass import passes `targetBankId` into the batch import service.
- Chunked path: AI PDF chunk import passes `targetBankId` into the batch import service.
- Admin guard preservation: `/admin/imports/pdf` still uses admin/super-admin guards and only preserves existing `import_batches.target_bank_id`.
- Review Draft handoff: teacher import redirects to `/teacher/banks/[bankId]/review`.
- JSON fixture separation: the JSON fixture remains in the collapsed `Advanced / Developer fixture` area and is not the main teacher PDF path.

## Permission Verification

- Owner/editor can import into a bank.
- Viewer is blocked by `canManageBankContent(detail.currentUserRole)` and a disabled submit UI.
- Student is blocked by `requireTeacher()`.
- Unauthenticated user is blocked by the teacher auth guard.
- Inactive bank is blocked.
- Missing `bankId` / invalid target bank is blocked by schema validation and bank lookup.
- Non-PDF file is blocked.
- Empty PDF is blocked.
- Oversized PDF is blocked by the existing AI PDF size limit.

## Data Verification

- `import_batches.target_bank_id` is set for teacher bank PDF imports.
- Review Draft items should target the selected bank through the existing bank-scoped import service.
- Generated questions should have `owner_bank_id` set to the selected bank.
- Generated questions remain `status = draft`.
- `published_at` remains null.
- Taxonomy assignments remain `pending_review`.
- Approval into the bank still uses the existing bank review RPC/path.
- Bank-private draft and approved-bank content should not appear in global/public search.

## Provider Validation Status

No paid/live provider call was executed during this pre-merge check.

Validated instead:

- Static source smoke confirms the provider path receives `targetBankId`.
- Live clean Supabase non-provider smokes confirm bank import/review, question bank, teacher AI Parsing targeting, and teacher dashboard behavior.
- Full smoke passes when network access to clean Supabase is available.

Manual provider-backed E2E still needs to be run in an environment with an enabled AI PDF provider and storage/RLS configured for teacher PDF source uploads.

## Manual E2E Checklist

1. Sign in as `TEST_TEACHER` or a real teacher.
2. Create or select a private Question Bank.
3. Open `/teacher/banks/[bankId]/imports`.
4. Upload a tiny safe PDF, such as a one-question synthetic worksheet.
5. Submit AI PDF import.
6. Confirm redirect to `/teacher/banks/[bankId]/review`.
7. Confirm a Review Draft appears.
8. Confirm the draft source/import batch references the selected bank.
9. Approve one draft into the bank.
10. Confirm the approved question remains non-published.
11. Publish or assign the approved bank question to a classroom through the normal assignment flow.
12. Sign in as a student in that classroom.
13. Confirm the student sees the assignment only, not the source bank.
14. Open `/practice?assignmentId=...`.
15. Confirm the question loads.
16. Submit an answer or use hint/grade flow if available.
17. Confirm practice evidence persists back to the assignment/progress surface.

## Failure-State Checklist

Current handling:

- No provider configured: teacher UI explains that AI PDF parsing is not enabled for the site or organization yet, and that a platform admin must enable a shared provider in Admin / AI Settings.
- Invalid PDF: teacher action blocks missing, non-PDF, empty, and oversized files before provider execution.
- Permission denied: teacher action blocks non-owner/editor bank roles.
- Inactive bank: teacher action blocks import.
- Storage upload failure: action cleans up the reserved batch/asset/storage object where possible and returns the upload error.
- Provider failure: existing AI PDF service error handling updates import state and returns an error.
- Import returns zero drafts: teacher action redirects with created draft count; this copy may need product polish if zero-draft imports are common.

Remaining polish:

- Add a richer teacher-visible import status/history timeline for provider failures.
- Add a friendlier zero-draft result panel with suggested next steps.
- Add a guided manual retry path for failed teacher PDF imports.

## Server Action Form / Provider Setup Addendum

- Removed explicit `encType` / `method` from the teacher PDF import server-action form to avoid the React warning. React supplies those automatically for server-action forms.
- Kept the PDF file input as a normal multipart file input with `name="pdf"` and `accept="application/pdf,.pdf"`.
- Clarified product architecture: Admin Dashboard / AI Settings configures shared site/org provider profiles. Teacher and student workspaces call shared server-side AI services, not admin dashboard actions.
- Provider credentials, vendor names, model IDs, and raw provider config remain absent from the teacher workspace.
- Teacher no-provider state is expected until the shared AI provider is enabled.
- Manual provider-backed E2E remains pending until an enabled provider plus storage/RLS are available.

## Tests Run

Latest pre-merge rerun:

- Passed `node --check scripts\bank-scoped-ai-pdf-import-bridge-smoke.mjs`.
- Passed `npm.cmd run lint`.
- Passed `npm.cmd run build`.
- Passed `node scripts/security-smoke.mjs`.
- Passed `node scripts/route-smoke.mjs`.
- Passed `node scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs`.
- Passed `node scripts/teacher-ai-parsing-bank-targeting-smoke.mjs`.
- Passed `node scripts/bank-import-review-smoke.mjs`.
- Passed `node scripts/question-bank-foundation-smoke.mjs`.
- Passed `node scripts/teacher-dashboard-real-data-smoke.mjs`.
- Passed `npm.cmd run smoke`.
- Passed `npm.cmd run perf:budget`.

Network note:

- Live Supabase checks hit sandboxed `EACCES` / `fetch failed` when run without network access.
- The same live checks passed with approved network access to the clean Supabase project.

## Merge Recommendation

Safe to merge if tests pass and manual provider E2E is either completed or explicitly scheduled for environment validation.

Not safe to merge if the provider route cannot preserve `targetBankId` or if the admin guard is weakened.
