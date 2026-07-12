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

At initial implementation time, live circuit validation was pending until
`0035` could be applied. It has now been applied once to the clean project; the
post-migration results are recorded below. The manual-apply guide remains for
other clean environments only and must never be rerun against this project.

## Post-migration live validation

`0035_ai_provider_routing_circuit_breaker.sql` was manually applied to the
clean Supabase project exactly once, as confirmed before this validation. This
validation did not reapply or modify migrations `0033`, `0034`, or `0035`.

### Remote schema and access control

- The routing-policy and ordered policy-member relations are reachable through
  the gateway RPCs. The service-role worker can read and write the private
  runtime-state relation only through its dedicated RPCs.
- A super-admin saved and read an ordered two-profile policy through the trusted
  gateway path. Returned policy metadata contained only operation, scope,
  bounded ordering, and version fields; it contained no key material, prompts,
  source content, or raw provider output.
- Disabled, soft-deleted, and other-organization profile fixtures were rejected
  by the policy RPC before a route could be saved.
- Teacher, unrelated-teacher, and student clients could not read or alter a
  routing-policy row. They also could not call the service-role runtime-state
  RPC. A teacher request with an invalid gateway token was rejected.
- Service-role calls recorded safe outcomes and read only bounded circuit state.
  The test responses contained no credentials, ciphertext, prompt, PDF, or
  source-object data.

The aggregate embedded-database rehearsal applied `0035` successfully with its
foreign keys, checks, unique constraints, indexes, RLS, and RPC definitions.
The hosted project's private schema is intentionally not exposed through
PostgREST, and direct PostgreSQL catalog connectivity was unavailable from this
validation environment. Remote validation therefore confirms table/RPC behavior
and constraint outcomes through the supported interface; it does not claim a
separate raw catalog dump.

`supabase_migrations` history is not treated as a reliable manual Dashboard SQL
audit source in this repository. The apply-once statement above is the supplied
remote-apply confirmation; the live object/RPC behavior and the aggregate
embedded migration rehearsal both verified the resulting schema contract.

### Circuit and routing behavior

The new live script `scripts/ai-provider-fallback-chaos-smoke.mjs` uses only
synthetic, credential-free profile records under a temporary organization. It
does not call an AI provider and removes policies, profiles, circuit state, and
organizations in a `finally` cleanup block.

- A healthy profile remained `closed` and eligible.
- Two classified safe transient outcomes opened the profile circuit.
- Route resolution skipped an open primary and considered only its explicit,
  compatible fallback.
- After the five-minute configured cooldown, five concurrent service-role
  workers raced for recovery. Exactly one acquired the 90-second half-open
  lease; all others were denied.
- A stale lease owner could not record an outcome. The valid probe owner closed
  the circuit on success.
- A simultaneous second probe fixture reopened on failure with a new bounded
  cooldown.
- PDF extraction state remained isolated from `blueprint_analyze_text`, and one
  profile opening did not change a different profile's state.
- No route used an arbitrary enabled profile. Test routes used only explicit
  policy members and excluded incompatible PDF candidates in the routing smoke.

### Total attempt budget

Post-migration validation found and corrected one issue before live testing:
the route previously bounded profile count but each candidate could receive the
entire PR4-I retry ceiling. `runWithAIProviderRoute` now uses one total budget
of four provider attempts per routed provider request. It reserves one attempt
for each remaining configured candidate. In the live synthetic primary/fallback
run, the primary received three attempts and the fallback received one. A route
cannot cycle from fallback back to primary and cannot exceed its bounded member
list.

Existing PR4-J queue validation also passed live for duplicate enqueue,
atomic claim, heartbeat, stale-lease protection, retry-wait scheduling,
permanent-failure termination, global/per-kind/per-organization limits, and
cleanup. The internal worker endpoint accepted only its trusted process token,
rejected missing/wrong/ordinary credentials, ignored arbitrary request payload,
and returned bounded aggregate counts only.

### Bounded AI PDF and Blueprint validation

One configured real PDF-capable profile and two configured real text-capable
profiles were found through metadata-only checks. No provider names, models,
keys, endpoints, or raw responses were logged.

The existing bounded queue E2E used a tiny synthetic PDF and one synthetic
Blueprint. Both completed successfully:

- The PDF job preserved its target Bank, completed through the durable queue,
  and produced private bank-scoped Review Draft data only.
- The Blueprint job preserved its Blueprint/version and target Bank, completed
  through the same durable queue, and produced one Review Draft handoff only.
- Existing E2E assertions confirmed no global publishing, Assignment creation,
  source-question mutation, or Review Draft bypass. Smoke records were removed.

There is only one configured real PDF-capable profile, so a **real PDF fallback
E2E is configuration-blocked**. No second credential or destructive failure
fixture was invented. The primary-failure/fallback-success route was instead
validated against the live database with synthetic no-network adapters. A real
Blueprint fallback is likewise not forced until a second compatible configured
route and a safe failure-injection mechanism are available.

### UI and production status

Teacher-facing source and route smokes confirm that teachers and students do
not receive provider, model, fallback-order, circuit-state, profile-ID, HTTP,
or raw-error controls. Admin / AI Settings remains the super-admin-only routing
surface and may configure primary/fallback order through the server gateway.

All routing state remains server-side. The worker did not auto-publish,
create Assignments, mutate source questions, or expose credentials.

Production worker execution remains disabled. Do not enable it until all of the
following are complete:

1. `AI_JOBS_INTERNAL_TOKEN` is configured server-side.
2. A trusted scheduled worker trigger is deployed.
3. Each enabled operation has a valid explicit routing policy.
4. Conservative concurrency limits have been reviewed.
5. Operational monitoring and alerting are deployed.

### Post-migration checks passed

```text
npm.cmd install
npm.cmd run lint
npm.cmd run build
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node scripts/ai-provider-fallback-circuit-breaker-smoke.mjs
node scripts/ai-provider-fallback-chaos-smoke.mjs
node scripts/ai-provider-resilience-smoke.mjs
node scripts/durable-ai-job-queue-smoke.mjs
node scripts/durable-ai-job-queue-load-smoke.mjs
node scripts/durable-ai-job-queue-live-smoke.mjs
node scripts/durable-ai-job-queue-internal-route-smoke.mjs
node scripts/durable-ai-job-queue-e2e-smoke.mjs
node scripts/ai-pdf-provider-failure-status-smoke.mjs
node scripts/ai-parsing-status-review-qa-smoke.mjs
node scripts/ai-parsing-boundary-duplicate-guard-smoke.mjs
node scripts/blueprint-to-review-drafts-generation-smoke.mjs
node scripts/bank-import-review-smoke.mjs
node scripts/teacher-beta-readiness-smoke.mjs
node scripts/supabase-rls-smoke.mjs
npm.cmd run smoke
npm.cmd run perf:budget
```
