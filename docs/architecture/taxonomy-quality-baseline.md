# Taxonomy Quality Baseline

## Canonical contract

Migration `0056_add_math_taxonomy_v2_catalog.sql` and the runtime catalog define
five facets, exactly:

1. `curriculum`
2. `concept`
3. `method`
4. `task`
5. `form`

Provider candidates are full `tag_id` strings grouped by facet. Only active,
assignable exact IDs may be persisted. Labels, aliases, facet roots, planning
IDs, inactive IDs, and invented IDs are not valid output. Approved assignments
remain `pending_review` until a human Review Draft action accepts them.

## Baseline defect

At anchor `f1ce7bc`, the prompt asked the model to cover four of five facets,
called the fifth facet `difficulty/form`, encouraged multiple curricula, and
asked for the closest leaf. Persistence rejected unknown IDs, but the prompt
still created pressure to over-tag broad or weakly supported categories.

## Treatment

- name the exact five facets;
- assign only when visible evidence supports that exact active ID;
- prefer a supported specific tag without inferring specificity from labels;
- allow partial or complete abstention;
- use multiple curricula only when the source explicitly establishes each;
- preserve the full first-attempt catalog until subset recall is measured.

## Deterministic baseline

Six synthetic cases exercise all facets, exact leaves, ambiguous curriculum,
partial evidence, graph reasoning, tables, word problems, and full abstention.
The local treatment candidate has exact-tag and per-facet precision/recall/F1
of 1.0, with zero unknown IDs, duplicates, or broad-parent over-tags. Those
numbers validate the evaluator and contract fixtures, not real Provider
accuracy.

Mutation proofs independently inject an unknown ID and an unnecessary broad
parent; both fail. A future Provider benchmark must preserve zero unknown IDs
and report broad-parent and facet over-tagging separately from recall.
