# AI Parsing Quality and Efficiency

## Decision

The canonical workflow remains:

`private source -> AI Parsing -> Review Draft -> Bank -> Assignment -> Practice evidence`

This change hardens the Parsing-to-Review boundary without changing the
Provider setting, model, publication rules, or Assignment behavior. The
immutable comparison baseline is commit
`f1ce7bcb791604468693ea945401cfb157e64d97`. The treatment contract is
`ai-pdf-parsing/provider-neutral-v2`.

The source and local-evaluation foundation is ready. PDF50 remains partially
qualified because the prior authorized scale run completed 23 of 50 jobs and
the remaining paid budget cannot fund a fresh controlled 50-file run. Question
visual attachment is source-ready, but a representative real image-rich PDF
proof is still pending.

## Current call graph

1. A Teacher submits a private Bank-scoped PDF.
2. Durable `ai_provider_jobs` admission records the source and exact job.
3. The worker resolves a server-owned Provider route and one bounded execution
   budget.
4. `processAIPdfImport` performs preanalysis, selective/full source selection,
   Provider extraction, application validation, boundary/duplicate checks, and
   Review Draft persistence.
5. Visual proposals are validated against source pages, cropped
   deterministically, stored in the private `question-assets` system, and
   associated with the Draft.
6. Approval remains blocked for missing required evidence or unresolved image
   placeholders. AI never approves, publishes, or assigns.

Coverage Recovery uses the same Provider-neutral quality observer and visual
attachment boundary on server-selected source windows. Blueprint behavior is
unchanged.

## Versioned observability

`qualityObservatory` records bounded numeric and enum-only evidence:

- parsing contract, observatory, and attempt-reason versions;
- attempts per job and reason histogram;
- initial, transport retry, fallback, structural/application repair, and
  source-recovery reasons;
- exact safe Provider error categories (for example rate limit, busy, timeout,
  network, invalid request, and budget exhaustion) instead of one generic
  Provider/network bucket;
- source, prompt, schema, repair-context, and taxonomy byte composition;
- repeated-source and context-overhead ratios;
- raw/schema-valid/application-valid/rejected candidate counts;
- persisted Drafts, duplicate count, unknown taxonomy IDs, and warnings;
- available Provider token usage and output-per-valid-Draft ratios;
- checkpoint replay count and visual proposal/crop/attachment/block/decorative-
  suppression counts.

It does not record prompts, source text, filenames, private identifiers,
credentials, raw Provider output, or question content. Existing aggregate
`providerRetryAttempts` remains for compatibility but is explicitly legacy and
must not be used to infer why an attempt occurred.

## Retry treatment

The baseline nested extraction, transport, route-fallback, and durable retry
layers made an inference-count delta observable but not its cause. Therefore,
the 25 extra attempts in the partial 50-file run are classified as
`LEGACY_REASON_UNKNOWN`; they are not retrospectively assigned to schema,
network, fallback, or semantic recovery.

The treatment keeps validation strict and changes only context selection:

- first extraction: source + prompt + schema + taxonomy;
- non-JSON or structural/application repair: previous bounded response and
  safe validation feedback, without uploading the PDF again;
- zero-importable semantic recovery: source is included once because the
  model may need source evidence;
- transport retry and fallback: explicit reason and route position;
- checkpoint replay: zero Provider inference and a separate replay counter.

The full taxonomy catalog remains in the first attempt. Candidate-subset
retrieval is held until recall evidence exists. A separate taxonomy inference
pass was rejected because it adds cost and another failure boundary.

## Deterministic evaluation

The repository-authored Golden Corpus contains 14 parsing, 6 taxonomy, and 13
visual cases. It covers plain and multiple questions, MCQ/FRQ, equations,
tables, OCR noise, columns, duplicate pages, cross-page questions and answer
keys, taxonomy ambiguity, no-question/insufficient-evidence rejection, shared
figures, graphs, geometry/mechanics diagrams, answer figures, required tables,
decorative images, low-resolution crops, and missing visual evidence.

The evaluator reports precision/recall/F1 for question boundaries, answer
pairing, page attribution, exact taxonomy assignment, facet assignment, and
visual association. Hard-zero gates cover:

- duplicate questions or assets;
- fabricated page references;
- unvalidated answers;
- unknown taxonomy IDs;
- missing required visual evidence left approvable;
- automatic approval/publication and cross-organization visibility.

Ten independent mutations prove those gates fail on meaningful regressions,
including a decorative-image attachment regression.
Fixture ordering does not change results. This is deterministic local evidence,
not a substitute for a blind human review or a paid Provider benchmark.

## Controlled findings

| Treatment | Decision | Reason |
| --- | --- | --- |
| Exact five-facet taxonomy with abstention | Adopt | Removes forced over-tagging pressure |
| Text-only structural repair | Adopt | Avoids repeating source bytes when source understanding already exists |
| One source-backed zero-importable recovery | Preserve | Semantic recovery can require source evidence |
| Candidate taxonomy subset | Hold | Recall loss is not yet bounded |
| Separate taxonomy model pass | Reject | Adds inference cost and failure surface |
| Deterministic visual identity and crop validation | Adopt | Prevents duplicate/random asset creation |
| Review lock during cross-system visual persistence | Adopt | Failure remains review-blocked |

The controlled local context model measures 169,514 baseline bytes and 194,865
treatment bytes for its synthetic matrix. The treatment is intentionally not a
raw byte-minimization claim: it adds versioned metrics, visual integrity, and
taxonomy safety while removing repeated source bytes from structural repair.
Only a same-fixture paid comparison can establish token, latency, or cost
improvement.

## Rollout gates

Before enabling the treatment for broad Provider-backed qualification:

1. Verify immutable baseline and treatment fingerprints.
2. Keep the same source fixture, Provider profile, model, output-token cap, and
   execution budget for A/B comparison.
3. Require all hard-zero gates to remain zero.
4. Require no regression in boundary, answer, page, taxonomy, or visual F1.
5. Compare input tokens, attempts per job, repeated-context ratio, valid Drafts
   per input token, latency, and estimated cost per valid Draft.
6. Run a blind human packet review for correctness and missing evidence.
7. Stop on any privacy, Bank-scope, Review Gate, cleanup, or lineage failure.

No additional paid run was performed by this change.
