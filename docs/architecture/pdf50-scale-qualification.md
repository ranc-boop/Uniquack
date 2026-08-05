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
- Known live scale iterations: 10.
- Trustworthy actual estimate for the passing terminal iteration: 3,794 micros.
- Cumulative actual spend: `UNKNOWN` because failed iterations did not all
  reach complete usage telemetry.
- Conservative cumulative ceiling consumed: 831,037 micros (USD 0.831037).
- Remaining authorized budget: 1,168,963 micros (USD 1.168963).

Future scale runs use a 50,000-byte upper envelope covering the prompt,
structured-output schema, synthetic PDF bytes, and fixed request overhead. The
server rejects an oversized proof input before upload or inference. Treating
that byte envelope as the input-token ceiling, plus the server-owned 4,096
output-token limit, remains conservative for these exact small synthetic
sources. Scale execution permits at most three attempts per completed job. At
current source-defined Gemini rates this bounds a fresh stage as follows:

- Four files: 79,668 micros (12-attempt ceiling; already passed and not rerun).
- Ten files: 179,253 micros (27-attempt ceiling for nine Provider jobs).
- Fifty files: 995,850 micros (150-attempt ceiling).
- Projected ceiling after one new ten-file run: 1,010,290 micros (USD
  1.010290).
- A subsequent fifty-file run at the unchanged 50,000-byte envelope would
  project to 2,006,140 micros, 6,140 micros beyond authorization, and therefore
  must not start under that envelope. Sanitized maximum Provider-input-byte
  telemetry is now captured from authorized attempts. The envelope may be
  reduced only after a passing ten-file run proves a lower exact maximum with
  conservative headroom; otherwise fifty-file execution is an external budget
  gate.

Unknown usage remains `UNKNOWN`; it is never converted into a zero-cost claim.
Before each paid run, the harness must calculate a credible maximum and stop if
that maximum would exceed the remaining authorized budget.

## Evidence status

| Stage | Status | Live iterations | Provider attempts | Result |
| --- | --- | ---: | ---: | --- |
| Four files | `PASS` | 5 | At least 11; exact failed-run total `UNKNOWN` | 4/4 terminal, UI, isolation, invariants, and cleanup passed |
| Ten files | `BLOCKED_RETRY_WAIT_HARNESS_CORRECTED` | 5 | At least 17; earlier failed-run total `UNKNOWN` | Eight completed; the ninth correctly entered durable `retry_wait` after a bounded transient `provider_busy`, but the harness treated that nonterminal state as failure |
| Fifty files | `NOT_RUN` | 0 | 0 | Must not begin before the ten-file gate passes |

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

Five fresh ten-file iterations stopped before mixed-state completion. Every
run completed exact-ID cleanup with zero residue. The first three and fifth
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

The environment-backed durable queue E2E stopped at its independent
missing-environment gate; zero values were injected and no hosted operation
ran. The current main `route-smoke` retains an unrelated `/videos` copy
assertion failure. The AI Parsing status QA smoke also retains a stale literal
copy assertion against an unchanged Teacher import UI. These are recorded as
baseline/fixture gates, not as passing tests and not as PDF50 product
regressions.

## Current classification

`PDF50_SCALE_QUALIFICATION_PARTIALLY_COMPLETE`

The recovery path is merged, the isolated qualification branch is established,
and the four-file baseline is live validated. Ten-file recovery/mixed-state and
fifty-file maximum-count qualification remain, so this document does not yet
claim operational readiness.
