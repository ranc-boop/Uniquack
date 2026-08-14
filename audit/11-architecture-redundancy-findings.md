# Refactor-Readiness Audit — Architecture / Redundancy Findings (Stage 2)

Focus: places where a future agent could modify the wrong implementation because the canonical path is not obvious. Each finding says which variant is canonical **today**.

## A-01 · `src/lib/ai-pdf-import/service.ts` is a 6,134-line god module

- **Severity:** P1 (architecture) · **Readiness:** REQUIRES-REGRESSION-PROOF · **Confidence:** high
- **Evidence:** 6,134 LOC, 13 exports; `processAIPdfImport` (the whole extraction orchestration) starts at line 4888; imports ~all sibling planning modules (`adaptive-reread*`, `coverage-recovery*`, `selective-execution`, `taxonomy-*`, `masked-pdf`, …).
- **Current behavior:** it is the single canonical import orchestrator, called from the worker (`src/lib/ai-jobs/worker.ts`) for both `ai_pdf_extract` and `ai_pdf_coverage_recovery` job kinds.
- **Why it matters:** every import-pipeline change funnels through this file; merge conflicts and accidental behavior drift concentrate here. But it is also the most smoke-pinned file family in the repo (R-02) — decomposition is desirable and *expensive*.
- **Preserve:** stage ordering, checkpoint/fencing call sequence, failure-recording semantics (`recordAIPdfProviderFailure`, transient-failure classification).

## A-02 · Provider HTTP invocation is implemented twice (import vs practice) — intentional specialization, shared substrate

- **Severity:** P2 · **Readiness:** PRESERVE now; consolidation only with REQUIRES-REGRESSION-PROOF
- **Evidence:** `src/lib/ai-providers/chat.ts` (import extraction + provider test; `fetch(endpoint(profile.base_url))` at 520/743) and `src/lib/practice/ai.ts` (practice chat/stream/JSON calls; fetch at 257/430) each own request/retry/parse loops, both built on the same shared helpers (`adapters`, `json-repair`, `network-safety`, `response-limits`, `profiles`, `routing`).
- **Assessment:** intentionally distinct — practice needs streaming + tool loops + trace safety; import needs structured-output PDF contracts. Failure/retry behavior differs on purpose (practice has DB admission + leases; import has circuit breaker + attempt budget). Do **not** unify the loops casually; the shared-substrate boundary is already correct.

## A-03 · DB approval logic is a three-generation onion; the app calls only the top layer

- **Severity:** P1 (comprehension risk, not behavior risk) · **Readiness:** PRESERVE (DB); app-side is already consolidated
- **Evidence:** `approve_library_questions_v2` (0076) → calls `approve_bank_review_question` (redefined 0066, 0070) → calls `approve_bank_review_question_legacy` (0027-era body renamed by `0055:1222 alter function … rename to`). The same rename-and-wrap pattern applies to `create_question_bank_legacy` and `publish_review_draft_questions_legacy` (0055:541, 0055:572).
- **Current behavior:** app code calls **only** `approve_library_questions_v2` (4 call sites in `src/app/teacher/banks/actions.ts` + admin actions). `approve_bank_review_question(s)` have **zero** src callers but are (a) called internally by v2, and (b) exercised directly by 9+ smoke scripts.
- **Why it matters:** a refactor that "removes the unused v1 functions" would break v2 at runtime. Conversely the layering is invisible from app code — future agents must learn it from migrations.
- **Preserve:** the whole chain, forward-only. Any DB-side flattening is REQUIRES-MIGRATION + HOSTED PARITY REQUIRED.

## A-04 · Legacy pre-bank-first read models still present beside bank-first ones

- **Severity:** P2 · **Readiness:** SAFE-CANDIDATE (exports) / BLOCKED (files) per R-02
- **Evidence:** `src/lib/teacher-assignments.ts` exports `listManagedClassrooms`, `listAssignablePublishedQuestions` (0 refs — the old "assign from global published pool" flow); knip-dead UI (`teacher-dashboard-panels.tsx`, `app-primary-nav.tsx`) superseded by `teacher-workspace-shell` components; `src/app/teacher/classrooms/[id]/assignments/actions.ts` unreferenced by app code (assignment creation now goes through the bank flow → `create_assignment_from_bank`).
- **Classification:** historically duplicated (classroom-first era). The *live* assignment path is: `src/app/teacher/banks/actions.ts:createAssignmentFromBankQuestions` → `create_assignment_from_bank` RPC.

## A-05 · Multiple app entry points into the same review-approval RPC — intentional UX fan-in

**Observed:** `approveBankReviewQuestion`, `approveBankReviewQuestions`, `approveCurrentBankReviewPage`, `publishBankReviewDraftChanges` (all in `teacher/banks/actions.ts`) plus admin bulk approve (`admin/questions/actions.ts`) all end in `approve_library_questions_v2`. This is fan-in, not duplication — each wrapper handles a different selection/validation shape. PRESERVE; safe to share more pre-validation helpers later.

## A-06 · Capability/role presentation logic exists in three app locations

- **Severity:** P2 · **Readiness:** REQUIRES-REGRESSION-PROOF
- **Evidence:** `src/lib/auth/roles.ts` (route-level), `src/lib/question-banks.ts:1662 canManageBankContent` (bank content gates, used by 10+ files), `src/lib/questions/workspace.ts` (`bankQuestionWorkspaceCapabilities` → UI capability flags). All mirror DB truth (`bank_members.role`, `private.is_question_bank_content_editor`).
- **Assessment:** defense-in-depth is intentional; the risk is only that the three encodings can drift (e.g. a future "commenter" role added in DB but not in `workspace.ts`). Consolidating to one app-side capability module is a good cleanup target — behavior-preserving if flag outputs are snapshot-tested first.

## A-07 · Small html/sanitize/markdown modules are distinct, not duplicated

**Observed:** `lib/html/excerpt.ts` (entity decode + excerpt), `lib/sanitize/html.ts` (sanitize-html config), `lib/markdown-latex/markdown.ts` (markdown/LaTeX rendering) have separate responsibilities and callers. No action needed. Guarded by `check-math-content-usage.mjs` lint (math content must go through the right renderer).

## A-08 · Compatibility stubs that look dead but are contractual

**Observed:** `runQueuedAIPdfExtraction` (`admin/imports/pdf/actions.ts:1739`) is deliberately a read-only stub — its comment states it prevents an admin browser request from becoming "a second competing worker"; smokes assert both its existence and that it does **not** call the runner (`durable-ai-job-queue-smoke.mjs:293`). `retryAIPdfImportChunk` similar family. **PRESERVE** — these encode negative guarantees.
