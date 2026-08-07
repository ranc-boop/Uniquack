# Question Visual Evidence Regression

## Historical evidence

Commit `b5e2c954089297cdffe491b72366eb0da4105ecb` introduced the original AI PDF
import path, including `asset_placeholders`, PDF page rendering/cropping,
question asset upload, and Review rendering. Git history establishes intended
ownership; it is not by itself proof that the current path works.

The baseline code retained a reachable crop path, but the PDF50 qualification
fixtures were text-heavy and did not exercise it. Source audit found random
asset IDs, permissive bbox clamping, incomplete visual semantics, no hard
approval block for a failed required crop, no recovery-path attachment, and an
incomplete cross-system compensation boundary.

The first unsafe transition was not Provider output or PDF rendering. It was
the normalization/persistence boundary: invalid required proposals could be
dropped without preserving a blocking requirement, and asset writes lacked a
complete deterministic, compensating transaction boundary. Teacher Review
already had an authorized requester-scoped asset DTO and render path, so no
parallel Admin-only image system was restored.

## Current call graph

`Provider output`
-> normalize `asset_placeholders`
-> validate page/bbox/role/ownership evidence
-> deterministic PDF crop
-> validate PNG dimensions, size, and entropy
-> content hash and deterministic asset identity
-> private `question-assets` object and `question_assets` row
-> question association and Review Draft visual record
-> protected `/api/question-assets/[assetId]` rendering
-> approved Bank/Assignment/Practice/Student rendering under existing
requester-first authorization.

Coverage Recovery remaps its bounded subset pages back to original source page
numbers and uses the same attachment function. No parallel visual store or
public Storage URL was added.

### Reused versus replaced

Reused: the historical `asset_placeholders` proposal field, authoritative PDF
page rendering, private `question-assets` bucket, `question_assets` relation,
requester-first asset route, and Teacher/Bank/Assignment/Practice renderers.

Replaced or hardened: permissive bbox clamping, random asset identity,
best-effort required-figure warnings, duplicate-prone upload behavior, and
incomplete cleanup. The new Provider-neutral contract is
`ai-pdf-visual-evidence/v2`.

## Provider-neutral proposal contract

Each proposal can carry:

- source page and normalized bbox;
- visual role: question figure, answer figure, diagram, graph, table, or
  decorative;
- owning question and optional subquestion reference;
- optional shared-group relation;
- confidence and ambiguity note;
- required/optional evidence flag;
- source asset and Review lineage.

The server, not the Provider, decides whether coordinates are valid and whether
a question text requires visual evidence. It never invents or regenerates a
replacement image.

## Integrity and privacy

- Bboxes must have positive area and remain fully inside an available source
  page; they are rejected rather than clamped.
- Crops are PNG, bounded to 8-4096 pixels per dimension and the existing asset
  byte ceiling, and must contain nontrivial visual variation.
- Asset ID and private object path derive from question, source asset, and crop
  SHA-256, making retry idempotent and content-bound.
- The source PDF must be the exact ready `import_batch_assets` row for the same
  Bank import batch. A source asset from another batch cannot authorize a crop.
- Existing deterministic assets are reused. New uploads use `upsert=false`, so
  a retry cannot overwrite an unrelated object.
- Decorative-only proposals are counted and suppressed before Storage or
  database writes. Decorative metadata cannot make a figure required.
- Review is locked to `needs_more_evidence` before cross-system association.
  On failure, question state is read back, restored and verified before bounded
  exact-ID cleanup. If compensation cannot be proven, the Review lock remains.
- A successful later attachment returns only to `pending_review`; it never
  approves.
- Required evidence that is missing, invalid, low-resolution, or still an
  unresolved `{{asset:...}}` placeholder blocks approval.
- The existing private bucket, requester-first asset route, Bank ownership,
  and Assignment-only Student visibility remain authoritative.
- Quality diagnostics contain counts only, not source text, filenames, object
  paths, signed URLs, private IDs, raw Provider output, or credentials.
- Persisted alt text is role-based and generic; Provider ambiguity text is
  reduced to a safe enum flag, and shared-group references must be short safe
  tokens rather than copied source text.

Teacher Review loads the resulting `question_assets` through the existing
requester-scoped, private, `no-store` preview route. The same path is used on
initial inspection, reload, and fresh remount; source tests cover that call
graph. A real image-rich hosted remount remains a live-proof gate.

## Golden Corpus

Thirteen synthetic visual cases cover single/multiple/shared figures, graph,
geometry and mechanics diagrams, required table, before/after figures,
adjacent columns, cross-page answer figures, duplicate proposal idempotency,
decorative suppression, low resolution, and missing required evidence.

Deterministic evaluation and ten mutation proofs report attachment association,
bbox validity, duplicates, fabricated pages, and approval-boundary failures.
All local treatment fixtures pass with hard-zero failures equal to zero.

## Proof status

No paid Provider call, hosted database write, or Storage operation was run for
this hardening. Therefore, the valid classification is:

`QUESTION_VISUAL_ATTACHMENT_SOURCE_READY_LIVE_PROOF_PENDING`

A separate authorization must use a rights-safe image-rich PDF with graphs,
tables, shared figures, a deliberately missing required figure, and exact
cleanup. The existing text-heavy 23/50 evidence does not satisfy that gate.

The later PR #229 authorization covered such a proof, but the three useful
scale attempts were text-only operational diagnostics. The third stopped on an
external connection timeout before Provider inference. No image-rich PDF,
crop, Storage object, question-asset row, Teacher render, or remount evidence
was created. The classification therefore remains unchanged:

`QUESTION_VISUAL_ATTACHMENT_SOURCE_READY_LIVE_PROOF_PENDING`

## PR #229 image-rich live-resume result

The resumed authorization did execute five rights-safe synthetic image-rich
runs. Across the useful pre-terminal observations, Gemini returned four
questions with unique source lineage, the application persisted four Review
rows, two placeholders, two private question assets, and two visual-evidence
records, and the crop pipeline produced two deterministic source-backed crops.
Three Review items remained `pending_review`; the deliberately missing required
figure remained `needs_more_evidence` rather than approval-ready.

Observed hard-zero results were:

| Gate | Observed count |
| --- | ---: |
| Fabricated crop | 0 |
| Wrong-question attachment | 0 |
| Decorative attachment | 0 |
| Invalid bounds persisted | 0 |
| Public visibility | 0 |
| Cross-organization visibility | 0 |
| Orphan residue after cleanup | 0 |
| Silent missing-required-figure | 0 |

Two directly demonstrated proof-harness defects were corrected without
weakening the product boundary. A decorative image may be omitted by the model
instead of explicitly proposed and suppressed, while a decorative proposal
marked required still fails. Teacher Review now scrolls a `loading=lazy`
protected image into view and waits boundedly for load/decode before asserting
dimensions. Safe diagnostics expose only allowlisted stages, states, codes, and
counters.

The final run reached Provider extraction, private asset persistence, valid
crops, and Review-state checks, then stopped at `exact_visual_question_set`.
Exact question values were intentionally not logged, and exact-ID cleanup had
already removed the fixtures before causal inspection. Therefore the expected
four-question identity set, full Teacher Review reload, fresh-page remount, and
requester-render completion are still open.

The superseding classification is:

`QUESTION_VISUAL_ATTACHMENT_PARTIAL_LIVE_EVIDENCE_FULL_CONTRACT_OPEN`

This is stronger than source-only readiness, but it is not complete visual live
validation and must not be described as such.

## Superseding exact-set closure

The final source review reconstructed the prior `exact_visual_question_set`
failure without changing the fixture expectation. Page 4 represents one
question with internal parts and visibly says `Question 4 (parts a and b)`.
The old harness incorrectly required that full visible label to equal `4`.
Question indices are now derived from unique one-page lineage, and the visible
label is validated separately. A `shared_group_key` remains required only when
multiple question rows actually share a visual; an empty value is never
accepted.

The exact safe sets are:

- imported: `Q1`, `Q2`, `Q3`, `Q4`;
- expected persisted visual assets: `Q1`, `Q4`;
- observed persisted visual assets: `Q1`, `Q4`;
- decorative-only and correctly unattached: `Q2`;
- missing required figure, unattached and blocking: `Q3`.

Before the stale final helper assertion, the bounded live run had already
proved two finite source-backed crops, two private question assets, exact Bank
and Review lineage, owner rendering, reload, fresh-page remount, owner access,
anonymous denial, unrelated-organization denial, and exact cleanup. It
persisted four questions and four Review Drafts: three `pending_review` and one
`needs_more_evidence`. Fabricated, wrong-question, decorative, invalid-bounds,
public, cross-organization, orphan, and silent-missing counts were zero.

Twenty mutation cases now protect the exact-set, page-lineage, shared-group,
authorization, render, cleanup, and hard-zero contracts. No additional paid
run was used after the source-backed expectation correction.

Superseding classification:

`QUESTION_VISUAL_ATTACHMENT_RESTORED_AND_LIVE_VALIDATED`
