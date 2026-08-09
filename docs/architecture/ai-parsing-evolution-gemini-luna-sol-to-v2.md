# AI Parsing Evolution: Gemini, Luna, Sol, and the V2 Decision

Status: `AI_PARSING_V2_REPORT_READY_FOR_REVIEW`

## 1. Executive summary

EduStruct has proven that its AI Parsing system can safely admit and process a
large private PDF batch, preserve Bank ownership, create private Review Drafts,
attach source-backed visual evidence, and prevent unreviewed content from
reaching students. It has also proven that a stronger model can improve some
quality metrics. Neither result means that one larger model, one prompt, or one
monolithic structured response can reliably turn every educational document
into canonical Question data.

The evidence separates three truths:

1. **Operational truth.** The PDF50 work made admission, jobs, retries,
   checkpoints, fencing, cleanup, and Review-gated persistence durable. Its
   fifty-file evidence is `OPERATIONAL_PDF50_EVIDENCE`, not the primary model
   quality benchmark.
2. **Model truth.** On the same six-source benchmark, Luna and Sol improved
   selected grounding, taxonomy, boundary, answer/solution, and visual metrics.
   The improvements were not uniform. Source sufficiency remained weak,
   answer/solution consistency was non-monotonic, and taxonomy over-tagging and
   visual association remained open.
3. **Product truth.** AI Parsing produces reviewed canonical Question data;
   Blueprint is an ownable generator specification that creates new private
   Review Draft Questions; Practice currently consumes authorized existing
   Questions and does not call Blueprint.

The resulting decision is to design **AI Parsing V2 as a staged,
Provider-neutral data-assimilation pipeline**. V2 separates document
assessment, source boundaries, visuals, answers, solutions, taxonomy, and
quality disposition. Models propose. Application contracts validate and
promote. Human Review remains the only path to approval.

This report does not change production behavior, choose a production Provider,
or approve a migration. It records the decision basis and the contracts that a
future implementation must preserve.

## 2. Audit identity and evidence rules

| Item | Immutable value |
| --- | --- |
| Repository | `1650512585qq-collab/o2iinstitute` |
| Audited authoritative main | `387e65ac0e46d5aa47e18c0f63da59a4d8e08874` |
| Main subject | `Merge pull request #228 from codex/pdf50-scale-qualification` |
| Luna System-Locked PR/head | `#233` / `53d9369c31231279ff6da38126465ea4aaaddf7e` |
| Luna Provider-Native PR/head | `#234` / `09c53fc17a29db66caccc9ec54a7d557dcec7265` |
| Sol System-Locked PR/head | `#235` / `b9468b2e464b8734d7b517c4a135fd6dddbd99c5` |

At the start of this report, fetched `origin/main` still matched the required
main exactly. The three PR heads also matched their frozen values. Their
branches were read as immutable evidence and were not modified.

The report uses three evidence classes:

- **Observed evidence:** persisted benchmark data, executable evaluation,
  live sanitized outcomes, current reachable source, or exact Git history.
- **Architectural inference:** the narrow conclusion supported by multiple
  observations, explicitly labeled as inference rather than a measured fact.
- **Proposed design:** a future V2 contract or rollout decision. It is not
  current runtime behavior.

Unknown values remain unknown. A theoretical reservation is not actual spend.
A Provider-reported token count is not assumed to be tokenizer-equivalent to a
different Provider's count. A six-source benchmark is not a population study.

## 3. Current product truth

### 3.1 AI Parsing

**Definition:** AI Parsing converts a private source into validated,
source-linked, review-gated canonical Question data and private visual assets.

The current reachable Teacher path is:

```text
Teacher Bank import UI
-> reserve burst and upload private source
-> release durable ai_pdf_extract job
-> trusted worker claim, lease, fence, and checkpoint
-> processAIPdfImport
-> Provider extraction
-> application normalization and validation
-> private draft Question and taxonomy rows
-> private visual crop and question_assets rows when applicable
-> pending_review or needs_more_evidence
-> Teacher Review
```

The Admin PDF path converges on the same `processAIPdfImport` application
service. The implementation persists Question content, choices, type,
`answer_spec`, solution fields, taxonomy decisions, page references in import
metadata, Review findings, source lineage, and bounded visual evidence. It
does not contain a general independent mathematics proof engine. A
Provider-supplied answer can pass shape and consistency checks, but semantic
correctness remains a Review responsibility.

Primary current evidence paths include:

- `src/lib/ai-pdf-import/service.ts`
- `src/lib/ai-pdf-import/schema.ts`
- `src/lib/ai-pdf-import/visual-evidence.ts`
- `src/lib/ai-jobs/worker.ts`
- `src/app/teacher/banks/[bankId]/imports/`
- `src/app/admin/imports/pdf/`

### 3.2 Blueprint

**Definition:** A Blueprint is an ownable, versioned, Bank-linked question
generator specification and analysis artifact that can create new private
Review Draft Questions.

The current Teacher path is:

```text
approved Bank Questions or reviewed source evidence
-> Teacher Blueprint Builder
-> owned and versioned QuestionBlueprint
-> durable blueprint_generate_questions job
-> routed Provider generation
-> originality and application validation
-> new private Question
-> pending Review Draft in the linked Bank
```

The current Admin generation path uses a DeepSeek profile. The Teacher path is
Provider-routed and is not universally DeepSeek. Neither path is a general
multi-tool agent. Blueprint supports substantial structure, purpose,
difficulty, answer/distractor patterns, taxonomy, constraints, calibration,
source references, generation count, and originality rules. Its data model has
real private, shared, organization, and public visibility states, but its
member/share UX is not yet as complete as Question Bank collaboration.

Current evidence paths include:

- `src/types/database.ts`
- `src/lib/teacher-blueprint-builder.ts`
- `src/lib/teacher-blueprint-generation.ts`
- `src/app/teacher/blueprints/actions.ts`
- `src/app/admin/blueprints/actions.ts`
- `supabase/clean-migrations/0031_blueprint_library_foundation.sql`

### 3.3 Practice

**Definition:** Practice is a persistent learning workflow that selects
authorized existing Questions, grades and coaches attempts, and stores learner
evidence; it does not currently create canonical Questions or call Blueprint.

Self-directed Practice uses policy-bound taxonomy browsing and Question search
tools, then finalizes a recommendation from existing authorized Question IDs.
Assignment Practice loads the Questions selected into the Assignment and
starts deterministically. Practice can use AI for subjective review, hints,
coaching, and summaries. Objective grading is based on the stored
`answer_spec`. It does not re-solve every Question and does not rewrite the
canonical answer.

```text
authorized Question source
-> self-study recommendation or Assignment selection
-> persistent session and round
-> existing Question snapshots
-> attempt grading, optional hint/review, and reflection
-> wrong-Question, preference, progress, and feedback evidence
-> Student resume and Teacher insight
```

Current evidence paths include:

- `src/lib/practice/ai.ts`
- `src/lib/practice/assignment-linkage.ts`
- `src/app/api/practice/`
- `src/components/practice/`
- `supabase/clean-migrations/0047_practice_self_study_evidence_isolation.sql`
- `supabase/clean-migrations/0048_practice_course_framework_evidence_isolation.sql`

### 3.4 Relationship that must remain explicit

```text
Private source
-> AI Parsing
-> private Review Draft
-> Question Bank
-> Assignment or authorized self-study source
-> Practice
-> durable learner evidence
-> Teacher insight

Reviewed Question examples
-> Blueprint induction or authoring
-> Blueprint generation
-> new private Review Draft Questions
-> Question Bank after Review
```

Practice does not currently have an edge to Blueprint. A future policy-bound
edge is a product proposal, not an existing capability.

## 4. Chronology

### 4.1 PDF50 durable operational recovery

PR `#227` fixed the Gemini Developer API structured-output contract, durable
job execution, successful-persistence telemetry, cancellation authority, and
Teacher status reconciliation. Its approved head was
`94925557301fe35dea3a62e84ee829ab3072db2f`; merge commit
`f229f0fb2396b2bf12661d5a0f40b2b3a57b480a` landed on 2026-08-04.

PR `#228` then qualified admission and worker behavior at four, ten, and fifty
files. The four-file and ten-file gates passed. Later fifty-file evidence
proved rejection of file 51, exact admission of 50, 50 completed jobs/items,
53 private Review Drafts, 52 `pending_review`, one
`needs_more_evidence`, zero approvals/publications/Assignments, and exact
cleanup. A final launcher tail remained blocked by a stale page-1 title
assumption after the durable gates had already completed. That literal blocked
tail was not rewritten as a pass. The operational evidence and the UI-harness
defect were reviewed separately before PR `#228` merged as
`387e65ac0e46d5aa47e18c0f63da59a4d8e08874` on 2026-08-07.

See [PDF50 Scale Qualification](pdf50-scale-qualification.md) and
[PDF50 Worker Checkpoint and Fencing](pdf50-worker-checkpoint-fencing-implementation.md).

**Lesson:** durable admission and safe completion are application properties,
not model-quality scores.

### 4.2 Authoritative taxonomy reconciliation

PR `#214` merged at
`67e643508337ae91bdbfbded782626bf1c5e81c5`. Its decisive expansion commit is
`bfb789c58780a885a9bcf6fba54e96741fe710f9`. Replaying the clean seed followed
by migration 0056 produced the authoritative runtime catalog:

- 439 active canonical nodes;
- 460 active edges;
- 20 normalized aliases;
- 372 effective assignable leaves;
- five facets: curriculum, concept, method, task, and form.

The runtime snapshot SHA-256 is
`05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe`.
The effective-leaf candidate subset SHA-256 is
`fd11666a6ea207244dd5c60529aef812f73c8e82120f02b5348bb4db02970262`.

See [Taxonomy Quality Baseline](taxonomy-quality-baseline.md).

**Lesson:** the model may select only application-supplied active effective
leaves; application validation controls acceptance. Candidate availability
alone does not solve over-tagging or abstention.

### 4.3 Historical visual attachment convergence

The first automatic crop path entered at
`b5e2c954089297cdffe491b72366eb0da4105ecb`. It already used Provider
`asset_placeholders`, PDF rendering, normalized boxes, cropping, and
`question_assets`. It was incomplete: public delivery, random identity,
permissive bounds, incomplete compensation, and warning-only missing figures.

Commit `59ac19df53f5ef4c02528b25aac7bbdf9a3472e0` retained the historical
renderer/cropper while converging it with private requester-first delivery,
deterministic identity, exact lineage, idempotency, bounded crop validation,
compensation, decorative suppression, and the `needs_more_evidence` Review
lock. Later live evidence at `82ebd40b775fd784c24b2fce2e0194e604693c5c`
proved Q1/Q4 attachment, Q2 decorative suppression, Q3 missing-evidence lock,
private owner rendering, reload/remount, cross-organization denial, and zero
residue.

See [Historical Question Visual Pipeline Audit](historical-question-visual-pipeline-audit.md)
and [Question Visual Evidence Regression](question-visual-evidence-regression.md).

**Lesson:** V2 must not create another crop architecture. It should elevate
the existing source-backed visual system into a document-level evidence model.

### 4.4 Gemini Baseline V1

The Gemini benchmark was frozen at `73c667f557ac57605c9717ab8bb7d7a6712d0b78`
and anchored at `85f5eb229f7b93dd8e26b7870c53bf9d892de9bc`.
The trustworthy source head was
`53527d4068d348ffb04093632910da545eca0601`. It established the fixed
six-source quality corpus, immutable evaluator, Provider-neutral usage schema,
and truthful unknown-usage handling.

See [Gemini AI Parsing Baseline V1](gemini-ai-parsing-baseline-v1.md).

### 4.5 Luna System-Locked V1

PR `#233`, frozen head
`53d9369c31231279ff6da38126465ea4aaaddf7e`, changed only the Provider/model
transport needed to run the same frozen production prompt, schema, source
bytes, taxonomy subset, evaluator, and expected outputs through
`gpt-5.6-luna`. It issued six independent requests with
`reasoning.effort=none`, no tools, no retries, and `store=false`.

**Observed result:** taxonomy exact-ID F1 and answer/solution consistency
improved. Draft yield, boundaries, answer correctness, grounding,
insufficient-evidence behavior, and visual association did not.

### 4.6 Luna Provider-Native V1

PR `#234`, frozen head
`09c53fc17a29db66caccc9ec54a7d557dcec7265`, tested explicit caching,
`none` versus `low` reasoning, and PDF plus deterministic page images. It kept
all application validators and the frozen benchmark fixed. The selected
configuration was explicit cache, no reasoning, and PDF plus page images,
fingerprinted as
`feb130c41aa64a4038db4c0045530affaa1f1e2c1601d03a2b49ac305b1364b4`.

**Observed result:** explicit cache was an economic transport gain. Page images
removed one missing-required-visual hard-boundary escape in the selection probe,
but the final benchmark did not materially improve over Luna System-Locked.
The unseen holdout confirmed the same overall pattern.

### 4.7 Sol System-Locked Ceiling V1

PR `#235`, frozen head
`b9468b2e464b8734d7b517c4a135fd6dddbd99c5`, replaced only the model field
in the Luna System-Locked request body with `gpt-5.6-sol`. It used six requests,
no retries, no tools, `reasoning.effort=none`, and the same evaluator and
sources.

**Observed result:** source grounding, page references, boundary F1, and
required visual association improved. Answer correctness did not. Taxonomy
recall rose but precision fell through over-tagging. The insufficient-evidence
case produced no candidate only because the request exhausted its output limit;
that is not clean proof of explicit abstention.

### 4.8 Product-truth audit

A source and Git-history audit against exact main `387e65a` established that:

- AI Parsing is the canonical source-to-Review path;
- Blueprint is a real generator specification, not a quiz assembler;
- Teacher Blueprint generation is routed while Admin generation is DeepSeek;
- generated Questions enter private Review, not publication;
- Practice consumes existing authorized Questions and cannot call Blueprint;
- the competition Demo mixed static presentation with separate historical
  runtime code that generated Questions but used unsafe direct-publish rules.

This product truth narrows V2: improve canonical source assimilation without
folding Blueprint or Practice into the parser.

### 4.9 Why V2 is now required

The current monolithic extraction asks one Provider response to decide document
structure, Question boundaries, answers, solutions, taxonomy, page lineage,
and visuals simultaneously. Stronger models improve parts of that bundle, but
the experiments show persistent cross-cutting failure modes:

- source insufficiency is not decided before answer generation;
- answer and solution consistency does not rise monotonically with model tier;
- taxonomy recall can become over-tagging;
- per-Question visual proposals lack a first-class document visual registry;
- a single invalid sub-contract can invalidate or complicate otherwise useful
  output;
- downstream Blueprint evidence is mixed with Question-instance extraction;
- observability has to reconstruct which stage caused a quality failure.

V2 is therefore a system-contract decision, not a conclusion that Gemini,
Luna, or Sol is categorically good or bad.

## 5. Frozen Provider comparison

### 5.1 Fixed benchmark identity

All system-locked quality rows use the same six rights-safe PDFs. Luna Native's
final benchmark also retains these contracts while changing transport and
representation.

| Contract | SHA-256 |
| --- | --- |
| Benchmark manifest | `6d4fc29a959209f4e9576b76e536fd382131cff8ae11fc8a639f5f8653189712` |
| Evaluation contract | `51ab57b9c372078b5a86af501788949f72d6acaedb076e104873a3199f01036c` |
| Evaluator, normalized LF | `fb48df5c800ec0a93d0215608a989dde9437d9f1b2d0a9e651c96c496ca79306` |
| Parsing contract | `5c19aed2d13c85121d89b09a3a85064f2eea200016560780295f2d7510e9ca95` |
| Taxonomy snapshot | `05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe` |
| Candidate subset | `fd11666a6ea207244dd5c60529aef812f73c8e82120f02b5348bb4db02970262` |

The six source SHA-256 values and their fixed expected outputs are recorded in
`fixtures/ai-parsing-provider-benchmark-v1/manifest.json` on main. Luna and Sol
observations are stored only on their frozen experiment heads.

### 5.2 Model and transport

| Evidence | Model | Reasoning | Transport and source representation |
| --- | --- | --- | --- |
| Gemini Baseline V1 | `gemini-2.5-flash-lite` | No explicit reasoning control; incomplete thinking usage remains unknown | Gemini Developer API raw REST `v1beta generateContent`, Provider file lifecycle, `responseJsonSchema` |
| Luna System-Locked V1 | `gpt-5.6-luna` | `none` | Responses API, exact PDF `input_file`, strict Structured Outputs, no cache treatment |
| Luna Provider-Native V1 final | `gpt-5.6-luna` | `none` selected; `low` probe not selected | Responses API, explicit stable-prefix cache, exact PDF plus deterministic page PNGs at original detail |
| Sol System-Locked Ceiling V1 | `gpt-5.6-sol` | `none` | Byte-equivalent Luna System-Locked request except model field |

### 5.3 Quality comparison

| Metric | Gemini | Luna locked | Luna native final | Sol locked |
| --- | ---: | ---: | ---: | ---: |
| Expected / extracted Questions | 11 / 11 | 11 / 11 | 11 / 11 | 11 / 10 |
| Valid Review Drafts | 8 | 8 | 8 | 9 |
| Valid Draft yield | 0.727273 | 0.727273 | 0.727273 | 0.818182 |
| Question-boundary F1 | 0.909091 | 0.909091 | 0.909091 | 0.952381 |
| Answer correctness | 0.909091 | 0.909091 | 0.909091 | 0.909091 |
| Answer/solution consistency | 0.545455 | 0.727273 | 0.636364 | 0.636364 |
| Source grounding | 0.909091 | 0.909091 | 0.909091 | 1.000000 |
| Page-reference F1 | 0.833334 | 0.923077 | 0.923077 | 0.960000 |
| Taxonomy exact-ID F1 | 0.000000 | 0.571429 | 0.600000 | 0.545455 |
| Visual detection F1 | 0.666667 | 0.666667 | 0.666667 | 0.666667 |
| Required visual association | 0.333333 | 0.333333 | 0.333333 | 0.666667 |
| Wrong visual proposals | 1 | 1 | 1 | 0 |
| Insufficient-evidence score | 0 / 1 | 0 / 1 | 0 / 1 | 1 / 1, output-limit caveat |
| First-attempt completed responses | 6 / 6 | 6 / 6 | 6 / 6 final; no experiment retries | 5 / 6; all attempted once |
| Hard-boundary escapes | 0 | 0 | 0 | 0 |

Sol's insufficiency score must not be read as clean abstention. The request
failed at the 4,096-token output limit and returned zero candidates; the frozen
evaluator correctly scored the observable outcome but cannot infer intent.

### 5.4 Usage, latency, and estimated economics

| Metric | Gemini | Luna locked | Luna native final | Sol locked |
| --- | ---: | ---: | ---: | ---: |
| Input tokens | 69,942 | 70,430 | 86,600 | 70,430 |
| Output tokens | 3,527 | 3,518 | 3,472 | 7,903 |
| Reasoning/thinking tokens | aggregate unknown | 0 | 0 | 0 |
| Total tokens | 73,469 | 73,948 | 90,072 | 78,333 |
| p50 latency | 3.041 s | 3.003 s | 2.635 s | 6.016 s |
| p95 latency | 6.222 s | 7.725 s | 7.453 s | 127.899 s |
| Usage-derived estimate | $0.008405 | $0.109143 | $0.009852 | $0.677257 |
| Estimate per valid Draft | $0.001051 | $0.013643 | $0.001232 | $0.075251 |

Luna Native's table row is its selected final six-source benchmark. The full
21-request treatment, including cache, reasoning, visual selection, final, and
holdout phases, reported 291,787 input, 13,827 output, 256 reasoning, and
305,614 total tokens; p50/p95 latency 2.994/9.447 seconds; and a
usage-derived estimate of $0.041662. Explicit caching recorded 32,316 cache
write tokens and 193,896 cached reads across the complete treatment.

These values are pricing-snapshot estimates, not billing-dashboard actual
spend. Gemini omitted cached-input counts and most thinking-token counts, so
unknown fields remain unknown. Luna and Sol estimates use their experiment-time
official price snapshots. Token counts are Provider-reported and are not
cross-Provider tokenizer equivalents. Conservative exposure reservations are
excluded from this table because they are safety ceilings, not usage.

### 5.5 Interpretation labels

#### MODEL_TIER_GAIN

Under an otherwise locked request, Sol improved source grounding, page
references, boundary F1, and required visual association. Luna improved
taxonomy exact-ID selection and answer/solution consistency relative to
Gemini. These are observed gains, not proof that the larger model is best on a
broader corpus.

#### PROVIDER_TRANSPORT_GAIN

Luna Native explicit caching reduced the current-price-normalized two-probe
estimate from $0.006327 to $0.003852. Page-image input also removed a
missing-required-visual escape in the selection probe. The final benchmark did
not materially outperform system-locked Luna, so the transport gain is mostly
economic and safety-representational rather than a general quality gain.

#### SYSTEM_CONTRACT_LIMIT

Answer/solution consistency was Gemini 0.545455, Luna locked 0.727273, Luna
native 0.636364, and Sol 0.636364. More model capacity did not monotonically
solve it. Source sufficiency stayed at zero clean detections for Gemini and
both Luna variants. Taxonomy also traded recall for precision. These patterns
support separating decisions and deterministic checks in V2.

#### INPUT_REPRESENTATION_LIMIT

All four rows retained visual detection F1 of 0.666667. Page images improved a
selection safety case, and Sol improved required association, but shared visual
and residual association problems survived. The document needs an explicit
visual registry and source relation rather than only per-Question proposals.

#### INCONCLUSIVE_SMALL_SAMPLE

The benchmark has six source documents and eleven expected Questions. It is
designed for reproducible contract comparison, not statistical generalization.
Sol's insufficiency outcome, model-tier boundary gain, and visual gain each
need broader independent evidence before a production Provider decision.

## 6. Architectural lessons

1. **Stronger models help, but only locally.** Luna and Sol improved selected
   grounding, taxonomy, boundary, consistency, and visual metrics. None solved
   the whole assimilation problem.
2. **Source sufficiency is a precondition, not an output decoration.** The
   system must decide whether the source supports an answer before it accepts
   an answer or solution proposal.
3. **Answers and solutions need separate provenance and checks.** Their
   agreement did not track model size monotonically.
4. **Taxonomy selection needs a decision contract.** Candidate retrieval was
   complete, but stronger recall could become over-tagging. Abstention and
   facet-specific evidence must be first-class.
5. **Visuals are document objects.** A graph or table can support multiple
   Questions. Per-Question boxes alone cannot express shared identity, atomic
   facts, or document-level deduplication reliably.
6. **Safety belongs to application validators.** Every experiment recorded zero
   hard-boundary escapes because invalid taxonomy, fabricated pages, missing
   required visuals, publication, and Assignment creation were controlled by
   application contracts rather than model intelligence.
7. **One monolithic schema hides causality.** A staged pipeline can retain valid
   boundaries while quarantining an uncertain answer, or retain a visual
   registry while requesting more evidence for one Question.
8. **Provider neutrality must exist above adapters.** Gemini file lifecycle,
   OpenAI PDF input, cache controls, images, and reasoning settings differ. The
   canonical objects and evaluator must not.

## 7. Proposed AI Parsing V2

Everything in this section is `PROPOSED DESIGN`, not current runtime behavior.

### 7.1 Nontechnical explanation

V1 asks one model to read a document and return almost everything at once. V2
works like a careful editorial team:

1. inspect the document and decide what evidence exists;
2. mark exact Question and answer-key regions;
3. build a shared registry of graphs, tables, and diagrams;
4. propose answers, solutions, and taxonomy separately;
5. run deterministic checks and package only traceable results;
6. send uncertain items to `needs_more_evidence` and all usable items to human
   Review, never directly to students.

The model remains useful, but no single response becomes canonical merely
because it is syntactically valid.

### 7.2 Technical pipeline

```text
private source bytes and immutable source identity
-> DocumentAssessmentV2
-> SourceSpanV2 registry
-> QuestionBlockV2 segmentation
-> VisualObjectV2 registry and VisualFactV2 proposals
-> CanonicalAnswerV2 proposal and provenance
-> AuditableSolutionV2 proposal and deterministic checks
-> TaxonomyDecisionV2 candidates, selections, and abstentions
-> GenerationRelevantFeaturesV2 evidence
-> CanonicalQuestionPackageV2 assembly
-> QualityDispositionV2
-> V1-compatible Review projection
-> human Review
-> approved Question Bank content
```

Each stage receives explicit references to prior validated objects. It does not
silently reinterpret raw source from an unrelated stage. Provider adapters may
use different transports, but they must return the same versioned proposal
contracts.

## 8. V2 contract inventory

### 8.1 `DocumentAssessmentV2`

Purpose: determine whether and how a document can be assimilated before
Question extraction.

Minimum contract:

- source identity and content hash;
- page count and deterministic render identities;
- document classes such as worksheet, answer key, mixed packet, or reference;
- text/image/table availability by page;
- candidate Question and answer-key regions;
- document-level warnings and sufficiency flags;
- assessment contract and adapter versions.

The application validates page existence, hashes, and bounded categorical
values. A model's document class remains a proposal until validated.

### 8.2 `SourceSpanV2`

Purpose: give every extracted claim an immutable location.

Minimum contract:

- source asset identity;
- page number;
- bounded text offsets or normalized page coordinates;
- span kind: stem, part, choice, answer key, solution, caption, or context;
- safe content fingerprint;
- parent/child and continuation relations;
- extraction confidence and ambiguity category.

Canonical packages reference spans. They do not duplicate raw PDF bytes or
unbounded source text into observability records.

### 8.3 `QuestionBlockV2`

Purpose: represent Question boundaries independently of answer quality.

Minimum contract:

- stable block identity derived from source and spans;
- visible number and part structure;
- stem and choice span references;
- Question type proposal;
- continuation and multi-page relations;
- required context and visual references;
- duplicate and overlap checks;
- boundary disposition.

A valid boundary can survive even when the answer or taxonomy needs more
evidence.

### 8.4 `VisualObjectV2`

Purpose: create one document-level registry of source visuals.

Minimum contract:

- deterministic visual identity;
- page and finite normalized bounds;
- source crop and content hashes;
- role candidates: graph, table, diagram, figure, answer figure, decorative;
- shared-group and Question-block relations;
- crop validation outcomes;
- private asset state and requester-first lineage.

The existing `renderPdfPages` and crop pipeline remain the rendering owner.
V2 adds a registry above them; it does not add a second bucket or cropper.

### 8.5 `VisualFactV2`

Purpose: record atomic, reviewable facts visible in a source visual.

Examples include an axis label, a table cell relation, a marked angle, a force
direction, or a curve intercept. Every fact references one or more
`VisualObjectV2` regions and carries:

- bounded fact type;
- normalized value or relation;
- source-region reference;
- proposal Provider/contract identity;
- deterministic validation where possible;
- confidence and ambiguity;
- Review state.

Provider prose is not persisted as an unbounded visual description. Only
bounded facts required for the Question package are retained.

### 8.6 `CanonicalAnswerV2`

Purpose: separate answer content from answer provenance.

Minimum contract:

- normalized answer representation;
- provenance: `SOURCE_EXPLICIT`, `DETERMINISTIC_DERIVED`,
  `PROVIDER_PROPOSED`, or `HUMAN_REVIEWED`;
- supporting source spans or deterministic derivation inputs;
- choice/numeric/symbolic/unit constraints;
- contradiction checks;
- confidence and unresolved assumptions;
- Review state.

`PROVIDER_PROPOSED` is never promoted to `HUMAN_REVIEWED` automatically.

### 8.7 `AuditableSolutionV2`

Purpose: make a solution inspectable and test its relationship to the answer.

Minimum contract:

- ordered bounded steps;
- source-derived versus model-derived step provenance;
- explicit final-answer reference;
- assumptions and required visual facts;
- deterministic checks: option membership, numeric/unit equivalence,
  final-answer agreement, and contradiction detection where supported;
- unsupported-step and unresolved-proof flags;
- Review state.

V2 does not claim that deterministic checks prove every mathematical solution.
Uncheckable semantics remain visible to Review.

### 8.8 `TaxonomyDecisionV2`

Purpose: separate candidate retrieval from final tag decisions.

Minimum contract:

- taxonomy snapshot and candidate-subset hashes;
- candidates grouped by the five exact facets;
- selected active effective-leaf IDs;
- per-selection evidence references;
- explicit per-facet abstention;
- rejected candidate reasons;
- broad-parent, wrong-facet, unknown, and inactive validation results;
- Review state.

No facet is filled merely to produce a complete-looking five-facet output.

### 8.9 `GenerationRelevantFeaturesV2`

Purpose: retain evidence that may later support Blueprint induction without
turning one parsed Question into a Blueprint.

Minimum contract:

- structural pattern and part topology;
- variable and parameter candidates;
- invariants and constraints;
- difficulty evidence;
- distractor and answer-form patterns;
- required visual roles and relations;
- source Question and Review identities;
- confidence and exclusions.

This object is candidate evidence only. It is not named or treated as an
approved Blueprint.

### 8.10 `CanonicalQuestionPackageV2`

Purpose: bind the validated pieces into one versioned Review unit.

Minimum contract:

- Question block, answer, solution, visual, taxonomy, and generation-feature
  references;
- source, Bank, import, and Review lineage;
- component contract versions and fingerprints;
- proposal and application-validation outcomes;
- unresolved requirements;
- immutable package hash;
- compatibility projection version.

The package is canonical for Review, not approved for assignment.

### 8.11 `QualityDispositionV2`

Purpose: make the application, not the Provider, decide the next safe state.

Proposed states:

- `READY_FOR_REVIEW`: required contracts are present and traceable;
- `NEEDS_MORE_EVIDENCE`: a required answer, source span, visual, or solution
  relation is missing or ambiguous;
- `QUARANTINED`: conflicting or unsafe proposals require support review;
- `REJECTED`: the source or package cannot satisfy bounded contracts;
- `SUPERSEDED`: a later idempotent package version replaces this one.

None of these states equals approval, publication, or Assignment visibility.

## 9. Proposal versus authoritative state

### 9.1 AI-proposed

- document class and region candidates;
- Question boundaries and type;
- visual roles and facts;
- answers and solution steps;
- taxonomy selections;
- generation-relevant features;
- confidence and ambiguity labels.

### 9.2 Application-authoritative

- source identity, page existence, hashes, and Bank ownership;
- finite span/crop bounds and deterministic asset identity;
- active taxonomy catalog and eligible candidate set;
- schema versions and validation outcomes;
- duplicate, overlap, choice, numeric, unit, and consistency checks;
- private asset authorization;
- package fingerprint and quality disposition;
- Review, approval, publication, and Assignment states.

### 9.3 Saved

- product-required Question content and normalized answer/solution data;
- bounded source/page/span and visual lineage;
- private crop identity and safe visual facts;
- taxonomy decisions and abstentions;
- generation-relevant candidate evidence;
- numeric/categorical validation outcomes;
- contract versions, hashes, attempt reasons, and safe usage aggregates;
- human Review changes and final provenance.

### 9.4 Never saved in V2 evidence or diagnostics

- credentials, tokens, signed URLs, or credential-bearing endpoints;
- raw Provider requests or responses;
- complete prompts or unbounded source excerpts;
- base64 PDF/image payloads;
- transient retry payloads or hidden reasoning;
- private filenames, user identities, or unrelated object paths;
- unsupported claims labeled as authoritative;
- theoretical reservation labeled as actual spend.

The existing private source object may remain under its approved retention
policy. The prohibition is against duplicating it into V2 package,
observability, or experiment evidence.

## 10. Source sufficiency and answer provenance

V2 should decide source sufficiency before answer promotion:

```text
Does the source explicitly contain an answer?
  yes -> bind SOURCE_EXPLICIT spans
  no  -> is deterministic derivation supported for this Question type?
          yes -> record DETERMINISTIC_DERIVED inputs and checks
          no  -> Provider may propose, but disposition cannot claim source truth
```

An educational Question can be solvable even when the source lacks an answer
key. V2 may preserve a Provider-proposed answer for Review, but it must not
describe that proposal as extracted from the source. If the Question depends
on missing context or a missing visual, the package becomes
`NEEDS_MORE_EVIDENCE` before answer acceptance.

Answer and solution are checked separately. The solution must reference the
same final answer and required facts. A mismatch cannot be repaired by choosing
whichever string looks more plausible.

## 11. Blueprint relationship

```text
Question Instance != Question Family != Blueprint
```

- A **Question Instance** is one concrete problem with concrete values, source
  lineage, answer, solution, taxonomy, and visuals.
- A **Question Family** is an evidence-backed pattern observed across approved
  instances.
- A **Blueprint** is a reviewed, ownable, versioned generator specification
  that can create new private Review Draft Questions.

Example:

```text
Source instance:
8 N right
3 N left

Question Instance data:
two opposing horizontal forces; concrete values 8 and 3; net force 5 N right

GenerationRelevantFeaturesV2 candidates:
two signed force magnitudes; non-equal values; direction follows larger force;
answer invariant is signed difference; units remain newtons

Future reviewed Blueprint:
generate an original opposing-force Question under validated parameter ranges,
preserve the invariant, produce a consistent answer and solution, and route the
new Question to private Review
```

The one instance does not prove safe parameter ranges, difficulty behavior, or
distractor patterns. Blueprint induction should aggregate multiple approved
examples, validate invariants, and require human authoring/Review. V2 may emit
`GenerationRelevantFeaturesV2`; it must never label those features
`blueprint_candidate_features` as an approved Blueprint.

Practice remains unchanged during V2 foundation and shadow validation. Future
Practice-to-Blueprint invocation requires a separate capability, authorization,
cost, Review, and learner-safety design.

## 12. V1 compatibility

V2 must be additive until proven:

1. retain the current private source, durable job, Bank, Review Draft,
   `question_assets`, and requester-first asset boundaries;
2. version every V2 contract and compute deterministic package hashes;
3. provide a one-way `CanonicalQuestionPackageV2 -> V1 Review DTO` projection;
4. compare V2 shadow output with the frozen V1 evaluator without writing V2
   output into production Questions during P0/P1;
5. never project a `NEEDS_MORE_EVIDENCE`, `QUARANTINED`, or `REJECTED` package
   as approval-ready;
6. preserve current source Review lineage and legacy readers until an explicit
   migration plan proves parity;
7. keep Practice and Assignment snapshots on their current contracts until a
   separate compatibility review.

No migration is specified by this report. Persistence design must follow the
forward-only migration process after source/fake contract review.

## 13. Implementation roadmap

### P0: source/fake V2 foundation

Scope:

- define Provider-neutral TypeScript/Zod contracts for all eleven V2 objects;
- build deterministic fixture constructors and version/fingerprint utilities;
- split the evaluator by boundary, answer, solution, taxonomy, and visual
  stages;
- implement fake adapters and adversarial mutation tests;
- implement V1 Review DTO projection in memory;
- preserve current production parsing and Practice behavior.

Exit criteria:

- all contracts reject unknown versions, invalid bounds, fabricated pages,
  invalid taxonomy, inconsistent answers, missing required visuals, duplicate
  identities, and unsafe dispositions;
- no Provider or hosted operation is required;
- frozen V1 evidence and fingerprints remain unchanged.

### P1: Luna V2 shadow validation

Scope:

- run a separately authorized Luna shadow experiment on the exact benchmark
  plus an independently frozen broader holdout;
- compare V1 and V2 with the same source bytes and safety boundaries;
- capture stage-specific usage, latency, failure, and quality aggregates;
- write no canonical production Questions.

Exit criteria:

- source sufficiency, answer/solution, taxonomy precision, visual association,
  and valid package yield improve without a hard-boundary regression;
- every result is reproducibly bound to contracts, corpus, model, and pricing
  snapshot;
- no production Provider switch is implied.

### P2: controlled Teacher Review pilot

Scope:

- create V2 packages for an approved disposable/controlled cohort;
- show source spans, provenance, visual facts, taxonomy abstention, and quality
  disposition in Teacher Review;
- compare edit burden, acceptance, rejection, and `needs_more_evidence` rates;
- keep V1 as the operational fallback.

Exit criteria:

- Teacher reviewers can understand why each answer, solution, tag, and visual
  exists;
- no unreviewed content reaches a Bank-approved or student-facing state;
- exact cleanup and rollback to V1 projection are proven.

### P3: V2 default

Scope:

- make V2 the default assimilation path only after the pilot gate;
- retain explicit compatibility projection and observability;
- freeze a forward-only persistence/migration plan;
- monitor quality disposition, reviewer burden, cost, and failure stages.

Exit criteria:

- operational SLOs and Review-quality thresholds are met;
- rollback changes routing, not historical source or Review evidence;
- no migration history is fabricated or rewritten.

### P4: Blueprint consumption and future callable-tool integration

Scope:

- aggregate approved `GenerationRelevantFeaturesV2` across multiple examples;
- provide a reviewed Blueprint induction workflow;
- expose a narrow policy-bound Blueprint generation tool to approved server
  callers;
- separately evaluate future Practice invocation.

Exit criteria:

- generated Questions always enter private Review;
- tool callers cannot bypass Bank ownership, authorization, quotas, or Review;
- Practice access, if added, is separately approved and learner-safe.

Practice behavior must not change in P0 or P1.

## 14. Risks and controls

| Risk | Required control |
| --- | --- |
| V2 duplicates current crop/storage architecture | Reuse current renderer, cropper, private bucket, asset table, and requester-first route |
| Staged calls multiply cost | One durable attempt owner, stage budgets, source-byte accounting, cached immutable context, and fail-closed aggregate limits |
| More stages create inconsistent truth | Immutable object identities, explicit dependencies, package hash, and single application disposition owner |
| Source text leaks into evidence | Safe numeric/categorical diagnostics, bounded fingerprints, and no raw requests/responses |
| Taxonomy precision falls while recall rises | Facet-specific evidence, explicit abstention, effective-leaf validation, and precision gates |
| Provider proposes a plausible unsupported answer | Provenance state, sufficiency gate, deterministic checks, and human Review |
| Visual facts attach to the wrong Question | Document registry, finite bounds, shared-group semantics, exact source lineage, and mutation tests |
| Generation evidence is mistaken for Blueprint | Distinct `GenerationRelevantFeaturesV2` type and multi-example reviewed induction |
| V2 changes Practice accidentally | No Practice imports/callers in P0/P1 and dedicated source-contract smoke |
| Provider benchmark overfits six sources | Frozen benchmark plus independently authored holdout before Provider observation |
| Model costs are misreported | Provider-reported usage, pricing snapshot, unknown preservation, and reservation/actual separation |

## 15. Frozen invariants

The following remain non-negotiable across every phase:

- private source and Bank scope by default;
- one durable attempt owner with bounded retries and truthful attempt reasons;
- checkpoint, lease, fencing, idempotency, and exact cleanup;
- Provider output is untrusted;
- active effective-leaf taxonomy IDs only;
- finite source/page/visual lineage;
- deterministic private asset identity and requester-first delivery;
- missing required evidence blocks approval;
- no AI auto-approval, auto-publication, or Assignment creation;
- human Review before student-facing use;
- no Blueprint generated Question bypasses Review;
- Practice uses existing authorized Questions until separately changed;
- no secret, prompt, source payload, raw response, or signed URL in evidence;
- missing usage is unknown, never zero;
- operational PDF50 evidence remains separate from model-quality evidence;
- frozen Gemini, Luna, and Sol observations are never retuned or rewritten.

## 16. Decision register

| Decision | Status | Basis |
| --- | --- | --- |
| Preserve current PDF50 durable worker foundation | Accepted | Operational evidence and application safety are independent of V2 semantic staging |
| Replace monolithic semantic extraction with staged V2 contracts | Proposed for P0 | Persistent source-sufficiency, consistency, taxonomy, visual, and causality gaps |
| Keep canonical contracts Provider-neutral | Accepted design constraint | Gemini/Luna/Sol transports differ while product invariants do not |
| Use Luna as the first V2 shadow candidate | Proposed for P1, separately authorized | Luna improved taxonomy/consistency and has suitable transport controls; no production switch implied |
| Adopt Sol as production parser | Not decided | Quality gains are mixed, sample is small, latency/cost are high, and insufficiency evidence is caveated |
| Change Practice during V2 foundation | Rejected for P0/P1 | Product truth places Practice downstream of approved existing Questions |
| Treat generation-relevant features as Blueprint | Rejected | Instance evidence is not a reviewed generator specification |
| Add a new visual crop/storage path | Rejected | Historical and current systems already converge on one hardened path |

## 17. Glossary

- **AI Parsing:** private-source assimilation into Review-ready canonical
  Question data.
- **Question Instance:** one concrete Question with its exact values, answer,
  solution, source, taxonomy, and visuals.
- **Question Family:** a pattern inferred from multiple approved Question
  instances.
- **Blueprint:** an owned, reviewed generator specification that creates new
  private Review Draft Questions.
- **Practice:** the student learning workflow over authorized existing
  Questions; currently not a Blueprint caller.
- **Canonical:** application-validated and versioned for a defined product
  stage. It does not mean human-approved unless the Review state says so.
- **Source sufficiency:** whether the available source supports the claimed
  Question, answer, solution, and visual evidence.
- **Provenance:** the trace from a product claim back to source spans,
  deterministic derivation, Provider proposal, or human Review.
- **Quality disposition:** the application-owned decision about whether a
  package is ready for Review, needs evidence, is quarantined, or is rejected.
- **Hard-boundary escape:** unsafe content that passes an application safety
  gate, such as fabricated pages, invalid taxonomy, missing required visuals,
  or auto-publication.
- **System-locked comparison:** a model comparison that freezes prompt,
  sources, schema, evaluator, and application boundaries.
- **Provider-native experiment:** a bounded experiment that changes transport
  controls such as caching, reasoning, or image representation while retaining
  product validators.
- **Usage-derived cost:** a price-snapshot calculation from reported usage; it
  is not a billing-dashboard actual-spend claim.

## 18. Evidence index

Current-main evidence:

- [Gemini AI Parsing Baseline V1](gemini-ai-parsing-baseline-v1.md)
- [Gemini Parsing Efficiency Baseline](gemini-parsing-efficiency-baseline.md)
- [PDF50 Scale Qualification](pdf50-scale-qualification.md)
- [Taxonomy Quality Baseline](taxonomy-quality-baseline.md)
- [Question Visual Evidence Regression](question-visual-evidence-regression.md)
- [Historical Question Visual Pipeline Audit](historical-question-visual-pipeline-audit.md)
- `fixtures/ai-parsing-provider-benchmark-v1/manifest.json`
- `fixtures/ai-parsing-provider-benchmark-v1/evaluation-contract.json`
- `fixtures/ai-parsing-provider-benchmark-v1/gemini-observations.json`

Frozen experiment evidence:

- PR `#233` head `53d9369c...`:
  `docs/architecture/luna-ai-parsing-system-locked-v1.md` and
  `fixtures/ai-parsing-provider-benchmark-v1/luna-observations.json`.
- PR `#234` head `09c53fc1...`:
  `docs/architecture/luna-ai-parsing-provider-native-v1.md` and
  `fixtures/ai-parsing-provider-native-v1/observations.json`.
- PR `#235` head `b9468b2e...`:
  `docs/architecture/sol-ai-parsing-system-locked-ceiling-v1.md` and
  `fixtures/ai-parsing-sol-ceiling-v1/observations.json`.

## 19. Final conclusion

Gemini proved the safe operational foundation and established the reproducible
quality baseline. Luna showed that model and transport changes can improve
specific quality and economic dimensions without changing application safety.
Sol showed a higher ceiling for grounding, page lineage, boundaries, and some
visual association, while also demonstrating that cost, latency,
answer/solution consistency, taxonomy precision, and source sufficiency do not
disappear with model scale.

The product-truth audit prevents the V2 response from expanding into the wrong
domain. AI Parsing should produce reliable Question Instance data. Blueprint
should consume reviewed examples to become a reusable generator specification.
Practice should remain downstream of approved existing Questions until a
separate policy-bound Blueprint invocation design is approved.

The correct next step is P0 source/fake contract work, not a production
Provider switch and not a paid rerun of the frozen experiments.

Final classification: `AI_PARSING_V2_REPORT_READY_FOR_REVIEW`.
