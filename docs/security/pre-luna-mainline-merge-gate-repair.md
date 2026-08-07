# Pre-Luna Mainline Merge-Gate Repair

## Audit identity

- Repository: `1650512585qq-collab/o2iinstitute`
- Starting `origin/main`: `e4c29229dfaf0404cef0d361432bef29ba41df7b`
- Repair branch: `codex/pre-luna-mainline-merge-gate-repair`
- Frozen PR #228 head: `9205c168f725fd4b379a9fd9e7d3c96b7899a5d9`
- Frozen PR #229 evidence head: `85f5eb229f7b93dd8e26b7870c53bf9d892de9bc`
- Gemini/OpenAI/Luna calls: `0`
- Hosted database/Auth/Storage/RPC operations: `0`
- Migration files added, edited, or applied: `0`
- Deployments: `0`

The repair was developed from the exact reviewed main commit in an isolated
worktree. Neither frozen branch was changed. Frozen benchmark fixtures,
expectations, taxonomy evidence, candidate-subset contracts, parsing hashes,
and Gemini observations were not regenerated or edited.

## Migration reconciliation

Main already contained canonical executable migration
`0077_scope_orphan_question_admin_access.sql`. The reconciliation smoke still
stopped its explicit inventory loop at 0076 and separately described an older
tail in its output.

The repaired contract now:

1. Iterates from 0044 through `manifest.latestActivePrefix`.
2. Requires 0077 to be canonical executable migration number/order 77.
3. Requires the executable tail number to equal the manifest-derived head.
4. Reports the head from the manifest instead of another hard-coded tail.
5. Preserves the excluded Google 0032 entry and all legacy/unmapped history
   semantics.

Canonical head remains 0077. No migration bytes changed and no migration was
created or applied.

## Stale smoke reconciliation

| Failure | Classification | Obsolete assumption | Replacement contract and mutation |
| --- | --- | --- | --- |
| Review action delegation | Stale source-shape assertion | The exported edit action directly contained every update field. | The exported action must delegate to the private safe saver; the saver must update only editable Draft fields and reset Review state. Replacing the delegation or removing rejection fails. |
| Import viewer behavior | Stale UI/source-shape assertion | A viewer reached a disabled import form with particular explanatory copy. | The page computes the management capability and calls `notFound()` before rendering import controls. Removing that denial fails. |
| Review media handoff | Stale source-shape assertion | The Review page eagerly rendered two old media panels. | The card opens the same-origin lazy preview API, which enforces bank management, loads requester-scoped data, and sends assets through the protected question-asset route. A direct Storage-path mutation fails. |
| Migration approval assertion | Line-ending portability issue | A multiline LF-only SQL substring had to match. | A semantic SQL expression accepts equivalent LF/CRLF source and rejects an update aimed at the wrong row. |
| `/videos` route | UI-copy assertion | The rendered page had to contain the literal word `Videos`. | Source and route checks now cover the page export, safe unconfigured state, published-only query, and bounded pagination. A non-published query mutation fails. |

The related AI Parsing status/Review QA smoke was updated to follow the same
current data and lazy-preview contracts rather than old prose.

## Teacher Review boundary guidance

### Before

The Bank detail loader could calculate question-boundary findings, but the
reachable paginated Teacher Review summary/card loader did not consume them.
Cards displayed only the first hard validation error or joined soft-warning
strings. Stored source-boundary, visual, answer-alignment, duplicate, and other
Review evidence was therefore unavailable at the decision point.

### After

The paginated summary loader now:

1. Resolves each displayed question to its import batch.
2. Reads the already-stored `aiPdfImport.questionBoundaryGuardPlan`.
3. Reuses `questionBoundaryFindingsForQuestion` with question ID/code.
4. Maps findings and canonical validation results to fixed safe categories.
5. Sends only category, level, fixed title/summary, and normalized source page
   numbers to the card.

The card supports source-boundary, answer/solution, missing evidence, visual,
taxonomy, duplicate, and fallback Review checks. `needs_more_evidence` is shown
as blocking. Unknown or malformed older findings fail closed to a generic
stored-check category.

Finding explanations, reason codes, suggested actions, prompts, source text,
raw Provider responses, credentials, filenames, and identifiers are not
projected. The existing manual edit/approve/needs-fix/reject controls,
`pending_review`, `needs_more_evidence`, private Bank scope, and no automatic
publication or Assignment behavior remain unchanged.

## Dependency advisory baseline

`npm audit --json --package-lock-only` was reproduced against the exact starting
main lockfile. It reported 8 vulnerable package entries: 7 high and 1 moderate.
The earlier six-high description was stale relative to the exact lockfile and
current advisory database.

| Package/path | Direct | Severity | Advisory and affected range | Reachability and resolution |
| --- | --- | --- | --- | --- |
| `brace-expansion` via ESLint and `@typescript-eslint` | No | High | `GHSA-mh99-v99m-4gvg` `<1.1.17`; `GHSA-rgw5-rvv9-x895` `<1.1.18` and `>=4.0.0 <5.0.9` | Development tooling DoS surface. Resolved to 1.1.18 and 5.0.9. |
| `js-yaml` via ESLint tooling | No | High | `GHSA-5p4m-2wfm-xmqj`, `>=4.0.0 <4.3.1` | Development/config parsing CPU DoS surface. Resolved to 4.3.1. |
| `nanoid` via PostCSS | No | High | `GHSA-2v37-7h3g-55p8`, `<3.3.17` | Build-tool dependency; not the PDF runtime. Resolved to 3.3.18. |
| `postcss` nested under Next | No | High aggregate | `GHSA-qx2v-qp2m-jg93` `<8.5.10`; `GHSA-6g55-p6wh-862q` `<=8.5.11`; `GHSA-r28c-9q8g-f849` `<=8.5.17`; `GHSA-fxqj-rqcc-2cmp` `<=8.5.22` | Build/render dependency with source-map file-read and CSS-output risks. Next 16.3.0 dedupes to PostCSS 8.5.23. |
| `next` | Yes | High aggregate | Audit node inherited vulnerable nested PostCSS and optional Sharp; affected Next aggregate through `16.3.0-preview.10` | Runtime/build framework. Upgraded from 16.2.11 to 16.3.0 and aligned analyzer/lint packages. |
| `pdfjs-dist` | Yes | High | `GHSA-hq66-cqwq-w95j`, `>=5.6.83 <6.2.108` | Directly reachable while parsing untrusted teacher PDFs. Upgraded 6.0.227 to 6.2.108; loading remains byte-buffer based with worker fetching disabled. The patched API no longer exposes the obsolete eval toggle. |
| `sanitize-html` | Yes | Moderate | `GHSA-vccv-cmxp-4j9h`, `>=1.18.0 <=2.17.4` | Reachable on imported/rendered HTML. Upgraded 2.17.4 to 2.17.6. |
| `sharp` | Yes | High | `GHSA-f88m-g3jw-g9cj`, `<0.35.0`; inherited libvips CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | Directly reachable while inspecting/cropping untrusted PDF images. Upgraded 0.34.5 to 0.35.3. |

Final `npm audit --json` reports zero vulnerabilities. The direct security-
sensitive versions are exact-pinned, and the Next runtime, bundle analyzer,
and lint configuration are aligned at 16.3.0.

## Deterministic visual replay

A temporary detached worktree at frozen stack head `9205c168...` ran the same
four-page generator used by PR #229 first with the frozen dependency set and
then with `pdfjs-dist@6.2.108` and `sharp@0.35.3`. No Provider, Storage, or
database was used.

- Source PDF SHA-256: `09bc5eb8b70e6f5c4cfa122a33fd048cd60448ffeaffc49180cc59b6afa95938`
- Page count: 4 before and after
- Page geometry: 918 x 1188 for every page before and after
- Rendered page PNG bytes and hashes: exact match before and after
- Q1 crop: 495 x 510; entropy `1.1870292481034994`
- Q4 crop: 550 x 451; entropy `1.1571372009275365`
- Q1 decoded-pixel SHA-256: `6c79af0733407cd5237c49cc08320fa6fbc97f37a7a570cf62a197fda44c23f1` before and after
- Q4 decoded-pixel SHA-256: `a0a151a06d051371b135d5a33595f4075b1fc9a7402eccf4dc0e84e4aacc4d0a` before and after
- Q1 encoded PNG changed from `bbd90d0b...` to `f4e7e22b...`
- Q4 encoded PNG changed from `440136bd...` to `aaa7442f...`

The changed encoded hashes are a Sharp/libvips PNG-container encoding change,
not a pixel or crop-region change. Visual inspection confirmed the complete Q1
coordinate diagram and Q4 shared table. The frozen stack's visual safety and
20 mutation contracts, runtime contract, 14/14/13 Golden cases, 18 mutation
proofs, private asset source contracts, and quality foundation passed against
the patched pair.

PR #229's archived platform-specific encoded hashes remain frozen historical
evidence and were not rewritten. The visual-v2 asset ID includes the encoded
content hash, so an encoder change can produce a different deterministic ID
for an otherwise identical crop. This upgrade lands before the frozen stack;
its synthetic hosted assets were exact-ID cleaned with residue zero, so there
is no supported cross-version asset replay to preserve. No identity-version
change is required for this pre-merge adoption. After real visual-v2 assets
exist, another Sharp encoder change must be treated as an identity migration
or requalification event rather than an ordinary lockfile refresh.

## Validation status

The following non-paid checks passed:

- canonical migration governance/reconciliation through 0077;
- all five corrected semantic smoke boundaries and mutations;
- Teacher Review guidance unit/source contracts, including malformed stored
  findings and raw-diagnostic suppression;
- PDF/visual dependency security contract;
- frozen visual replay, Golden, mutation, and private asset contracts;
- all focused PDF50 admission, upload, security, load, status, checkpoint,
  fencing, crash-recovery, lineage, proof-control, lifecycle-budget, and
  post-persistence source/fake suites;
- Provider network safety, resilience, fallback circuit breaker, PDF failure
  status, and local worker source suites;
- taxonomy progressive mount and catalog read-model source suites;
- security smoke;
- core tests: 14 passed;
- full tests: 21 Node tests plus 67 backfill/planning assertions passed;
- `npm audit --json`: 0 vulnerabilities across 643 dependencies;
- `npm ls`: clean;
- changed MJS syntax checks;
- typecheck and lint;
- two production builds;
- performance budget and performance audit;
- bundle analyze build;
- `git diff --check`.

The existing `ai-provider-fallback-chaos-smoke.mjs` stopped at its missing clean
Supabase browser-configuration gate after loading zero local environment
values. It made no connection or hosted mutation and is not counted as passing.
The analyzer completed with exit code 0 and wrote its reports; webpack reported
that bundle parsing fell back to original module sizes because cache dependency
snapshotting was unavailable.

No environment-gated live test is counted as passing.

## Current classification

`MAINLINE_MERGE_GATE_REPAIR_READY_FOR_HOST_REVIEW`
