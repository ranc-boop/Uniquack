# Refactor-Readiness Audit — Database Integration Findings (Stage 5)

Scope note (owner directive 2026-08-13): all schema comparisons are against **`supabase/clean-migrations/` only**. The legacy chain is frozen history and excluded from analysis.

## D-01 · `src/types/database.ts` is hand-maintained, partial, and contains one phantom table

- **Severity:** P1 · **Readiness:** REQUIRES-REGRESSION-PROOF · **Confidence:** high
- **Evidence:** 1,724-line hand-written file (not `supabase gen types` output). Its `Tables:` map covers ~55 of ~95 clean-chain tables. Heavily-used tables **absent** from the map: `review_batches`, `review_draft_items`, `question_status_events`, `organizations`? (present), notably the whole review-draft family — yet `.from("review_draft_items")` is called in ≥7 files. It also declares **`user_question_attempts`**, a table that exists in *no* clean migration and has zero code references — a legacy-chain phantom.
- **Current behavior:** queries against unmapped tables and RPCs degrade to loose typing; `src/lib/ai-jobs/queue.ts` deliberately casts the whole client to `any`; 43 `as any` casts in lib/app touch supabase clients; `src/lib/question-banks.ts:702` casts the client to a hand-rolled RPC interface.
- **Why it matters:** the type layer silently under-reports schema drift; a refactor "fixing types" could accidentally change runtime behavior (e.g. treating a nullable column as required). Conversely, regenerating types from a live DB embeds hosted state into the repo — do it deliberately.
- **Refactor path:** (1) delete the phantom `user_question_attempts` type (SAFE-CANDIDATE, zero refs); (2) add missing table types additively (SAFE-CANDIDATE); (3) replacing the file with generated types wholesale is REQUIRES-REGRESSION-PROOF + **HOSTED PARITY REQUIRED** (generation source must be a DB at exactly the canonical chain).

## D-02 · The queue client's `any` boundary is deliberate but unguarded

**Evidence:** `SupabaseQueueClient = any` with an explanatory comment (generated contract intentionally lags until migrations are applied); schema-missing errors are translated to `AIProviderJobQueueSchemaMissingError` by sniffing error codes (42P01/PGRST204/205) and message substrings (`ai_provider_jobs`, `enqueue_ai_provider_job`).
**Risk:** renaming those DB objects (even in a "pure cleanup") breaks the error-classification heuristic silently. PRESERVE names; if the queue is ever refactored, the sniff strings are part of the contract.

## D-03 · Dual question lifecycle (`status` vs `approval_status`) — usage census

- **Severity:** P1 (carried from Stage 0) · **Readiness:** REQUIRES-MIGRATION
- **Evidence:** both fields are read and written across `question-banks.ts`, `teacher/banks/actions.ts`, admin actions, and DB functions; `set_bank_question_statuses` (live) manipulates legacy status; readiness triggers (0057) and v2 approval logic gate on `approval_status`; public visibility logic mixes both.
- **Conclusion:** this is **not** a code-cleanup item. Consolidating requires a semantic migration (DB + code + data backfill) with HOSTED PARITY REQUIRED (hosted rows carry legacy statuses like `archived`/`deprecated` that have no `approval_status` equivalent). Until then, every new code path must decide which field it consults — worth a short "which field means what" doc during cleanup (doc-only, allowed).

## D-04 · Dormant table families (0004/0005) — unchanged status, now with sharper boundaries

**Evidence recheck:** `source_files`, `source_pages`, `import_jobs`, `import_job_assets`, `ai_import_*` (7 tables), `course_plan_sources`: still zero code/script references. `source_references` referenced only by `src/lib/course-builder/assignment-bridge.ts`.
**Stance:** BLOCKED + **HOSTED PARITY REQUIRED** (row counts on hosted DB would settle "data-bearing or empty"). Note these tables have RLS policies and helpers that inflate the policy count — cleanup of *documentation* may distinguish "live policy surface" (~active tables) from dormant surface.

## D-05 · Trigger/CHECK semantics are the real state machine — application code cannot see them

- **Severity:** P2 (comprehension) · **Readiness:** doc-only
- **Observed:** critical behavior lives exclusively in DB artifacts: readiness triggers (0057), regression blockers (`prevent_assigned_library_question_regression`), lineage repair (0071), burst-item sync triggers (`sync_ai_pdf_burst_item_from_job`), profile immutability triggers (0039–41), submission snapshot immutability. App code has no marker at call sites that a write may be vetoed by a trigger; errors surface as thrown strings matched nowhere.
- **Cleanup opportunity (safe):** a doc mapping table → active triggers/CHECKs (generated from the migration chain) would prevent future agents from "fixing" a rejected write in app code.

## D-06 · Error-string coupling between SQL and UI

**Observed:** RPCs raise human-readable exceptions (e.g. `'Only Library owners or editors can approve Review Drafts.'`, `'Every selected question must be pending, active, taxonomy-ready when public…'`); app actions surface or match on such strings; some smokes assert exact strings in source. Changing SQL error copy is a behavior change under the current harness. PRESERVE strings during cleanup; centralizing copy is REQUIRES-REGRESSION-PROOF.

## D-07 · Governance script hard-codes chain shape

`scripts/canonical-migration-governance-smoke.mjs` asserts exactly 78 files / 77 executable / duplicate-0032 topology. Every future migration bumps these constants (by design, forcing review). Not debt to remove — but cleanup automation must know that adding any migration requires touching this script; treat as part of the migration-release process (`docs/security/migration-release-process.md`).
