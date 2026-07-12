# PR4-K AI Provider Fallback Routing and Circuit Breaker

## Goal

Add one server-side, administrator-configured provider routing layer that can
use an explicit compatible fallback after the existing provider retry policy is
exhausted. The layer is built around the durable AI queue and preserves the
private source to Review Draft to Bank workflow.

## Current Control-Plane Audit

`public.ai_provider_profiles` is the existing profile source of truth. It
already contains nullable organization scope, provider/model fields, enabled
and default state, native-PDF/page-image capability flags, and encrypted key
material. Profiles are managed only through **Admin / AI Settings** gateway
RPCs.

Before this PR, queued PDF jobs stored a profile reference and Blueprint
generation chose the first compatible enabled profile. Neither behavior could
express an ordered fallback route or shared provider health. PR4-I retries
occurred inside a single provider call; PR4-J handled the surrounding durable
job retries, leases, and idempotency.

## Implementation

Migration `0035_ai_provider_routing_circuit_breaker.sql` adds:

- `ai_provider_routing_policies` for a site-level route and future
  organization-level override.
- `ai_provider_routing_policy_members` for an ordered primary plus up to two
  explicit fallbacks.
- `private.ai_provider_runtime_states` for cross-worker closed, open, and
  half-open circuit state.
- Service-role-only atomic RPCs for half-open probe acquisition and safe route
  outcome recording.

The new server-only resolver checks operation capability before executing:

- `ai_pdf_extract` accepts only implemented PDF/page-image inputs.
- `blueprint_observe_pdf` accepts only the existing native-PDF or mock path.
- `blueprint_analyze_text` accepts only the compatible JSON chat adapter.
- `blueprint_generate_questions` requires text and structured JSON support.

An open circuit is skipped. After the cooldown, exactly one worker can acquire a
90-second half-open lease. A successful probe closes the circuit; a failed probe
reopens it for five minutes. Two classified availability failures open a closed
circuit. Only bounded safe provider error codes are stored.

## Queued Execution Behavior

The worker now resolves the policy at execution time, then runs the existing
PR4-I retry behavior for one candidate at a time. When those retries end in a
transient availability failure, it records the safe failure and proceeds only to
the next explicitly configured compatible fallback. It never picks an arbitrary
enabled profile.

Already-queued jobs are intentionally not rewritten. If an active routing policy
exists, the worker resolves that current policy when it executes. If no routing
policy exists, the queued job's existing explicit profile reference is retained
as the one compatible candidate; jobs without a reference can use only the
explicitly marked default profile. This makes a provider change take effect for
future execution without breaking idempotency keys, source references, job
leases, or Review Draft lineage.

Blueprint PDF observation receives a native-PDF route before extraction and a
separate text-analysis route for the analyzer. Blueprint question generation
uses the same routing wrapper. Teacher and student forms remain provider/model
free.

## Admin UI

Admin / AI Settings now exposes only super-admin routing controls: primary,
fallback 1, fallback 2, enabled state, and a bounded maximum route length for
each supported operation. This is the sole UI for fallback configuration;
teacher and student surfaces receive no provider profile, model, endpoint, or
credential data.

## Safety Boundaries

- No production worker was enabled.
- No provider key, endpoint, prompt, raw error, raw response, or PDF content was
  added to the routing tables or UI.
- The worker remains queue-only, idempotent, and lease-protected.
- PDF and Blueprint outputs remain private, bank-scoped Review Drafts until
  human approval.
- No auto-publish, Assignment creation, source-question mutation, or student UI
  redesign was introduced.

## Validation

Focused source and behavior smoke:

```text
node scripts/ai-provider-fallback-circuit-breaker-smoke.mjs
```

This verifies compatible-only routing, no arbitrary text-to-PDF downgrade,
open-circuit skipping, controlled half-open acquisition, transient fallback,
safe failure-code persistence, migration RLS/grants, and queue/review safety.

Passed during implementation:

```text
npm.cmd run lint
npm.cmd run build
node scripts/ai-provider-fallback-circuit-breaker-smoke.mjs
node scripts/ai-provider-resilience-smoke.mjs
node scripts/durable-ai-job-queue-smoke.mjs
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node scripts/supabase-rls-smoke.mjs
npm.cmd run perf:budget
npm.cmd run smoke
```

The aggregate smoke applied all 36 clean migrations, including `0035`, to its
embedded disposable PostgreSQL validation environment successfully. The initial
non-escalated RLS smoke could not reach the clean Supabase endpoint; the same
check passed once normal network access was available.

Live circuit validation is intentionally pending because migration `0035` has
not been applied during this PR. Apply it using
`docs/ai-provider-routing-circuit-breaker-manual-apply.md`, configure explicit
routes in Admin / AI Settings, then run a bounded queue validation as a separate
follow-up.
