# AI Parsing Quality and Efficiency

## Decision

The canonical workflow remains:

`private source -> AI Parsing -> Review Draft -> Bank -> Assignment -> Practice evidence`

This treatment hardens Parsing-to-Review without changing Provider settings,
models, publication rules, Assignment behavior, migrations, dependencies, or
environment contracts. The immutable baseline is
`f1ce7bcb791604468693ea945401cfb157e64d97`; the treatment contract is
`ai-pdf-parsing/provider-neutral-v5`.

No real Provider call or hosted mutation was performed during the source phase.
Current Clean taxonomy parity subsequently passed read-only with the exact
source snapshot. The final bounded Gemini authorization completed all ten paid
run slots. It validated the exact visual attachment set and completed all 50
durable qualification jobs. The launcher's final status remained blocked only
by a post-gate, pagination-sensitive Review-page assertion; the superseding
evidence and its limitation are recorded below.

## Immutable contract fingerprints

`docs/architecture/ai-parsing-contract-fingerprints.json` binds the Provider
prompt/repair path, application schema, runtime taxonomy snapshot and attempt
ledger, preanalysis, boundary checks, taxonomy persistence, visual evidence,
Review Gate, observatory, Gemini transport, worker integration, and the 0056
source catalog to immutable Git blobs and SHA-256 values.

The verifier requires baseline ancestry, treatment ancestry, exact file order,
exact anchor blobs, and current-byte equality. New treatment modules are
explicitly absent at baseline. Uncommitted worktree bytes are never accepted as
an anchor. The current manifest binds 61 files to treatment anchor
`857a486636a8836344a25080a1673024379b2e64`; the manifest-only evidence commit
is a descendant and does not redefine treatment bytes.

## Runtime taxonomy path

The production call graph is:

`loadTaxonomyCatalog -> buildRuntimeTaxonomySnapshot -> effective candidates`
`-> serializeRuntimeTaxonomyCandidates -> fingerprintAIPdfParsingContract`
`-> buildPrompt -> Provider serialization -> exact-ID validation`
`-> pending_review persistence -> Teacher label resolution`

The runtime snapshot identity is therefore not a disconnected helper. Candidate
retrieval, prompt construction, parsing contract evidence, quality output, and
safe job evidence all carry the same snapshot SHA. Faithful seed-plus-0056
replay produces 439 nodes, 460 edges, 20 aliases, 372 effective leaves, and the
complete snapshot SHA
`05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe`.
The old `e557cdb...` value is retained only as
`STATIC_0056_PAYLOAD_ONLY_NONAUTHORITATIVE`.

Effective candidate eligibility requires an active policy-assignable leaf,
valid root reachability, an exact canonical facet, and no cycle, orphan,
cross-facet edge, duplicate ID, or active child. The loader no longer trusts a
stale `is_assignable=true` parent flag by itself.

## One attempt owner

Before this correction, extraction-level repair and outer Provider retry could
re-enter one another. A source-backed semantic recovery could be multiplied by
another retry layer, and durable re-entry could reconstruct fresh local state.

Now one versioned, serializable `AIPdfProviderAttemptLedger` follows the logical
job through worker checkpoints and retry-wait re-entry. The only Provider retry
owner is `runAIPdfProviderTransport`. Every inference gets exactly one primary
reason:

- `FIRST_ATTEMPT`
- `STRUCTURAL_SCHEMA_REPAIR`
- `APPLICATION_VALIDATION_REPAIR`
- `BLANK_REQUIRED_FIELD_REPAIR`
- `ANSWER_CONSISTENCY_REPAIR`
- `SOURCE_LINEAGE_REPAIR`
- `VISUAL_ASSOCIATION_REPAIR`
- `TAXONOMY_REPAIR`
- `SOURCE_BACKED_SEMANTIC_RECOVERY`
- `PROVIDER_BUSY_RETRY`
- `RATE_LIMIT_RETRY`
- `NETWORK_RETRY`
- `TIMEOUT_RETRY`

Checkpoint reuse records `CHECKPOINT_REPLAY_ZERO_INFERENCE` separately and does
not call a Provider. Structural repair is reserved once per extraction scope
and sends no source. Source-backed semantic recovery is reserved once for the
entire logical job, not once per chunk or worker invocation. A successful
normalized output exits immediately. If the execution envelope is exhausted
after a truthful validation failure, that preceding failure is preserved
instead of being replaced by a budget symptom.

The ledger records bounded safe enums, ordinals, scope names, route position,
source inclusion, and counters. It does not record prompts, source text,
filenames, Provider responses, credentials, or private identifiers.

## Serialized context accounting

The previous observatory mixed overlapping estimates and could produce a false
total. Version 3 starts from the actual serialized request body byte count
reported by the transport. It records non-overlapping attributed components:

- system instructions;
- extraction instructions;
- taxonomy candidates;
- structured schema;
- source/file input;
- previous response;
- structural-repair instructions;
- semantic-recovery instructions; and
- remaining fixed transport overhead.

If attributed components exceed the measured request, the overflow is exposed
rather than hidden. Derived views include source bytes, non-source overhead,
repeated source bytes, repeated previous-response bytes, taxonomy/schema/repair
shares, and total serialized request bytes. Provider-reported input, output,
thought, cached, and total tokens remain separate and nullable.

The OpenAI-compatible repair path now sends the bounded previous response once
as the assistant message. The user repair instruction no longer embeds a second
copy. Gemini text repair also includes one bounded previous-response copy.
Bytes are never described as tokens, and no token-savings claim is made without
same-fixture Provider usage evidence.

## Independent deterministic evaluator

The Golden Corpus has 14 parsing, 14 taxonomy, 13 visual, and deterministic
run-state/authorization cases. Taxonomy fixtures separate candidate pool, gold
expected IDs, prediction, distractors, aliases, and acceptable abstention.
Candidate pools include siblings, broad parents, wrong-facet labels, aliases,
invalid IDs, seed-only IDs, and PR #214 expansion IDs. The evaluator rebuilds
the complete source catalog from the seed and 0056 for every run; fixture JSON
cannot define a replacement catalog.

Reported taxonomy metrics are independent:

- candidate retrieval recall;
- exact-ID precision, recall, and F1;
- abstention accuracy;
- broad-parent overuse;
- wrong-facet rate; and
- inactive/unknown-ID rejection;
- alias resolution;
- seed-only candidate and exact-ID coverage; and
- PR #214 expansion candidate and exact-ID coverage.

Publication, Assignment, approval, and pending-review counts are computed from
the resulting deterministic run state. Cross-organization asset denial executes
the real `/api/question-assets/[assetId]` route with deterministic auth/storage
mocks: a denied requester receives the generic 404 boundary, no service-role
metadata read, and no signed URL. An authorized owner receives the redirect.

Eighteen independent mutations challenge invalid/unknown taxonomy IDs,
broad-parent and wrong-facet substitution, fabricated pages, invalid crop
bounds, wrong-question visual attachment, cross-organization asset requests,
missing required visuals, inconsistent answers, duplicate questions, and
publication/Assignment side effects. They also remove correct seed-only and
0056 candidates and corrupt a source alias. All mutations are rejected and
fixture ordering remains invariant.

The original six-case result remains labeled exactly
`SYNTHETIC_EVALUATOR_SANITY_BASELINE_ONLY` at anchor `659654e`. The new
source-bound result covers six unique seed-only expected IDs and 22 unique
0056-introduced expected IDs with 1.0 candidate recall and exact-ID F1. It is
still Provider-neutral evaluator evidence, not current Provider quality.

The complete runtime graph serializes to 160,720 bytes. The conservative
production effective-leaf subset is 43,530 canonical bytes (0.270844 of the
full graph), 372 candidates, and 35,865 prompt bytes. Controlled Golden pools
average 7.5 eligible candidates with 1.0 gold recall. That result does not
activate a narrow or coarse-to-fine runtime retriever; actual Provider token
share remains unknown until matched live evidence exists.

## Visual and Review boundaries

Visual crops come only from the authoritative source and require finite,
positive, in-page coordinates plus exact question/source ownership. Asset
identities are deterministic and private. Decorative proposals are suppressed.
Missing required evidence sets `needs_more_evidence`; partial failures restore
the Review lock, verify cleanup, and never auto-approve, publish, or assign.

Provider output still passes application schema, answer, page lineage,
taxonomy, duplicate, visual, Bank-scope, and `pending_review` gates. Neither the
attempt ledger nor context observer can bypass validation.

## Authorized live extension

The independently reproduced Current Clean taxonomy snapshot matched the source
snapshot exactly, so the paid gate opened without changing Provider settings or
hosted taxonomy. All live runs used that same 439-node/372-candidate contract.

1. A 50-file run admitted exactly 50 and rejected file 51, then failed before
   Provider transport because the 50,000-token planning limit had also been
   interpreted as a 50,000-byte limit. The observed request was 55,694 bytes.
   Provider inference requests were zero and exact cleanup passed.
2. The corrected contract separates 50,000 input tokens from a 200,000-byte
   serialized request ceiling. A new 50-file run completed seven items. The
   eighth normalized successfully after three bounded Provider attempts, then
   failed before `drafts_persisted`. Aggregate evidence recorded ten inference
   requests, 40 Provider HTTP requests, and no trusted complete usage total.
   Exact cleanup passed and usage-derived spend remains `UNKNOWN`.
3. Source tracing showed that the remaining interval contains a non-authoritative
   progress write and the fenced atomic Review Draft persistence RPC. Progress
   telemetry is now best-effort after the durable normalized checkpoint. The
   same fenced persistence operation may replay once with identical lineage;
   ambiguous first-response loss followed by deterministic `NOOP` is accepted,
   while a second genuine failure remains terminal. The new safe
   `draft_persistence` diagnostic cannot expose row data or Provider output.
4. A ten-file validation of that correction admitted all ten files but the first
   exact worker invocation encountered an external HTTPS connection timeout
   before any Provider inference. It stopped without retry. Provider inference,
   upload, cleanup, and network counters were all zero. Cleanup reported one
   failed operation during the same connectivity event, while the independent
   final synthetic residue count was zero and process-only values were cleared.

The new authorization ledger has three paid-run slots consumed. Conservative
ceilings are USD 0.497925, USD 0.497925, and USD 0.179253, totaling USD 1.175103
and leaving USD 0.824897. Known actual Provider spend is zero for runs one and
three; run two remains `UNKNOWN` because complete usage evidence was not
reached. No dashboard-observed total was collected. Theoretical exposure is
not reported as actual spend.

The paired baseline/treatment quality comparison and blind human-review packet
were not produced. The visual path remains source-ready but has no paid
image-rich crop/persistence/remount proof. PDF50 still lacks a 50/50 terminal
drain, aggregate UI proof, and final live invariant matrix.

## Existing validation limitations

Three unchanged stacked-base source smokes remain red because they require UI
source literals that are already absent at baseline `f1ce7bc`:

- `ai-parsing-boundary-duplicate-guard-smoke.mjs` expects Review-page
  `boundaryFindings` and `Possible duplicate` literals;
- `ai-parsing-status-review-qa-smoke.mjs` expects obsolete status-panel copy;
  and
- `teacher-ai-parsing-bank-targeting-smoke.mjs` expects obsolete viewer/status
  copy.

The exact baseline files fail those same predicates. This treatment did not
change the referenced UI files and does not mark those checks as passing. They
belong to the separate stale-source smoke cleanup. The known Windows
embedded-Postgres `initdb` restriction remains an infrastructure limitation,
not passing aggregate evidence or a product regression.

## Rollout gates

Before any further paid Gemini comparison:

1. Preserve the passed Current Clean taxonomy parity result
   `AUTHORITATIVE_RECENT_TAXONOMY_CONFIRMED` and stop if a later snapshot drifts.
2. Require both arms to carry the exact same runtime taxonomy snapshot SHA and
   parsing-contract SHA.
3. Verify immutable contract fingerprints and identical fixtures, source,
   model limits, output cap, and budget.
4. Require all hard-zero gates and eighteen mutations to pass.
5. Compare Provider-reported tokens, attempts by reason, repeated context,
   valid Drafts, latency, and cost under the same input.
6. Run blind human review for correctness, source fidelity, taxonomy precision,
   visual evidence, and edit burden.
7. Stop on any privacy, Bank-scope, Review Gate, cleanup, lineage, or
   authorization failure.

No automatic retry was made after the observed connectivity failure. Any later
run must first re-establish the same fingerprints and budget ledger. The
authorization still does not cover GPT/Luna, deployment, migrations,
Provider-setting changes, or hosted taxonomy mutation.

## Authoritative Gemini live resume evidence

The bounded resume ran on 2026-08-05 after the credential-safe preflight found
zero run-scoped residue, zero queued/processing synthetic jobs or leases, no
leftover local server, cleared process-only values, and a reachable Gemini HTTPS
endpoint. The earlier Stage 10 timeout remained a zero-inference, zero-spend
event and was not retried blindly.

### Authoritative-taxonomy Stage 10

The successful ten-item mixed-state run admitted ten exact synthetic items,
completed nine, and intentionally cancelled one. It made ten exact worker-route
invocations and ten claims. Nine Provider jobs completed on their first attempt;
one checkpoint replay consumed zero inference, and stale-fence mutation was
rejected. The durable drain took 231,457 ms.

The immutable bindings were:

- runtime taxonomy snapshot SHA-256:
  `05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe`;
- effective candidate-subset SHA-256:
  `fd11666a6ea207244dd5c60529aef812f73c8e82120f02b5348bb4db02970262`;
- parsing-contract SHA-256:
  `579f6e308de89b77f681906ec40dc65cd7ba9043351e59894ebfa4c1c65687a1`;
- retrieval/prompt/schema/repair versions:
  `full-effective-leaves-v1`, `ai-pdf-extraction-prompt-v3`,
  `gemini-ai-pdf-extraction-schema-v2`, and
  `source-free-structural-single-source-semantic-v2`.

The full taxonomy serialized to 160,720 bytes and the effective candidate set
to 43,530 bytes. Provider usage was 101,547 input tokens, 3,015 output tokens,
and 104,562 total tokens. The actual estimated cost was 11,361 micros, or about
1,262.33 micros per valid pending Review Draft. Source, instruction, schema, and
repair-context byte subtotals were not retained in the final sanitized output
and remain `UNKNOWN`; they are not reconstructed. Repeated-source context was
zero because every inference-bearing job succeeded on its first attempt.

The attempt histogram was `FIRST_ATTEMPT=9`; every repair and transient-retry
reason was zero. Attempts per Provider job were `{1: 9}`, p50/p95 were both 1,
first-attempt success was 100%, and repair/transient retry rates were zero. Nine
private `pending_review` Drafts persisted. Approval, publication, Assignment
creation, cross-organization exposure, and duplicate claims were zero. Reload,
remount, checkpoint replay, exact cleanup, and process-environment clearing
passed.

The deterministic 14-case taxonomy evaluator remains the only gold-labeled
precision/recall evidence: candidate recall and exact-ID precision/recall/F1
were 1.0, alias resolution was 9/9, abstention accuracy was 1.0, broad-parent
overuse and wrong-facet violations were zero, seed-only coverage was six unique
expected IDs at F1 1.0, and PR #214 expansion coverage was 22 unique expected
IDs at F1 1.0. The live Provider output had exact valid IDs and no unknown-ID
failure, but it was not independently gold-labeled; no live precision/recall
score is claimed.

### Embedded visual evidence

Five bounded image-rich runs produced repeated Provider, persistence, and crop
evidence. Successful pre-terminal observations consistently recorded four
imported questions with unique source lineage, four Review rows, two private
assets, two placeholders, two visual-evidence records, two valid deterministic
crops, three `pending_review` items, and one `needs_more_evidence` item. The
missing required visual stayed blocking. Invalid proposals, fabricated crops,
wrong-question attachments, decorative attachments, invalid persisted bounds,
public visibility, cross-organization visibility, and observed orphan residue
were zero.

Two harness-only defects were corrected from direct evidence: a decorative
image may be omitted by the model rather than emitted and then suppressed, and
lazy Review images must be scrolled into view and awaited before checking
decode dimensions. Sanitized terminal diagnostics were added without exposing
source text, prompts, filenames, IDs, Provider responses, or credentials.

The final visual run stopped at `exact_visual_question_set`. Exact values were
intentionally not logged and fixtures were already cleaned, so the cause cannot
be reconstructed or silently relaxed. Consequently, the exact four-question
identity set plus complete Review reload/fresh-remount contract remains open.
The live visual classification is `PARTIAL_LIVE_EVIDENCE_FULL_CONTRACT_OPEN`,
not complete validation.

### Final fifty-file attempt

The final bounded scale run rejected file 51 before durable-row creation and
admitted exactly 50 private synthetic files/items. Eleven items completed. The
twelfth failed at the durable `normalized` checkpoint after two Provider
attempts with the safe category `unknown_provider_error`. The harness failed
closed and did not start the remaining 38 items.

Partial counters were 12 route invocations, 11 completed items, 13 inference
attempts/requests, 26 uploads, 13 cleanups, 52 Provider network requests, zero
poll requests, and zero cleanup failures. The run created no approval,
publication, or Assignment side effect. Local-server shutdown, exact-ID
cleanup, zero synthetic residue, and environment clearing passed. It did not
prove 50/50 terminal drain, complete batch aggregation, final Teacher UI
reload/remount, or the full invariant matrix.

### Final authorization ledger

The sequence consumed all 10 of 10 paid-run slots. Recorded Provider inference
attempts were 37: ten in the earlier partial scale run, nine in the successful
authoritative-taxonomy run, one in each of five visual runs, and thirteen in the
final scale run. The two pre-Provider failures contributed zero inference.

The final conservative ledger is 1,830,468 micros of the existing USD 2
authorization, leaving 169,532 micros. No paid-run slot remains, and that dollar
remainder is also below the 331,950-micros one-attempt-per-file minimum for a
fresh 50-file run. The only complete usage-derived total retained for the live
resume is the 11,361-micros Stage 10 estimate. Usage for incomplete runs remains
`UNKNOWN`; their full ceilings remain uncertainty reserve and are not reported
as actual spend.

### Non-paid closure validation

The immutable-fingerprint verifier, 14-case Golden evaluator, 18 mutation
proofs, runtime contract, Provider attempt state/architecture, visual live
safety, quality foundation, PDF50 scale safety, proof-control parity, Provider
lifecycle budget, post-persistence diagnostics, checkpoint, fencing, security,
migration reconciliation, and canonical migration governance checks passed.
Lint, production build, performance budget, performance audit, and analyze
build passed. The analyzer emitted non-fatal cache-snapshot warnings and exited
zero.

Route smoke reached the local production server and passed `/questions`, then
stopped on the unchanged `/videos` expected-text assertion. The source-only
stale route contract predates and is outside this treatment; no product source
was modified to satisfy it. The temporary local server was stopped. These
closure checks made zero Provider calls and zero hosted mutations.

Final classification: `GEMINI_LIVE_EXPERIMENTS_COMPLETE_PDF50_PARTIAL`. PR #229
must remain Draft. Source Host review can evaluate the corrections, but merge
is not recommended as live closure while the exact visual question set and
50/50 terminal proof remain unresolved.

## Fresh visual and PDF50 closure authorization

This section supersedes the preceding partial classification for the fresh
authorization that started at
`c9fede4b91e66c80846ecd19215d5931d213f287`. It does not rewrite the earlier
run history and does not claim that the final launcher printed a passing
terminal line.

### Visual gate

The `exact_visual_question_set` failure was a proof-harness defect. The fourth
fixture page visibly labels a single question as `Question 4 (parts a and b)`;
the old harness compared that full label with the literal `4`. Safe run-scoped
indices now come from the unique one-page lineage, while the visible source
label is validated separately. A question-level `shared_group_key` is also
optional when one imported question contains internal parts rather than
multiple question rows. Empty shared-group values still fail.

The source-backed expected and observed sets were identical:

| Set | Safe indices |
| --- | --- |
| Imported questions | `Q1`, `Q2`, `Q3`, `Q4` |
| Questions requiring persisted assets | `Q1`, `Q4` |
| Questions with observed persisted assets | `Q1`, `Q4` |
| Decorative-only question | `Q2` |
| Missing-required-figure question | `Q3` |

The useful live run had already passed two deterministic crops, private asset
persistence, exact source/question/Bank lineage, owner rendering, browser
reload, fresh-page remount, owner route authorization, anonymous denial,
unrelated-organization denial, and exact cleanup before the stale helper
assertion ran. `Q2` received no attachment. `Q3` received no fabricated asset
and remained `needs_more_evidence`. Fabricated, wrong-question, decorative,
invalid-bounds, public, cross-organization, orphan, and silent-missing counts
were zero. The superseding visual classification is
`QUESTION_VISUAL_ATTACHMENT_RESTORED_AND_LIVE_VALIDATED`.

### Provider and checkpoint diagnosis

The earlier `unknown_provider_error` was not an extraction failure. Provider
output and Review Draft persistence had succeeded; the full quality snapshot
then exceeded migration 0051's 4096-byte checkpoint metadata contract. The
correction removes that full snapshot from checkpoint metadata, records only
typed bounded diagnostics, and permits one fenced replay only for ambiguous
transient checkpoint or persistence outcomes. Known safe codes are now
`ai_job_checkpoint_failed`, `ai_job_checkpoint_transient`,
`ai_pdf_post_persistence_failed`, and
`ai_pdf_post_persistence_transient`. Genuine Provider, extraction, validation,
and persistence failures still fail closed. No raw SQL, prompt, source,
Provider response, identifier, or credential enters diagnostics.

### Fifty-file gate

The final paid run rejected a 51-file selection before durable-row creation,
admitted exactly 50 private rights-safe PDFs, and completed all 50 intended
durable items/jobs. Every completed job retained its target Bank, completed
checkpoint, persisted-output lineage, and imported batch. The first PDF was
the four-question visual fixture; the other 49 produced one question each, for
53 private draft questions and 53 Review Draft rows: 52 `pending_review` and
one `needs_more_evidence`. Duplicate drafts, Bank approval, publication,
Assignment creation, and cross-organization visibility were all zero.

The Imports UI displayed the completed burst on initial load, reload, and a
fresh-page remount. The later Review-page check failed because the harness
queried questions without ordering, selected an arbitrary title, and expected
that title on page 1 of a 25-row paginated result. That check ran after the
durable aggregate and Imports UI gates. It is now deterministic: it verifies
`53 results`, `Page 1 of 3`, and exactly 25 rendered Review articles on initial
load, reload, and remount. This source-only correction passed mutation-backed
safety validation, but no eleventh paid run was authorized. Therefore the
historical launcher line remains `PDF50_SCALE_50=BLOCKED`; it is not rewritten
as `PASS`.

The run completed exact database, Storage, Auth/profile/membership/
organization cleanup, stopped the local server, cleared process-only values,
and reported zero synthetic residue. No unrelated job or non-synthetic record
was claimed or mutated.

### Fresh authorization ledger and limits

All 10 of 10 paid-run slots were consumed. Conservative spent-or-held exposure
was 1,677,582 micros of USD 2, leaving 322,418 micros but no remaining run.
Provider-reported usage for every incomplete/final observation was not emitted,
so actual usage remains `UNKNOWN`; dashboard-observed spend is also `UNKNOWN`.
The final post-gate stop prevented emission of exact Provider HTTP totals,
input/output tokens, queue-depth maxima, drain timing, attempt-reason
histogram, and attempts-per-job histogram. Those values remain `UNKNOWN`; the
absence of visible repair/retry diagnostics is not promoted into a fabricated
histogram.

The authoritative identities are:

- taxonomy snapshot:
  `05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe`;
- candidate subset:
  `fd11666a6ea207244dd5c60529aef812f73c8e82120f02b5348bb4db02970262`;
- v5 parsing contract:
  `5c19aed2d13c85121d89b09a3a85064f2eea200016560780295f2d7510e9ca95`;
- immutable treatment anchor:
  `857a486636a8836344a25080a1673024379b2e64`.

Final superseding classification:
`GEMINI_VISUAL_VALIDATED_PDF50_OPERATIONALLY_READY_FOR_FINAL_HOST_REVIEW`.
PR #229 remains Draft and requires independent Host review before any merge.
