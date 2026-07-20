# 10/25/50 PDF Load-Test Plan

Status: test specification; no live provider test is authorized by this document

Audit date: 2026-07-19

## 1. Purpose

Prove that a burst of 50 private PDFs is admitted, processed across two symmetric execution targets, persisted exactly once, and exposed only as Review Drafts. The test must expose capacity, retry, lease, routing, and persistence defects before billable or production traffic.

## 2. Test layers

### L0: deterministic local simulation

No network, credentials, Supabase, Vertex, or Vercel. Extend existing scheduler/load/circuit simulations with two fake project targets, a fake clock, deterministic latency, scripted 429/5xx/timeout responses, capacity leases, and idempotent output storage.

### L1: local browser/API integration

Use local fake HTTP providers and disposable local persistence. Exercise direct-upload reservation semantics with generated fixture metadata rather than real cloud Storage. Verify product state, Review Draft gate, and bounded UI summaries.

### L2: disposable preview infrastructure

Only after explicit approval: isolated preview database/storage/queue, Vercel preview deployment, and fake provider. Test deployment rollover, queue redelivery, OIDC subject isolation without invoking Vertex, and exact cleanup.

### L3: approved Vertex benchmark

Only after separate cost/security approval: synthetic non-sensitive PDFs in preview, concurrency one first, bounded budget, both target projects, and allowlisted telemetry. This task does not authorize L2 or L3.

## 3. Fixture corpus

Use synthetic or redistribution-safe PDFs. No student records, copyrighted test packets, or production files.

| Class | Pages | Size target | Content characteristic | Share |
|---|---:|---:|---|---:|
| Small text | 2-5 | under 2 MB | Clear text and equations | 30% |
| Medium mixed | 10-25 | 2-10 MB | Text, tables, diagrams | 40% |
| Long | 50-100 | 10-25 MB | Repeated sections and cross-page items | 20% |
| Image-heavy | 5-20 | 5-25 MB | OCR-needed pages | 10% |

Include duplicate visible question numbers, missing numbers, `3`, `3.1`, `3(a)`, cross-page continuations, invalid placeholders, and partial extraction. Database codes must remain server-generated.

## 4. Instrumentation

Record bounded aggregates only:

- burst/item/job counts by lifecycle state;
- active and maximum concurrency by target/model/operation;
- queue/admission wait and provider/stage latency percentiles;
- attempts, retry waits, lease recovery, cooldowns, circuits, fallback/escalation;
- message deliveries and duplicate deliveries;
- idempotent duplicate writes prevented and stale commits rejected;
- drafts, warnings, partial/failed items, zero-draft items;
- page/token/cost aggregates and embedding backlog;
- private/public exposure assertions.

Do not log PDF text, prompts, model output, signed URLs, credentials, IDs, user data, or cloud project identifiers.

## 5. Core scenarios

### A. Healthy active-active

- Submit 10, then 25, then 50 PDFs as one organization.
- Both targets have equal latency and capacity.
- Assert completed-job distribution differs by no more than one after steady state, unless measured capacity or latency explains the difference.
- Assert configured project/model/global concurrency is never exceeded.

### B. Unequal latency

- Target B p95 is twice target A.
- Assert no starvation and that capacity-aware routing sends more work to available A slots without exceeding A's limit.

### C. Project 429 cooldown

- Target A returns 429 for a bounded window with and without Retry-After.
- Assert A enters durable cooldown, B continues, no same-request storm occurs, and A re-enters through a bounded probe.

### D. Both projects pressured

- A and B return 429.
- Assert jobs enter durable retry wait, admission remains responsive, no infinite fallback loop occurs, and oldest-job alert fires.

### E. Worker loss and lease recovery

- Terminate a worker after provider success but before output commit.
- Terminate another after commit but before job completion.
- Assert lease recovery, fencing, and exactly one logical draft set.

### F. Duplicate delivery

- Deliver every queue signal twice and selected signals after deployment-version rollover.
- Assert one database execution lease and idempotent outputs.

### G. Quality escalation

- Primary returns contract-valid low-coverage output for allowlisted fixtures.
- Assert only qualified jobs escalate, escalation capacity/budget is respected, and unresolved conflicts become review warnings.

### H. OCR fallback

- Low-text detection selects only image-heavy pages.
- Assert ordinary PDFs never call OCR, OCR failure does not erase primary results, and partial drafts remain reviewable.

### I. Embedding backlog

- Slow or fail embeddings after drafts are ready.
- Assert Review Drafts remain available and the low-priority backlog retries independently.

### J. Authorization and publication

- Use two organizations and unrelated users in local/disposable tests.
- Assert cross-Bank source reads fail, students cannot browse source Banks, and no unreviewed draft is assigned or published.

## 6. Scale matrix

| Gate | Burst | Starting extraction concurrency | Required fault set | Promotion outcome |
|---|---:|---:|---|---|
| G10 | 10 PDFs | 1 per project | Healthy, duplicate delivery | Basic correctness |
| G25 | 25 PDFs | 1 per project, then 2 | 429 one project, worker loss, escalation | Approve 2+2 if clean |
| G50 | 50 PDFs | 2 per project | All core scenarios, mixed corpus | Production canary eligibility |

Run each L0 scenario at least 20 deterministic seeds and the complete G50 suite at least 100 scheduler seeds. Browser/integration repetitions should be sequential and use fresh contexts; no retry may conceal a first-attempt failure.

## 7. Pass/fail gates

All gates require:

- 100% burst items represented by one immutable source and one logical job;
- zero duplicate logical Review Drafts;
- zero stale-worker commits;
- zero concurrency-limit violations;
- zero unauthorized reads or public source URLs;
- zero auto-published or auto-assigned AI drafts;
- all final states explainable as completed, partial, failed, or cancelled;
- cleanup of disposable artifacts by exact ID when live disposable infrastructure is later authorized;
- temporary local servers and fake providers stop;
- no secret or content leakage in logs.

Reliability gates:

- healthy synthetic runs: at least 99% aggregate item completion across repetitions without manual retry, with every other item ending in a bounded explainable state;
- injected retryable faults: 100% reach completion or bounded final failure;
- 429 scenario: no target receives calls during cooldown except the allowed probe;
- duplicate delivery: every duplicate becomes a no-op or joins the same job;
- lease loss: recovered job completes exactly once.

Performance is measured before numeric production SLOs are frozen. Use:

```text
estimated_drain_time(N) = ceil(N / healthy_primary_slots)
                          * measured_pdf_p95
                          * 1.25 recovery margin
```

G50 fails if measured drain time exceeds the approved launch SLO or if queue age grows after input stops. Do not manufacture an SLO before representative `measured_pdf_p95` exists.

## 8. Model-quality gates

For a labeled synthetic corpus, compare by model and parser contract:

- question boundary precision/recall;
- answer/choice structure validity;
- source-page attribution;
- equation preservation;
- warning and zero-draft rate;
- reviewer edit distance and rejection rate;
- cost and p95 latency per PDF/page.

`gemini-3.1-flash-lite` becomes primary only if it meets the agreed quality floor. `gemini-3.5-flash` becomes escalation only if it materially improves qualified failures. OCR candidates are enabled only if they improve image-heavy fixtures without weakening privacy or cost gates. Embedding model selection has a separate retrieval benchmark.

## 9. Local source checks to reuse

Existing non-provider foundations include:

- `scripts/durable-ai-job-queue-load-smoke.mjs`
- `scripts/ai-jobs-scheduler-simulation.mjs`
- `scripts/ai-provider-fallback-circuit-breaker-smoke.mjs`
- `scripts/ai-provider-fallback-chaos-smoke.mjs`
- `scripts/ai-provider-resilience-smoke.mjs`
- `scripts/ai-operations-launch-readiness-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/supabase-rls-smoke.mjs`
- `scripts/route-smoke.mjs`
- `npm.cmd run perf:budget`

Future tests must add two-target capacity accounting, project cooldown, exact-job queue signals, stage checkpoints, direct-upload burst admission, idempotent draft persistence, Vercel deployment rollover, and OIDC environment isolation.

## 10. Test execution order

1. Source/contract smokes and deterministic L0 tests.
2. G10 healthy and duplicate delivery.
3. G25 with one-project failure and lease recovery.
4. G50 full fault matrix.
5. L1 local browser product boundaries.
6. L2 disposable Vercel/fake-provider tests after approval.
7. L3 smallest approved Vertex benchmark, then 10/25/50 only if cost and quota allow.

Stop immediately on credential leakage, cross-organization access, public source exposure, auto-publish, duplicate outputs, stale commits, uncontrolled retries, or cleanup uncertainty.

## 11. Evidence package

For each gate, retain sanitized configuration version, source commit, fixture manifest hashes, seed, aggregate results, max concurrency, routing distribution, failure injections, recovery outcomes, cost estimate, and cleanup classification. Evidence must not include raw PDF content, provider output, identities, URLs, credentials, or database rows.
