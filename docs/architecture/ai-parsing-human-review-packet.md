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

## Decision

Any hard-zero violation makes a candidate ineligible. Aggregate preference is
considered only after answer, lineage, Review Gate, and privacy checks pass.
This document defines the packet; no paid blind comparison was run.
