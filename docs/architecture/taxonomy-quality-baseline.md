# Taxonomy Quality Baseline

## Provenance verdict

`AUTHORITATIVE_RECENT_TAXONOMY_SOURCE_RECONCILED`

PR #214 (`feat: unify Library workflows and public governance`) is the
authoritative source. Its decisive taxonomy commit is
`bfb789c58780a885a9bcf6fba54e96741fe710f9`, and that commit is already an
ancestor of main, PR #228, and PR #229. The relevant immutable inputs are:

- `supabase/clean-seeds/0002_local_taxonomy_seed.sql`
- `supabase/clean-migrations/0056_add_math_taxonomy_v2_catalog.sql`

The source replay applies the seed first, then faithfully applies 0056
`INSERT ... ON CONFLICT DO NOTHING` behavior and its post-insert assignability
reconciliation. It does not concatenate SQL text or count raw tuples as live
rows.

## Reconciled source catalog

The source-derived post-apply catalog is:

| Measure | Count |
| --- | ---: |
| Active canonical nodes | 439 |
| Declared assignable / effective leaves | 372 / 372 |
| Active edges / hierarchy edges | 460 / 438 |
| Normalized aliases | 20 |
| Facets | 5 |

The 439-node result is independently reconciled as `430 + 18 - 9`. The
460-edge result is `449 + 19 - 8`; aliases are `16 + 4`. Nine nodes are
seed-only, nine preserve compatible seed rows also named by 0056, and 421 are
introduced by 0056. Eleven edges are seed-only, eight preserve compatible
overlaps, and 441 are introduced by 0056.

| Facet | Active nodes | Effective leaves |
| --- | ---: | ---: |
| `curriculum` | 67 | 53 |
| `concept` | 186 | 159 |
| `method` | 91 | 81 |
| `task` | 45 | 37 |
| `form` | 49 | 42 |

The complete runtime-canonical snapshot SHA-256 is
`05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe`.
The separate source-reconciliation SHA-256, which also binds the seed and 0056
source hashes plus every row's provenance category, is
`9b757425ac04dedfec7a35069639fde570181fb1301c59c17ec9f68d83c3ef75`.
The old
`e557cdb3519f29601b74bc6551a207d19b3ba81ab439029e526fecad9d20211e`
value is retained only as
`STATIC_0056_PAYLOAD_ONLY_NONAUTHORITATIVE`; it omitted seed-only runtime
records and cannot gate Provider experiments.

## Runtime binding

The reachable parsing call graph is:

`loadTaxonomyCatalog(includeAllEdges)`
`-> buildRuntimeTaxonomySnapshot`
`-> buildRuntimeTaxonomyCandidateSubset`
`-> Provider serialization`
`-> parsing contract fingerprint`
`-> quality observatory`
`-> exact-ID validation`
`-> pending_review persistence`
`-> Teacher label resolution`

The observatory distinguishes the full catalog hash, per-job candidate-subset
hash, retrieval version, prompt version, schema version, repair-policy version,
and overall parsing-contract hash. All active edge kinds are included in the
full snapshot; only active, assignable, rooted, cycle-free effective leaves can
enter Provider candidates.

The current conservative production subset is all 372 effective leaves. Its
canonical bytes are 43,530 versus 160,720 bytes for the full graph snapshot, a
0.270844 ratio. The Provider prompt serialization is 35,865 bytes, including
347 bytes of alias representation. A narrower coarse-to-fine runtime retriever
is not activated because it lacks independent live recall evidence.

## Provider-neutral Golden evidence

The historical six taxonomy cases remain identified at commit
`659654e81e56b0891f786adfa3a003faec8783d5` as
`SYNTHETIC_EVALUATOR_SANITY_BASELINE_ONLY`.

The current source-bound corpus has 14 stratified cases. Its catalog is rebuilt
from the seed and 0056 on every run; the JSON fixture cannot invent catalog
entries. It covers all five facets, shallow/deep leaves, close siblings, broad
parents, cross-facet similar labels, abstention, invalid IDs, aliases,
seed-only nodes, and 0056-introduced nodes. Results are:

- candidate retrieval recall: 1.0
- exact-ID precision / recall / F1: 1.0 / 1.0 / 1.0
- alias resolution: 9 / 9
- seed-only unique expected IDs: 6, candidate recall and exact-ID F1 1.0
- PR #214 expansion unique expected IDs: 22, candidate recall and exact-ID F1 1.0
- abstention accuracy: 1.0
- broad-parent overtags: 0
- wrong-facet violations: 0
- inactive/unknown rejection: 1.0

Eighteen independent mutations are rejected, including removal of a correct
seed-only candidate, removal of a correct 0056 candidate, alias drift, broad
parent substitution, wrong-facet substitution, and the existing parsing,
visual, authorization, publication, and Assignment mutations.

Controlled Golden candidate pools average 7.5 eligible candidates and preserve
1.0 gold, seed-only, and 0056-expansion recall. This is evaluator evidence, not
permission to replace the conservative 372-leaf production subset.

## Hosted parity gate

The credential-safe Current Clean read-only parity run returned
`AUTHORITATIVE_RECENT_TAXONOMY_CONFIRMED`. It independently observed 439 active
canonical nodes, 460 active edges, 20 normalized aliases, 372 declared
assignable/effective leaves, and five facets. Its deterministic snapshot SHA-256
was exactly
`05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe`,
matching source replay byte-for-byte under the shared canonicalizer.

The audit made zero hosted writes and zero Provider calls, printed no taxonomy
rows or credentials, and cleared its process-only environment. This closes the
pre-paid source/hosted taxonomy parity gate. It does not authorize hosted
taxonomy mutation or make future Admin-created rows reproducible by itself.

## Remaining schema gate

Admin child creation still uses separate node and edge writes and does not
atomically demote a now-broad parent. Runtime candidate derivation fails closed,
but the stored invariant remains a separate forward-only schema design gate.
No migration or hosted mutation is made in this treatment.
