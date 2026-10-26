# Teacher AI Parsing Reality Audit

Date: 2026-07-08

Branch: `codex/teacher-ai-parsing-reality-audit`

## Executive summary

Teacher AI Parsing is not a native teacher PDF upload/provider workflow yet.

What exists today:

- `/teacher/ai-parsing` is a teacher-facing bank-targeted entry page.
- `/teacher/banks/[bankId]/imports` can create bank-scoped Review Drafts from an advanced JSON fixture.
- `/teacher/banks/[bankId]/review` can approve draft questions into the selected private/shared Question Bank.
- `/admin/imports/pdf` is the real PDF upload and provider-backed AI parsing surface.

What does not exist today:

- A teacher cannot upload a PDF directly from the teacher workspace.
- A teacher cannot start a real Gemini/OpenAI-compatible PDF extraction from `/teacher/ai-parsing`.
- The real AI PDF service does not currently receive a `targetBankId`, so provider-created PDF drafts are not automatically scoped to a teacher Question Bank.
- The teacher AI Parsing UI does not yet give a first-class progress/history flow for source PDFs.

Classification: **partial product shell plus bank-scoped JSON import fixture**.

The next PR should connect the existing provider-backed PDF pipeline to the teacher bank workflow with a teacher-safe, bank-scoped import path.

## Product workflow target

EduStruct's protected workflow is:

```text
Private/owned materials
-> AI Parsing
-> Review Drafts
-> Question Bank / Library
-> Assignment
-> Practice Evidence
-> Teacher insight
```

Question Banks are the content source of truth. Classrooms are roster and delivery layers. AI Parsing should create private, review-gated drafts inside a selected bank before any assignment or student-visible use.

## Route and action inventory

| Surface | Role | PDF upload | Provider call | Creates drafts | Bank scoped | Current status |
| --- | --- | --- | --- | --- | --- | --- |
| `/teacher/ai-parsing` | Teacher | No | No | No | Selects a bank | Bank-targeted wrapper and navigation page |
| `/teacher/banks/[bankId]/imports` | Teacher owner/editor | No | No | Yes, via JSON fixture | Yes | Advanced smoke/developer import path |
| `importBankJsonDrafts` | Teacher owner/editor | No | No | Yes | Yes | Calls `importBatchImportJson` with `targetBankId` |
| `/teacher/banks/[bankId]/review` | Teacher owner/editor | No | No | No new drafts | Yes | Reviews/approves bank-private drafts |
| `approveBankReviewQuestion` | Teacher owner/editor | No | No | No new drafts | Yes | Approves a draft into `bank_questions` without global publish |
| `/admin/imports/pdf` | Admin, super admin to execute | Yes | Yes, super admin execution | Yes | No teacher bank target | Real PDF/provider path |
| `reserveAIPdfSourceUpload` / `finalizeAIPdfSourceUpload` | Admin | Yes | No | No | No teacher bank target | Source PDF staging |
| `startAIPdfExtraction` | Super admin | No | Queues provider job | Not directly | No teacher bank target | Requires provider profile and source PDF |
| `runQueuedAIPdfExtraction` | Super admin | No | Yes | Yes through service | No teacher bank target | Calls `processAIPdfImport` |
| `processAIPdfImport` | Server service | No UI | Yes | Yes through `importBatchImportJson` | Not currently | Real extraction engine |
| `/admin/imports` JSON import | Admin | No | No | Yes | No teacher bank target | Manual/admin fixture path |

## Teacher-facing AI Parsing today

`src/app/teacher/ai-parsing/page.tsx`:

- Requires `requireTeacher()`.
- Lists teacher-visible Question Banks through `listTeacherQuestionBanks`.
- Lets the teacher choose a target bank.
- Separates owner/editor banks from viewer-only banks through `canManageBankContent`.
- Shows recent bank-scoped imports and links to:
  - `/teacher/banks/[bankId]/imports`
  - `/teacher/banks/[bankId]/review`

It does not:

- reserve a source PDF upload,
- upload a PDF,
- choose provider profile,
- start extraction,
- run provider calls,
- create Review Drafts itself.

`src/app/teacher/banks/[bankId]/imports/page.tsx`:

- Requires a teacher and a selected bank.
- Shows the bank import entry panel.
- Keeps the only mutation path inside `Advanced / Developer fixture`.
- Submits JSON to `importBankJsonDrafts`.

This is useful for smoke validation, but it is not the teacher product experience.

`src/app/teacher/banks/actions.ts`:

- `importBankJsonDrafts` calls `importBatchImportJson`.
- It passes `targetBankId: parsed.bankId`.
- It stores summary metadata:
  - `importedFrom: "teacher_bank_import"`
  - `reviewGate: "bank_review_required"`
  - `targetBankId`
- It redirects to `/teacher/banks/[bankId]/review`.

This is a real bank-scoped Review Draft creation path, but it is JSON-only and provider-free.

## Admin PDF/provider path today

`src/app/admin/imports/pdf/page.tsx`:

- Requires `requireAdmin()`.
- Lists AI PDF import batches and source PDF assets.
- Loads enabled provider profiles only for `super_admin`.
- Renders the upload panel and AI PDF control dashboard.
- Explicitly notes that starting extraction requires super admin.

`src/app/admin/imports/pdf/actions.ts`:

- Source upload and source management actions require admin.
- `startAIPdfExtraction` requires `requireSuperAdmin()`.
- `runQueuedAIPdfExtraction` requires `requireSuperAdmin()`.
- `retryAIPdfImportChunk` requires `requireSuperAdmin()`.
- Provider execution is routed through server actions and `processAIPdfImport`.

`src/lib/ai-pdf-import/service.ts`:

- Loads safe and full provider profiles server-side.
- Supports normal extraction and blueprint observation.
- Calls provider adapters through:
  - `callAIPdfExtractionProvider`
  - `generateWithGeminiNativePdf`
- Converts extraction output to import JSON.
- Calls `importBatchImportJson` with `sourceType: "ai_pdf"`.

Current blocker for teacher-bank scoping:

- `ProcessInput` has `batchId`, `profileId`, `providerProfileId`, `sourceAssetId`, and `sourceObjectPath`.
- It does **not** have `targetBankId`.
- The service calls `importBatchImportJson` without `targetBankId`.
- Therefore AI PDF provider output becomes draft questions, but not teacher-bank-owned drafts.

## Data model support already present

The clean schema already has most of the bank-scoped review plumbing needed for a teacher-native AI Parsing bridge.

Relevant tables/fields:

- `import_batches.target_bank_id`
- `review_batches.target_bank_id`
- `review_draft_items.target_bank_id`
- `questions.owner_bank_id`
- `questions.visibility`
- `questions.source_review_item_id`
- `import_batch_items.created_question_id`
- `question_taxonomy_assignments.review_status`
- `bank_questions`
- `import_batch_assets`
- `question_assets`

Relevant RPCs:

- `public.approve_bank_review_question(question_id, bank_id)`
- `public.approve_review_item_to_bank(review_item_id, bank_id)`

Existing bank behavior:

- Bank-scoped import batches can be read by bank members.
- Bank-scoped import batches can be managed by bank owners/editors.
- Bank-private draft questions are not globally published.
- Approval adds an active `bank_questions` row and keeps `published_at` null.
- Assignment from bank can expose selected bank-private questions only through assignment scope.

## Current data flows

### Flow A: teacher bank JSON fixture

```text
Teacher chooses/opens bank
-> /teacher/banks/[bankId]/imports
-> Advanced / Developer fixture JSON
-> importBankJsonDrafts
-> importBatchImportJson(targetBankId)
-> import_batches.target_bank_id
-> questions.owner_bank_id + status=draft
-> question_taxonomy_assignments.review_status=pending_review
-> /teacher/banks/[bankId]/review
-> approveBankReviewQuestion
-> bank_questions active row
-> question remains private/non-published
```

This path is working by design for smoke/demo data, but it is not a normal teacher PDF flow.

### Flow B: admin PDF provider import

```text
Admin uploads source PDF
-> import_batch_assets source_pdf
-> import_batches source_type=ai_pdf
-> super admin starts extraction
-> runQueuedAIPdfExtraction
-> processAIPdfImport
-> provider call
-> importBatchImportJson(sourceType=ai_pdf)
-> draft questions/import items/assets/taxonomy suggestions
-> admin review surfaces
```

This is the real AI provider path, but it is admin/super-admin gated and not teacher-bank-targeted.

### Flow C: teacher AI Parsing top-level

```text
/teacher/ai-parsing
-> choose a Question Bank
-> open bank import page
-> open bank Review Drafts
-> see recent bank-scoped imports
```

This path is navigation and targeting, not PDF ingestion.

## Provider and credential boundary

The provider boundary is currently conservative:

- Provider profile loading happens server-side.
- Super admin starts PDF extraction.
- Teacher routes do not expose provider profiles or provider keys.
- Teacher routes do not call provider adapters.
- No provider call was run during this audit.

That is safe, but incomplete for teacher product workflow. The next implementation should keep provider keys server-only while allowing a teacher to request extraction into a bank they can manage.

## Review safety boundary

The current teacher bank flow preserves the required safety gates:

- Imported content stays draft/private.
- Taxonomy assignments are reviewable/pending.
- Bank approval is explicit.
- Bank approval does not globally publish.
- Assignment from bank is separate.
- Student bank browsing remains blocked unless separately authorized.

The next teacher PDF PR must preserve these same gates.

## Old demo comparison

The old demo branch was not inspected in this audit. Current product docs already capture the old demo overlap that should be preserved conceptually:

- teacher-scoped AI PDF imports,
- package/framework preview,
- private course/bank questions,
- generated exam-style questions,
- teacher report/evidence later.

The old demo should remain a concept reference only, not a source to blindly restore.

## Gaps to close

### Product gaps

1. Teacher PDF upload is not available from teacher workspace.
2. Teacher provider execution is not reachable from `/teacher/ai-parsing`.
3. AI PDF output is not scoped to a selected bank.
4. Teacher import progress/history is split between a wrapper page and bank pages.
5. The bank import page tells normal teachers to use AI Parsing, but still only contains a JSON fixture.
6. Teacher Review Draft cards are functional but still light compared with admin review/detail workflows.

### Technical gaps

1. `processAIPdfImport` needs a safe way to receive and preserve `targetBankId`.
2. AI PDF batch creation should set `import_batches.target_bank_id` when teacher-scoped.
3. `importBatchImportJson` calls from AI PDF service should pass `targetBankId`.
4. Source PDF assets need teacher-bank RLS/storage review before exposing upload.
5. Teacher extraction actions need owner/editor bank checks before queueing provider work.
6. Provider execution must remain server-only and credential-safe.
7. Smoke coverage must distinguish teacher-bank PDF import from admin PDF import.

## Recommended next PR

Recommended PR: **Teacher Native PDF Upload + Bank-Scoped AI Parsing Handoff**

Goal:

```text
Teacher-owned PDF
-> selected Question Bank
-> server-side AI PDF provider job
-> bank-scoped Review Drafts
-> teacher review
-> approve into bank
```

Likely files:

- `src/app/teacher/ai-parsing/page.tsx`
- `src/app/teacher/ai-parsing/actions.ts` or `src/app/teacher/banks/[bankId]/imports/actions.ts`
- `src/app/teacher/banks/[bankId]/imports/page.tsx`
- `src/components/teacher/...` for a teacher-safe PDF upload/import panel
- `src/lib/ai-pdf-import/service.ts`
- `src/lib/batch-import/service.ts`
- `scripts/teacher-ai-parsing-bank-targeting-smoke.mjs`
- a new live/mock smoke for teacher PDF import to bank

Expected behavior:

- Teacher selects a bank they own or can edit.
- Teacher uploads a private PDF source.
- Server creates `import_batches.target_bank_id`.
- Server stores source PDF refs without exposing raw keys.
- Teacher starts extraction only for a bank they can manage.
- Provider runs server-side.
- `processAIPdfImport` passes `targetBankId` into `importBatchImportJson`.
- Created questions have:
  - `status = draft`
  - `owner_bank_id = selected bank`
  - `visibility` from bank policy or private default
  - taxonomy assignments pending review
  - source lineage back to import batch/items/assets
- Teacher lands on `/teacher/banks/[bankId]/review`.
- Approval uses existing bank review RPC and does not publish globally.

Non-goals:

- No auto-approval.
- No global publish.
- No direct assignment during import.
- No provider key exposure to teachers.
- No classroom-first shortcut.
- No old demo restoration.

Risk areas:

- Storage RLS for teacher source PDFs.
- Async job ownership and lease checks.
- Provider cost controls.
- Preventing viewer bank members from importing.
- Ensuring admin/global imports remain unchanged.
- Keeping blueprint observation separate from question draft extraction.

Smoke coverage to add:

- Teacher owner/editor can upload a tiny synthetic PDF into a private bank with mock provider.
- Viewer bank member cannot import.
- Student cannot import.
- Import batch preserves `target_bank_id`.
- Draft questions preserve `owner_bank_id`.
- Taxonomy assignments remain `pending_review`.
- No draft is assigned or globally published.
- Review page shows the new draft.
- Approval adds `bank_questions` row.
- Student can see approved content only through assignment, not by browsing the bank.

## Bottom line

The website has the right bank-first data model and review gates for teacher AI Parsing, but the teacher-facing AI Parsing product is not complete. Today it is a bank-targeted shell plus a JSON fixture. The real multimodal PDF/provider engine exists under admin, and the next focused PR should bridge that engine into a teacher-owned, bank-scoped, review-gated workflow.

## Validation

This audit is documentation-only.

Runtime changes: none.

Supabase changes: none.

Provider calls: none.

Old demo branch inspected: no.

