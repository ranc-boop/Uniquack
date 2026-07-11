# PR4-J Durable Multi-user AI Job Queue

## Executive summary

PR4-J replaces the synchronous browser/request-owned execution boundary for AI PDF Parsing and Teacher Blueprint question generation with a durable, database-backed queue. A teacher upload or Blueprint generation request now validates its bank-first ownership boundary, persists/reuses a queue job, and returns immediately. A trusted worker later claims and executes the job.

No job can publish a question, create an assignment, change a source question, or expose provider configuration. Existing AI PDF and Blueprint services remain the only places that perform provider calls and create Review Drafts.

## Previous synchronous execution

Before this change, admin PDF extraction created a batch-level lease and then the active page called `runQueuedAIPdfExtraction`. Teacher bank PDF import uploaded a private source and waited for `processAIPdfImport` in the server action. Teacher Blueprint generation similarly waited for `generateTeacherBlueprintReviewDrafts` in its server action.

Those paths already had resource-level guards and PR4-I request-local provider retry, but no shared durable queue, atomic multi-worker claim, organization fairness, or scheduled retry after request-local retries were exhausted.

## Queue schema and migration status

`supabase/clean-migrations/0033_ai_provider_jobs.sql` is a new forward-only clean migration. It adds:

- `public.ai_provider_jobs` for durable job references, safe status, attempts, leases, idempotency, and bounded result metadata.
- `private.ai_provider_job_fairness_state` for trusted-worker round-robin scheduling state.
- authenticated enqueue and cancellation RPCs with resource authorization.
- service-role-only claim, heartbeat, and finish RPCs.

The migration was **not applied by this PR**. The remote queue/RLS path therefore remains blocked until the clean migration is manually applied. The companion [manual apply guide](ai-provider-jobs-0033-manual-apply.md) documents the safe rollout.

## Enqueue and idempotency

AI PDF idempotency is derived from the batch, private source asset, operation version, and explicit retry generation. Blueprint idempotency is derived from the Blueprint ID/version, linked target Library, and explicit retry generation.

The database has a unique constraint over the logical operation. A rapid duplicate click reuses the durable row. A completed job cannot accidentally rerun with the same key. An explicit retry after final failure uses a new, visible retry generation; `retry_wait` remains the same job.

## Atomic claim, fairness, and limits

`public.claim_ai_provider_jobs` uses `FOR UPDATE SKIP LOCKED` to claim rows atomically. It reclaims expired leases, enforces a closed-beta policy, and persists fairness state for both organization and user keys.

Current conservative limits are:

- global active jobs: 3
- PDF extraction active jobs: 1
- Blueprint generation active jobs: 2
- active jobs per organization: 1
- queued/in-flight jobs per user: 5
- queued/in-flight jobs per organization: 12

These are closed-beta safeguards, not launch-scale capacity claims. One organization with a large upload burst cannot take all active slots; the scheduler picks the least recently served eligible organization/user first.

## Worker, leases, and retries

`src/lib/ai-jobs/worker.ts` claims bounded work, marks it processing, heartbeats every minute, revalidates the target Library and original creator, and invokes one of two handlers:

- `runAIPdfExtractJob`
- `runBlueprintGenerateQuestionsJob`

The PDF handler additionally takes a conditional batch-level resource claim before calling the existing extraction service. Completion/failure updates require the same lease owner, so a stale worker cannot finalize a recovered job.

PR4-I still performs the short provider-request retries. If its final error remains retryable, PR4-J schedules the durable job for approximate jittered 30-second, 2-minute, then 5-minute retry windows. A fourth execution failure becomes a safe permanent failure. Invalid input, missing resources, lost permission, inactive Library, and invalid Blueprint readiness do not retry.

## AI PDF and Blueprint integration

Teacher PDF import still uploads the private PDF and creates the bank-scoped `import_batches` / source asset first. It then queues `ai_pdf_extract`; the worker reloads the private source, preserves `target_bank_id`, and hands output through the existing Review Draft flow.

Teacher Blueprint generation validates the linked Library and Blueprint version, then queues `blueprint_generate_questions`. The worker later calls the existing generator, which writes private bank-scoped Review Drafts only. Neither path creates an Assignment or globally publishes content.

The worker records its durable job ID in the Blueprint generation batch summary. If a lease is recovered after the Review Draft handoff but before queue completion is recorded, the next worker recognizes that completed handoff instead of generating a duplicate set.

Admin PDF start and failed-chunk retry now enqueue durable work too. The previous client-triggered runner is read-only compatibility code; provider execution belongs to the trusted worker.

## Teacher and admin UX

Teacher Bank Import and Blueprint detail pages show safe state cards for queued, processing, retry wait, completed, failed, and cancelled work. Active cards refresh every 15 seconds. Teachers can cancel only queued/retry-wait work and explicitly retry a final failure. The UI exposes no raw payload, provider model, credentials, lease owner, raw provider response, or exact fairness internals.

The trusted trigger is `POST /api/internal/ai-jobs/run`. It requires `AI_JOBS_INTERNAL_TOKEN` through the server environment, accepts no client job payload, and returns bounded aggregate counts only.

## RLS and safety boundaries

Students receive no queue policies, cannot enqueue jobs, and cannot read queue rows. Unrelated teachers cannot read or cancel another Library's job. There are intentionally no direct browser insert/update/delete policies on the queue table. The worker-only RPCs require `service_role`.

Queue payloads are bounded safe references only. They must not contain PDF bytes, base64, signed URLs, prompts, raw provider output, provider keys, or credential-bearing URLs. Safe error codes/messages are recorded instead of raw provider diagnostics.

## Synthetic load and smoke coverage

`scripts/durable-ai-job-queue-smoke.mjs` covers duplicate enqueue, atomic simulated claims, global/per-kind/per-org limits, lease heartbeat/recovery/owner guard, retry wait, permanent retry cutoff, browser-disconnect persistence, bank/Blueprint handoff boundaries, RLS source checks, safe error copy, and PR4 service preservation.

`scripts/durable-ai-job-queue-load-smoke.mjs` simulates 180 jobs across 12 organizations and 60 users with bounded workers. It does not call a provider. The deterministic run completed all jobs in 60 rounds without duplicate claims or organization starvation.

## Tests and results

Passed:

- `npm.cmd install` (lockfile already satisfied)
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/durable-ai-job-queue-smoke.mjs`
- `node scripts/durable-ai-job-queue-load-smoke.mjs`
- `node scripts/ai-provider-resilience-smoke.mjs`
- `node scripts/ai-pdf-provider-failure-status-smoke.mjs`
- `node scripts/ai-parsing-status-review-qa-smoke.mjs`
- `node scripts/ai-parsing-boundary-duplicate-guard-smoke.mjs`
- `node scripts/blueprint-to-review-drafts-generation-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/teacher-beta-readiness-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run perf:budget`

Blocked outside this queue implementation:

- `node scripts/security-smoke.mjs` and therefore `npm.cmd run smoke` stop at an existing classroom source assertion. The branch only adds the queue assertion at the end of that script; the failing classroom assertion is unchanged from `main`, so neither command reaches the new queue check. Dedicated queue/security source smoke passes, and the live clean-Supabase RLS smoke passes.

Not run against the remote queue tables:

- Live queue claim/RLS mutation validation is intentionally deferred because migration `0033` was not applied during this PR. No real provider job was submitted.

## Files changed

- `supabase/clean-migrations/0033_ai_provider_jobs.sql`
- `src/lib/ai-jobs/*`
- `src/app/api/internal/ai-jobs/run/route.ts`
- teacher/admin enqueue and status UI files
- queue and compatibility smoke scripts
- migration/manual rollout documentation

## Remaining blockers and non-goals

The migration and trusted scheduler trigger must be configured on the clean project before real jobs execute. This PR does not configure secrets or modify `.env.local`.

PR4-J intentionally does **not** add provider/model fallback, provider health scoring, circuit breakers, automatic model routing, student UI redesign, automatic publishing, automatic assignments, or production-scale concurrency claims. Those belong to PR4-K or later scoped work.
