# AI Provider Resilience Foundation

## Executive Summary

PR4-I adds one shared, server-only provider error and retry foundation for AI
PDF Parsing and teacher Blueprint-to-Review-Draft generation. Transient
provider failures are classified consistently, retried before durable question
or Review Draft writes, and recorded only as bounded safe metadata.

This is not a queue, fallback-router, or circuit breaker. A retry happens only
inside the active server request and ends after a bounded number of attempts.

## Workflow And Boundaries

Product workflow touched:

```text
Private PDF or approved Blueprint
-> server-side provider call with bounded retry
-> private Review Drafts
-> human review
-> bank approval
-> assignment
```

Teacher imports keep their selected `targetBankId`; Blueprint generation keeps
the linked Blueprint and Bank. No retry writes an Assignment, public question,
or auto-approved Review Draft. Source questions are read-only inputs.

## Provider Path Audit

### AI PDF Parsing

The provider call paths are:

- full-PDF Gemini Native extraction through `generateWithGeminiNativePdf`
- sequential page/chunk extraction through `callAIPdfExtractionProvider`
- Blueprint Observation full-PDF input through `generateWithGeminiNativePdf`
- text-only Blueprint observation analyzer through
  `executeDeepSeekQuestionBlueprintAnalyzer`

Previously, adapter/provider errors could be converted to strings at the
teacher action, chunk status, queued-admin failure recorder, or
Blueprint-observation plan warning. The old teacher-facing patch only
recognized a small set of transient error phrases and recommended a later
manual retry.

The new call sites wrap provider work with `runWithAIProviderRetry`. They do
not persist an adapter error body, response preview, stack trace, provider key,
or vendor status text to an import summary, Review Draft payload, or redirect.
Existing server-only provider/debug logging remains the only diagnostic path.

### Teacher Blueprint Generation

The teacher Blueprint path resolves the provider server-side, requests output,
validates it, and only then calls `importBatchImportJson` and attaches Review
Draft lineage. The shared wrapper now surrounds the provider request before
that import/review boundary. A final failure creates a safe failed generation
record with Blueprint and target-Bank lineage only.

## Shared Error Model

`src/lib/ai-providers/errors.ts` defines the stable codes:

- `provider_busy`
- `provider_rate_limited`
- `provider_timeout`
- `provider_network_error`
- `provider_invalid_response`
- `provider_configuration_error`
- `provider_permission_error`
- `request_invalid`
- `operation_cancelled`
- `unknown_provider_error`

The classifier uses structured status metadata first, then bounded fallback
phrases including `UNAVAILABLE`, `RESOURCE_EXHAUSTED`, high demand,
overloaded, rate limit, and deadline exceeded. A safe state includes only the
error code, safe message, retryability, bounded attempt data, next action, and
an internal reference.

`redactAIProviderDiagnostic` masks credential-shaped keys, Bearer and
Authorization values, JWTs, signed credential URLs, database URLs, base64
payloads, and stack frames before a diagnostic can be reused.

## Retry And Backoff Policy

`src/lib/ai-providers/resilience.ts` provides `runWithAIProviderRetry` with:

- four total attempts by default
- one-second exponential base delay
- twelve-second maximum delay
- full jitter for normal transient retry delays
- bounded `Retry-After` support, capped at twelve seconds
- no retry for 400, 401, 403, malformed output, cancellation, or configuration
  failures
- injectable random, clock-compatible callbacks, and sleep functions for
  deterministic tests without real waits
- optional `AbortSignal` support

Retry status callbacks deliberately swallow only their own persistence error;
they never turn a safely retryable provider request into a false success or an
infinite retry.

## Durable-Write And Idempotency Boundary

The retry wrapper ends before `importBatchImportJson`, crop attachment, import
items, questions, Review Drafts, or Blueprint lineage are written.

- Full PDF: the complete provider response is retried before draft import.
- Sequential chunks: only the current chunk call is retried; completed chunks
  and their import items are left untouched.
- Blueprint generation: the provider text request is retried before the one
  import/review handoff. Once Review Draft output exists, this PR does not
  automatically rerun that logical generation.

This avoids duplicate durable output without adding a migration. Existing
manual reset and failed-chunk retry flows remain the only post-write retry
mechanisms.

## AI PDF State Preservation

Safe retry progress is merged into the latest `summary.aiPdfImport` snapshot
using the existing summary merge helpers. It preserves preanalysis, packet and
extraction plans, adaptive reread, taxonomy/tagging, coverage plans,
`questionBoundaryGuardPlan`, chunk summaries, source asset references,
provider metadata, created-question results, and target Bank lineage.

Retrying stores `phase: "provider_retry_wait"`, safe error code, attempt/max
attempt count, next action, and retryability. Final failures store safe retry
history and an internal reference. Failed chunks use the same safe fields and
a `retrying` chunk status; they do not store raw provider text.

## Teacher And Admin UI Behavior

Teacher-facing states are vendor-neutral:

- Processing: `Analyzing your material.`
- Retrying: `The AI service is temporarily busy. Your work is safe, and the
  system is retrying.`
- Delayed: `This is taking longer than usual. Your work is safe, and the
  system is retrying.`
- Final retryable failure: `This run could not be completed. Nothing was
  published or assigned, and you can retry later.`
- Configuration/permission failure: `The AI service is not currently
  available for this action. Contact an administrator.`

Teacher Bank import history now maps legacy/raw provider-looking warning text
to safe copy and displays friendly phase labels. The chunk panel no longer
renders `503`, `UNAVAILABLE`, or a provider response preview. Admin status
retains only safe code/attempt/reference-level diagnostics under the existing
admin boundary.

## Current Concurrency Reality

This implementation is synchronous and request-local. It has no durable job
queue, worker deployment, global provider concurrency limit, per-user or
organization fairness, scheduled retry, or backpressure. A browser/server
request remains active during bounded retry waits. Blueprint generation cannot
surface a live retry timeline before an import batch exists; it records only a
safe final result if all attempts fail.

## Files Changed

- `src/lib/ai-providers/errors.ts`
- `src/lib/ai-providers/resilience.ts`
- `src/lib/ai-pdf-import/service.ts`
- `src/lib/ai-pdf-import/chunking.ts`
- `src/lib/ai-pdf-import/display.ts`
- `src/lib/teacher-blueprint-generation.ts`
- teacher/admin AI PDF status and error surfaces
- focused resilience and existing status smoke coverage

## Smoke Coverage

The focused provider-resilience smoke covers:

1. 503 followed by success with full jitter and no raw status in safe state.
2. 429 with bounded `Retry-After` and no real sleep.
3. Repeated 503 bounded at the maximum attempt count.
4. 400 and 401 permanent failures without retries.
5. Deadline/timeout followed by success.
6. Credential-shaped raw error redaction.
7. Full-PDF pre-write retry placement and target-Bank preservation.
8. Active-chunk-only retry behavior.
9. Blueprint pre-write retry placement, one Review Draft handoff, no
   Assignment creation, and no public write.

## Tests And Results

Passed:

- `npm.cmd install` (no dependency or lockfile change)
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/ai-provider-resilience-smoke.mjs`
- `node scripts/ai-pdf-provider-failure-status-smoke.mjs`
- `node scripts/ai-parsing-status-review-qa-smoke.mjs`
- `node scripts/ai-parsing-boundary-duplicate-guard-smoke.mjs`
- `node scripts/blueprint-to-review-drafts-generation-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/teacher-beta-readiness-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

## Explicit Non-Goals

- No durable multi-user queue or worker deployment.
- No global concurrency, fairness, scheduled retry, or backpressure.
- No provider/model fallback routing or circuit breaker.
- No production model change or teacher provider/model/key choice.
- No LocateAnything work.
- No automatic duplicate deletion or fragment merge.
- No Review Draft mutation or bypass.
- No auto-publish, assignment creation, public/global write, source-question
  mutation, migration, or student UI redesign.

## Next Recommendation

PR4-J should add a durable multi-user provider queue with explicit fairness,
capacity, and background retry behavior. PR4-K can then add an
admin-configured fallback policy and circuit breaker without exposing provider
choice to teachers.
