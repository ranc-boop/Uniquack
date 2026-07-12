# PR4-L AI Operations, Monitoring, Cost Telemetry, and Launch Readiness

## Executive summary

PR4-L adds the closed-beta operational layer around the existing durable AI queue, safe provider retries, explicit fallback routing, and shared circuit breaker. It does not change teacher provider choice, production primary models, Review Draft gating, publishing, assignments, or source-question content.

The product workflow remains:

```text
Private source -> queued AI Parsing / Blueprint work -> private Review Drafts -> Bank review -> optional Assignment -> Practice evidence
```

Admin owns this new operational surface. Teachers only see existing safe queue status; they never see provider routing, models, token counts, cost figures, or infrastructure controls.

## Migration and configuration readiness

Repository audit confirmed the clean migration files `0033_ai_provider_jobs.sql`, `0034_ai_provider_jobs_worker_role_fix.sql`, and `0035_ai_provider_routing_circuit_breaker.sql` are present. Prior project validation recorded `0033` through `0035` as manually applied on the clean Supabase project. This PR adds forward-only `0036_ai_operations_launch_readiness.sql`; it has **not** been applied by this PR.

Use [the manual apply guide](ai-operations-0036-manual-apply.md) after merge. The migration chain already contains a pre-existing duplicate numeric prefix `0032` for unrelated Google and feedback-note migrations. PR4-L introduces no duplicate version and does not edit that baseline artifact.

## Worker scheduling design

`POST /api/internal/ai-jobs/run` remains the only worker entry point. It requires a timing-safe server-only `AI_JOBS_INTERNAL_TOKEN`, accepts no request payload, has a fixed `240` second runtime ceiling, and invokes the existing durable worker with a bounded limit.

The worker reads a service-role-only control record before claiming. It respects an emergency worker-claim pause and never exceeds the existing database queue caps. [The scheduler simulation](../scripts/ai-jobs-scheduler-simulation.mjs) verifies the trusted invocation contract without network or provider calls.

## Telemetry model and privacy

`ai_operation_telemetry` stores only aggregate operational facts: queue job ID, operation, safe provider/model identifiers, route/fallback position, attempts, token counts when supplied, estimated cost, latency, draft count, safe terminal code, and circuit outcome. It is super-admin-readable only and worker-written only through a service-role RPC.

It deliberately excludes prompts, provider output, source text/PDF/image bytes, asset URLs, credentials, student answers, and teacher notes. The existing provider-operation log remains unchanged because it lacks durable queue linkage, latency, and structured aggregate fields with a strict super-admin-only boundary.

## Actual and estimated token accounting

Gemini Native response `usageMetadata` is now preserved as aggregate counts only: prompt, cached input, candidate output, and total tokens. OpenAI-compatible Blueprint responses similarly capture standard usage fields where returned. If a provider does not return usage, telemetry leaves counts unavailable rather than inventing an exact value. No extra `countTokens` call is made, avoiding needless provider cost and latency.

## Cost catalog

`src/lib/ai-operations/cost-catalog.ts` defines `ai_model_cost_catalog_v1`, initially for the configured `gemini-2.5-flash-lite` standard tier: input `$0.10`/M, cached input `$0.01`/M, output `$0.40`/M, with a 2026-07-11 effective date and the [official Gemini pricing reference](https://ai.google.dev/gemini-api/docs/pricing). Costs are estimates, not invoices. Unknown provider/model pairs remain unavailable rather than using guessed pricing.

## Budget guards and concurrency policy

The existing durable queue retains database-enforced closed-beta caps: three active jobs globally, one active job per organization, one PDF job, two Blueprint jobs, five outstanding jobs per user, and twelve outstanding jobs per organization. PR4-L adds a queue-insert trigger for an emergency pause and conservative organization cost reservation before a new job can enter the queue.

The starting global control defaults are a `$10.00` daily estimate, `$50.00` monthly estimate, `$0.10` reservation per queued job, at most two jobs per trusted invocation, a 240-second route ceiling, and no more than four provider attempts per execution. Routing clamps execution attempts to the shared four-attempt maximum even when fallbacks exist.

Budget exhaustion returns the generic safe teacher message: “AI processing is temporarily unavailable for this workspace. Your source and Library are safe.” It never exposes cost internals to teachers.

## Monitoring, alerts, and emergency controls

Admin / AI Settings now shows concise queue, success, latency, token, and estimated-cost cards. Detailed safe telemetry, circuit state, controls, and cancellation live behind expandable panels. Server-side alert conditions cover queue age/depth, worker staleness, long-open circuits, fallback spikes, budget exhaustion, repeated zero-draft operations, stale leases, and repeated configuration failures. External Slack/email delivery is intentionally deferred.

Super admins can pause new work globally, pause worker claims, pause a named operation, resume by clearing the pause, safely cancel queued/retry-wait jobs, inspect circuits, and reset a circuit. These actions do not delete source PDFs, queue rows, Review Drafts, or completed work.

## Synthetic launch validation

`scripts/ai-operations-launch-readiness-smoke.mjs` runs 400 mixed PDF/Blueprint jobs across eight organizations and five users each. It deterministically simulates three workers, 429/503/timeout behavior, fallback/circuit recovery, budget exhaustion, pause/resume, scheduler outage/recovery, stale leases, duplicate enqueue suppression, fairness/no starvation, bounded provider attempts, aggregate telemetry, and privacy checks. It makes no provider or database calls.

## Real provider validation

No real provider run was performed for this operational PR. A small real PDF and one-question Blueprint queue validation must occur only after `0036` is applied and a scheduler/token configuration is ready. That validation must confirm recorded usage where supplied, estimated cost, queue/provider latency, private Review Draft output, no Assignment, and no publishing.

## Safety and boundaries

- No teacher provider/model/API-key choice was added.
- No provider credential, prompt, response, source, signed URL, student answer, or teacher note is stored in the new telemetry.
- No auto-publish, Review Draft bypass, Assignment creation, source-question mutation, or unlimited concurrency was added.
- Old demo overlap: not applicable; this is an admin operations layer, not a demo surface.
- Rollback risk: do not roll back existing applied migrations. Use the new pause controls or a forward-only follow-up if needed.

## Files and tests

Primary implementation: `0036_ai_operations_launch_readiness.sql`, cost/telemetry/dashboard helpers, queue worker and Gemini usage capture, admin AI Settings controls, scheduler and launch smoke scripts, and the enablement checklist.

Passed locally:

- `npm.cmd install` (already up to date)
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/ai-operations-launch-readiness-smoke.mjs`
- `node scripts/ai-jobs-scheduler-simulation.mjs`
- `node scripts/ai-provider-fallback-circuit-breaker-smoke.mjs`
- `node scripts/ai-provider-resilience-smoke.mjs`
- `node scripts/durable-ai-job-queue-smoke.mjs`
- `node scripts/durable-ai-job-queue-load-smoke.mjs`
- `node scripts/ai-pdf-provider-failure-status-smoke.mjs`
- `node scripts/ai-parsing-status-review-qa-smoke.mjs`
- `node scripts/ai-parsing-boundary-duplicate-guard-smoke.mjs`
- `node scripts/blueprint-to-review-drafts-generation-smoke.mjs` source checks
- `node scripts/teacher-beta-readiness-smoke.mjs`
- `npm.cmd run perf:budget`
- `npm.cmd run perf:audit`
- `npm.cmd run analyze`

Remote-dependent checks were blocked by the local sandbox connection restriction to the clean Supabase endpoint (`fetch failed` with `EACCES`): `ai-provider-fallback-chaos-smoke`, the live section of `bank-import-review-smoke`, and `supabase-rls-smoke`. `npm.cmd run smoke` correctly stopped at that same RLS smoke. This is an environment/network result, not a claimed live pass. The Blueprint generation smoke ran its source checks and skipped its live teacher validation for the same unreachable endpoint.

## Remaining blockers and recommendation

The launch recommendation is **Not enabled** until 0036 is applied, the internal token and trusted scheduler are configured, alert ownership is assigned, and the two tiny real queue validations pass. The next scoped product task remains **PR4-M selective packet execution**.

## Post-migration validation (2026-07-11)

The clean Supabase project has now had
`0036_ai_operations_launch_readiness.sql` manually applied once. The user
confirmed the one-time Dashboard SQL apply. A service-role read could verify
the resulting tables, RPCs, and exactly one global control seed row; the
Supabase REST surface does not expose a usable migration-history query for
this project, so the manual-apply history itself was not independently
re-read through PostgREST.

### Remote schema and RLS

- `ai_operations_controls`, `ai_operation_telemetry`, the control trigger,
  worker-control RPC, telemetry RPC, and admin circuit RPCs all responded on
  the clean project.
- Anonymous, teacher, and student clients could not read controls or
  telemetry, write telemetry, call worker-only controls, reset circuits, or
  update cost/pause controls.
- A real super-admin could read controls and reset a disposable open circuit.
- Service role successfully claimed, finished, and recorded only bounded
  telemetry for disposable fixtures.

### Budget, pause, and emergency control results

- Daily reservation, retry retention, successful-completion settlement, and
  cancelled-job release passed on an isolated organization.
- Two simultaneous real teacher sessions attempted separate jobs in one
  temporary bank with a one-job organization budget. Exactly one enqueue
  succeeded; the other was rejected, and only one reserved job remained.
- Global enqueue pause, operation-specific enqueue pause, worker-claim
  pause/resume, safe super-admin queued-job cancellation, and queued-work
  preservation passed. Operation-specific pause intentionally blocks new
  enqueues; the global worker-claim pause stops all claims.
- Existing durable queue tests also passed service-role atomic claim,
  heartbeat, stale-lease recovery, lease-owner protection, user/organization
  limits, and fixture cleanup.

### Telemetry and monitoring results

- Telemetry stores separate input, cached-input, output, and total token
  fields; provider-call and queue-execution attempts; queue/provider/total
  latency; route position; fallback flag; safe status; and draft count.
- The real one-question Blueprint run recorded Gemini Native
  `gemini-2.5-flash-lite` usage and a catalog-based estimated cost. The real
  PDF run completed without provider usage metadata, so its token and cost
  fields remained `null`; no exact cost was fabricated.
- Disposable live alert fixtures produced safe dashboard conditions for queue
  depth and age, fallback rate, daily budget, repeated zero-draft work,
  stale leases, and repeated configuration errors. Alert text contained no
  source content, URLs, prompts, responses, assets, credentials, student
  answers, or teacher notes.
- Provider response previews were removed from Gemini Native thrown errors.
  Debug-only error records retain response byte length rather than error-body
  content.

### Real queue validation

One small synthetic PDF and one one-question Blueprint were queued through
the real durable worker. Both completed and remained private,
bank-scoped Review Draft work: no global publishing, Assignment creation, or
source-question mutation occurred. Their smoke fixtures were removed after
validation while safe aggregate telemetry remained available to super-admins.

### Internal route and test suite

`POST /api/internal/ai-jobs/run` passed missing-token, wrong-token,
ordinary-user, trusted-token, payload-free, bounded-worker, and fixed
`maxDuration = 240` checks. The full aggregate smoke suite, lint, build,
security smoke, route smoke, RLS smoke, focused queue/routing/import/Blueprint
smokes, performance budget, performance audit, and bundle analysis all passed.

### Remaining production enablement blockers

**Not enabled.** No production scheduler was enabled during this validation.
`AI_JOBS_INTERNAL_TOKEN` still needs a server-only deployment configuration,
the trusted scheduler needs an owner and cadence, and a named closed-beta
operator must own alert response.

The current dashboard computes safe alert conditions in memory. It does not
yet persist a separate alert-history table or send external notifications.
There is also no dedicated token-growth anomaly condition, and the dashboard
surfaces daily budget exhaustion rather than a distinct monthly-budget alert.
Those are monitoring follow-ups, not reasons to weaken queue, RLS, Review
Draft, or publishing boundaries.
