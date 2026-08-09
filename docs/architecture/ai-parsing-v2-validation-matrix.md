# AI Parsing V2 Validation Matrix

Status: source/fake P0 evidence

Provider calls: 0

Hosted operations: 0

## Current-source decision

| Current capability | V2 decision | Reason |
| --- | --- | --- |
| Page preanalysis, segmentation, packet/page spans | REUSE | Mature V1 source decomposition remains the canonical input boundary |
| Question boundary guard and source lineage | ADAPT | V2 makes local Question relationships, cross-page/shared evidence, and fail-closed precision explicit |
| Historical renderer/cropper and deterministic visual keys | REUSE | V2 adapts the mature proposal kernel; it does not create a competing renderer, cropper, or Storage path |
| Runtime taxonomy snapshot and effective-leaf candidates | REUSE | Preserves the authoritative five-facet taxonomy and rejects broad-parent substitution |
| V1 Provider adapters, worker, checkpoints, fencing, recovery | KEEP_V1_ONLY | P0 has no production wiring or Provider execution |
| V1 Question/Review persistence | KEEP_V1_ONLY | P0 projects pure DTOs only; Review Draft writing remains unchanged |
| Versioned proposal/canonical contracts | NEW_V2 | Required to separate Provider proposals from application authority |
| Provider-neutral evaluator and rights-safe corpus | NEW_V2 | Required for deterministic source/fake validation and later apples-to-apples Provider comparison |
| Generation-relevant observations | NEW_V2 | Preserves source-backed future Blueprint evidence without creating a Blueprint |

## Development corpus

The rights-safe development corpus contains 41 deterministic cases. It covers
the required categories and additional relationship mutations:

| Area | Cases exercised | Required outcome |
| --- | --- | --- |
| Source assessment | text question, no questions, unsupported source, insufficient evidence, notes without Question, answer-only source, false abstention, false extraction, ambiguous preanalysis | Provider proposal reconciled with independent application evidence; no fabricated Question or false validated abstention |
| Answers | MCQ answer key, explicit boolean/short answer, numeric unit/tolerance, worked solution, model-derived answer, conflicting answer, multipart | Typed answer and provenance checks; contradictions fail |
| Boundaries | standalone, multipart parent/child, shared prompt, cross-page continuation, answer-key continuation, ambiguous | All local references resolve; impossible relations fail |
| Visuals | one-to-one, two-real-Question reassociation, one-to-many shared, many-to-one, cross-page, decorative, answer-key visual, missing required, ambiguous, invalid box, fabricated fact | Application-authorized source only; candidate page cannot self-authorize; decorative suppressed; missing required -> `needs_more_evidence`; unsafe associations fail |
| Taxonomy | exact close sibling, abstention, wrong facet, broad parent, inactive/noncandidate/unknown ID | Exact active assignable effective-leaf candidate or abstain |
| Generation evidence | parameter versus invariant, reasoning/solution observations, surface detail | Candidate-only evidence; surface detail never becomes a rule or Blueprint |
| Ownership and review | Bank mismatch, Provider disposition, approval/publication/Assignment mutation | All hard-boundary escape counts remain zero |

The frozen holdout has six richer rights-safe sources and separate source
SHA-256 plus gold expectations. It is integrity-checked only and was frozen
before any paid V2 Provider experiment. No production behavior branches on a
fixture ID or literal.

## Validation layers

| Layer | Evidence | Result required |
| --- | --- | --- |
| Zod proposal parse | strict Provider-visible schema | Unknown authority/product fields rejected |
| Application context parse | source, Bank, page, Question/visual preanalysis, taxonomy and fingerprint allowlists | Invalid context returns bounded failure only |
| Canonicalization | semantic reference and answer/solution checks | Invalid output remains `invalid_provider_output`; no projection |
| Visual adapter | mature V1 proposal key and source/fake identity derivation | Same inputs are idempotent; no persistent identity without crop bytes |
| Taxonomy adapter | runtime snapshot and effective-leaf candidate subset | Exactly five facets; unknown/broad/wrong-facet IDs rejected |
| V1 projection | pure DTO mapping | Private Bank match, escaped HTML, pending Review only, no side effects |
| Safe diagnostics | bounded summary | No source text, prompt, filename, private ID, raw Provider response, or credential |
| Provider-neutral evaluator | exact gold/prediction comparison | Precision/recall/F1 and hard-boundary counters are deterministic |
| Mutation suite | semantic adversarial proposals and predictions | Every unsafe mutation fails or increments the expected escape counter |
| Production isolation | repository import scan | No production module outside the V2 directory imports V2 |

## Evaluator metrics

The evaluator reports:

- Question detection precision, recall, and F1;
- boundary precision, recall, and F1;
- source lineage precision, recall, and F1, including source, page, role,
  precision, and Question relation;
- visual association, visual fact, required/shared/missing dependency metrics;
- answer correctness, provenance accuracy, and provenance coverage;
- solution consistency;
- exact-ID taxonomy precision, recall, F1, and abstention accuracy;
- generation-evidence precision, recall, and F1;
- sufficiency and disposition accuracy;
- valid Review Draft yield;
- hard-boundary escape totals.

Hard-boundary counters cover fabricated Questions, foreign source lineage,
invalid taxonomy, wrong visual relationships, cross-Bank scope, public assets,
Provider-chosen disposition, approvals, publications, and Assignments.

## Context composition

The fixed source/fake context report measures UTF-8 bytes, not Provider tokens:

| Component | Bytes |
| --- | ---: |
| Policy | 588 |
| Instructions | 546 |
| Provider-visible schema | 32,405 |
| Taxonomy snapshot identity | 184 |
| Candidate subset | 852 |
| Source packet metadata | 256 |
| Visual metadata | 183 |
| Source content | 172 |
| Repair context | 0 |
| Repeated source content | 0 |
| Total request | 35,529 |

The comparable V1 Provider-schema source file is 5,904 bytes; the V2 schema is
26,501 bytes larger in this local byte comparison. This is not a token or cost
claim. Provider token counts are `NOT_MEASURED`. Structural repair repeats zero
source bytes, and checkpoint replay performs zero inference.

## Regression and mutation gate

P0 is accepted only when all of these are true:

- development and holdout fingerprints match;
- all 41 development cases produce their declared source/fake outcome;
- a perfect evaluator prediction scores without hard-boundary escapes;
- fabricated-source, taxonomy, answer, boundary, visual, ownership, and Review
  mutations fail deterministically;
- V1 AI Parsing, PDF50 source/fake, visual, taxonomy, Blueprint, Practice,
  security, route, and migration-governance suites remain green;
- typecheck, lint, two production builds, performance checks, `npm audit`,
  `npm ls`, and `git diff --check` pass;
- no migration, dependency, environment, Provider setting, runtime wiring, or
  hosted-state change exists.

## Future paid Luna validation plan

No paid Provider call is part of P0. A later separately authorized experiment
must branch from the frozen P0 commit, verify every foundation fingerprint,
use the frozen six-source holdout without changing gold, compose the same
Provider-neutral proposal contract, and record Provider-reported usage as
available. It must preserve the application validator and evaluator unchanged,
use bounded request/output/cost controls, emit only safe numeric aggregates,
and perform no production wiring. Any schema adaptation requires a new explicit
contract version and a fresh source review before a call.

## Executed P0 validation

Executed on the isolated Windows worktree at the source/fake P0 head:

- V2 canonical foundation: 23/23 tests passed, including two-real-Question
  visual reassociation, false abstention, false extraction, ambiguous evidence,
  single-row multipart projection, and non-authoritative recurrence;
- repository Node tests: 44/44 passed with 93.03% aggregate line coverage in
  the exercised modules;
- V1 immutable fingerprint: 82 files matched the frozen baseline/treatment
  anchors;
- V1 Golden evaluation, 18 mutation proofs, order invariance, runtime contract,
  Provider benchmark source/evaluator, selective packet execution, coverage
  recovery, taxonomy snapshot, taxonomy source audit, and visual security
  passed;
- PDF50 admission, direct upload, private Storage, load, checkpoint, fencing,
  20-case crash recovery, proof controls, Provider lifecycle budgets, safe
  diagnostics, single-page lineage, status reconciliation, local worker, and
  durable queue suites passed;
- Practice Provider execution, prompt/request/trace security, Library scope,
  round state, and Assignment UX passed;
- Teacher AI Parsing Bank targeting, Review status/actions, Bank-scoped bridge,
  security, routes, migration governance/reconciliation, and question-assets
  source/static checks passed;
- typecheck and lint passed;
- production build passed twice;
- performance budget, performance audit, and analyzer build passed;
- `npm ls` passed and `npm audit` reported zero vulnerabilities;
- context-size and fingerprint reports passed with zero Provider calls and zero
  hosted operations.

The context-size report's stale fixture import was corrected to the existing
shared fixture module, making the documented report executable from the PR
worktree. The intentional Provider-schema fingerprint changed only for the
single-instance generation-observation field and is frozen in the foundation
registry; corpus and holdout bytes remain unchanged.

The official aggregate smoke reached an unchanged Windows
`embedded-postgres` infrastructure failure (`initdb` restricted-token setup)
after its preceding static checks passed. Two live-role suites were not run
because Supabase process credentials were intentionally absent. Four dedicated
source-shape smokes also retain pre-existing current-main assertions outside
this diff: three Blueprint UI literal/shape checks and one completed-Practice
answer-field shape check. The branch changes none of those scripts or their
target runtime modules; stronger Blueprint security/route and Practice
provider/security/state checks passed. These baseline/environment limitations
are reported, not reclassified as V2 successes.
