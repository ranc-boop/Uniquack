# PR4-M Selective AI PDF Packet Execution Validation

## Final State

**Available for controlled testing, not ready for closed beta.**

Full-document AI PDF parsing remains the production-compatible default. The
subset path now requires an explicit super-admin operations control and is only
passed into `processAIPdfImport` by the trusted durable worker. Teachers cannot
enable it, select it, or submit a provider/model override.

## Product Workflow and Boundaries

Workflow touched:

```text
Private source PDF -> AI Parsing -> private Review Drafts -> Question Bank
```

The change does not publish questions, create Assignments, expose a Bank to a
student, bypass Review Drafts, or modify source questions. `targetBankId`,
source references, taxonomy-review status, and private draft defaults remain on
the existing import path.

## Explicit Rollout Control

Migration `0037_ai_selective_execution_control.sql` adds
`ai_operations_controls.selective_execution_enabled boolean not null default false`.

- The existing Admin / AI Settings closed-beta form is the only UI that can
  enable it, and its server action requires `requireSuperAdmin()`.
- The trusted service-role worker reads the value through
  `get_ai_operations_worker_control()` and is the only caller that passes the
  value to an AI PDF execution.
- Direct admin and teacher server calls leave the input undefined and therefore
  use the full-document fallback.
- Worker scheduling, queue limits, and provider routing do not imply enablement.
- The migration recreates only the trusted-worker control RPC because PostgreSQL
  cannot widen an existing `RETURNS TABLE` definition in place. Its
  service-role-only grant is restored immediately.

Migration `0037` has not been applied to the remote environment in this
validation. Until it is applied and the super-admin checkbox is deliberately
enabled, full-document execution remains enforced.

## Provider Baseline and 403 Classification

A previous bounded selective queue validation reached the configured native PDF
provider and safely recorded a `403`, without retaining a provider body or
credentials. The current full-document baseline attempt used the same bounded
synthetic source and default-disabled selective path, but stopped before a
provider call because the clean queue already had one unrelated
`ai_pdf_extract` job in `processing` status. The validation did not mutate,
claim, cancel, or retry that job.

Therefore the prior `403` is **not yet conclusively attributable** to either
provider/project/model authorization or subset execution. The implementation
does establish the required failure classification:

- HTTP `401` and `403` map to `provider_permission_error`.
- That code is non-retryable and requests administrator attention.
- It is not a transient `503` / busy circuit signal.
- Fallback routing only proceeds for busy, rate-limited, timeout, or network
  failures; it does not switch providers after a permission failure.
- Teacher-visible failure copy remains vendor-neutral and does not expose raw
  provider diagnostics, keys, URLs, or responses.

## Sparse Fixture Benchmark

The local, non-sensitive 24-page sparse fixture contains two question pages,
answer-key context, and blank intervening pages. The planner selected 9 of 24
original pages, with a **62.5% estimated page reduction** and a complete
original-page mapping.

This is planning evidence only. No provider was called by the benchmark, so
actual tokens, cost, provider latency, extraction quality, crop preservation,
and draft count are all **not collected** rather than estimated or claimed.
See [ai-parsing-selective-execution-benchmark.md](ai-parsing-selective-execution-benchmark.md).

## Quality and Safety Gates

Focused coverage verifies:

- full-document fallback when the control is disabled;
- conservative selection only for an eligible native-PDF plan;
- full-document fallback for boundary risk, unknown content, dense/short files,
  unsupported inputs, manual segmentation, and materialization failure;
- preserved original-page mappings and source references;
- no raw PDF bytes, base64, prompts, signed URLs, provider bodies, or secrets in
  the plan summary;
- private, Review-Draft-only Bank handoff with no auto-publish or Assignment;
- no arbitrary fallback after a 403.

## Validation Results

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/ai-parsing-selective-packet-execution-smoke.mjs`
- `node scripts/ai-parsing-selective-execution-smoke.mjs`
- `node scripts/ai-parsing-selective-execution-benchmark.mjs`
- `node scripts/ai-operations-launch-readiness-smoke.mjs`
- `node scripts/ai-provider-fallback-circuit-breaker-smoke.mjs`
- `node scripts/ai-provider-resilience-smoke.mjs`
- `node scripts/durable-ai-job-queue-smoke.mjs`
- `node scripts/durable-ai-job-queue-load-smoke.mjs`
- `node scripts/ai-parsing-status-review-qa-smoke.mjs`
- `node scripts/ai-parsing-boundary-duplicate-guard-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/teacher-beta-readiness-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `npm.cmd run perf:budget`
- `npm.cmd run perf:audit`
- `npm.cmd run analyze`
- local embedded-Postgres migration harness: all 38 clean migrations applied;
  36 assertions passed and temporary data was removed.

`npm.cmd run smoke` exercised the new source smoke and passed its early focused
checks. It later stopped at an existing live-auth request rate limit during
`batch-import-smoke`; it did not report a selective-execution failure. Several
other live fixtures reported the same rate-limit skip before that terminal
failure. Re-run the aggregate suite after the authentication throttle clears.

## Next Controlled Validation

1. Let the unrelated processing queue job finish or have its owner resolve it.
2. Apply clean migration `0037` using the normal clean-Supabase procedure.
3. Leave `selective_execution_enabled` false and run the bounded PDF-only queue
   validation for the full-document baseline.
4. If the baseline also returns a safe 403, classify it as an existing provider
   authorization/configuration blocker and keep the control disabled.
5. Only if the full-document baseline succeeds, enable the super-admin control
   for one matching source/provider/model run and compare private Review Draft
   quality plus telemetry.
6. Do not recommend closed beta until both runs complete and quality gates match.

## Migration and Rollback Risk

No existing clean migration was changed; `0033` through `0036` remain intact.
The new migration is narrow and forward-only. Disabling the control immediately
restores full-document execution without changing imported questions, source
PDFs, Review Drafts, Banks, or Assignments.
