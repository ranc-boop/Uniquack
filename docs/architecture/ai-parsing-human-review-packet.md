# AI Parsing Blind Human Review Packet

## Reviewer instructions

Provider and treatment labels must be randomized before review. Do not reveal
cost, latency, model, route, or automatic evaluator scores. Use only
rights-cleared source excerpts and sanitized candidate Drafts.

For each candidate, score 0-2:

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Question boundary | wrong/merged/split | usable with edit | exact |
| Question text | materially wrong | minor edit | faithful |
| Answer pairing | wrong/unproven | incomplete | correct and supported |
| Page lineage | fabricated/wrong | incomplete | exact |
| Taxonomy | inaccurate/unknown | incomplete | precise supported IDs |
| Visual evidence | wrong/missing | usable with edit | correct crop/association |
| Review safety | unsafe to approve | needs evidence | review-ready |

Also record binary flags for duplicate question, duplicate image, broad-parent
over-tagging, missing required evidence, and source/privacy leakage.

## Packet manifest

The deterministic source packet is the synthetic Golden Corpus under
`fixtures/ai-parsing-golden`. A future Provider experiment should export one
row per corpus case and candidate with opaque labels `A` and `B`; ground truth
must remain in a separate adjudication file. No private source, prompt, raw
Provider response, filename, identifier, or credential belongs in the packet.

Every packet must bind both arms to the same runtime taxonomy snapshot SHA and
parsing-contract SHA. It must include the safe attempt-reason histogram,
serialized-context summary, and run-scoped pending-review/publication/Assignment
counts, but reviewers must not see those operational values until scoring is
locked.

Recent-label cases may be added only after authoritative provenance is
established. They must cover the affected facets with a recent exact leaf,
close old sibling, broad parent, alias, ambiguous source, abstention, and an
inactive or invalid distractor. No fixture may become a production taxonomy
source.

## Decision

Any hard-zero violation makes a candidate ineligible. Aggregate preference is
considered only after answer, lineage, Review Gate, and privacy checks pass.
The current six-case taxonomy result is
`SYNTHETIC_EVALUATOR_SANITY_BASELINE_ONLY`. This document defines the packet;
no paid blind comparison was run or authorized.
