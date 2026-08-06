# Gemini PDF50 Scale Qualification

## Source baseline

- Approved recovery PR: `#227`
- Approved recovery head: `94925557301fe35dea3a62e84ee829ab3072db2f`
- Recovery merge commit: `f229f0fb2396b2bf12661d5a0f40b2b3a57b480a`
- Scale branch base: `f229f0fb2396b2bf12661d5a0f40b2b3a57b480a`
- Authoritative main at branch creation: `f229f0fb2396b2bf12661d5a0f40b2b3a57b480a`
- Scale branch: `codex/pdf50-scale-qualification`
- Scale Draft PR: `#228`

PR `#227` was merged through a normal GitHub merge commit. Its exact approved
head is an ancestor of the scale branch base.

## Qualification contract

The qualification progresses in order:

1. Four-file baseline.
2. Ten-file recovery and mixed-state validation.
3. Fifty-file maximum admission, bounded drain, UI reconciliation, and exact
   cleanup.

Every live run uses fresh, run-scoped synthetic Teachers, organizations, a
private Bank, small educational PDFs, import records, durable jobs, and Review
Drafts. Trusted worker execution must be constrained to that exact run. The
cleanup path removes fixtures by exact identifier and verifies zero run-scoped
residue without inspecting or mutating unrelated queue work.

The qualification harness uses the existing Windows-user DPAPI credential
vault and process-only values. It never reads an environment file. Each local
worker invocation carries one exact synthetic job identifier. The server owns
two immutable test contracts: the frozen one-file terminal contract permits one
inference, while the scale contract permits at most three inferences so one
schema-repair attempt and one bounded transient retry can run. Both permit
exactly one claimed job and one worker-route invocation per process, cap output
at 4,096 tokens, cap Provider HTTP requests at 68, and require an exact target
job identifier. Scale mode also enforces a 50,000-byte Provider-input envelope
before any upload or inference request.

The ten-file stage deliberately interrupts one synthetic job only after its
normalized Provider output has been protected by the durable checkpoint. A
natural retry must replay that checkpoint with zero additional Provider
inference, while a mutation using the prior lease owner/fence must return
`STALE_FENCE_REJECTED`. The remaining unstarted item is cancelled through the
Teacher browser surface, producing a predefined 9-completed/1-cancelled batch.

The fifty-file stage first selects 51 files without submitting them and requires
the browser maximum to reject the selection with zero durable rows. It then
admits exactly 50 synthetic one-page PDFs, releases waiting items only for the
exact burst, and invokes the trusted worker one exact job at a time.

## Frozen product boundaries

- Gemini Developer API raw REST `v1beta` `models.generateContent`.
- Model `gemini-2.5-flash-lite`.
- Structured output uses `responseMimeType: application/json` and
  `responseJsonSchema`.
- Provider schema omits `questions.maxItems`; application validation retains
  the one-through-200 question bound.
- Provider inference is awaited before Provider-file cleanup.
- Outputs remain private, Bank-scoped Review Drafts in `pending_review`.
- No AI output is approved, published, or assigned automatically.
- No migration, deployment, dependency, Provider setting, billing, quota,
  routing, credential, or environment-file change is part of qualification.

## Provider budget ledger

- Authorized fresh cumulative ceiling: USD 2.00.
- Explicit reassessment threshold: USD 1.60 conservative cumulative spend.
- Known live scale iterations: 14.
- Trustworthy actual estimate for the passing terminal iteration: 3,794 micros.
- Cumulative actual spend: `UNKNOWN` because failed iterations did not all
  reach complete usage telemetry.
- Conservative cumulative ceiling consumed: 1,866,721 micros (USD 1.866721).
- Remaining authorized budget: 133,279 micros (USD 0.133279).

Future scale runs use a 50,000-byte upper envelope covering the prompt,
structured-output schema, synthetic PDF bytes, and fixed request overhead. The
server rejects an oversized proof input before upload or inference. Treating
that byte envelope as the input-token ceiling, plus the server-owned 4,096
output-token limit, remains conservative for these exact small synthetic
sources. Scale execution permits at most three attempts per completed job. At
current source-defined Gemini rates this bounds a fresh stage as follows:

- Four files: 79,668 micros (12-attempt ceiling; already passed and not rerun).
- Ten files: 179,253 micros (27-attempt ceiling for nine Provider jobs).
- Fifty files: 497,925 micros (75-attempt aggregate ceiling: one attempt for
  every job plus 25 bounded repair/retry attempts).
- The attempted fifty-file run consumed its 497,925-micros ceiling, leaving
  133,279 micros of the authorization. That remainder is below even the
  331,950-micros one-attempt-per-file minimum for a fresh 50-file run.

The fifty-file aggregate allowance is intentionally lower than the sum of 50
independent three-attempt maxima. The server still enforces at most three
attempts for every exact job. Before each worker invocation, the harness
reserves one attempt for every unprocessed job and refuses the invocation if
the 75-attempt stage ceiling could be crossed. This permits 25 total
repair/retry attempts while establishing a credible hard maximum below the USD
2 authorization. Crossing USD 1.60 was explicitly reassessed before the first
fifty-file run. That run remained useful because it was the only remaining
required file-count gate. It has now run once; no further paid run is authorized
by the remaining conservative budget.

Unknown usage remains `UNKNOWN`; it is never converted into a zero-cost claim.
Before each paid run, the harness must calculate a credible maximum and stop if
that maximum would exceed the remaining authorized budget.

## Parsing-quality reconciliation

The partial fifty-file evidence predates versioned attempt-reason
observability. Its 48 inference requests for 23 completed jobs prove 25 extra
attempts occurred, but do not prove whether they were structural repairs,
semantic recovery, transient transport retries, fallback attempts, or durable
retry waits. Those attempts are now recorded as `LEGACY_REASON_UNKNOWN`; no
retroactive attribution is permitted.

The stacked parsing-quality treatment adds a Provider-neutral, enum/numeric-
only observatory, deterministic Golden Corpus, exact taxonomy abstention,
reason-specific source reuse, and deterministic visual attachment safety. It
does not rerun or alter this paid scale result. The remaining USD 0.133279 is
still below the minimum credible ceiling for a new 50-file run, and the prior
text-heavy fixtures do not qualify as visual-attachment evidence.

## Evidence status

| Stage | Status | Live iterations | Provider attempts | Result |
| --- | --- | ---: | ---: | --- |
| Four files | `PASS` | 5 | At least 11; exact failed-run total `UNKNOWN` | 4/4 terminal, UI, isolation, invariants, and cleanup passed |
| Ten files | `PASS` | 8 | At least 38; earlier failed-run total `UNKNOWN` | 10 admitted, 9 completed, 1 deliberately cancelled; recovery, mixed state, UI, isolation, invariants, and cleanup passed |
| Fifty files | `PARTIAL_PROVIDER_ATTEMPT_CEILING_REACHED` | 1 | 48 | 50 admitted and 51st rejected; 23 completed before the aggregate attempt reservation failed closed |

Passing admission alone is insufficient. Each stage must verify durable item
states, batch aggregation, Review Draft identity, UI reload/remount behavior,
fencing and idempotency, isolation, Provider cleanup, exact fixture cleanup,
and zero residue.

### Four-file live evidence

Five fresh synthetic iterations were required. Every iteration completed
exact-ID database, Storage, Auth, Provider-file, local-process, and environment
cleanup with zero synthetic residue.

1. The first iteration stopped at batch terminal evidence. The harness was
   corrected to coerce PostgREST counters numerically and require both the
   durable burst aggregate and all item terminal states.
2. The second iteration proved all four items remained queued and that no
   worker had run. The drain loop was reading the nonexistent
   `control.completed` field instead of the stage-specific completion bound;
   a safety assertion now rejects that regression.
3. The third iteration completed all four Provider-backed jobs and passed
   aggregate, lineage, and cross-organization evidence, then failed a browser
   locator. The locator had opened the first page-level `<details>` element,
   which belongs to Bank navigation, instead of the batch card. It is now
   anchored to the exact durable summary card.
4. The fourth iteration completed three items before the bounded worker request
   failed. The 240-second route and 245-second local-runner boundary was not
   weakened. Safe runner/job/checkpoint and partial Provider-count diagnostics
   were added; raw child output remains forbidden.
5. The fifth iteration passed the complete four-file gate.

Observed passing iteration:

- 4 admitted items, 4 durable jobs, 4 exact claims, and 4 completions.
- Maximum queued-or-processing depth 4; admission-waiting depth 0.
- Drain elapsed 138,717 ms.
- Provider requests: 4 inference, 8 upload, 0 poll, 4 cleanup, 16 total.
- Usage: 31,104 input tokens, 1,704 output tokens, 32,808 total tokens;
  thinking tokens `UNKNOWN`.
- Actual estimated cost: 3,794 micros for this iteration.
- 4 private `pending_review` Review Drafts; 0 duplicates, approvals,
  publications, Assignments, or cross-organization visibility.
- Initial Teacher UI, reload, fresh-page remount, and Review Draft visibility
  all passed.
- Provider cleanup, exact fixture cleanup, process shutdown, environment
  clearing, and zero-residue verification all passed.

### Ten-file pre-correction evidence

Six fresh ten-file iterations stopped before mixed-state completion. Every run
completed exact-ID cleanup with zero residue. The first three, fifth, and sixth
admitted ten synthetic items; the fourth stopped before burst admission and
Provider work.

1. The first run made one exact claim, then stopped at the worker boundary.
   Early diagnostics did not preserve a trustworthy Provider counter total, so
   that run's exact attempts and usage remain `UNKNOWN`.
2. The second run made one exact claim and one Gemini inference request. The
   first structured response passed Provider JSON formatting but did not pass
   application extraction validation. The existing repair loop attempted its
   second call, but the scale harness had inherited the frozen one-file proof's
   one-inference ceiling. The second call was rejected before any Provider
   network request, and the budget error masked the original validation error.

This was a qualification-control defect, not a reason to weaken the extraction
schema or application validation. The first correction added a separate
server-owned scale contract with a two-attempt maximum. The frozen one-file
contract remained exactly one attempt.

3. With that contract active, the controlled checkpoint interruption, zero-
   inference replay, stale-fence rejection, read-after-write delay, and three
   completed imports all passed. The fourth Provider job completed two full
   upload/inference/cleanup lifecycles, then a nested retry attempted to start
   after the two-attempt execution envelope was exhausted. It was rejected
   before a third network request, leaving the safe terminal code as
   `provider_execution_budget_exhausted`. Exact cleanup and zero residue still
   passed.

The follow-up correction keeps all validation strict and does not increase the
USD 2 authorization. It strengthens structured-output descriptions and the
repair prompt so required question text cannot be blank, permits at most three
scale inferences per exact job, and enforces the 50,000-byte input envelope
before Provider transport. A retry that cannot start because the execution
budget is exhausted now preserves the preceding real Provider failure instead
of replacing it with a budget symptom. Genuine first-attempt, oversized-input,
or network-request budget failures still fail as budget errors.

4. The first run after that correction stopped before the local server spawned.
   The shared one-file environment validator rejected the scale-only
   `PDF50_PROVIDER_TEST_MAX_INPUT_BYTES` field before browser admission or
   worker drain. Exact fixture cleanup and zero residue passed. Source control
   flow proves that no Provider call was reachable, so this pre-worker run
   consumed zero of the Provider-spend ceiling. The validator now permits only
   that explicit optional field and continues to reject arbitrary extra fields.
   The cost ledger charges the full stage ceiling once worker drain begins, but
   records zero for failures that provably occur before that boundary.

5. The corrected environment gate admitted ten files and completed eight exact
   jobs. The ninth job used three bounded Gemini upload/inference/cleanup
   lifecycles, received the retryable safe code `provider_busy`, and correctly
   entered durable `retry_wait` at `provider_request_started`. The harness
   incorrectly treated `retry_wait` as an unexpected terminal state instead of
   waiting for `available_at` and invoking the same exact job again. The run
   made 10 exact worker-route invocations and, including the waiting job, 11
   inference requests, 22 upload requests, 0 polls, 11 cleanup requests, and 44
   Provider HTTP requests. Eight Review Drafts completed before the stop. All
   synthetic database, Storage, Auth, Provider-file, process, and environment
   cleanup passed with zero residue. Because worker drain had begun, the full
   179,253-micros stage ceiling was charged, bringing the conservative ledger
   to 831,037 micros; incomplete aggregate usage remains `UNKNOWN`.

The harness now follows only the four explicitly retryable safe Provider codes
through the same durable job. It requires the database retry flag and remaining
execution-attempt allowance, waits for `available_at`, preserves exact-job
targeting, and reserves one minimum inference for every unprocessed job before
allowing another bounded worker invocation. A final `failed` state still fails
truthfully. Safe numeric maximum-input-byte telemetry is persisted with the
worker result; prompts, source content, filenames, Provider responses, and
credentials remain excluded.

6. The first run with durable natural-retry handling admitted ten files and
   completed the first exact job. The next worker invocation was the deliberate
   checkpoint-interruption candidate and entered `retry_wait`, but the harness
   required that every such wait already be the post-checkpoint interruption.
   A real transient Provider wait can occur before the controlled checkpoint,
   so the assertion stopped before adding that invocation's counters. The safe
   partial evidence recorded one completed item, two exact worker-route
   invocations, one aggregated inference, a 35,742-byte maximum observed input,
   two upload requests, one cleanup request, four Provider HTTP requests, and
   zero polls. Exact-ID cleanup, Provider-file cleanup, process shutdown,
   environment clearing, and zero residue passed. The full 179,253-micros
   ceiling was charged, bringing the conservative ledger to 1,010,290 micros.

The controlled-interruption state machine now distinguishes a pre-checkpoint
transient wait from the intended `provider_result_checkpointed` interruption.
It keeps the interruption armed while retrying only the same exact job, checks
the durable execution-attempt allowance, and counts every invocation against
the stage ceiling. Only after the protected checkpoint is observed does it run
the stale-fence assertion and zero-inference replay.

7. The next run proved that correction: the controlled Provider checkpoint,
   stale-fence rejection, zero-inference replay, and controlled read-after-write
   delay all passed. Five items completed with five aggregated inference
   requests, ten uploads, five cleanups, zero polls, and twenty Provider HTTP
   requests. The sixth worker process exited successfully but reported no exact
   claim. This occurred at the transition from the initial five-job per-user
   outstanding window to the first job newly released by the admission pump.
   Source tracing showed that the harness accepted a newly queued item and
   invoked the local worker immediately, while the exact claim path rejects an
   item until its database-authored `available_at` is no later than the local
   process clock. The harness waited for this boundary only on `retry_wait`, not
   on a newly released `queued` job. Exact-ID cleanup, Provider-file cleanup,
   process shutdown, environment clearing, and zero residue all passed. The
   full 179,253-micros ceiling was charged, bringing the conservative ledger to
   1,189,543 micros.

The exact worker preflight now waits, with a bounded loop, for both `queued` and
`retry_wait` targets to reach their database-authored availability time before
spawning the one-invocation worker. A successful process that still claims no
job emits only sanitized runner/job/checkpoint state and fails closed. The
adversarial safety smoke rejects the previous retry-only wait contract. No
claim limit, Provider allowance, product authorization, migration, or live
configuration changed.

8. The corrected run passed the complete ten-file recovery and mixed-state
   gate. Ten items were admitted; nine exact durable jobs completed and the one
   predefined unstarted item was cancelled through the Teacher browser. The
   first five-job window and the newly released second window both drained.
   The controlled post-checkpoint interruption, stale-fence rejection,
   zero-inference checkpoint replay, and read-after-write retry all passed.
   The run made 10 claimed worker-route invocations: nine productive job
   executions plus the zero-inference checkpoint replay. Provider evidence
   recorded 15 inference requests, 30 uploads, zero polls, 15 cleanups, and 60
   total HTTP requests, with a 35,742-byte maximum Provider input. Usage
   metadata recorded 62,216 input tokens, 3,375 output tokens, and 65,591 total
   tokens; thinking tokens and a complete trustworthy actual-cost total remain
   `UNKNOWN`. The durable batch was `partial` with 9 completed, 0 failed, and 1
   cancelled item. Nine private Bank-scoped Review Drafts remained
   `pending_review`; duplicates, approvals, publications, Assignments, and
   cross-organization visibility were all zero. Teacher UI initial render,
   reload, fresh-page remount, and Review Draft visibility passed. Provider
   files, database rows, Storage objects, Auth fixtures, local processes, and
   process-only environment values were cleaned, with zero synthetic residue.
   The full 179,253-micros ceiling was charged, bringing the cumulative
   conservative ledger to 1,368,796 micros.

At this point the ten-file gate is closed. The only remaining live gate is the
fifty-file maximum-count admission/drain/UI/cleanup qualification. Its 497,925-
micros conservative ceiling would cross the USD 1.60 reassessment threshold but
remain below USD 2.00 at 1,866,721 micros. The run remains useful because no
smaller or previously completed stage can prove the required 50-file terminal
behavior. No unchanged paid rerun after that stage is budgeted.

### Fifty-file live evidence

One fresh synthetic iteration ran after the explicit USD 1.60 usefulness
reassessment. It proved the browser rejects a 51-file selection before creating
any durable row, then admitted exactly 50 private synthetic PDF items. Anonymous
source access remained denied. The drain respected the five-job per-user
outstanding window, burst-scoped admission release, and one exact targeted job
per worker process.

Twenty-three items reached durable completion. Six retryable Provider waits
remained durable and exact-job scoped. The 29 accepted worker-route invocations
made 48 inference requests, 96 uploads, zero polls, 48 cleanups, and 192 total
Provider HTTP requests. The maximum observed Provider input was 35,742 bytes.
This consumed all 25 aggregate repair/retry attempts above the 23 base attempts
for the completed jobs. Before invoking the next job, the harness reserved one
minimum attempt for each of the 27 remaining items. The resulting
`48 + 3 + 26 > 75` pre-invocation check failed closed with
`provider_budget_exceeded`; no over-budget Provider request was sent.

The run did not reach terminal batch aggregation, Teacher UI reconciliation,
or an independently counted final Review Draft set. The 23 completed jobs are
bound by the unchanged persistence-before-completion contract, but final draft,
duplicate, cross-organization, approval, publication, and Assignment aggregate
counts for this interrupted run are `NOT_REACHED`, not fabricated as passing
evidence. Input, output, thinking, total-token, and trustworthy actual-cost
totals are `UNKNOWN` because aggregate evidence was not reached.

Provider-file cleanup, exact database/Storage/Auth fixture cleanup, local server
shutdown, process-only environment clearing, and zero synthetic residue all
passed. The full 497,925-micros stage ceiling was charged, bringing the
cumulative conservative ledger to 1,866,721 micros and leaving 133,279 micros.
A fresh 50-file run requires at least 331,950 conservative micros before any
repair allowance, so another paid qualification is blocked by the existing USD
2 authorization. The result establishes maximum-count admission but not
50-file operational completion.

## Pre-live source validation

Passed before any scale Provider call:

- TypeScript via production build and repository lint.
- Canonical one-job proof-control parity.
- Scale harness safety and adversarial mutation checks.
- Direct private upload, 1/10/50 admission, 50-item load, and item-51 denial.
- Provider lifecycle, request accounting, output bound, and cleanup contracts.
- Durable queue/load, exact local worker, checkpoint, crash recovery, fencing,
  terminal summary, diagnostic redaction, and page/source lineage smokes.
- Provider network safety, resilience, and fallback/circuit-breaker smokes.
- Canonical migration governance/reconciliation and security smoke.

Final non-paid validation passed syntax checks, the PowerShell launcher parser,
PDF50 admission/upload/security/load/status contracts, Provider lifecycle and
budget controls, proof-control parity, scale-harness adversarial checks, the
durable queue and load contracts, exact local-worker behavior, checkpoint and
fencing checks, 20 deterministic crash cases, terminal-summary compaction,
single-page lineage, resilience/fallback checks, canonical migration
governance/reconciliation, security, source-only route validation, lint, two
sequential production builds, performance budget/audit, and bundle analysis.

The aggregate smoke passed its preceding static and governance checks, then
stopped at the known Windows embedded-Postgres `initdb` restricted-token
infrastructure failure. It is neither a passing aggregate smoke nor a PDF50
product regression. The environment-backed internal-route smoke separately
stopped at its missing clean-Supabase environment gate after injecting zero
values and performing no hosted operation. A default route smoke attempted a
local server connection and stopped because no server was running; the
credential-free source-only route mode passed.

Two unchanged source smokes retain unrelated stale assertions:
`review-draft-actions-mvp-smoke.mjs` expects an older safe-content update source
shape, and `ai-parsing-boundary-duplicate-guard-smoke.mjs` expects older
structural-guidance UI literals. They are recorded as baseline test-maintenance
failures, not as passing checks and not as PDF50 regressions. No production
source was changed to satisfy them.

## Provider-neutral quality treatment

The stacked quality branch freezes this evidence at baseline
`f1ce7bcb791604468693ea945401cfb157e64d97` and introduces treatment
`ai-pdf-parsing/provider-neutral-v2`. It adds explicit attempt reasons, exact
safe Provider error categories, deterministic Golden evaluation, exact
five-facet taxonomy abstention, text-only structural repair, and a hardened
private visual-evidence boundary. Fourteen parsing, six taxonomy, and thirteen
visual fixtures pass with zero hard-gate failures; fifteen independent
mutations, including a real-route cross-organization asset denial, are
rejected.

This is source and local deterministic evidence only. No additional paid
Provider run, hosted write, or Storage operation was performed. The historical
25 excess attempts remain `LEGACY_REASON_UNKNOWN`, and the remaining USD
0.133279 authorization still cannot fund the USD 0.331950 minimum fresh
50-file gate. Embedded-question figures are source-ready but require a separate
rights-safe image-rich live proof.

## Current classification

`PDF50_SCALE_QUALIFICATION_PARTIALLY_COMPLETE`

The recovery path is merged, the isolated qualification branch is established,
and both the four-file baseline and ten-file recovery/mixed-state gate are live
validated. Fifty-file admission and fail-closed attempt accounting are live
validated, but only 23 of 50 items completed before the stage attempt ceiling.
Terminal drain, aggregate UI, and final invariant evidence remain unproven, and
the remaining authorization cannot fund a valid fresh run. This document does
not claim operational readiness. The next useful step is a source-only review
of the observed repair/retry frequency and safe aggregate diagnostics, followed
by a new explicit Provider budget large enough for a fresh 50-file run after
any reviewed correction. An unchanged paid rerun is not justified or
authorized.

## Stacked PR #229 requalification extension

This section is a separate ledger under the later USD 2 authorization. It does
not rewrite the PR #228 history or reclaim its conservative budget.

| Run | Stage | Conservative ceiling | Provider evidence | Result |
| --- | ---: | ---: | --- | --- |
| 1 | 50 | USD 0.497925 | 0 inference requests | 50 admitted and file 51 rejected; stopped before transport on a byte/token limit defect |
| 2 | 50 | USD 0.497925 | 10 inference, 40 total HTTP requests | 7 completed; job 8 normalized, then failed before `drafts_persisted` |
| 3 | 10 | USD 0.179253 | 0 inference requests | 10 admitted; external HTTPS timeout on first worker invocation |

Run one proved that the 50,000 planning-token ceiling had also been used as a
50,000-byte request ceiling. The observed request was 55,694 bytes. The proof
contract now keeps a 50,000-token planning limit and separately enforces a
200,000-byte serialized-input limit.

Run two proved the byte fix and completed seven exact jobs. The eighth job used
three bounded Provider attempts and reached the durable `normalized`
checkpoint. The remaining interval was narrowed to a non-authoritative progress
write and fenced Review Draft persistence. The progress write is now
best-effort after the durable checkpoint. The atomic persistence call may replay
once using the same fence and deterministic lineage. An ambiguous first reply
followed by `NOOP` is accepted; two real failures remain terminal. A new safe
`draft_persistence` stage identifies this boundary without row data, prompts,
source content, Provider output, or identifiers.

Run three was the first live validation after that correction. It did not reach
Provider transport because the first exact worker invocation encountered a
connection timeout. The harness stopped rather than retrying. Local server
shutdown and process-environment clearing passed. Cleanup reported failure
during the connectivity incident, but its final independent synthetic residue
count was zero. This is not a complete cleanup pass and not product closure.

The PR #229 conservative ledger is USD 1.175103 consumed and USD 0.824897
remaining. Usage-derived actual spend is known zero for runs one and three;
run-two usage remains `UNKNOWN`. Dashboard-observed spend was not collected.

Latest status: `PDF50_SCALE_REQUALIFICATION_PARTIAL`. Maximum-count admission
is reconfirmed, but a fresh 50-file run has not reached 50/50 terminal items,
final batch aggregation, Teacher UI reload/remount, or the complete invariant
matrix. No automatic paid retry is recorded.

## Final PR #229 live-resume evidence

The resume began from a clean exact branch head after a read-only preflight
found zero run-scoped residue, zero synthetic queued/processing jobs or leases,
no leftover local server, cleared process-only values, and restored bounded
Gemini HTTPS reachability. The earlier HTTPS timeout remained a zero-inference,
zero-spend event.

The resumed Stage 10 admitted ten exact items, completed nine, intentionally
cancelled one, replayed one normalized checkpoint with zero inference, and
rejected a stale fence. All nine Provider jobs succeeded on their first attempt.
It persisted nine private pending Review Drafts with no approval, publication,
Assignment, duplicate claim, or cross-organization effect. Exact cleanup,
reload/remount, and environment clearing passed.

The final Stage 50 run then proved:

- file 51 was rejected before durable-row creation;
- exactly 50 private synthetic files/items were admitted;
- no unrelated job was selected;
- 11 items reached completed;
- item 12 failed at the durable `normalized` checkpoint after two Provider
  attempts with safe code `unknown_provider_error`;
- the harness stopped fail closed and did not start the remaining 38 items;
- approval, publication, and Assignment creation remained zero; and
- local-server shutdown, exact-ID cleanup, zero residue, and environment
  clearing passed.

The bounded partial counters were:

| Measure | Final Stage 50 observation |
| --- | ---: |
| Worker-route invocations | 12 |
| Completed items | 11 |
| Inference attempts / requests | 13 / 13 |
| Maximum serialized input bytes | 52,343 |
| Upload / cleanup requests | 26 / 13 |
| Poll requests | 0 |
| Provider network requests | 52 |
| Cleanup failures | 0 |

Batch aggregation, complete Teacher UI reload/remount, and the full 50-item
lineage/taxonomy/visual invariant matrix were not reached and are not inferred
from admission. The correct classification remains
`PDF50_SCALE_REQUALIFICATION_PARTIAL`.

The separate PR #229 authorization used all 10 paid-run slots. Its final
conservative ledger is 1,830,468 micros, leaving 169,532 micros of USD 2 but no
run slot. Recorded inference attempts total 37. The successful resumed Stage 10
retained an estimated actual cost of 11,361 micros; incomplete-run usage remains
`UNKNOWN` and is covered by the conservative reserve. No further paid run is
authorized, and the remaining amount is below the 331,950-micros minimum for a
fresh one-attempt-per-file Stage 50.

Final PR #229 live classification:
`GEMINI_LIVE_EXPERIMENTS_COMPLETE_PDF50_PARTIAL`. A new terminal proof requires
separate authorization after a causal review of the normalized-stage Provider
failure. This record does not claim PDF50 operational readiness.
