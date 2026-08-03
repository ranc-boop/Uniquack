# PDF50 Local Operational Recovery

## Scope

This design makes the current local-development architecture operable without
introducing a deployment platform or a second queue:

```text
local Teacher browser
-> local Next.js control plane
-> Current Clean Supabase Auth / DB / private Storage
-> durable ai_provider_jobs queue
-> one local worker wake-up loop
-> configured remote Provider
-> private bank-scoped Review Drafts
```

Supabase remains the source of truth for admission, jobs, leases, fencing,
checkpoints, source lineage, and draft persistence. The local runner only wakes
the authenticated internal worker route. Provider output never becomes a Bank
question, publication, or Assignment without the existing review workflow.

## Root Causes

1. The local runner had only a process-local in-flight guard. Two terminals
   could create duplicate wake-up pressure even though database claims remained
   fenced.
2. The worker route had no exact one-job proof mode, so a validation invocation
   could consider unrelated work.
3. Provider attempts were not paired with a single lifecycle ledger covering
   file upload, status polling, inference, and file cleanup.
4. Gemini PDF inference returned its promise from inside `try` without awaiting
   it. JavaScript could therefore enter `finally` and delete the remote file
   before inference had completed.
5. Output-token and transport-request ceilings were not enforced at the
   Provider adapter boundary.
6. OpenAI-compatible PDF, Blueprint observation, and Blueprint generation calls
   did not share equivalent usage and execution accounting.
7. Optional LLM diagnostics could retain raw strings such as prompts, source
   text, filenames, identifiers, or Provider output.
8. The Teacher burst UI could remain on browser-local queue state after the
   durable job had advanced.

## Runtime Decisions

### One local runner

The runner uses an atomic, route-scoped directory lock in the operating-system
temporary directory. Stale takeover first atomically renames the old lock into
a process-specific quarantine path, then removes it. Concurrent stale-lock
recovery has one winner. Server-side atomic claim, lease ownership, fencing,
and checkpoints remain authoritative.

### Per-job Provider ledger

One execution observer is created for each claimed job and passed through AI
PDF extraction, coverage recovery, Blueprint observation, and Blueprint
generation. It records:

- Provider lifecycle attempts;
- actual inference HTTP requests;
- upload start/finalize requests;
- status polls;
- cleanup requests and cleanup failures;
- total Provider network requests;
- the configured output-token ceiling.

Attempt and inference-request counts are intentionally distinct. A failed file
upload consumes an attempt and upload request, but it does not fabricate an
inference request.

The safe aggregate is persisted for completed, retry-wait, and failed jobs. It
contains counts only, never URLs, keys, filenames, prompts, source content, or
raw Provider responses.

### Bounded real-Provider proof

The explicit `BOUNDED_ONE_JOB_REAL_PROVIDER` mode is accepted only when all
server-owned process controls exactly match the reviewed contract:

| Control | Bound |
| --- | ---: |
| Claimed jobs | 1 |
| Worker route invocations | 1 |
| Provider attempts | 4 |
| Output tokens per inference | 8,192 |
| Provider HTTP requests | 136 |
| Approved total test budget | USD 5 |

The 136-request ceiling covers four complete worst-case Gemini file lifecycles:
two upload requests, 30 polls, one inference request, and one cleanup request
per attempt.

The known `gemini-2.5-flash-lite` catalog rates and a 1,048,576-token input
window yield a conservative maximum of 432,540 micro-USD (about USD 0.433) for
the four-attempt proof. The route refuses the proof if this upper bound exceeds
the approved USD 5 budget. Actual Provider telemetry must also be present and
remain below USD 5 after completion.

### Provider lifecycle ordering

Gemini Native PDF now follows this order:

```text
reserve attempt
-> upload session request
-> file upload
-> bounded activation polls
-> bounded inference request
-> parse bounded response
-> remote file cleanup
```

The inference promise is awaited before `finally` performs cleanup. Cleanup
failure is recorded independently and cannot expose raw Provider details or
mask a successful import. The bounded proof does not pass when cleanup fails.

### Truthful Teacher status

The Teacher burst component polls while any durable item is active and
reconciles browser-local state with the server state by client item key. Status
copy distinguishes admission readiness, trusted-worker queueing, processing,
completion, and safe failure. The job panel can show draft, attempt, and
Provider-request counts from safe result metadata.

## Failure and Recovery

- Transient Provider failures use the existing retry-wait state and durable
  retry policy.
- Permanent failures remain failed with safe copy.
- Both paths persist bounded lifecycle counters.
- The real proof verifies that any partial question remains private, draft,
  bank-owned, review-gated, unpublished, and unassigned.
- Fence loss still prevents stale persistence.
- Checkpoints and deterministic persistence lineage prevent duplicate drafts.
- Closing the local runner does not remove the durable job; a later authorized
  runner can resume eligible work.

## Privacy Boundary

- Provider and Supabase credentials remain server/process-only.
- The browser never receives Provider credentials or the internal worker token.
- Optional debug diagnostics fingerprint strings and cap object/array breadth.
- Safe errors contain no raw status payload, URL, key, source text, filename,
  prompt, or Provider response.
- Synthetic source files and database rows are removed by exact identifier.

## Progression Gates

| Gate | Required evidence |
| --- | --- |
| 1 file | Real browser upload, durable claim, Provider completion, private Review Draft, exact cleanup |
| 4 files | Mixed completion/failure, no duplicate drafts, bounded queue drain |
| 10 files | Recovery and retry distribution, queue age, cost and cleanup accounting |
| 50 files | Admission, drain time, Provider quota behavior, interruption recovery, zero residue |

Passing one file establishes operational path correctness only. It does not
establish 50-file throughput or production readiness.

## Blueprint Implication

Blueprint observation and generation now participate in the same Provider
attempt/request/output-token accounting. This does not change the product
boundary: AI Parsing observes source evidence, Blueprint consumes observations,
and generated questions still enter bank-scoped Review Drafts.

## No Schema Change

No migration is added or modified. The solution consumes the existing 0050
admission model and 0051 fencing/checkpoint contract. A hosted run must stop at
readiness preflight if those live capabilities are absent or partial.

## Bounded Live Evidence

The recovery started from authoritative `origin/main` commit
`ebf7ea95eb99c7f52448fb6a306e334d3f7c027f`. The approved credential vault was
loaded through Windows DPAPI for the current Windows user and computer. The
launcher reported only presence classifications and cleared every process-only
value after each run.

The final one-file run established the following path:

| Stage | Result |
| --- | --- |
| Hosted readiness and known-cost gate | PASS |
| Real Teacher browser upload | PASS |
| Private, bank-scoped durable job creation | PASS |
| Exact one-job local worker invocation | PASS |
| Provider upload lifecycle | PASS |
| Provider inference request | PASS at transport level |
| Provider remote-file cleanup | PASS |
| Importable validated extraction | BLOCKED |
| Bank-scoped Review Draft persistence | NOT REACHED |
| Teacher-visible completed import | NOT REACHED |
| Publication or Assignment creation | NONE |
| Exact-ID fixture cleanup | PASS |
| Process-environment cleanup | PASS |

The final counted lifecycle was one inference attempt, one inference request,
two upload requests, one cleanup request, zero cleanup failures, and four total
Provider network requests. The configured Gemini Native PDF endpoint rejected
the generation request with HTTP 400, represented only by the allowlisted safe
code `request_invalid`. No raw response body was returned to the Teacher,
written to the report, or emitted by the harness.

Earlier bounded runs proved the plain JSON request could reach generation, but
the returned text did not yield an importable validated question within the
bounded repair budget. Compatibility experiments using `responseJsonSchema`,
the deprecated `responseSchema`, and the current `responseFormat` request form
were each rejected with the same safe `request_invalid` classification. Those
known-rejected request forms are not retained in the production adapter. The
adapter remains on `application/json` response mode while the exact configured
endpoint and schema compatibility is unresolved.

Eight Provider-active launcher runs were recorded during this recovery. Each
passed a conservative preflight upper bound of 432,540 micro-USD. Summing those
launch-level ceilings gives a conservative total upper bound of 3,460,320
micro-USD, or USD 3.46032, below the approved USD 5 total. This is deliberately
more conservative than actual usage. The first two diagnostic runs stopped
before trustworthy per-job counters were available, so the report does not
invent exact billed usage for them.

## Progression Result

The one-file gate is partial, not complete. Upload, durable queueing, exact
worker execution, Provider lifecycle cleanup, private bank scope, no automatic
publication, no Assignment creation, and exact cleanup are proven. Validated
question extraction and Review Draft persistence are not proven.

The 4-file, 10-file, and 50-file runs were not started because progression is
strictly gated on a complete one-file result. Therefore this work does not
establish queue-drain throughput, 50-file completion time, or production
capacity.

Admin AI parsing was not paid-tested. Teacher AI PDF upload was exercised
through the real browser path. Blueprint execution received the same source
accounting controls in code, but no paid Blueprint Provider call was made and
its existing Review Draft boundary remains unchanged.

## Remaining Blocker

The configured Gemini Native PDF `generateContent` request is not yet producing
an importable extraction under the bounded adapter contract. In plain JSON mode
the response failed import validation; the reviewed structured-output request
forms were rejected as invalid requests. Because raw Provider payloads are
intentionally suppressed, the evidence supports this narrow classification but
does not justify guessing which schema keyword, endpoint profile, or model
capability caused the rejection.

The next approved change should be a separate, synthetic capability probe that:

1. sends no user material and uses a tiny fixed schema;
2. records only an allowlisted rejection category and catalog usage metadata;
3. determines the exact structured-output contract accepted by the configured
   endpoint and model;
4. progressively adds the extraction schema until the incompatibility is
   isolated; and
5. requires a fresh Provider-test budget authorization before another real PDF
   run.

Only after the one-file extraction and private Review Draft complete should the
4, 10, and 50-file progression resume.

## Rollback

The recovery is source-only and adds no migration or live configuration. It can
be rolled back by reverting the recovery commit. Existing durable jobs, review
gates, Bank ownership, publication rules, and Assignment rules remain the
database source of truth.

## Validation Matrix

The final source state passed:

- `npm.cmd ls --depth=0`;
- `npm.cmd run lint`;
- `npm.cmd run build` twice;
- `npm.cmd run perf:audit`;
- `npm.cmd run analyze`;
- local worker singleton, stale-lock, and local-target smoke;
- Provider lifecycle source and fake-runtime budget smokes;
- DPAPI vault and real-E2E safety contract smokes;
- PDF50 admission, direct-upload, private-asset, 0050 adoption, and 50-item
  load simulations;
- checkpoint source/load, crash-recovery, immutable fencing, and scheduler
  simulations;
- canonical migration governance and reconciliation smokes;
- security smoke; and
- route smoke across Admin, Teacher, Student, public, and internal worker
  boundaries.

`npm.cmd run perf:budget` reported one unrelated existing baseline failure:
`src/components/practice/practice-agent-client.tsx` is 116.5 KB against its
96.0 KB source budget. This branch does not modify that file or Student Practice
behavior. Route chunk budgets and all other performance-budget checks passed.

The aggregate smoke was not represented as passing. Its existing RLS and
database harnesses load `.env.local` and may connect to Supabase. One direct
attempt to run the existing internal-route database smoke loaded zero values
and stopped on its missing-environment gate before any hosted connection. It
was not rerun. No Provider-backed, database-mutating, 4-file, 10-file, or
50-file test was run after the final one-file blocker.

## Operations And Residue

- Migrations added, edited, or applied: 0.
- Deployments: 0.
- Provider settings changed: 0.
- Existing non-synthetic queue jobs mutated: 0.
- Synthetic fixture cleanup: PASS by exact identifier on every reported run.
- Provider-side file cleanup: PASS in the final counted run.
- Process-only environment cleanup: PASS.
- Vault plaintext files created: 0.
- Provider raw responses emitted or persisted: 0.
- Automatic publication or Assignment creation: 0.

## Classification

`PDF50_PARTIALLY_OPERATIONAL_WITH_IDENTIFIED_BLOCKERS`
