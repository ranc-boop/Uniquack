# Student Workspace Completion Audit

**Audit date:** 2026-07-16
**Scope:** current `origin/main` source and canonical clean migrations, followed by the narrowly scoped Practice provider-execution remediation recorded below. No provider call, Supabase mutation, environment-file read, migration, or runtime data change was performed.

## Evidence and Limit

The 2026-07-14 historical report titled *Practice Agent 与 AI Router 改动报告* was used only as supplied historical evidence. Its claims were checked against current source; the historical report is not treated as current truth. The live provider-gateway grant record cited below is the existing sanitized post-0042 SQL Editor evidence, not a new live query performed by this audit.

## Baseline Classification: PARTIAL

Practice persistence and most request UX remain implemented, but the current model-backed Practice endpoints have a provider-selection mismatch that prevents them from using the approved normal-execution resolver correctly for a normal student or teacher session. They are also request-bound rather than durable-job-backed.

`requirePracticeApiUser()` accepts any authenticated user. Each model-backed Practice route then passes that user's session client to `loadPracticeAIProfile()`. That function calls `list_enabled_ai_provider_profiles_for_gateway`, while canonical `0002_provider_profiles_and_operation_logs.sql` makes `private.verify_ai_provider_gateway()` require **both** the server-only gateway-token digest and `private.is_super_admin()`. A normal student or teacher session cannot satisfy the latter condition. Credential decryption then uses the service-role resolver, but execution does not get that far when profile enumeration is denied or empty.

This was a current source finding, not a conclusion about the historical implementation. The remediation below replaces this normal-execution selection path; the baseline remains here so the authorization defect is auditable.

## Baseline Practice Call Graph

| Surface | Current behavior | Provider path | Durability |
| --- | --- | --- | --- |
| `POST /api/practice/recommend` | Direct recommendation agent, JSON or app SSE response | `loadPracticeAIProfile(session client)` -> gateway profile-list RPC -> service-role credential load | Persists a round only after the model call completes |
| `POST /api/practice/review` | Direct per-question review plus streamed summary | Same | Attempts/review summary persist after work completes |
| `POST /api/practice/hint` | Direct JSON model hint with deterministic fallback | Same | Hint event can persist after completion |
| `POST /api/practice/sessions/title` | Direct JSON title call | Same | Request-bound helper |
| `POST /api/practice/preferences/merge/run` | Direct JSON preference merge | Same | Uses a `practice_preference_merge_jobs` record, but no durable worker claims it |
| `POST /api/practice/grade` | Deterministic grade and evidence update | No provider | Durable after writes succeed |

`src/lib/practice/ai.ts` and `src/lib/ai-providers/profiles.ts` are both marked `server-only`. The current model caller sends the provider authorization header only from server code. However, `loadPracticeAIProfile()` must be changed to select enabled profiles through the trusted server-use list (`listEnabledAIProviderProfilesForServerUse`) or a dedicated server-only Practice resolver, after the route's own user authorization has succeeded. It must not expose the gateway token or grant students/teachers provider-management capabilities.

## 2026-07-16 Provider-Execution Remediation

### New Trusted Execution Call Graph

The five model-backed routes now authenticate the caller through
`requirePracticeApiUser()` **before** provider resolution:

```text
authenticated Student or Teacher
-> Practice route authorization
-> loadPracticeAIProfile() in server-only code
-> listEnabledAIProviderProfilesForServerUse() using service role
-> enabled + text/JSON-capable provider selection
-> configured default, otherwise first compatible profile
-> loadAIProviderProfileForServerUse() decrypts credentials only in server memory
-> provider request
```

This replaces the old signed-in-client call to the super-admin gateway list RPC.
The browser supplies no provider ID, provider profile, model, credential reference,
gateway token, or vendor configuration. Disabled and incompatible profiles are
filtered before credential loading. The selected profile is admin-configured.

`recommend`, `review`, `hint`, `sessions/title`, and
`preferences/merge/run` use this path. The existing provider router,
circuit-breaker, and fallback records remain unchanged: their canonical operation
kinds cover AI PDF and Blueprint work, not Practice. Practice does not claim
DB-backed routing/fallback/circuit behavior that it never had.

### Role, Failure, and Log Boundaries

The current Practice contract remains an authenticated caller; it does not grant a
Student or Teacher provider-management capability. Admin provider CRUD stays
separate behind `requireSuperAdmin`. Practice no longer calls
`requireAIProviderGatewayToken` or
`list_enabled_ai_provider_profiles_for_gateway`, and the gateway token never enters
Practice browser code, responses, or the execution resolver.

Provider failures now return only a safe code, correlation ID, and retry-safe
message: `provider_unavailable`, `provider_timeout`,
`provider_rate_limited`, `provider_invalid_response`, or
`practice_generation_failed`. Upstream bodies, authorization headers, API keys,
cookies, JWTs, signed URLs, private prompts, and model output are not returned to
the browser. Preference-merge records store only a safe failure code.

`PRACTICE_AGENT_FULL_CALL_LOGS` remains disabled by default and fails closed in
production, preview, CI, and shared Vercel environments. Controlled local
development use is process-only, recursively sanitizes sensitive fields and
arbitrary URLs/strings, and prunes records after two days. Browser recommendation
and review SSE parsing now turns malformed event data into a safe retryable error
without clearing persisted session work.

## Current Practice Call Graph

| Surface | Current behavior | Provider path | Durability |
| --- | --- | --- | --- |
| `POST /api/practice/recommend` | Direct recommendation agent, JSON or app SSE response | Authenticated route -> trusted server-only resolver -> service-role credential load | Persists a round only after the model call completes |
| `POST /api/practice/review` | Direct per-question review plus streamed summary | Same | Attempts/review summary persist after work completes |
| `POST /api/practice/hint` | Direct JSON model hint with deterministic fallback | Same | Hint event can persist after completion |
| `POST /api/practice/sessions/title` | Direct JSON title call | Same | Request-bound helper |
| `POST /api/practice/preferences/merge/run` | Direct JSON preference merge | Same | Uses a `practice_preference_merge_jobs` record, but no durable worker claims it |
| `POST /api/practice/grade` | Deterministic grade and evidence update | No provider | Durable after writes succeed |

## Reconciliation of the July 14 Claims

| Historical claim | Current-source result | Notes |
| --- | --- | --- |
| Practice Error Boundary and retry UX | **Partial** | `PracticeAgentClient` has inline error state and retry actions. No React error boundary, `componentDidCatch`, `getDerivedStateFromError`, or Practice `error.tsx` was found. |
| SSE JSON parsing protection | **Present after remediation** | Provider-side stream parsing buffers malformed provider JSON and browser SSE consumers now convert malformed event data into a safe retryable Practice error. |
| Defensive array normalization | **Present** | Current client, persistence, review, grade, and agent paths use `Array.isArray`/normalizers around persisted arrays and API input. |
| Server-side provider loading | **Present after remediation** | Enabled-profile enumeration and credential resolution use the approved server-use service-role helpers only after Practice route authorization. |
| Provider credentials not returned to browser | **Present** | Types and normal/failure responses do not serialize ciphertext, IV, tag, credential reference, gateway token, or provider API key. |
| Super-admin provider-management boundary | **Present in canonical design** | `0002` requires super-admin plus gateway digest for gateway RPCs; post-0042 evidence records direct browser table grants removed. Practice must not reuse that admin gateway for normal execution. |

## Durable Jobs and Page-Close Behavior

The durable `ai_provider_jobs` queue supports exactly these current job kinds:

- `ai_pdf_extract`
- `ai_pdf_coverage_recovery`
- `blueprint_generate_questions`

The worker handles those same three kinds. Provider routing similarly covers AI PDF and Blueprint operations, not Practice. There is no Practice resource type, job kind, enqueue call, lease, heartbeat, retry policy, worker handler, status polling, or idempotency contract in `src/lib/ai-jobs`.

Therefore Practice recommendation rounds are **not durable jobs**. `recommend` runs the model inside the HTTP/SSE request and calls `persistRecommendationRound()` only after the agent returns. Closing the page or losing the request before that persistence step still risks losing the round result. A host might continue execution briefly after a disconnect, but current code provides no durable completion or recovery guarantee.

The `practice_preference_merge_jobs` table is a user-state record, not an `ai_provider_jobs` worker job: its route claims and processes it synchronously in the request. It does not change this conclusion.

## Durable State, Evidence, and Resume

Canonical `0008_practice_agent_evidence.sql` and `0017_practice_sessions_session_state.sql` provide durable state for completed work, including:

- `practice_sessions`, `practice_rounds`, and `practice_round_questions`;
- `practice_attempts`, hint/reflection/wrong-question evidence, and taxonomy weakness links;
- `practice_agent_episodes`, preference state, and preference-merge records; and
- assignment linkage through `assignment_practice_sessions` plus progress/evidence updates.

`persistRecommendationRound()` stores the completed round, question snapshots, session state, and an episode; review/grade paths store attempts and summaries; session loaders restore persisted history. These writes are durable independently of a later model request **after they succeed**. They do not preserve a recommendation still running when the page/request closes.

Canonical RLS is user-scoped with an explicit organization-staff exception for learning operations. The source supports student self-access and authorized staff visibility; this audit did not rerun live RLS validation.

## Historical Router and Timestamp Migration Status

No current source reference to `AI_ROUTER_CREDENTIAL` was found. No current static source reference to the historical `private.has_ai_router_provider_access()` helper or `ai_provider_profiles_ai_router_read` policy was found either. Existing post-0042 SQL Editor evidence records those aliases absent and direct `anon`/`authenticated` access to `public.ai_provider_profiles` revoked, with trusted `service_role` access retained.

The historical files under the legacy `supabase/migrations/` chain, including `0014_practice_persistence.sql`, `0015_practice_agent_thread_context.sql`, `0017_practice_cache_first_thread.sql`, and `0019_practice_thread_cache_snapshot.sql`, are **NONCANONICAL / SUPERSEDED / DANGEROUS_TO_APPLY** to the clean project. They create or alter the same Practice tables and timestamp/session state that canonical clean migrations `0008_practice_agent_evidence.sql` and `0017_practice_sessions_session_state.sql` own. Release control designates only `supabase/clean-migrations` as canonical. These historical files are not executed at runtime; they must not be restored or applied as a repair path.

There is one stale, isolated developer harness: `scripts/practice-thread-cache-refactor-smoke.mjs` tries to read nonexistent legacy path `supabase/migrations/0017_practice_thread_cache_snapshot.sql` (the legacy snapshot file is numbered `0019`). It fails before assertions, is available only through the explicit `smoke:practice-thread-cache` script, and is not imported by aggregate `npm run smoke`. This is a **P2 release-control test defect**, not evidence that the historical migration executes in the product. Its later repair must retarget assertions to the canonical clean migration or explicitly label the source-only historical contract it is testing.

## Browser, Log, Snapshot, and Evidence Exposure Review

| Surface | Result | Evidence / limitation |
| --- | --- | --- |
| Browser provider credentials | No direct serialization path found | Practice response types and normal routes do not return API key, gateway token, ciphertext, IV, tag, or credential reference. Provider fetch occurs in `server-only` code. |
| Provider gateway credentials | No browser path found | `AI_PROVIDER_GATEWAY_TOKEN` is read by a server-only module. The current issue is inappropriate super-admin RPC use for Practice selection, not browser token transport. |
| Raw provider error body | **Remediated in source** | Model callers classify failures and routes return safe code/message/correlation ID only; raw upstream response bodies are cancelled rather than read into errors. |
| Full Practice call logs | **Remediated in source** | Opt-in full logs are local-development-only, recursively sanitized, bounded to safe metadata, and pruned after two days. |
| Snapshots and evidence | No Practice-generated signed-URL path found | No `createSignedUrl`, `getPublicUrl`, or signed-URL construction was found in Practice. Round snapshots copy question `contentHtml`; if an upstream source inserted a sensitive URL into that content, the snapshot would preserve it. |
| Normal traces | Bounded summaries | The normal `traced()` helper marks full payloads unsaved. Model-backed failures now enter it as classified safe provider errors rather than raw upstream body text. |

## Findings and Required Follow-ups

### P2 - Practice Is Request-Bound; a Formal Error Boundary Is Still Absent

If product requirements promise completion after navigation/disconnect, add a new forward-only durable Practice job kind and worker contract. Do not assume the AI PDF/Blueprint queue already provides this guarantee. Until then, describe Practice recommendations as request-bound and persist only completed results.

The normal-execution provider defect, raw provider error exposure, full-call-log
exposure, and browser malformed-SSE gap are remediated in source. A formal React
error boundary remains absent; current inline retry state is useful but not
equivalent.

### P2 - Isolated Practice Cache Smoke Reads a Stale Legacy Filename

The explicit `smoke:practice-thread-cache` harness does not run because it references the nonexistent legacy `0017_practice_thread_cache_snapshot.sql` path. Do not fix it by restoring or applying an old migration; retarget its static assertions under a separate release-control PR.

## Verification Performed

- Static call-graph review of every `src/app/api/practice` route and `src/lib/practice` provider caller.
- Static queue/routing review of `src/lib/ai-jobs` and `src/lib/ai-providers/routing.ts`.
- Canonical migration review of `0002`, `0008`, `0017`, `0033`, `0038`, and `0042`.
- Legacy migration inventory and release-control review confirming `supabase/migrations` is noncanonical.
- Static credential, router-alias, and signed-URL searches across Practice source.
- `node scripts/practice-provider-execution-smoke.mjs` passed. It checks route authorization before service-role resolution, no browser provider-selection fields, disabled-profile filtering, super-admin-only management boundaries, safe error classification, full-log production gating/sanitization, malformed browser SSE handling, and deterministic-grade independence.
- `node scripts/migration-reconciliation-smoke.mjs`, `node scripts/security-smoke.mjs`, `node scripts/ai-provider-resilience-smoke.mjs`, `node scripts/ai-provider-fallback-circuit-breaker-smoke.mjs`, and `node scripts/ai-operations-launch-readiness-smoke.mjs` passed.
- `npm.cmd run lint`, `npm.cmd run build`, `node scripts/route-smoke.mjs`, `npm.cmd run perf:budget`, `npm.cmd run perf:audit`, and `npm.cmd run analyze` passed.
- `node scripts/practice-thread-cache-refactor-smoke.mjs` was intentionally checked and failed before assertions on the stale legacy filename described above; aggregate smoke does not import it.

No paid provider call, Supabase mutation, live RLS check, environment-file read, or migration was performed. `node scripts/assignment-practice-evidence-smoke.mjs` remains blocked in this isolated worktree because its ignored disposable Supabase process-environment categories were intentionally not injected. The aggregate `npm.cmd run smoke` reaches the same missing Supabase environment gate after its preceding static/embedded checks. Neither result is a passing live Practice E2E.

## Live E2E Preparation and Final Classification

The minimum safe disposable validation remains:

- an active Student fixture;
- an active Teacher fixture where the current Practice rules permit access;
- an enabled disposable-compatible provider profile or an approved safe mock;
- service-role cleanup access injected process-only;
- normal app-auth process environment injected process-only; and
- no real Student data or broad paid-provider run.

**Practice classification: FUNCTIONAL / LIVE E2E BLOCKED.** Source and embedded
tests now support normal authenticated execution through a server-only resolver,
but live disposable role/provider validation has not been run. Practice remains
**request-bound**, not `DURABLE_JOB_BACKED`: only AI PDF, Blueprint, and Coverage
Recovery use the durable queue today. Durable Practice execution is separate future
work and must not be inferred from this remediation.
