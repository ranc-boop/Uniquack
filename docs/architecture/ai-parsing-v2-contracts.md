# AI Parsing V2 Contracts

Status: source/fake P0 contract reference

Canonical version: `ai_parsing_canonical_v2`

Provider proposal version: `ai_parsing_proposal_v2`

## Authority boundary

| Layer | May contain | May not decide |
| --- | --- | --- |
| Provider proposal | source-span proposals, question boundaries, visual facts, typed-answer proposals, auditable solution steps, taxonomy candidates, generation observations | Bank scope, canonical lineage, Review state, quality disposition, approval, publication, Assignment, persistent asset identity |
| Validation context | allowed source and pages, Bank scope, application preanalysis evidence, source fingerprints, taxonomy snapshot and bounded candidate set, contract fingerprints, maximum question count | Provider content or product publication state |
| Canonical extraction | only application-validated proposal data plus application authority fields and findings | hidden reasoning, unvalidated IDs, public asset URLs, approval, publication, Assignment |
| V1 projection | pure private Review DTOs in `pending_review` or `needs_more_evidence` | database writes, generated IDs, auto-approval, publication, assignment |

`DocumentExtractionProposalV2` and `DocumentExtractionV2` are different strict
schemas. Canonical objects carry application authority fields; proposal objects
cannot supply them. `DocumentAssessmentV2` retains the Provider assessment as a
proposal while separately recording application-derived evidence state and
sufficiency. Application-owned `QualityDispositionV2` is never accepted from
Provider output.

## Contract family

| Contract | Purpose | Required authority checks |
| --- | --- | --- |
| `DocumentAssessmentV2` | Reconciles proposed source sufficiency with application evidence | Provider proposal is retained; application evidence is independently classified as `extractable`, `no_questions`, `insufficient_evidence`, `ambiguous`, or `unsupported_source` |
| `SourceSpanV2` | Binds evidence to source, page/region, role, and local Question IDs | Source and pages are allowlisted; exact fingerprints and region bounds validate |
| `QuestionBlockV2` | Represents standalone, multipart, shared, continued, or ambiguous boundaries | Parent, child, option, prompt, and visual references resolve locally |
| `VisualObjectV2` | Registers question, answer-key, shared, decorative, missing, or ambiguous visuals | Source-bound; finite normalized regions; deterministic crop proposal identity only |
| `VisualFactV2` | Represents a bounded observation from a visual | Fact, visual, evidence span, and associated Question all agree |
| `CanonicalAnswerV2` | Stores typed answer semantics | Type-specific validation plus evidence provenance and support status |
| `AuditableSolutionV2` | Stores visible concise solution steps and conclusion | Evidence-backed steps and deterministic final-answer consistency; no hidden chain-of-thought |
| `TaxonomyDecisionV2` | Assigns an exact taxonomy candidate or abstains | Exactly five facets; assigned ID must be active, assignable, effective-leaf, in-facet, and in the candidate set |
| `GenerationRelevantFeaturesV2` | Preserves future Blueprint-relevant observations | Candidate-only Provider proposals with evidence; never an authoritative Blueprint |
| `QualityDispositionV2` | Records application outcome | Application-derived only: `review_ready`, `needs_more_evidence`, `insufficient_source`, `invalid_provider_output` |
| `CanonicalQuestionPackageV2` | Groups one validated Question, answer, solution, taxonomy, generation observations, and disposition | Same source/Question/Bank boundary throughout |
| `DocumentExtractionV2` | Versioned canonical document result | Validated assessment, spans, visuals, packages, findings, Bank scope, and immutable contract fingerprints |

## Source evidence

Evidence roles are `prompt`, `option`, `answer_key`, `worked_solution`,
`explanation`, and `required_visual`. Precision is explicitly `exact`,
`page_level`, `region_level`, or `unknown`.

Every source span includes `questionIds`. This makes shared prompt, shared
answer-key, and shared visual evidence explicit while preventing an answer or
solution from borrowing evidence associated only with another Question.
`exact` requires an allowlisted text SHA-256. `region_level` requires finite
normalized coordinates wholly inside the page. Known precision requires page
lineage. Cross-page evidence uses ordered page bounds.

Question boundary kinds are `standalone`, `multipart_parent`,
`multipart_child`, `shared_prompt`, `cross_page_continuation`, `shared_visual`,
`answer_key_continuation`, and `ambiguous`. Impossible, foreign, inverted,
missing, or cyclic references fail closed.

The application context also carries source-preanalysis evidence that is not
part of the Provider response. Question evidence records source-owned page
bounds, an optional exact text fingerprint, and any deliberate multipart or
shared-prompt relationship. Visual evidence records an exact source region and
the application Question-evidence IDs that region may support. Provider spans
must match this evidence before they can become canonical. A Provider cannot
make an abstention authoritative merely by returning an empty proposal, and it
cannot manufacture a Question from answer-only, incomplete, or unsupported
application evidence.

## Answers and solutions

Answer kinds are multiple choice, boolean, numeric, short text, free response,
and multipart. Provenance is one of:

- `source_answer_key`;
- `source_worked_solution`;
- `source_explicit_answer`;
- `model_derived`.

Support remains separate: `source_supported`, `inferred`, or `unsupported`.
Numeric answers retain unit and tolerance. Multipart answers recursively bind
child answers. The application checks MCQ option membership, numeric
finiteness, child coverage, provenance-compatible evidence roles, and the
solution conclusion against the canonical answer.

Auditable solution steps are user-visible concise mathematical or explanatory
steps. Hidden reasoning or chain-of-thought has no field in either proposal or
canonical schema.

## Visuals and private assets

P0 adapts the mature V1 visual proposal kernel rather than adding a renderer or
cropper. It reuses normalized-bound checks and the existing deterministic crop
proposal key. A persistent private asset identity can be derived only after
authoritative crop bytes exist; the source/fake canonical object keeps that
identity `null`.

Decorative visuals do not project as Question assets. Missing required visuals
produce `needs_more_evidence`. Shared visual-to-Question relationships are
explicit, and a visual fact cannot be attached to an unrelated Question. The
candidate visual page never authorizes itself: an exact application visual
region must independently support every associated application Question
evidence ID. This preserves explicitly supported cross-page, shared,
answer-key, and multiple-visual relationships while rejecting a self-consistent
Provider reassignment between two real Questions.

## Generation observations

`GenerationRelevantFeaturesV2` has exactly these fields:

1. `instanceSpecificDetails`
2. `parameterCandidates`
3. `invariantCandidates`
4. `reasoningOperators`
5. `solutionSkeleton`
6. `answerDerivationRelation`
7. `visualGrammarObservations`
8. `difficultySignals`
9. `distractorObservations`
10. `surfaceSpecificDetails`

Each observation is `candidate_only`, Provider-proposed, and evidence-linked.
Its `providerObservedInstanceCount` is the literal value `1`; it names the one
source instance observed by the Provider and cannot be read as
application-observed recurrence across documents. Future recurrence aggregation requires a
separate application-owned contract.
Parsing does not create a Blueprint. A future Blueprint may consume these
observations under its own ownership, versioning, review, and generation gate.

## Projection and diagnostics

The V2-to-V1 projection is pure. It requires the caller's Bank scope to match
the canonical extraction, escapes Provider text before HTML projection, and
emits only private Review DTOs. Canonical multipart parent and child packages
project as one current-V1 `mixed` Question; child prompts, answers, lineage, and
the strictest child Review state remain in that one DTO rather than becoming
duplicate Question rows. It has no database, Storage, Provider, queue,
publication, or Assignment side effect.

`toSafeCanonicalizationSummaryV2` is the only intended diagnostic summary. It
contains a version, success flag, application disposition, package count, and
bounded issue codes. It excludes prompts, source text, filenames, raw Provider
responses, credentials, private IDs, and asset paths.

## Frozen identities

The foundation registry binds canonical and file-byte SHA-256 values for the
development corpus and frozen holdout. Its Provider contract component binds
the canonical contract version, evaluator version, prompt contract version,
policy prefix, Provider-visible schema, task instructions, and combined parsing
contract inputs. Every composed request and canonical extraction additionally
binds its request-specific authoritative taxonomy snapshot and candidate-subset
hashes into the combined parsing-contract fingerprint. Later experiments must
use a new version rather than silently changing these bytes.
