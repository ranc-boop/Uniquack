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
- exact active assignable taxonomy catalog;
- output-token, attempt, HTTP-request, and cost envelope;
- repair-reason policy;
- Review Draft, Bank, lineage, visual, and cleanup gates;
- deterministic evaluator and blind review packet.

The Provider adapter may translate transport syntax only. It may not alter
question bounds, taxonomy pressure, visual requirements, Review Gate behavior,
or persistence semantics.

## Measurements

Report per document and aggregate:

- first-attempt success and attempts per job by reason;
- input/output/thought/cached tokens when supplied;
- source, prompt, schema, taxonomy, and repair-context bytes;
- latency and estimated cost;
- schema-valid and application-valid candidates;
- importable Drafts and useful output per input token;
- question boundary, answer pairing, page attribution, taxonomy, and visual
  precision/recall/F1;
- duplicates, unknown taxonomy IDs, fabricated pages, unvalidated answers,
  missing required visual evidence, and cleanup failures.

Missing usage metadata is `UNKNOWN`, never zero.

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

No comparison Provider call was made in this work.
