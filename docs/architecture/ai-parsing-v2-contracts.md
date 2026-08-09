# AI Parsing V2 Contracts

Status: source/fake P0 contract reference

Canonical version: `ai_parsing_canonical_v2`

Provider proposal version: `ai_parsing_proposal_v2`

## Authority boundary

| Layer | May contain | May not decide |
| --- | --- | --- |
| Provider proposal | source-span proposals, question boundaries, visual facts, typed-answer proposals, auditable solution steps, taxonomy candidates, generation observations | Bank scope, canonical lineage, Review state, quality disposition, approval, publication, Assignment, persistent asset identity |
| Validation context | allowed source and pages, Bank scope, source fingerprints, taxonomy snapshot and bounded candidate set, contract fingerprints, maximum question count | Provider content or product publication state |
| Canonical extraction | only application-validated proposal data plus application authority fields and findings | hidden reasoning, unvalidated IDs, public asset URLs, approval, publication, Assignment |
| V1 projection | pure private Review DTOs in `pending_review` or `needs_more_evidence` | database writes, generated IDs, auto-approval, publication, assignment |

`DocumentExtractionProposalV2` and `DocumentExtractionV2` are different strict
schemas. Canonical objects carry `authority: application_validated`; proposal
objects cannot supply that field. Application-owned `QualityDispositionV2` is
never accepted from Provider output.

## Contract family

| Contract | Purpose | Required authority checks |
| --- | --- | --- |
| `DocumentAssessmentV2` | Classifies source sufficiency | One of `extractable`, `no_questions`, `insufficient_evidence`, `unsupported_source`; evidence IDs resolve |
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
explicit, and a visual fact cannot be attached to an unrelated Question.

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
Parsing does not create a Blueprint. A future Blueprint may consume these
observations under its own ownership, versioning, review, and generation gate.

## Projection and diagnostics

The V2-to-V1 projection is pure. It requires the caller's Bank scope to match
the canonical extraction, escapes Provider text before HTML projection, and
emits only private Review DTOs. It has no database, Storage, Provider, queue,
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
