# AI PDF Import Cleanup Audit

## Executive Summary

PR1, PR2, and PR3 leave the AI PDF import flow in a usable but complex state. The most important stable behavior is now clear:

- Gemini Native full PDF stays single-pass.
- Real sequential chunk extraction is limited to `page_images`.
- Chunk state is persisted inside `import_batches.summary.aiPdfImport.chunking`.
- Shared Batch Import can create draft questions from AI output without using AI-visible numbers as database `question_code`.
- Failed chunks can produce partial success.
- Draft review remains the human gate before publishing.

The cleanup risk is not one big broken area; it is that summary writing, provider routing, dashboard formatting, and smoke tests are now spread across many files. Cleanup should reduce this coordination risk without changing working behavior.

Highest-risk areas:

- `import_batches.summary` is updated from both AI PDF actions and the shared Batch Import service.
- Full-PDF strategies must never accidentally enter the chunk loop.
- Dashboard refactors must not expose raw provider response, source PDF URLs, or secrets.
- Workstream A added two must-fix high-risk findings:
  - `processAIPdfImport` can pass stale nested `aiPdfImport` through `initialSummaryExtras` into `importBatchImportJson`.
  - `resetAIPdfImportOutputs` and `deleteAIPdfSource` can read summary early, perform destructive/storage work, then write stale summary later.
- Tests must keep covering integration write paths, not only pure helpers.

## Current Stable Behavior To Preserve

- [ ] Gemini Native full PDF works as single-pass import.
- [ ] OpenAI-compatible full-PDF/file strategy stays single-pass.
- [ ] `page_images` is the only real sequential chunk extraction strategy.
- [ ] Sequential chunks are processed in chunk index order.
- [ ] Chunk failures do not block later chunks.
- [ ] Partial success is valid when some chunks fail but drafts are created.
- [ ] Failed chunk retry foundation is limited to `super_admin`.
- [ ] Retry is blocked for full-PDF strategies.
- [ ] `question_code` is server-generated.
- [ ] AI-visible question numbers are metadata/display only.
- [ ] AI output always creates draft questions.
- [ ] Review Drafts remains the human review path.
- [ ] Public pages do not expose draft imports.
- [ ] Source PDFs remain private/admin-only.
- [ ] No PR4 cross-page adaptive re-read exists yet.

## Summary Write Path Map

### `src/app/admin/imports/pdf/actions.ts`

Observed write paths:

- `reserveAIPdfSourceUpload`
  - Inserts a draft `import_batches` row with `summary.aiPdfImport.phase = "upload_reserved"`.
  - Inserts a pending `import_batch_assets` source PDF record.
  - No chunking involved.

- `finalizeAIPdfSourceUpload`
  - Updates source asset metadata/status.
  - Updates batch summary to `phase = "source_uploaded"`.
  - Uses the currently loaded batch summary from `ensureSourceAssetCanBeManaged`.
  - Risk: this is acceptable for upload finalization, but it does not use the stricter `load latest summary immediately before update` pattern used in extraction. Avoid concurrent extraction while upload is finalizing.

- `cancelAIPdfSourceUpload`
  - Updates source asset to deleted/cancelled.
  - Updates batch summary to `phase = "source_upload_cancelled"`.
  - Uses loaded batch summary from management check.
  - Risk: low, because this applies before source is ready/extracting.

- `deleteAIPdfSource`
  - Removes source object from private bucket.
  - Marks source asset deleted.
  - Updates `sourceAvailable = false`, `sourceDeletedAt`, and possibly batch failed status.
  - Risk: must not expose source object path in public UI.

- `startAIPdfExtraction`
  - Requires `super_admin`.
  - Acquires extraction lease and sets batch to `validating`.
  - Calls `clearRetryableBatchItems` before queued run.
  - Risk: lease summary write must not erase existing source metadata.

- `runQueuedAIPdfExtraction`
  - Verifies job id and lease status.
  - Downloads source PDF from private bucket server-side.
  - Calls `processAIPdfImport`.
  - On failure, calls `recordExtractionFailure`.

- `recordExtractionFailure`
  - Reloads current summary from DB before writing failure.
  - Writes `status = "failed"`, `phase = "failed"`, and safe error metadata.
  - Good: latest-summary read is present.
  - Risk: stored error can include provider response text; UI must keep sanitizing/collapsing it.

- `retryAIPdfImportChunk`
  - Requires `super_admin`.
  - Reads batch summary and normalizes chunking.
  - Allows retry only for failed chunks.
  - Blocks chunks that already created drafts.
  - Blocks non-page-range strategies through `supportsAIPdfSequentialChunkExtraction`.
  - Downloads source PDF server-side.
  - Calls `processAIPdfImport` with `chunkIndex`.
  - Risk: retry writes lease from loaded summary, then process path owns chunk state. Keep tests around this path.

### `src/lib/ai-pdf-import/service.ts`

Observed write paths:

- `loadCurrentAIPdfSummary`
  - Central helper used by extraction service to reload current `import_batches.summary`.

- `updateAIPdfBatchProgress`
  - Reloads current summary before writing progress.
  - Uses `mergeAIPdfImportChunkingSummary`.
  - Preserves existing `summary.aiPdfImport.chunking` unless explicitly patched.
  - Good: protects against stale planned chunk overwrite.

- `updateAIPdfChunkProgress`
  - Reloads current summary before writing chunk progress.
  - Calls `patchAIPdfChunkingSummary` on current chunking.
  - Recomputes completed/failed/merge status through chunking normalization.
  - Good: this is the key protection against the earlier "only last chunk completed" bug.

- `processAIPdfSinglePass`
  - Used for full-PDF strategies and non-sequential provider inputs.
  - Calls provider once.
  - Builds import JSON.
  - Calls shared `importBatchImportJson`.
  - Reloads current summary before final update.
  - Good: full-PDF strategies avoid repeated per-chunk calls.
  - Risk: full-PDF errors still flow through stored summary; display must redact.
  - Workstream A risk: when this path calls `importBatchImportJson` with `initialSummaryExtras: { aiPdfImport: importingAiPdfImport }`, the nested `importingAiPdfImport` must be based on the latest summary immediately before the shared import write. If a concurrent retry/reset/action mutates chunking between reads, stale nested `aiPdfImport` can overwrite newer chunk state.

- `processAIPdfImport`
  - Counts pages, loads provider, loads tags.
  - Creates or reuses foundation chunking.
  - Gates strategy:
    - `page_images` enters sequential chunk loop.
    - non-page-range strategies call `processAIPdfSinglePass`.
  - Sequential loop is `for...of`, sorted by `chunkIndex`.
  - Calls `importBatchImportJson` per chunk with `itemIndexOffset`.
  - Reloads current summary before final status update.
  - Good: avoids `Promise.all` unordered merge.
  - Risk: this function is large and should be split carefully only after summary behavior is fully mapped.

### Must-Fix Summary Overwrite Risks

#### Risk A: `processAIPdfImport` -> `importBatchImportJson`

- Risk level: high.
- Suggested PR: PR-C3 Summary merge consolidation.
- Current concern: `processAIPdfImport` calls `importBatchImportJson` with `initialSummaryExtras: { aiPdfImport: importingAiPdfImport }`. The service currently reloads before building `importingAiPdfImport` in the important paths, but this is fragile because the shared import service performs its own summary writes. A future cleanup or retry path could pass stale nested `aiPdfImport` and overwrite chunk state from another concurrent operation.
- Required fix direction:
  - Reload latest DB summary immediately before every summary write that includes nested `summary.aiPdfImport`.
  - Deep merge or explicitly preserve current `summary.aiPdfImport.chunking`.
  - Avoid passing partially built nested `aiPdfImport` objects into shared Batch Import unless they were merged from latest persisted summary.
- Required tests:
  - Integration write-path test, not only helper tests.
  - Simulate chunk progress, shared import summary update, then another chunk progress update.
  - Assert all previous chunk states survive.

#### Risk B: `resetAIPdfImportOutputs` and `deleteAIPdfSource`

- Risk level: high.
- Suggested PR: PR-C3 or separate small safety PR.
- Current concern: these actions can read `summary` near the start, perform storage deletion / DB deletion / reset work, and later write a summary built from the earlier read. If a chunk completes or another action updates summary in the middle, the final write could resurrect stale state or drop newer `aiPdfImport.chunking`.
- Required fix direction:
  - Reload latest DB summary immediately before final summary write.
  - Or explicitly block concurrent import/reset/delete by status/job lease checks and document that invariant.
  - Preserve current `summary.aiPdfImport.chunking` unless the reset/delete operation intentionally clears it.
- Required tests:
  - Reset/delete/cancel path should not resurrect stale summary.
  - Test should mutate chunking between initial read and final write or use a fake DB sequence that reproduces the stale write risk.

### `src/lib/batch-import/service.ts`

Observed write paths:

- `importBatchImportJson` existing-batch initial update
  - Loads current batch summary using `loadImportBatchSummary`.
  - Writes `{ ...existingSummary, ...initialSummary, ...initialSummaryExtras }`.
  - Good: avoids overwriting current AI PDF chunking with stale initial summary.
  - Risk: shallow top-level merge can still delete nested fields if future callers pass incomplete nested `aiPdfImport`. Callers must pass merged `aiPdfImport`, not partial nested objects.

- `importBatchImportJson` final update
  - Reloads summary before final update.
  - Writes `{ ...existingSummaryBeforeFinal, ...finalSummary }`.
  - Good: this protects `summary.aiPdfImport.chunking` when shared import writes after chunk progress.
  - Risk: final status is `failed` when `errorCount > 0`; AI PDF wrapper then derives partial/imported state later. Keep tests around partial success semantics.

## Provider Strategy Boundary Map

Provider strategy source:

- `src/lib/ai-providers/adapters.ts`

Current boundary:

- `deepseek_openai`
  - Text/json by default.
  - No native PDF.
  - No page images unless explicitly configured.
  - Should be blocked for PDF/image extraction unless capabilities support it.

- `gemini_openai`
  - Page images only.
  - Selects `page_images` when `supports_vision_images` is true.
  - Must never use full-PDF `type:file` style path.

- `gemini_native`
  - Selects `gemini_native_pdf` when native PDF support is enabled.
  - Must remain single-pass.

- Generic `openai_compatible`
  - Selects `openai_file` if native PDF input is configured.
  - Selects `page_images` if vision images are configured.
  - Otherwise unsupported.

- `mock`
  - Test-only.

Sequential chunk gate:

- `supportsAIPdfSequentialChunkExtraction(strategy)` returns true only for `page_images`.
- `estimateAIPdfProviderCallCount` returns `totalChunks` only for `page_images`; otherwise 1.
- `retryAIPdfImportChunk` uses the same gate to block full-PDF chunk retry.

Workstream A confirmation:

- `page_images` is currently the only real sequential chunk strategy because it can physically filter rendered page images to `pageStart-pageEnd`.
- `gemini_native_pdf` remains single-pass.
- `openai_file` / full-PDF input remains single-pass.
- `estimateAIPdfProviderCallCount` matches this design: chunk count for `page_images`, one call for full-PDF strategies.
- Failed chunk retry has a guard that rejects single-pass providers.

Cleanup risk:

- Do not duplicate strategy checks in UI/service/tests.
- Any future strategy must explicitly state whether it supports physical page-range input.

## Chunk Lifecycle Review

Current chunk lifecycle:

- planned
- running
- completed
- failed
- retry through failed chunk action

Important behavior:

- Chunk plans come from `createAIPdfChunkingSummary`.
- `patchAIPdfChunkingSummary` normalizes current chunking, patches one chunk, and recomputes aggregate status.
- `completedChunks` and `failedChunks` are derived from actual chunk statuses.
- `mergeStatus` becomes:
  - `ready` when all chunks completed
  - `waiting_for_chunks` when work remains
  - `failed` when failed chunks exist and no planned/running chunks remain

PR3 behavior to preserve:

- Sequential loop uses `for...of`.
- Failed chunk catch block records chunk failure and continues.
- Final batch status is:
  - imported/complete when drafts exist and no chunks failed
  - imported/partial when drafts exist and chunks failed
  - failed when no drafts are created

Known cleanup target:

- The current chunk lifecycle logic is mostly in `service.ts` and `chunking.ts`. Splitting service code is useful later, but only after tests keep covering stale summary overwrite and partial status behavior.

## Batch Import Integration Risks

The AI PDF path depends on shared Batch Import for draft creation. This is good because it keeps AI output on the same draft-review path as manual imports.

Confirmed behavior:

- AI output is normalized into batch import JSON.
- Imported questions are inserted with `status = "draft"`.
- AI `status: "published"` is stripped during normalization/repair flow.
- AI-visible numbers are not trusted as DB `question_code`.
- `itemIndexOffset` keeps chunk item indexes separated.
- `solution_html: null` / `solution_source: null` is omitted before Batch Import payload validation.
- Invalid asset placeholders are dropped or warned, not fatal.

Risks to watch:

- `importBatchImportJson` uses top-level shallow merges. Future callers must not pass partial `aiPdfImport` objects without first merging against current AI PDF metadata.
- `itemIndexOffset = chunk.chunkIndex * 1000` is simple and deterministic, but it assumes fewer than 1000 items per chunk. This is fine for MVP but should be documented if chunk sizes grow.
- Shared import status may mark a batch failed for per-item errors. AI PDF wrapper must preserve partial success semantics.
- Batch Import cleanup must not loosen draft-only behavior.

## Security / Privacy Risks

Current protections:

- Starting extraction requires `super_admin`.
- Normal admin can upload source PDF but cannot start provider-token extraction.
- Retry chunk requires `super_admin`.
- Source PDF is downloaded server-side from private storage.
- Source PDF signed URL/open behavior is server-side permission checked.
- Dashboard copy says AI-generated questions are draft-only.
- Public pages should not show draft AI imports.
- `safeTechnicalDetail` redacts:
  - private source URLs
  - `sk-` API keys
  - Gemini-style `AIza` keys
  - JWT-looking values
- Failed chunk error display strips `Provider response:` by default.

Raw provider response regression risk:

- Default UI must not display raw provider response.
- Collapsed debug/technical details must still be redacted and length-limited.
- Failed chunk rows should show only concise safe errors, for example a provider-unavailable summary rather than raw HTTP body.
- API keys, source PDF URLs, stack traces, signed URLs, and raw provider bodies must not appear in default UI.
- Even if current code summarizes these safely, treat this as a regression risk for every dashboard cleanup PR.

Known existing risk, not fixed in cleanup:

- `question-assets` public bucket URLs remain directly readable if a URL leaks. This is documented by `question-assets-security-smoke.mjs`. It is separate from source PDF privacy and should not be changed in cleanup unless explicitly scoped.

Risks to audit further:

- `src/lib/ai-providers/chat.ts` can include provider response preview in thrown error messages. This is useful for debugging but must remain hidden/collapsed/redacted in UI.
- Stored summary may contain raw provider error text. UI must never render it by default.
- Any dashboard component split must preserve redaction and truncation.
- Any logging added later must avoid provider response dumps, API keys, source object paths, and signed URLs.

## Dashboard Complexity Review

Primary file:

- `src/components/ai-pdf-control-dashboard.tsx`

Current state:

- This component handles display derivation, warning aggregation, technical redaction, chunk rendering, pipeline timeline, preflight, figure review, warnings, and CTA display.
- Workstream A confirms this file currently carries too much state interpretation plus rendering responsibility.
- Warnings are compact/collapsible.
- Repeated figure placeholder warnings are summarized.
- Failed chunk errors are concise.
- Technical details are collapsed.
- Failed/partial/imported display goes through shared display helpers.

Safe cleanup opportunities:

- Extract presentational subcomponents:
  - summary header
  - output cards
  - pipeline timeline
  - preflight card
  - chunk list
  - warnings card
  - figure review card
- Keep `deriveAIPdfBatchDisplayState`, warning summarization, and error redaction as shared utilities.

Risks:

- Do not move import state logic into UI components.
- Do not duplicate formatter logic across live/latest/history panels.
- Do not expose `technicalError` outside collapsed/redacted UI.
- Do not make Review Drafts CTA appear when created question count is 0.
- PR-C4 may split presentational components only.
- PR-C4 must not change import behavior, retry behavior, provider routing, or warning data.

## Test Coverage Gaps

Covered today:

- Shared import summary update preserves chunking.
- Full-PDF strategies stay single-pass.
- `page_images` uses sequential chunk extraction.
- Sequential chunks preserve ordered status updates.
- Failed chunk retry metadata is preserved.
- Null solution is omitted before Batch Import validation.
- Invalid asset placeholders are non-blocking.
- Failed chunk concise safe error display is covered by route smoke.
- Source PDF RLS/storage privacy is covered by RLS smoke.
- Draft imports do not appear publicly.

Gaps / audit concerns:

- Some summary write paths in `actions.ts` are not directly covered as integration tests:
  - source upload cancel
  - source delete after imported items exist
  - lease expiration failure
  - reset failure
- Tests strongly cover helper behavior and route smoke fixtures, but fewer tests exercise real UI actions end-to-end for reset/retry/delete flows.
- Real provider calls are intentionally not in smoke tests; manual QA remains required for provider-specific quirks.
- Chunk retry foundation has service/action coverage but should get a focused route/action smoke before bigger PR4 work.
- Dashboard component split needs snapshot-like route smoke around failed/partial/no-draft states.

## Safe Cleanup Items

- [ ] Add docs-only summary write map.
- [ ] Rename local variables for clarity where behavior is unchanged.
- [ ] Remove stale comments/TODOs that conflict with current behavior.
- [ ] Extract dashboard presentational cards without changing props or data derivation.
- [ ] Move repeated dashboard redaction/warning formatting into stable helpers if already used.
- [ ] Add smoke assertions for source upload cancel/delete/reset summaries.
- [ ] Add comments near `supportsAIPdfSequentialChunkExtraction` explaining physical page-range requirement.
- [ ] Document `itemIndexOffset` assumptions.

## Risky Refactor Items

- [ ] Splitting `processAIPdfImport` into multiple services.
- [ ] Changing `importBatchImportJson` merge behavior.
- [ ] Changing provider routing/capability selection.
- [ ] Changing batch final status derivation.
- [ ] Changing storage/source PDF handling.
- [ ] Moving retry logic.
- [ ] Changing how warnings/errors are stored.
- [ ] Changing chunk plan size/overlap behavior.

These should be separate PRs with explicit tests and Jerry approval.

## Do Not Touch Yet

- [ ] PR4 cross-page adaptive re-read.
- [ ] Cross-page merge.
- [ ] Blind content concat.
- [ ] Aggressive question number cleanup.
- [ ] PDF slicing engine.
- [ ] Marker/OCR/Python/torch.
- [ ] Persistent worker queue.
- [ ] New database migration.
- [ ] Storage policy changes.
- [ ] Gemini Native repeated chunk calls.
- [ ] Auto-publish.
- [ ] Direct merge of old Frances/Coffee branches.

## Suggested Cleanup PR Order

### PR-C1: Audit Report Only

- Goal: record current behavior, risks, and cleanup order.
- Allowed: docs only.
- Not allowed: code, migrations, provider behavior.
- Required checks: lint/build if cheap; final `git status --short`.

### PR-C2: Dead Code And Naming Cleanup

- Goal: remove unused helpers and improve names without behavior change.
- Allowed: mechanical cleanup.
- Not allowed: provider routing, import behavior, schema/storage change.
- Required checks:
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - `node scripts/security-smoke.mjs`
  - `node scripts/route-smoke.mjs`

### PR-C3: Summary Merge Consolidation

- Goal: reduce stale summary overwrite risk by consolidating merge/update patterns.
- Risk level: high.
- Must include tests.
- Allowed: helper consolidation and tests.
- Not allowed: new DB table, queue, PR4 behavior, provider behavior change.
- Must address:
  - `processAIPdfImport` -> `importBatchImportJson` stale nested `aiPdfImport` risk.
  - `resetAIPdfImportOutputs` stale summary write risk.
  - `deleteAIPdfSource` stale summary write risk.
  - Preserve current `summary.aiPdfImport.chunking` on all shared writes.
- Required checks:
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - `node scripts/security-smoke.mjs`
  - `node scripts/batch-import-smoke.mjs`
  - `node scripts/route-smoke.mjs`
  - `node scripts/supabase-rls-smoke.mjs`

### PR-C4: Dashboard Component Split

- Goal: reduce dashboard component size while preserving rendering behavior.
- Allowed: presentational extraction only.
- Not allowed: service/import behavior changes, retry behavior changes, provider routing changes, or warning data changes.
- Required checks:
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - `node scripts/route-smoke.mjs`
  - `node scripts/security-smoke.mjs`
  - manual screenshots for failed/partial/imported/no-draft states

### PR-C5: Test Hardening

- Goal: strengthen route/action/smoke coverage for cleanup-sensitive paths.
- Allowed: test-only improvements.
- Not allowed: feature behavior changes unless separately approved.
- Required checks:
  - affected smoke scripts
  - full smoke suite if route/data fixtures change

### PR4 Later: Cross-Page Adaptive Re-Read

- Start only after cleanup PRs stabilize current import behavior.

## Ownership Split

### 点哥

- [ ] Summary write map.
- [ ] Provider strategy boundary.
- [ ] Chunk lifecycle.
- [ ] Batch Import integration.
- [ ] Security/privacy audit.
- [ ] Branch/PR hygiene.

### Frances

- [ ] Dashboard clarity.
- [ ] Failed/partial state wording.
- [ ] PDF test matrix.
- [ ] Parsing output QA.
- [ ] Warning/actionability review.
- [ ] Review Drafts workflow QA.

### Jerry

- [ ] Priority decision.
- [ ] Merge order.
- [ ] Final manual QA.
- [ ] Decide cleanup PR vs PR4.
- [ ] Approve risky refactor.

## Files Reviewed

- `src/lib/ai-pdf-import/chunking.ts`
- `src/lib/ai-pdf-import/constants.ts`
- `src/lib/ai-pdf-import/display.ts`
- `src/lib/ai-pdf-import/pdf.ts`
- `src/lib/ai-pdf-import/question-code.ts`
- `src/lib/ai-pdf-import/schema.ts`
- `src/lib/ai-pdf-import/service.ts`
- `src/lib/ai-providers/adapters.ts`
- `src/lib/ai-providers/chat.ts`
- `src/lib/ai-providers/encryption.ts`
- `src/lib/ai-providers/gemini-native.ts`
- `src/lib/ai-providers/json-repair.ts`
- `src/lib/ai-providers/mock.ts`
- `src/lib/ai-providers/profiles.ts`
- `src/lib/batch-import/asset-references.ts`
- `src/lib/batch-import/json.ts`
- `src/lib/batch-import/service.ts`
- `src/components/ai-pdf-control-dashboard.tsx`
- `src/app/admin/imports/pdf/actions.ts`
- `src/app/admin/imports/pdf/page.tsx`
- `scripts/security-smoke.mjs`
- `scripts/batch-import-smoke.mjs`
- `scripts/route-smoke.mjs`
- `scripts/supabase-rls-smoke.mjs`
- `scripts/question-assets-security-smoke.mjs`
- `scripts/bulk-asset-import-smoke.mjs`
- `scripts/package-import-smoke.mjs`

## Commands Run

- `git status --short`
- `git branch --show-current`
- `git checkout main`
- `git pull`
- `git checkout -b codex/ai-pdf-import-cleanup-audit`
- `rg "import_batches|summary|update\\(|upsert\\(|insert\\(|aiPdfImport|chunking|updateAIPdfChunkProgress|processAIPdfImport|retryAIPdfImportChunk|importBatchImportJson" src/lib/ai-pdf-import src/lib/batch-import src/app/admin/imports/pdf src/components/ai-pdf-control-dashboard.tsx -n`
- `rg "page_images|gemini_native|gemini_native_pdf|openai_file|full PDF|single-pass|native_pdf|supportsPhysical|strategy" src/lib/ai-pdf-import src/lib/ai-providers src/app/admin/imports/pdf src/components/ai-pdf-control-dashboard.tsx -n`
- `rg "Provider response|api_key|secret|signed|source_pdf|source file|question_source|service_role|raw provider|Technical details|getPublicUrl|private" src/lib/ai-pdf-import src/lib/ai-providers src/app/admin/imports/pdf src/components/ai-pdf-control-dashboard.tsx scripts -n`
- `Get-ChildItem -Recurse src\\lib\\ai-pdf-import,src\\lib\\ai-providers,src\\lib\\batch-import,src\\app\\admin\\imports\\pdf -File | Select-Object FullName`
- `rg "AI PDF|chunk|single-pass|solution|placeholder|source PDF|provider|draft|summary" scripts -g "*smoke*.mjs" -n`
- `rg 'Promise\\.all|concat|question_number|questionCode|question_code|published|sourceInput|supportsAIPdfSequentialChunkExtraction' src/lib/ai-pdf-import src/lib/batch-import scripts -g "*smoke*.mjs" -n`
