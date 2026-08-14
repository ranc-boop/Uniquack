# Refactor-Readiness Audit — AI Import Pipeline Findings

Deeper subsystem map than Stage 0. Evidence: traced call graph from entry actions through worker to persistence; module import census; knip cross-check.

## End-to-end ownership map (canonical/live path)

```text
[teacher entry]  src/app/teacher/banks/pdf-burst-actions.ts   (bank-scoped; burst admission)
[admin entry]    src/app/admin/imports/pdf/actions.ts          (reserve/finalize upload, segmentation, startAIPdfExtraction)
        │  both → enqueueAIProviderJob (src/lib/ai-jobs/queue.ts → enqueue_ai_provider_job RPC, idempotency key)
        ▼
[wake-up]  scripts/local-ai-jobs-worker.mjs  → POST /api/internal/ai-jobs/run  (token; no payload)
        ▼
[orchestrator]  src/lib/ai-jobs/worker.ts   claims ≤2 jobs (claim_ai_provider_jobs), lease + fence
        │   job_kind = ai_pdf_extract | ai_pdf_coverage_recovery   (only these two)
        ▼
[pipeline]  src/lib/ai-pdf-import/service.ts  processAIPdfImport / processAIPdfCoverageRecovery
        │   uses: preanalysis, segmentation, packets, selective-execution, masked-pdf,
        │   extraction-schema, visual-evidence, taxonomy-question-tagging, boundary-guard …
        ▼
[provider]  src/lib/ai-providers/*  (routing → profile → gemini-native | gemini-structured-output | openai-compatible chat | mock)
        ▼
[persistence]  fenced RPCs: begin/checkpoint/persist_ai_provider_job_import_item_fenced /
               finalize_ai_provider_job_import_batch_fenced / finish_ai_provider_job_fenced
               → import_batches / import_batch_items / import_batch_assets
               → review_batches / review_draft_items  (bank-scoped, ensure_bank_import_review_lineage)
        ▼
[review→publish]  teacher review actions → approve_library_questions_v2 (DB onion, A-03) → questions/bank_questions
```

## Classification of every pipeline area

| Area | Status | Evidence / notes |
|---|---|---|
| Burst admission (`burst-admission.ts`, `burst-contract.ts`, 0050) | **canonical/live** | teacher path only; admin path uses its own reserve/finalize actions — parallel by design (different quota semantics) |
| `service.ts` orchestration | **canonical/live** (god module, A-01) | sole implementation; no competing orchestrator |
| Fenced persistence (`batch-import/fenced-persistence.ts` + `*_fenced` RPCs) | **canonical/live** for worker writes | interactive JSON import (`importBatchImportJson`) intentionally uses the *unfenced* user-session path — **two persistence modes, intentional** (worker = service-role+fence; interactive = RLS) — do not unify |
| Coverage recovery (`coverage-recovery*.ts`, job kind `ai_pdf_coverage_recovery`, 0038) | **live** | enqueued from `teacher/banks/actions.ts:queueBankPdfCoverageRecovery` (service-role); many exports dead (R-04) but modules live via service.ts |
| Selective execution (0037, `selective-execution.ts`) | **live** | worker consults `ai_operations_controls` |
| Adaptive reread (`adaptive-reread*.ts`, 4 modules) | **live-but-partially-wired** | imported by service.ts, but *all* distinctive exports have zero external refs; plan/dry-run surface appears speculative. Verify which functions service.ts actually calls before pruning |
| Blueprint observation / analyzer (`blueprint-observation*`, `question-blueprint-analyzer`) | **experimental/partially wired** | consumed by service.ts + blueprints libs; several "plan path" constants dead |
| Taxonomy plan modules (`taxonomy-bootstrap/persistence/review.ts`) | **experimental/design-as-code** | exports mostly dead; imported by service.ts; the *live* taxonomy write path is `taxonomy-persistence.ts`? — no: live tagging goes through `taxonomy-question-tagging.ts` + `tagging-v2.ts`. The three plan modules describe future admin flows |
| Gemini adapters (`gemini-native.ts`, `gemini-structured-output.ts`) | **provider-specific, both live** | selected by profile/routing (`adapters.ts` input-strategy); do not merge — different transport + schema contracts |
| OpenAI-compatible path (`chat.ts:callAIPdfExtractionProvider`) | **provider-specific, live** | for non-Gemini profiles |
| Mock provider (`mock.ts`) | **test-only, env-gated** (`ENABLE_MOCK_AI_PROVIDER`) | smoke-pinned |
| V2 (`ai-pdf-import/v2/*`) | **experimental/unwired by declaration** | no production import (verified again); consumed by `test/ai-parsing-v2-canonical-foundation.test.mjs` + fingerprint smokes via `scripts/lib/ai-parsing-v2-fixtures.mjs`; fingerprints in `docs/architecture/ai-parsing-contract-fingerprints.json` |
| 0004/0005 table families | **dormant, possibly data-bearing** | HOSTED PARITY REQUIRED (D-04) |
| Admin compat stubs (`runQueuedAIPdfExtraction`, `retryAIPdfImportChunk`) | **compatibility, negative-guarantee** (A-08) | PRESERVE |

## I-01 · Retry / idempotency / fencing assumptions (must-preserve set)

- Enqueue idempotency key = (batch, source asset, retry generation) — retries create a *new generation*, not a duplicate job.
- Claim limit 2 per worker wake; single-runner OS lock on the local runner; **DB claim is the ownership boundary**, the runner is untrusted.
- Every state-advancing write carries the lease fence token; a fenced-out worker's RPCs fail closed (0051). Checkpoints let a crashed worker resume from provider-result checkpoints instead of re-calling the provider (cost containment).
- Failure classification: `isTransientAIPdfProviderFailure` decides retry-vs-fail; transient failures are *recorded* (`recordAIPdfTransientProviderFailure`) without consuming the attempt budget the same way. Provider attempt budget + circuit breaker (0035) sit below this.
- **Refactor rule:** any decomposition of `service.ts`/`worker.ts` must keep the order: claim → fence → checkpoint-read → provider call → checkpoint-write → fenced persist → fenced finish. Two smoke families (`pdf50-worker-checkpoint*`, `pdf50-worker-fencing*`, `pdf50-worker-crash-recovery*`) are the regression proof harness — they must pass unmodified.

## I-02 · Dual entry surfaces (admin vs teacher) are parallel, not duplicated

Admin path: unscoped/org imports, segmentation UI, super-admin controls. Teacher path: bank-scoped, burst-admission quotas, `can_actor_manage_ai_pdf_burst_bank`. They share queue/worker/service. The upload/reserve steps are implemented twice with different authorization + quota semantics — **intentionally distinct**; consolidating the upload plumbing would couple admin quota-exempt behavior to teacher quotas. PRESERVE the split; sharing pure helpers (path building, mime checks) is SAFE-CANDIDATE.

## I-03 · Practice AI is a separate synchronous pipeline — not part of the durable queue

Confirmed: practice grade/hint/review calls run in-request with DB admission windows + inflight leases; no `ai_provider_jobs` involvement. Provider selection reuses `profiles`/`routing`. The two pipelines must not be "unified" — their concurrency models are opposite (queue-and-fence vs admit-and-lease).

## I-04 · Biggest pipeline-specific cleanup opportunity

The planning/dry-run export surface (R-04) inside `ai-pdf-import/` (~40+ dead exports across adaptive-reread, coverage-recovery-merge/runner, blueprint-observation, taxonomy-plan modules) can shrink substantially **without touching runtime**, once per-module verification confirms service.ts's actual call set and smoke pins are updated. Classified SAFE-CANDIDATE (export-level) / REQUIRES-REGRESSION-PROOF (module-level).
