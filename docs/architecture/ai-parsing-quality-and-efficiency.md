# AI Parsing Quality and Efficiency

## Decision

The canonical workflow remains:

`private source -> AI Parsing -> Review Draft -> Bank -> Assignment -> Practice evidence`

This treatment hardens Parsing-to-Review without changing Provider settings,
models, publication rules, Assignment behavior, migrations, dependencies, or
environment contracts. The immutable baseline is
`f1ce7bcb791604468693ea945401cfb157e64d97`; the treatment contract is
`ai-pdf-parsing/provider-neutral-v2`.

No real Provider call or hosted mutation was performed. PDF50 remains only
partially scale-qualified because the prior authorized run completed 23 of 50
jobs. Real image-rich visual evidence and recent taxonomy provenance remain
external gates.

## Immutable contract fingerprints

`docs/architecture/ai-parsing-contract-fingerprints.json` binds the Provider
prompt/repair path, application schema, runtime taxonomy snapshot and attempt
ledger, preanalysis, boundary checks, taxonomy persistence, visual evidence,
Review Gate, observatory, Gemini transport, worker integration, and the 0056
source catalog to immutable Git blobs and SHA-256 values.

The verifier requires baseline ancestry, treatment ancestry, exact file order,
exact anchor blobs, and current-byte equality. New treatment modules are
explicitly absent at baseline. Uncommitted worktree bytes are never accepted as
an anchor.

## Runtime taxonomy path

The production call graph is:

`loadTaxonomyCatalog -> buildRuntimeTaxonomySnapshot -> effective candidates`
`-> serializeRuntimeTaxonomyCandidates -> fingerprintAIPdfParsingContract`
`-> buildPrompt -> Provider serialization -> exact-ID validation`
`-> pending_review persistence -> Teacher label resolution`

The runtime snapshot identity is therefore not a disconnected helper. Candidate
retrieval, prompt construction, parsing contract evidence, quality output, and
safe job evidence all carry the same snapshot SHA. The checked-in 0056 source
reconstructs to
`e557cdb3519f29601b74bc6551a207d19b3ba81ab439029e526fecad9d20211e`,
but a future experiment must use the hash produced from its exact runtime
catalog.

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
- `STRUCTURAL_REPAIR_SOURCE_FREE`
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
total. Version 2 starts from the actual serialized request body byte count
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

The Golden Corpus has 14 parsing, 6 taxonomy, 13 visual, and deterministic
run-state/authorization cases. Taxonomy fixtures separate candidate pool, gold
expected IDs, prediction, distractors, aliases, and acceptable abstention.
Candidate pools include siblings, broad parents, wrong-facet labels, aliases,
inactive IDs, and unknown IDs.

Reported taxonomy metrics are independent:

- candidate retrieval recall;
- exact-ID precision, recall, and F1;
- abstention accuracy;
- broad-parent overuse;
- wrong-facet rate; and
- inactive/unknown-ID rejection.

Publication, Assignment, approval, and pending-review counts are computed from
the resulting deterministic run state. Cross-organization asset denial executes
the real `/api/question-assets/[assetId]` route with deterministic auth/storage
mocks: a denied requester receives the generic 404 boundary, no service-role
metadata read, and no signed URL. An authorized owner receives the redirect.

Fifteen independent mutations challenge invalid/unknown taxonomy IDs,
broad-parent and wrong-facet substitution, fabricated pages, invalid crop
bounds, wrong-question visual attachment, cross-organization asset requests,
missing required visuals, inconsistent answers, duplicate questions, and
publication/Assignment side effects. All mutations are rejected and fixture
ordering remains invariant.

The evaluator result is labeled exactly
`SYNTHETIC_EVALUATOR_SANITY_BASELINE_ONLY`. It validates the evaluator and
source gates, not current production taxonomy accuracy or Provider quality.
Recent-label Golden cases remain intentionally absent because authoritative
recent provenance was not established.

## Visual and Review boundaries

Visual crops come only from the authoritative source and require finite,
positive, in-page coordinates plus exact question/source ownership. Asset
identities are deterministic and private. Decorative proposals are suppressed.
Missing required evidence sets `needs_more_evidence`; partial failures restore
the Review lock, verify cleanup, and never auto-approve, publish, or assign.

Provider output still passes application schema, answer, page lineage,
taxonomy, duplicate, visual, Bank-scope, and `pending_review` gates. Neither the
attempt ledger nor context observer can bypass validation.

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
belong to the separate stale-source smoke cleanup. Live/chaos scripts requiring
Supabase credentials were not run because hosted access is outside this task.
The known Windows embedded-Postgres `initdb` restriction remains an
infrastructure limitation, not passing aggregate evidence or a product
regression.

## Rollout gates

Before any Gemini/Luna or other paid comparison:

1. Resolve the recent taxonomy provenance or capture an authorized hosted
   runtime snapshot and canonicalize it through a reviewed source process.
2. Require both arms to carry the exact same runtime taxonomy snapshot SHA and
   parsing-contract SHA.
3. Verify immutable contract fingerprints and identical fixtures, source,
   model limits, output cap, and budget.
4. Require all hard-zero gates and fifteen mutations to pass.
5. Compare Provider-reported tokens, attempts by reason, repeated context,
   valid Drafts, latency, and cost under the same input.
6. Run blind human review for correctness, source fidelity, taxonomy precision,
   visual evidence, and edit burden.
7. Stop on any privacy, Bank-scope, Review Gate, cleanup, lineage, or
   authorization failure.

Paid experiments remain unauthorized by this correction.
