# Taxonomy Quality Baseline

## Provenance verdict

`RECENT_TAXONOMY_PROVENANCE_NOT_FOUND`

The audited Pacific window `2026-07-29` through `2026-08-05` resolves to
`2026-07-29T07:00:00Z..2026-08-06T07:00:00Z`. The audit covered current
authoritative `origin/main`, the stacked PDF50 and AI Parsing branches, 229
fetched pull-request refs, 293 non-PR remote refs, Git history, migrations,
seeds, import/export paths, and Admin taxonomy mutation source.

No authoritative taxonomy data file changed in that window. Taxonomy-related
implementation and test paths include the synthetic Golden fixture and this
runtime-snapshot correction, but none is a production catalog, seed, import,
export, or migration carrying the reported additions. Migration
`0056_add_math_taxonomy_v2_catalog.sql` entered Git
at commit `bfb789c58780a885a9bcf6fba54e96741fe710f9` on
`2026-07-27T21:57:22+08:00`, before the reported 100-plus additions. Its Git
blob is identical on the reviewed branch and `origin/main`.

The hosted Current Clean taxonomy was not read because this task did not grant
hosted access. Recent created/modified record counts and any Admin/direct-DB
mutation provenance therefore remain `NOT_SAFELY_DETERMINABLE`. A future paid
Provider comparison is blocked until the exact runtime snapshot is captured
and matched; no paid experiment is authorized by this source result.

## Reproducible source inventory

The checked-in 0056 catalog has the following exact source-derived inventory:

| Measure | Count |
| --- | ---: |
| Canonical nodes / labels / active nodes | 430 / 430 / 430 |
| Normalized aliases | 16 |
| Declared assignable nodes before graph derivation | 424 |
| Effective assignable leaves | 364 |
| Grouping nodes / roots / leaves | 66 / 1 / 364 |
| Active parent-child edges / all active edges | 429 / 449 |
| Facets | 5 |

The earlier planning value of 14 aliases was stale; the migration contains 16.

| Facet | Active nodes | Effective assignable leaves |
| --- | ---: | ---: |
| `curriculum` | 65 | 51 |
| `concept` | 183 | 157 |
| `method` | 89 | 79 |
| `task` | 45 | 37 |
| `form` | 47 | 40 |

The migration byte SHA-256 is
`7d5158b62294392035d81f9e36a3da7873090db5bd38272412f44733c4cd22e6`.
The deterministic runtime snapshot reconstructed from those source rows is
`e557cdb3519f29601b74bc6551a207d19b3ba81ab439029e526fecad9d20211e`.
That hash describes the checked-in catalog only; it is not a claim about an
unaudited hosted catalog.

## Runtime contract

The exact five facets remain:

1. `curriculum`
2. `concept`
3. `method`
4. `task`
5. `form`

The parsing call graph is now:

`loadTaxonomyCatalog -> buildRuntimeTaxonomySnapshot -> effective candidates`
`-> serializeRuntimeTaxonomyCandidates -> fingerprintAIPdfParsingContract`
`-> buildPrompt -> Provider transport -> exact-ID validation -> pending_review`

The canonical snapshot sorts stable node IDs, facets, catalog labels,
normalized aliases, exact parent IDs, active state, assignable policy, and
derived effective-leaf state. It excludes audit timestamps and private
identifiers. The snapshot SHA and parsing-contract SHA are recorded together
with candidate count in the quality observatory and safe job evidence.

Parsing fails closed unless the catalog has exactly five facets and no
duplicate IDs, orphan ambiguity, cycles, cross-facet parent edge, or invalid
facet. A candidate must be active, policy-assignable, reachable from its valid
facet root, not be a root, and have no active child. Consequently, adding an
active assignable child excludes an old assignable parent even if the stored
parent flag is stale. Inactive children do not turn a valid parent into a
grouping candidate, and aliases are normalized for evidence without becoming
assignable IDs.

Provider output remains untrusted. Only exact active effective-leaf IDs from
the same runtime snapshot may survive application validation. Labels, aliases,
broad parents, inactive IDs, wrong-facet IDs, and invented IDs cannot be
persisted as accepted assignments. AI output remains `pending_review`.

## Admin consistency gate

The current Admin create action requires an active Admin, validates the parent,
inserts the child node, then inserts its edge. It performs compensating child
deletion if the edge insert fails. It does not atomically demote an old
assignable parent. Runtime candidate derivation closes the parsing exposure,
but the stored invariant is not atomic.

A later forward-only migration should introduce a narrow postgres-owned
`SECURITY DEFINER` RPC such as `public.create_taxonomy_child_v2(...)` with a
fixed `search_path = public, private`. The RPC should:

- require the caller to be an active `super_admin`;
- lock the exact parent for the transaction;
- validate canonical ID, parent existence, active status, facet, and cycle
  constraints;
- insert the child and parent-child edge atomically;
- set the parent `is_assignable = false` when the active child is created;
- refresh any closure data in the same transaction;
- expose only safe created-node metadata; and
- grant execute only to the authenticated Admin path needed by the product.

No migration or hosted change was made here. Until that RPC is reviewed and
applied, `ADMIN_TAXONOMY_ATOMIC_CONSISTENCY` remains an external source/schema
gate while parsing itself remains fail closed.

## Evaluation status

The six deterministic taxonomy cases are labeled
`SYNTHETIC_EVALUATOR_SANITY_BASELINE_ONLY`. Candidate pools, gold IDs,
predictions, distractors, aliases, and acceptable abstention are separate.
Metrics report candidate retrieval recall, exact-ID precision/recall/F1,
abstention accuracy, broad-parent overuse, wrong-facet rate, and
inactive/unknown rejection.

Representative recent-label cases were not added because recent authoritative
provenance was not established. Adding guessed labels would turn the evaluator
into a new, unaudited taxonomy source.
