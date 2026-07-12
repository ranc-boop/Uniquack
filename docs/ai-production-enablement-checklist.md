# AI Production Enablement Checklist

## Current recommendation

**Not enabled.** The queue, retry, routing, circuit-breaker, and operations-control code passed a controlled clean-project rehearsal. Production remains disabled until the scheduler, deployed token, named alert owner, and launch ownership are configured.

## Required gates

- [ ] Clean migrations `0033`, `0034`, and `0035` confirmed applied on the target project.
- [x] Clean migration `0036_ai_operations_launch_readiness.sql` manually applied once to the clean project; live object/RLS checks passed.
- [ ] `AI_JOBS_INTERNAL_TOKEN` configured server-side only.
- [ ] Trusted scheduler invokes `POST /api/internal/ai-jobs/run` with the internal token.
- [ ] Scheduler is bounded to the configured maximum jobs per invocation and the fixed 240-second runtime ceiling.
- [ ] Routing policies are configured for each enabled operation.
- [ ] A compatible fallback route is verified, or its absence is explicitly accepted for the relevant operation.
- [ ] Closed-beta queue bounds are reviewed: global active `3`, per organization active `1`, PDF active `1`, Blueprint active `2`, user outstanding `5`, organization outstanding `12`, and worker invocation `<= 3`.
- [ ] Cost reservation, daily, and monthly budget controls are reviewed by the closed-beta owner.
- [x] Admin-safe dashboard data reads telemetry, queues, circuit state, and safe alert conditions after real work runs.
- [ ] Alert thresholds are reviewed: queue age/depth, worker staleness, circuit duration, fallback rate, budget, zero-draft imports, stale leases, and configuration failures.
- [x] Emergency pause/resume, queued-job cancellation, and safe circuit reset were rehearsed by a super admin on disposable fixtures.
- [ ] Source preservation and retry/recovery behavior are documented for support.
- [ ] Logs and telemetry are checked for absence of prompts, responses, assets, signed URLs, keys, student answers, and teacher notes.
- [x] One tiny real PDF queue job completed into private Review Drafts.
- [x] One one-question Blueprint queue job completed into private Review Drafts.
- [x] Neither live validation published, assigned, mutated source questions, or bypassed Review Drafts.
- [ ] A named closed-beta owner is assigned for queue/cost/alert response.

## Deployment-neutral scheduler contract

The scheduler is not a public API client. It calls the internal route on a short cadence with a server-only token. It does not send a job payload; the worker claims fair, eligible durable jobs through the service-role RPC. If the scheduler stops temporarily, jobs remain durable and become eligible on the next trusted invocation. Do not use browser automation or a teacher session as a scheduler.

## Rollback and recovery

Use the emergency controls before disabling infrastructure:

1. Pause new enqueues to preserve existing queue order.
2. Pause worker claims if provider or cost conditions require a full halt.
3. Do not delete queued jobs, source PDFs, or Review Drafts.
4. Cancel only selected queued/retry-wait jobs through the safe queue action.
5. Resume claims after the provider/routing issue is resolved; stale leases recover through the existing durable queue policy.

PR4-M remains the next product step: selective packet execution. It is not part of this operational enablement work.

## Follow-up monitoring gaps

- [ ] Configure external alert delivery or a durable alert-history workflow.
- [ ] Add a token-growth anomaly condition.
- [ ] Add a distinct monthly-budget dashboard alert.
- [ ] Assign a named closed-beta scheduler and alert-response owner.
