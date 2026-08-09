# AI Parsing V2 Canonical Data Foundation

Status: implementation design record

Scope: source/fake P0 foundation only

Runtime behavior delta: none

## Objective

AI Parsing V2 establishes a versioned, Provider-neutral application contract
for turning private source evidence into review-gated educational data. It does
not replace or wire into the current importer in this change.

The target boundary is:

```text
private source and application-owned scope
-> Provider proposal
-> strict application validation
-> canonical question packages
-> pure V1 Review Draft projection
```

The Provider may propose extraction, source associations, visual facts,
answers, taxonomy decisions, and generation-relevant observations. The
application remains authoritative for source scope, lineage, taxonomy
eligibility, deterministic identities, validation findings, quality
disposition, Bank scope, and Review state.

## Non-goals

This foundation does not:

- call a Provider;
- read or mutate hosted state;
- write Review Drafts or Questions;
- change migrations, schemas, dependencies, Provider settings, or routing;
- wire V2 into Admin, Teacher, PDF50, worker, Blueprint, Assignment, or Practice
  runtime;
- create, approve, publish, or assign a Question;
- create an authoritative Blueprint;
- store hidden chain-of-thought;
- alter the frozen Gemini, Luna, or Sol benchmark evidence.

## Reuse boundary

V2 is located under `src/lib/ai-pdf-import/v2/` beside the mature V1 importer.
It reuses concepts already proven by the current implementation without
creating a second renderer, cropper, queue, Provider adapter, or persistence
path:

- source preanalysis and page classification;
- packet and page-span lineage;
- deterministic visual crop identity and requester-first private assets;
- the five-facet runtime taxonomy snapshot and effective-leaf candidate set;
- current typed answer and Review readiness semantics;
- Bank-first ownership and pending-review safety gates.

No production module imports V2 in P0. Tests import it directly.

## Contract topology

All externally meaningful contracts carry an explicit literal version. The
foundation defines:

- `DocumentAssessmentV2`;
- `SourceSpanV2`;
- `QuestionBlockV2`;
- `VisualObjectV2`;
- `VisualFactV2`;
- `CanonicalAnswerV2`;
- `AuditableSolutionV2`;
- `TaxonomyDecisionV2`;
- `GenerationRelevantFeaturesV2`;
- `QualityDispositionV2`;
- `CanonicalQuestionPackageV2`;
- `DocumentExtractionV2`.

Provider input is parsed as `DocumentExtractionProposalV2`. A separate
application-owned context supplies the allowed source, page range, packet
scope, Bank scope, taxonomy snapshot, and candidate subset. Validation produces
`DocumentExtractionV2`; it never mutates the proposal in place.

## Source and boundary authority

Document sufficiency has exactly four states:

- `extractable`;
- `no_questions`;
- `insufficient_evidence`;
- `unsupported_source`.

Source spans describe one of these evidence roles:

- prompt;
- option;
- answer key;
- worked solution;
- explanation;
- required visual.

Each span is bounded to the application-supplied source and page range. Its
precision is `exact`, `page_level`, `region_level`, or explicitly `unknown`. Region
precision requires finite normalized coordinates. Exact precision requires a
source fingerprint. `questionIds` bind each span to one or more local Questions,
including deliberate shared evidence. Cross-page spans require ordered page bounds. Missing,
inverted, out-of-range, or foreign-source references fail closed.

Question boundaries support standalone, multipart parent/child, shared prompt,
cross-page continuation, shared visual, answer-key continuation, and ambiguous
boundaries. Every referenced parent, span, option, visual, answer, solution,
and taxonomy evidence ID must resolve within the same validated document.

## Visual evidence

The document visual registry represents question, answer-key, shared,
decorative, missing, and ambiguous visuals. Visual facts remain bounded
Provider proposals linked to source spans. The application validates finite
bounds, source/page lineage, question association, required/decorative
semantics, and deterministic identity inputs.

P0 adapts the mature V1 visual-proposal kernel and creates only deterministic
crop proposal references. It does not render, crop,
upload, sign, expose, or delete an asset. Missing required visuals produce
`needs_more_evidence`; decorative visuals are never promoted to required
evidence.

## Answers and solutions

Canonical answers are discriminated typed values for:

- multiple choice;
- boolean;
- numeric;
- short text;
- free response;
- multipart.

Every answer carries source provenance or an explicit unsupported state. The
validator checks option membership, numeric finiteness and tolerance,
multipart child coverage, and answer/source relationships.

Auditable solutions contain concise, visible steps and evidence references.
They are not hidden reasoning traces. Deterministic final-answer checks reject
contradictions between the canonical answer and solution conclusion.

## Taxonomy and generation evidence

Taxonomy decisions cover exactly the existing five facets: curriculum,
concept, method, task, and form. Each facet either assigns one exact candidate
ID or abstains. Assigned IDs must exist in the application-owned candidate
subset and remain active, assignable, effective leaves in the matching facet.
Unknown IDs, broad parents, inactive nodes, wrong facets, and silent
substitution fail closed. The validator never forces all five facets to be
assigned.

Generation-relevant features preserve source-backed observations that a future
Blueprint may consume. They are candidate evidence only. Single-instance
observations cannot become authoritative Blueprint invariants in this layer.
AI Parsing observes; Blueprint may later consume observations; generation
remains separately review-gated.

## Application-derived disposition

Only the application creates `QualityDispositionV2`. Provider output that
contains a disposition or canonical authority field is rejected as an unknown
field. The only outcomes are:

- `review_ready`;
- `needs_more_evidence`;
- `insufficient_source`;
- `invalid_provider_output`.

`review_ready` still projects to a V1 `pending_review` Draft. It is not an
approval. `needs_more_evidence` projects to the existing locked Review state.
Insufficient or invalid documents do not project writable Draft DTOs.

## V1 projection

The compatibility layer is pure and side-effect free. It maps validated V2
packages into the current Question and Review DTO shapes:

- multiple choice -> `mcq`;
- boolean, numeric, and short text -> `fill_blank`;
- free response -> `frq`;
- multipart -> `mixed`;
- taxonomy IDs -> current tag IDs;
- source spans -> bounded page/source lineage metadata;
- visual references -> unresolved private-asset projection references;
- `review_ready` -> `pending_review`;
- `needs_more_evidence` -> `needs_more_evidence`.

Provider text is escaped before HTML projection. The projection contains no DB
write, generated UUID, approval, publication, Assignment, or public asset URL.

## Prompt and schema foundation

The Provider-visible request has stable ordering:

1. immutable policy prefix;
2. task contract;
3. Provider-visible JSON Schema;
4. taxonomy snapshot identity and bounded candidates;
5. application-owned source packet context;
6. source-specific content last.

The request composer reports UTF-8 byte counts separately for policy,
instructions, schema, taxonomy, repair context, source content, repeated source
content, and total context. These are local byte measurements, not invented
Provider tokens.

Fingerprints use canonical JSON and SHA-256 for the proposal schema, policy,
task, versioned contract inputs, development corpus, and frozen holdout. Every
request and canonical extraction separately binds its authoritative taxonomy
snapshot and candidate subset into the combined parsing-contract fingerprint.

## Corpus and evaluation

P0 includes a rights-safe synthetic development corpus with 41 scenarios,
covering every required category and additional relationship mutations across text, answer keys, free response, equations, tables,
required/decorative/shared/missing visuals, multipart and cross-page questions,
taxonomy ambiguity, no-question documents, unsupported inputs, and
insufficient evidence. It is distinct from the historical six-PDF Provider
benchmark.

A separate frozen holdout is fingerprinted and excluded from development
quality assertions. No production behavior may branch on corpus IDs or fixture
literals.

The deterministic Provider-neutral evaluator reports:

- question detection and boundary precision/recall/F1;
- source lineage precision/recall/F1;
- visual association precision/recall/F1;
- answer correctness and provenance coverage;
- solution consistency;
- taxonomy exact-ID precision/recall/F1 and abstention accuracy;
- generation-evidence precision/recall/F1;
- sufficiency accuracy;
- valid Review Draft yield;
- hard-boundary escape counts.

Hard-boundary mutation tests must keep fabricated questions, foreign source
references, invalid taxonomy IDs, wrong visual associations, public/cross-Bank
assets, Provider-chosen Review states, auto-approvals, publications, and
Assignments at zero.

## Context accounting

The fixed source/fake initial request measures 35,669 UTF-8 bytes: 588 policy,
546 instructions, 32,545 Provider-visible schema, 184 taxonomy identity, 852
candidate subset, 256 source-packet metadata, 183 visual metadata, and 172
source content. Repair context and repeated source content are both zero. The
comparable V1 schema source file is 5,904 bytes, so the V2 schema is 26,641
bytes larger in this local comparison. These are byte measurements, not token
or cost claims; Provider token counts are `NOT_MEASURED`.

## Rollback and risk

The P0 rollback is removal of the new V2 source/fake modules, fixtures, tests,
and documentation. Because no production import references V2 and no migration
or hosted operation occurs, rollback has no data or runtime impact.

The main implementation risk is accidental authority leakage from Provider
proposal to canonical state. Strict schemas, separate types, application-owned
validation context, mutation tests, and a pure projection are the required
controls.
