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

This was the pre-live preparation state. The later disposable Assignment/Practice
and final Student browser validations supersede it. Practice remains
**request-bound**, not `DURABLE_JOB_BACKED`: only AI PDF, Blueprint, and Coverage
Recovery use the durable queue today. Durable Practice execution is separate
future work and must not be inferred from this remediation.

## Disposable Assignment/Practice Live E2E - 2026-07-16

The operator reported that the approved disposable live harness completed after
the provider-execution remediation. The literal terminal PASS line was not
retained in the task material, so this section records the operator-confirmed
outcome and the harness's fail-closed checks rather than fabricating a copied
terminal result. It used process-only values and a controlled local
OpenAI-compatible fake provider (`LOCAL_FAKE_HTTP_PROVIDER`); it made no paid
provider call and did not use a production user, Bank, Classroom, Assignment, or
Provider profile. The operator retained no credentials, project identity,
fixture IDs, prompts, provider output, or signed URLs in this report.

The harness will only emit its success result after its `try/finally` exact-ID
cleanup and absence checks complete. The operator-confirmed completed result
therefore validates the following disposable graph and results without retaining
its identifiers:

- Active Teacher, Student, and unrelated Student fixtures; a Teacher-owned
  Classroom, private Bank, selected and unselected private questions, an
  assigned-only Assignment, private Review Draft and Blueprint controls, and a
  temporary enabled/disabled provider-profile pair.
- Student My Work and assignment detail displayed only the entitled Assignment;
  assignment start loaded the selected private question and created the linked
  Practice session/round.
- The trusted server-only resolver selected and decrypted only the enabled local
  fake profile. Recommendation, review, hint, session title, preference merge,
  and deterministic grade completed through their intended paths.
- Completed Practice state reloaded, and the Teacher could read the linked
  assignment progress/evidence. This confirms persistence and resume only after
  the relevant writes complete.
- Anonymous access, unrelated-Student assignment/evidence access, source-Bank
  enumeration, unrelated private-question access, Review Draft access,
  Blueprint access, direct provider-profile access, and provider-management RPC
  access were denied. The Student received no Bank membership.
- Timeout, rate-limit, invalid-response, generic-upstream-failure, and malformed
  stream cases remained in the browser-safe failure boundary. The harness checks
  that raw upstream marker content, profile metadata, credential fields, and
  profile identifiers do not appear in responses. Full-call logging was forced
  off for the local server process.
- Cleanup used only captured IDs. It removed Practice state/evidence, assignment
  links/items, Classroom rows and memberships, Bank/question rows, Review
  Draft/Blueprint controls, Provider fixtures, organization/profile records, and
  disposable Auth users; post-cleanup absence checks passed. No fixture or
  credential was persisted by the harness.

### Request-Bound Limitation

This live result does **not** make Practice durable-job-backed. Completed calls
and evidence now persist and resume correctly, but an interrupted recommendation
or review request is still not guaranteed to finish after the browser/page
closes. AI PDF, Blueprint, and Coverage Recovery remain the only durable worker
job kinds.

### Current Classification

**Practice classification: FUNCTIONAL_BUT_REQUEST_BOUND / LIVE VALIDATED.**

The isolated `scripts/practice-thread-cache-refactor-smoke.mjs` remains a P2
release-control defect because it targets a stale legacy migration filename. It
was not restored, applied, or used by this validation.

### Post-Live Regression Review

The visible regression run completed on 2026-07-16 without rerunning the live
fixture harness. It produced the following review result:

- Passed: provider-execution source smoke, student My Work static boundary
  checks, assignment-to-Practice static/evidence checks, assignment-from-Bank
  static checks, security smoke, migration reconciliation, AI provider
  resilience/fallback/operations checks, lint, and performance budget/audit.
- Blocked, not failed as a product assertion: database-backed Student My Work,
  assignment Practice, assignment-from-Bank, and aggregate Bank-share portions
  did not receive the ignored `TEST_TEACHER`/`TEST_ADMIN` and `TEST_STUDENT`
  role credentials in that regression process. The aggregate smoke stopped at
  the Bank-share credential gate.
- Blocked, not failed as a route assertion: route smoke had no local server
  listening on port 3000 and therefore received a connection refusal.
- Blocked: build and bundle analysis both stopped during existing Next
  prerendering with a `useContext` null error on authentication/global-error
  routes. This validation changed only the disposable harness, its safety
  smoke, and this evidence document; it did not modify those runtime routes.

No secrets, environment values, fixture identities, provider output, or signed
URLs are recorded in this document or the committed harnesses. The regression
review does not convert any blocked command into a pass, and the missing live
terminal line remains intentionally unquoted.

---

## Whole Student Workspace Completion Review - 2026-07-17

### Scope and Evidence Rules

This completion review inventories the current signed-in Student routes in
`docs/security/student-route-manifest.json`. It separates source/static evidence
from disposable live proof. It does not read an environment file, make a paid
provider request, alter Provider routing, change migrations, or reuse production
users or records.

The prior disposable Assignment/Practice run remains the only recorded provider
execution evidence. Its literal final terminal PASS line was not retained, so no
new result is quoted or fabricated here. The current review did not rerun it.

### Route and Workspace Result

| Journey | Result | Evidence and remaining limit |
| --- | --- | --- |
| Student dashboard -> My Work | FUNCTIONAL | Every concrete `src/app/student/**/page.tsx` route has an active-Student server guard. My Work uses only active Student classroom memberships and assigned assignments. |
| My Work -> assignment detail -> Practice | FUNCTIONAL | Assignment detail loads selected item metadata, sent feedback, and a scoped `/practice?assignmentId=...` entry. Assignment start requires an active Student profile, assigned work, active membership, and an RLS-readable selected question. |
| Not started / in progress / completed | FUNCTIONAL | `student_assignment_progress` determines the three UI states; grade/review updates linked assignment evidence after writes succeed. |
| Resume | FUNCTIONAL_BUT_REQUEST_BOUND | Persisted sessions, rounds, attempts, and assignment links resume after successful writes. A model request still has no durable worker guarantee if the browser closes before persistence. |
| Classroom join | FUNCTIONAL | Page and server action both require an active Student and call the join-code RPC. Existing live Classroom evidence confirms removal prevents silent rejoin and classroom membership grants no Bank membership. |
| Feedback | FUNCTIONAL in assignment detail / PARTIAL in Progress | Only explicitly sent notes for the active assigned Student are selectable. `/student/progress` is a summary with a feedback-history placeholder rather than a consolidated feedback feed. |
| Study Library / Study Groups | MISSING by design | Guarded shells only; their backends are intentionally not implemented. |
| Public Library | FUNCTIONAL_BUT_UNPOLISHED | The Student entry point correctly leads to published `/questions`; it is not yet a full universal-library UI. |

No availability-window field is present in the canonical assignment model. My
Work correctly orders and displays `due_at`, but availability-window behavior is
therefore a **P2 product decision**, not an implemented entitlement. The current
queries also do not filter archived classroom state once an active membership and
assigned assignment remain; define whether archive hides outstanding work without
deleting history before changing this behavior. After membership removal, the
active-membership RLS contract removes Assignment access while retained personal
progress rows are not deleted. Whether completed history should remain visible
after removal is likewise a product decision.

### Assignment Entitlement and Revocation

Canonical `0028_assignment_from_bank_questions.sql` makes a private question
readable to a Student only when it is an `assignment_items` question in an
`assigned` assignment with an active Student classroom membership. Assignment
Practice queries this RLS-scoped question set only after validating the profile
as an active Student. It neither writes `bank_members` nor treats a classroom
membership as Bank membership.

The recorded disposable flow also checked the concrete contract: the selected
bank-private question loaded for the assignment, while source-Bank enumeration,
an unselected private question, Review Drafts, and Blueprints were denied. The
unrelated Student was denied the assignment and its progress rows. Assignment
revocation/removal is expected to fail closed because the helper requires
`assignment.status = 'assigned'` and `classroom_members.status = 'active'`; the
remaining completed-history rule is the explicit product decision above.

`startAssignmentPractice()` does not have a caller-provided idempotency key and
creates a new Practice session on each successful start request. This is not a
cross-user authorization breach, but duplicate clicks can split a Student's
assignment evidence across sessions. It is a **P2 reliability follow-up**:
choose either an active-session reuse contract or an explicit restart flow, then
add a duplicate-start live assertion. No automatic behavior change was made in
this audit.

### Cross-Student Isolation

The existing disposable harness covered Student access to the entitled
assignment, an unrelated Student's denial of the assignment/progress, anonymous
denial before provider resolution, and denial of source Bank, Review Draft,
Blueprint, unselected private question, and provider-management access. The new
source smoke inventories every Practice API and asserts all call
`requirePracticeApiUser()`; session, round, attempt, preference, and wrong-question
operations remain user-scoped in their data paths.

The approved disposable matrix ran after the 0048 correction. It covered a
same-Classroom Student, a same-organization unrelated Student, a
cross-organization Student, Teachers, a removed co-teacher, organization admin,
anonymous access, framework ownership, Assignment-linked evidence, and
Student-owned preference and wrong-question state. The matrix passed and every
fixture was removed by its exact captured identifier.

### P1 - Private Self-Study Evidence Isolation

**P1-STUDENT-01: COMPLETED / CLEAN-DB LIVE VALIDATED.**

The confirmed source defect was in `0008_practice_agent_evidence.sql`: the owner
**or** `private.is_org_staff(organization_id)` could access private Practice
evidence. Active Teacher/Admin organization membership does not require a shared
Classroom, a managed Assignment, or explicit Student sharing, and several of the
old policies also allowed staff mutation.

Forward-only canonical migration
`0047_practice_self_study_evidence_isolation.sql` supersedes those policy
families for `practice_sessions`, rounds, round questions, attempts, hints,
reflections, episodes, wrong questions, weakness links, preferences, and
preference merge jobs. The clean project catalog confirms its three helpers are
live with the expected security-definer, owner, search-path, and execute-grant
contract. It does not change existing rows or runtime code.

That catalog review also found two additional canonical `0009` policies:
`practice_sessions_teacher_select_course` and
`practice_agent_episodes_teacher_select_course`. Since Students can select an
active teacher-owned course framework for private self-study, these policies
allow framework ownership or admin status to bypass `0047` without an explicit
Assignment. `0048_practice_course_framework_evidence_isolation.sql` is the
required forward-only correction: it removes those two legacy read policies and
does not alter framework availability, data, Bank, Storage, Classroom,
Assignment creation, or Provider behavior.

The final contract is deliberately narrower:

- A Student reads and writes their own evidence.
- A Teacher reads only session-scoped evidence explicitly linked through
  `assignment_practice_sessions` to an Assignment they currently manage.
- Teachers cannot mutate Student answers, hints, reflections, or session state.
- Wrong-question history and long-term preference/merge records remain
  Student-owned because they can aggregate private self-study history.
- Same-Classroom Students, same-organization unrelated staff, removed
  co-teachers, organization admins, and anonymous callers receive no new raw
  self-study access. Service role remains a trusted operational path only.
- Existing assignment progress and sent Teacher feedback remain on their current
  explicit Assignment-scoped contracts; source Bank, Review Draft, Blueprint,
  and asset access remain separate.

`scripts/student-self-study-isolation-smoke.mjs` provides local embedded policy
coverage, including a Teacher-owned framework attached to Student A private
self-study. The framework Teacher and organization admin are denied both the
session and agent episode after `0048`.

The approved clean-project post-apply catalog result recorded legacy policy
count `0`, Assignment-manager policy count `2`, validated helper count `3`, and
RLS-enabled affected-table count `11`. The process-only disposable matrix then
passed the cross-student, cross-organization, Teacher, removed-co-teacher,
admin/staff, anonymous, framework-owner, Assignment-manager, browser-helper,
Bank/content-isolation, feedback/progress, and exact-ID cleanup assertions.

#### Implementation and Live Evidence

The focused embedded matrix passed after applying `0047` to an isolated local
Postgres fixture. It proved Student A create/read/update; reciprocal same-Class
Student isolation; same-organization unrelated Student/Teacher, removed
co-teacher, organization-admin, and anonymous denial; authorized
Assignment-manager read-only access; no Teacher answer mutation; owner-only
aggregate mistakes/preferences/merge records; existing Assignment progress and
sent-feedback behavior; no Bank membership side effect; and trusted service-role
access. This result contains no clean-project query, credentials, fixture IDs,
or production evidence. The later clean-project catalog and disposable role
matrix provided the sanitized live proof summarized above.

### Teacher Feedback and Evidence

Canonical `0032_teacher_feedback_notes.sql` limits Student reads to their own
`sent_to_student`/`sent` notes for active membership in an assigned classroom.
Private teacher notes stay manager-only. Student code has no feedback mutation
control. Assignment detail presents sent notes and the absence state without
exposing private-note state. After removal, the feedback policy also fails closed
because it requires active classroom membership.

### Question Asset Dependency

**Source implementation: COMPLETE.** Student-visible source uses the protected
`/api/question-assets/[assetId]` path. That route reads minimal asset metadata
server-side, asks the requesting user’s session to satisfy `can_read_question`,
and creates a short-lived signed redirect only after that authorization decision.
It uses `private, no-store` responses; signed URLs are not saved in Practice
snapshots/evidence. The lint guard rejects executable `.getPublicUrl()` calls
under `src/`.

**Live private-bucket Student validation: COMPLETED / CLEAN-DB LIVE VALIDATED.**
`0045` and `0046` were each applied manually exactly once and remain unledgered.
The clean database has exactly one private `question-assets` bucket, all nine
audited HTML/JSONB legacy public URL residual counts are zero, and the
requester-first asset matrix passed. No historical-data backfill was needed or
run; this does not claim production historical-data migration.

### Build, Prerender, and UI Review

The current branch production build completed successfully on 2026-07-17. The
previous `useContext`-null prerender report did not reproduce. The Student audit
branch differs from `origin/main` only in Practice remediation, audit, and smoke
inputs; it does not change global layout, auth page, error page, or build config.
No narrow build fix is justified without a reproducible root cause. Bundle
analysis is tracked separately in the validation record below.

Student navigation is consistent and has no Teacher management links. Assignment
detail includes back navigation, status, due date, start/continue/review copy,
missing-item handling, feedback, and a scoped Practice affordance. Remaining UI
items are P2: consolidated feedback history, real Study Library/Group surfaces,
an availability-window contract, archive/history decision, duplicate-start
handling, and a formal Practice React error boundary.

### Whole-Student Decision

**PARTIALLY COMPLETE / CORE GAPS REMAIN**

The critical Student Assignment -> Practice -> evidence workflow is implemented
and previously live validated with a disposable local fake provider. It does not
grant source-Bank or review/Blueprint visibility. P1-STUDENT-01 is now
independently **COMPLETED / CLEAN-DB LIVE VALIDATED** after `0047`/`0048` catalog
validation and the disposable role matrix. The Student workspace remains
**PARTIALLY COMPLETE / CORE GAPS REMAIN** because Study Library and Study Group
backends, consolidated feedback history, an availability-window contract,
archive/history behavior, duplicate-start handling, and a durable Practice
recommendation decision remain separate product work. P0-STORAGE-01 is also
independently completed; neither result declares the overall site
deployment-ready.

### Validation Record - 2026-07-17

Passed without an environment-file read:

- `npm.cmd run lint`
- `node scripts/student-workspace-completion-smoke.mjs`
- `node scripts/practice-provider-execution-smoke.mjs`
- `node scripts/security-smoke.mjs`
- `node scripts/migration-reconciliation-smoke.mjs`
- `node scripts/student-self-study-isolation-smoke.mjs` (local embedded Postgres;
  non-live)
- `node scripts/check-question-assets-public-url.mjs`
- `npm.cmd run build`
- `npm.cmd run analyze`
- `node scripts/route-smoke.mjs` against a temporary local server, then the
  server was stopped
- `npm.cmd run perf:budget`
- `npm.cmd run perf:audit`

The production build and analyzer both completed; the previously reported
`useContext`-null prerender failure did not reproduce. The three database-backed
Student smokes ran their static contracts then correctly reported **BLOCKED**
because disposable Supabase URL/key and role-fixture categories were not injected
as process-only variables:

- `node scripts/student-my-work-smoke.mjs`
- `node scripts/assignment-practice-evidence-smoke.mjs`
- `node scripts/assignment-from-bank-smoke.mjs`

They were not counted as live passes. The affected smoke scripts and
`route-smoke` were changed to use process-only environment input so future
operators cannot accidentally source ignored local environment files during this
validation. `npm.cmd run smoke` was also run; it passed its preceding static and
embedded checks, then stopped at the pre-existing process-environment gate in
`supabase-rls-smoke` because no disposable URL/key categories were injected.

`0047` and `0048` were each manually applied exactly once and remain unledgered.
The P1 live role matrix ran once after 0048 and passed with exact-ID cleanup.
No provider call, production-data read, or environment-file read occurred for
this validation. The overall website remains separately not deployment-ready.

---

## Final Student V1 Completion Gate - 2026-07-18

This section supersedes the earlier whole-workspace label for the narrower
Student V1 launch contract defined in
[`student-final-completion-gate.md`](student-final-completion-gate.md). It does
not reclassify intentionally deferred Study Library, Study Group, and broader
universal-library work as required V1 delivery.

**Final Student V1 classification: COMPLETED / LIVE VALIDATED.**

The required Student V1 workflow is implemented and its core security/data
ownership proof is complete:

- My Work and assignment detail are active-membership and assigned-work scoped;
  browser validation proved entitled work visibility and unrelated Assignment
  denial.
- Assignment Practice uses selected questions only, persists linked progress,
  resumes the same session after reload, restores submitted/completed answers,
  and does not grant Bank membership.
- Practice executes through an authenticated, server-only compatible/default
  provider resolver; normal Practice does not use the super-admin gateway or a
  durable AI worker job.
- Migrations `0043` through `0048` remain frozen and unchanged: `0043` retains
  `PARTIALLY_APPLIED_FAILED`, `0044` was applied manually exactly once, and
  `0045/0046/0047/0048` retain their clean-database live validation.
- `0047` and `0048` are frozen, applied manually exactly once, and clean-database
  live validated. Private self-study is Student-owned; assignment managers are
  read-only; staff, framework owner, co-teacher, unrelated Student/Teacher, and
  anonymous bypasses are denied.
- P0-STORAGE-01 is independently completed: protected selected assets work,
  unselected private assets and public URLs are denied, and signed URLs are not
  persisted.
- Private self-study browser validation proved creation, persistence, active empty
  state, immediate list visibility, same-session reload, and zero initial evidence.
- Logout, protected-route redirect, unauthenticated Practice API denial, hidden
  Teacher/Admin controls, safe error copy, and same-class Student isolation passed.

The final authenticated suite reported `PASS Student V1 browser E2E completed
with exact cleanup`. Cleanup, temporary-server shutdown, process-environment
clearing, and zero fixture residue all passed. It used no production identity or
data and did not replay migrations.

Assignment Practice and private self-study are **COMPLETED / LIVE VALIDATED**.
Practice is **FUNCTIONAL_BUT_REQUEST_BOUND / LIVE VALIDATED**. It uses the
configured enabled/default compatible Provider, which may be DeepSeek or Gemini
OpenAI-compatible depending on the environment. Deterministic grade uses no
Provider; no cross-Provider fallback or circuit behavior is claimed.

Accepted limitation: Practice model calls remain request-bound. Completed work
persists and resumes; an interrupted in-flight model call is not guaranteed to
complete after page close. This is not a V1 blocker unless the product promises
background completion.

One failed `PRACTICE_PREFERENCES` request was observed during the otherwise
passing private self-study journey. Required creation, persistence, active
session, list, reload, and zero-evidence assertions passed, so this remains
non-blocking P2 diagnostic debt.

P2 follow-ups remain: feedback aggregation, availability/archive/history
semantics, duplicate-start behavior, Study Library/Groups, a formal Practice
error boundary, generic classroom read-error copy, and the preference-request
diagnostic. The broader site is still not declared deployment-ready.
