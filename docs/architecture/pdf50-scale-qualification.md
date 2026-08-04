# Gemini PDF50 Scale Qualification

## Source baseline

- Approved recovery PR: `#227`
- Approved recovery head: `94925557301fe35dea3a62e84ee829ab3072db2f`
- Recovery merge commit: `f229f0fb2396b2bf12661d5a0f40b2b3a57b480a`
- Scale branch base: `f229f0fb2396b2bf12661d5a0f40b2b3a57b480a`
- Authoritative main at branch creation: `f229f0fb2396b2bf12661d5a0f40b2b3a57b480a`
- Scale branch: `codex/pdf50-scale-qualification`
- Scale Draft PR: pending creation after this initial evidence commit

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

## Current classification

`PDF50_SCALE_QUALIFICATION_PARTIALLY_COMPLETE`

The recovery path is merged and the isolated qualification branch is
established. No scale stage has run yet, so this document does not claim
operational readiness.
