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
9. The configured Gemini Developer API `generateContent` surface rejects the
   `responseFormat.text` representation and rejects the otherwise-compatible
   extraction schema when `questions.maxItems` is present.
10. A failure while recording a successful Provider route outcome could
    retroactively turn already-persisted Review Draft work into an
    `unknown_provider_error` terminal result.

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
server-owned process controls exactly match
`src/lib/ai-jobs/pdf50-provider-proof-control.json`. The runtime, launcher,
live harness, and smoke tests consume or validate that contract rather than
copying its values. `node scripts/pdf50-provider-proof-control-report.mjs`
prints the active sanitized limits and conservative cost ceiling. The request
ceiling remains fail-closed, and actual Provider telemetry must be present and
remain below the contract budget after completion.

### Gemini structured output

The configured production surface is the Gemini Developer API raw REST
`v1beta` `models.generateContent` endpoint with model
`gemini-2.5-flash-lite`. No Google Gen AI SDK is installed. The accepted
structured-output representation is:

```json
{
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseJsonSchema": {}
  }
}
```

The Provider-facing schema intentionally omits `questions.maxItems`, which the
configured endpoint rejected. The application Zod contract still enforces one
through 200 importable questions after JSON parsing, so removing that Provider
keyword does not weaken semantic validation or the Review Draft gate.

Successful route-outcome telemetry is best-effort. A telemetry write failure
may leave the circuit state conservative until a later request, but it cannot
invalidate Provider output and Review Drafts that have already passed their
transactional persistence boundary. Failure outcome telemetry remains
best-effort as before.

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

The Teacher burst component keeps three separate values: local upload phase,
an optional local transport warning, and the latest authoritative durable item
snapshot. Once a durable lifecycle outcome is known, it controls the displayed
status. Durable completion, failure, and cancellation override stale local
states; a delayed local failure cannot downgrade completion. An interrupted
finalize response remains a non-authoritative warning while polling continues.
Durable snapshots are monotonic and retained across delayed responses, while a
refresh or remount restores status directly from the server. Status copy still
distinguishes admission readiness, trusted-worker queueing, processing,
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

Before review, authoritative main advanced to
`26694e14953ae71a6c0e3a4571443e59bb8acc6f` with an independent Practice
loading optimization. It was integrated through normal merge commit
`57e3f453d15125bbd567a8a21aee64efb90cc9a5`; the shared aggregate smoke file
retains both the new Practice check and all three PDF50 recovery checks.

### Synthetic compatibility probe

The synthetic probe established the exact configured surface and transport:

| Contract | Result |
| --- | --- |
| Provider surface | Gemini Developer API raw REST `v1beta` `models.generateContent` |
| Model | `gemini-2.5-flash-lite` |
| Google Gen AI SDK | Not installed or used |
| Plain text | PASS |
| `application/json` without schema | PASS |
| `responseFormat.text`, tiny object | REJECTED, HTTP 400 `INVALID_ARGUMENT` |
| `responseFormat.text`, tiny array | REJECTED, HTTP 400 `INVALID_ARGUMENT` |
| `responseMimeType` plus `responseJsonSchema`, tiny object | PASS |
| `responseMimeType` plus `responseJsonSchema`, tiny array | PASS |
| Progressive extraction fields | PASS through every individual field |
| Full extraction schema with `questions.maxItems` | REJECTED |
| Production schema without Provider `maxItems` | ACCEPTED in the one-file E2E |

The allowlisted rejection path for `responseFormat.text` was
`generation_config.response_format.text.mime_type`. No raw Provider response,
request content, key, URL, profile identifier, or credential was printed. The
probe made 18 inference requests and 18 Provider network requests. Every
accepted response included usage metadata. Its observed estimated cost was 701
micro-USD; its fail-closed conservative ceiling was 589,842 micro-USD.

The application did not remove its semantic question bound. The Provider
schema omits the incompatible keyword, while the existing Zod validator still
requires between one and 200 importable questions before persistence.

### One-file Teacher PDF evidence

After selecting the accepted transport and omitting the incompatible Provider
keyword, the bounded one-file run established:

| Stage | Result |
| --- | --- |
| Hosted readiness and known-cost gate | PASS |
| Real Teacher browser upload | PASS |
| Private, bank-scoped durable job creation | PASS |
| Exact one-job local worker invocation | PASS |
| Provider upload lifecycle | PASS |
| Structured Provider inference | PASS |
| Application extraction validation | PASS |
| Private Bank Review Draft persistence | PASS, exactly one draft |
| Review state | `pending_review`, private and bank-scoped |
| Bank approval, publication, or Assignment creation | NONE |
| Worker terminal completion | BLOCKED after `drafts_persisted` |
| Provider remote-file cleanup | PASS |
| Exact-ID fixture cleanup | PASS |
| Process-environment cleanup | PASS |

The counted lifecycle was one inference attempt, one inference request, two
upload requests, one cleanup request, zero cleanup failures, and four total
Provider network requests. The failed terminal record retained the
`drafts_persisted` checkpoint and the harness independently confirmed one
private, bank-owned Review Draft with no active Bank question and no Assignment.
The safe terminal code was `unknown_provider_error`; no raw Provider response
or credential-bearing value was returned to the browser, persisted in evidence,
or emitted by the harness.

### Post-persistence terminal defect

The route wrapper awaited success-outcome telemetry after the Provider work had
returned. If `record_ai_provider_route_outcome` failed, that non-authoritative
telemetry exception could replace the successful result even though the Review
Draft transaction had already completed. A focused regression reproduced that
exact sequence: the synthetic `execute` callback returned persisted work, the
success telemetry RPC failed, and the wrapper threw. The production wrapper now
treats success-outcome telemetry as best-effort, matching its existing failure
telemetry behavior. The regression proves persisted work survives the same
telemetry failure.

No additional real-Provider E2E was run after this patch. The fresh task's
conservative authorized sequence was already bounded at 983,061 micro-USD:

| Authorized step | Conservative ceiling |
| --- | ---: |
| Compatibility matrix | 589,842 micro-USD |
| Earlier bounded one-file attempt | 262,146 micro-USD |
| Final one-attempt one-file run | 131,073 micro-USD |
| Total | 983,061 micro-USD |

This is below the USD 1 hard ceiling, but leaves no safe conservative allowance
for another run. The report therefore does not claim that the source-level
terminal fix has been live-confirmed.

### Autonomous completion loop from `994d198`

The later autonomous completion task began at reviewed head
`994d1980bc41bfde4c0d707ae6b694dbb5e5848e`. Seven additional one-file runs
used only run-scoped synthetic Teacher, organization, Bank, PDF, queue job, and
Review Draft fixtures. Every run claimed exactly one job, performed one Gemini
inference request, issued four counted Provider HTTP requests, completed
Provider-file cleanup, removed database and Storage fixtures by exact
identifier, and cleared process-only values.

The iterations narrowed the remaining failure without repeating an unchanged
run:

| Iteration | Authoritative result | Narrow correction before the next run |
| ---: | --- | --- |
| 1 | Draft persisted, then non-authoritative success telemetry failed after `drafts_persisted` | Made successful route-outcome telemetry best-effort after persisted output |
| 2 | Post-persistence review annotation still replaced a successful extraction outcome | Made coverage and boundary annotations advisory |
| 3 | Safe diagnostics localized the failure to fenced batch finalization | Added bounded finalization-stage and reason diagnostics |
| 4 | Final summary exceeded the fenced RPC payload contract | Added safe summary-byte and field-size evidence |
| 5 | Execution-only plans accounted for the oversized summary | Deterministically compacted transient plans into bounded hash metadata while retaining final review and lineage evidence |
| 6 | Durable job reached `completed`; the harness stopped while reading batch lineage | Added bounded, labeled, read-only evidence retries and predicate labels |
| 7 | Durable job and imported batch passed; lineage keys were present and unique, but a one-page extraction had empty `page_refs` | Inferred page 1 only when the Provider was supplied exactly one page; multi-page omissions remain unchanged and review-gated |

The seventh run proved the durable job terminal state, imported batch status,
Bank/source scope, source-asset lineage, imported items, and unique persistence
lineage keys. It stopped at the page-lineage predicate before the later Review
Draft and Teacher UI predicates. Earlier runs independently proved that
persisted output remained private, bank-scoped, `pending_review`, unapproved,
unpublished, and unassigned.

The single-page correction is source- and fake-Provider-tested across direct,
segmented, and coverage-recovery extraction paths. It preserves Provider page
references when present and refuses to infer a page for multi-page inputs. It
was not followed by another paid run: seven runs consumed a cumulative
conservative ceiling of 917,511 micro-USD (USD 0.917511), leaving less than the
131,073-micro-USD ceiling required for one additional bounded run. Actual
input, output, and thinking token totals and actual cumulative estimated cost
were not retained safely before exact cleanup and are therefore not claimed.

## Progression Result

The one-file gate remains partial. Upload, private Storage, durable queueing,
exact one-job worker execution, Gemini structured extraction, application
validation, private Review Draft persistence, durable job completion, Provider
cleanup, Bank scope, no automatic publication, no Assignment creation, and
exact cleanup are proven across the bounded iterations. The final single-page
lineage correction, Teacher-visible completed state, and refresh/remount
continuity are not proven by a later real-Provider run.

The 4-file, 10-file, and 50-file runs were not started because progression is
strictly gated on a complete one-file result. Therefore this work does not
establish queue-drain throughput, 50-file completion time, or production
capacity.

Admin AI parsing was not paid-tested. Teacher AI PDF upload was exercised
through the real browser path. Blueprint execution received the same source
accounting controls in code, but no paid Blueprint Provider call was made and
its existing Review Draft boundary remains unchanged.

## Remaining Blocker

Gemini structured extraction and durable terminal completion are no longer the
remaining blockers. The remaining gate is a new bounded one-file run that must
prove the single-page lineage correction, continue through private Review Draft
and publication-gate checks, show the Teacher-visible completed import, and
retain that state after refresh/remount. This task stopped before that run
because its remaining conservative authorization budget was insufficient. No
4-, 10-, or 50-file run may start before the complete one-file gate passes.

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
- `npm.cmd run perf:budget` on the final integrated branch;
- `npm.cmd run perf:audit`;
- `npm.cmd run analyze`;
- single-page lineage inference and multi-page fail-closed regression smoke;
- terminal-summary compaction and post-persistence diagnostic smokes;
- local worker singleton, stale-lock, and local-target smoke;
- Provider lifecycle source and fake-runtime budget smokes;
- Provider routing regression proving telemetry failure cannot invalidate
  successful persisted work;
- Gemini structured-output compatibility probe safety and fail-closed smokes;
- DPAPI vault and real-E2E safety contract smokes;
- PDF50 admission, direct-upload, private-asset, 0050 adoption, and 50-item
  load simulations;
- checkpoint source/load, crash-recovery, immutable fencing, and scheduler
  simulations;
- canonical migration governance and reconciliation smokes;
- security smoke; and
- route smoke across Admin, Teacher, Student, public, and internal worker
  boundaries.

Before latest main was integrated, `npm.cmd run perf:budget` reported an
unrelated existing Practice source-size failure. The independently merged main
optimization reduced `src/components/practice/practice-agent-client.tsx` to
87.2 KB against its 96.0 KB budget. The final integrated branch passes the full
performance budget without any PDF50-side exception.

Several source-string smokes retain pre-existing failures reproduced on the
exact clean starting head `994d198`: Bank-scoped import bridge UI copy,
boundary/duplicate Review-list copy, AI Parsing recent-import copy, Review
Draft action source shape, and the route smoke's `/videos` title literal. The
PDF50 branch does not change the corresponding product surfaces and does not
weaken or rewrite those unrelated assertions.

The aggregate smoke is not represented as passing. Its static and source-only
checks passed until the local embedded-Postgres profile-role harness reached
Windows `initdb`; restricted-token initialization failed before the database
test started. No environment file was loaded and no hosted connection was made.
No Provider-backed, database-mutating, 4-file, 10-file, or 50-file test was run
after the final one-file blocker.

## Operations And Residue

- Migrations added, edited, or applied: 0.
- Deployments: 0.
- Provider settings changed: 0.
- Existing non-synthetic queue jobs mutated: 0.
- Synthetic fixture cleanup: PASS by exact identifier on all seven autonomous
  runs.
- Provider-side file cleanup: PASS on all seven autonomous runs.
- Process-only environment cleanup: PASS.
- Vault plaintext files created: 0.
- Provider raw responses emitted or persisted: 0.
- Automatic publication or Assignment creation: 0.

## Classification

`PDF50_AUTONOMOUS_RECOVERY_PARTIALLY_COMPLETE`
