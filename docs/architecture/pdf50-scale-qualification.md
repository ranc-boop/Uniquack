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
worker invocation carries one exact synthetic job identifier; the route refuses
the qualification-only interruption control unless the canonical Provider proof
mode and exact target are both present.

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
- Known live scale attempts: 0.
- Known actual estimated spend: USD 0.00.
- Conservative cumulative spend: USD 0.00.
- Remaining authorized budget: USD 2.00.

The pre-run conservative bound uses 100,000 input tokens plus the server-owned
4,096 output-token limit per actual Provider attempt. At current source-defined
Gemini rates this bounds the planned stages as follows:

- Four files: 46,556 micros.
- Ten files (nine Provider attempts): 104,751 micros.
- Fifty files: 581,950 micros.
- Planned cumulative ceiling: 733,257 micros (USD 0.733257).

Unknown usage remains `UNKNOWN`; it is never converted into a zero-cost claim.
Before each paid run, the harness must calculate a credible maximum and stop if
that maximum would exceed the remaining authorized budget.

## Evidence status

| Stage | Status | Live iterations | Provider attempts | Result |
| --- | --- | ---: | ---: | --- |
| Four files | `NOT_RUN` | 0 | 0 | Pending source and safety-gate preparation |
| Ten files | `NOT_RUN` | 0 | 0 | Must not begin before the four-file gate passes |
| Fifty files | `NOT_RUN` | 0 | 0 | Must not begin before the ten-file gate passes |

Passing admission alone is insufficient. Each stage must verify durable item
states, batch aggregation, Review Draft identity, UI reload/remount behavior,
fencing and idempotency, isolation, Provider cleanup, exact fixture cleanup,
and zero residue.

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

The environment-backed durable queue E2E scripts stopped at their independent
missing-environment gate and were not supplied from `.env` files. The current
main `route-smoke` retains an unrelated `/videos` copy assertion failure. These
are recorded as baseline/fixture gates, not as passing tests and not as PDF50
product regressions.

## Current classification

`PDF50_SCALE_QUALIFICATION_PARTIALLY_COMPLETE`

The recovery path is merged and the isolated qualification branch is
established. No scale stage has run yet, so this document does not claim
operational readiness.
