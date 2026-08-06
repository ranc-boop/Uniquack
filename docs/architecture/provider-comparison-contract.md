# Provider Comparison Contract

## Purpose

This contract permits a future comparison of the current configured Gemini
route with GPT-5.6 Luna or another Provider. It does not implement, configure,
or authorize Luna. Provider selection remains server/admin controlled; Teachers
cannot select a Provider.

## Frozen treatment

Each candidate receives the same:

- rights-safe source bytes and page selection;
- parsing contract version and JSON schema;
- exact runtime taxonomy snapshot SHA, candidate serialization, and parsing
  contract SHA;
- output-token, attempt, HTTP-request, and cost envelope;
- one durable attempt ledger and repair-reason policy;
- Review Draft, Bank, lineage, visual, and cleanup gates;
- deterministic evaluator and blind review packet.

The Provider adapter may translate transport syntax only. It may not alter
question bounds, taxonomy pressure, visual requirements, Review Gate behavior,
or persistence semantics.

The experiment must stop before its first paid request if either arm reports a
different runtime taxonomy snapshot SHA. The authoritative source replay is the
seed plus 0056 under their real conflict and assignability semantics, not the
0056 payload alone. It produces the complete source snapshot
`05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe`.
Paid work remains inactive until Current Clean independently produces the exact
same snapshot through the credential-safe read-only parity gate.

## Measurements

Report per document and aggregate:

- first-attempt success and attempts per job by reason;
- input/output/thought/cached tokens when supplied;
- source, prompt, schema, taxonomy, and repair-context bytes;
- actual serialized request bytes, fixed overhead, repeated source, and
  repeated previous-response bytes;
- latency and estimated cost;
- schema-valid and application-valid candidates;
- importable Drafts and useful output per input token;
- question boundary, answer pairing, page attribution, taxonomy, and visual
  precision/recall/F1;
- duplicates, unknown taxonomy IDs, fabricated pages, unvalidated answers,
  missing required visual evidence, and cleanup failures.

Missing usage metadata is `UNKNOWN`, never zero.

Each inference must have one of the versioned primary reasons. At most one
source-backed semantic recovery is allowed per logical job; structural repair
is source-free; checkpoint replay is reported separately as zero inference.

## Blind review

Randomize Provider labels and candidate order. Reviewers score question
correctness, answer correctness, source/page fidelity, taxonomy precision,
visual association, missing evidence, and edit burden. Provider names, cost,
latency, and prior scores stay hidden until adjudication is locked.

## Decision rule

A candidate is ineligible if any hard-zero gate is nonzero. Among eligible
candidates, adopt only when quality is non-inferior and the efficiency change
is material under the same fixture and budget. A lower cost cannot compensate
for weaker review safety, lineage, answer validity, or visual fidelity.

No comparison Provider call was made in this work. The current deterministic
result is `SYNTHETIC_EVALUATOR_SANITY_BASELINE_ONLY`, not Provider-performance
evidence.
