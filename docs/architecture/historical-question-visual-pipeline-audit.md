# Historical Question Visual Pipeline Audit

## Audit identity and constraints

- Repository: `1650512585qq-collab/o2iinstitute`
- Draft PR: `#229`
- Branch: `codex/ai-parsing-quality-efficiency`
- Audited head: `82ebd40b775fd784c24b2fce2e0194e604693c5c`
- Stacked base: PR `#228`, head
  `f1ce7bcb791604468693ea945401cfb157e64d97`
- Historical replay snapshot:
  `8da2ff159849af9678f75f620999984a3322151b`
- Mode: source and Git-history audit plus deterministic local replay
- Real Provider calls: `0`
- Hosted database/Auth/Storage/RPC operations: `0`
- Migration operations: `0`

This audit answers whether PR #229 created a second visual-attachment system or
converged the historically working crop path with the current private asset and
Review safety model.

## Executive conclusion

The competition-era source was found. The competition Demo route did not own or
invoke an automatic crop implementation. Its frozen tree inherited an earlier
Admin AI PDF Import implementation that already accepted Provider
`asset_placeholders`, rendered PDF pages, cropped normalized bounding boxes,
created `question_assets`, and associated them to imported questions.

PR #229 did not build a parallel renderer, cropper, bucket, table, or Admin-only
asset path. It retains the historical `renderPdfPages` and
`cropPdfPlaceholderImage` implementation and routes Admin, Teacher durable PDF
jobs, and recovery through the same application service. It adds the controls
the old pipeline lacked: Provider-neutral visual semantics, strict source/page
lineage, fail-closed bounds, crop-content checks, deterministic identity,
private requester-first delivery, idempotency, compensation, and
`needs_more_evidence`.

No historical commit satisfied the whole reported contract at once. The early
automatic pipeline used a public bucket/public URL and random IDs. The later
private Storage route did not itself add automatic association. PR #229 is the
convergence of those two histories.

One product boundary remains: Assignment and Practice render embedded protected
`<img>` elements when the Provider supplied an inline placeholder, but they do
not independently query `question_assets`. A valid crop attached only to the
question gallery is visible in Teacher Review and approved Bank preview, but is
not guaranteed to appear in Assignment/Practice. That is a product decision,
not evidence of a second crop architecture.

## Competition Demo source location

The relevant competition sequence is:

| Commit | Date | Subject |
| --- | --- | --- |
| `cd64fc53305521a81d8bfa408a67aecfa06e3645` | 2026-06-27 | Expand demo UI for personalized learning showcase |
| `d17124fae69a575d727003d3787a16bfd848e55c` | 2026-06-27 | Restore full EduStruct feature showcase |
| `8da2ff159849af9678f75f620999984a3322151b` | 2026-06-27 | Polish state-aware demo presentation |

The later branch tip is
`origin/codex/web-demo-feature-scan-ui-expansion` at
`9e6028965fa71ca7b6c7d16dc29bb1e1d4cae2ff`.

The frozen Demo source is primarily:

- `src/app/demo/state-aware-practice/page.tsx`
- `src/app/admin/demo-learning-flow/page.tsx`
- `docs/web-demo-personalized-branch-scan.md`

Git search at `8da2ff1` found zero Demo-route references to
`processAIPdfImport`, `asset_placeholders`, `question_assets`, or
`cropPdfPlaceholderImage`. The automatic visual pipeline in that same tree
lived under `src/lib/ai-pdf-import` and the Admin import/question surfaces. The
Demo is therefore useful product evidence, but it is not the implementation
owner.

## Historical provenance

### Question asset and gallery foundation

| Evidence | Value |
| --- | --- |
| Earliest commit | `6464658d060f457da21a37c22dc1650513561603` |
| Date | 2026-06-01 |
| Branch | `origin/someone114514/question-image-storage` |
| Follow-up | `e55a558b161372ac4a17ea5bba70600426756afb` |
| Merge | PR #2, `36fb389566cd54a343d590f5a341fcc45a13b0c5` |

Relevant files were:

- `src/app/admin/questions/actions.ts`
- `src/app/admin/questions/asset-actions.ts`
- `src/app/admin/questions/page.tsx`
- `src/app/questions/[id]/page.tsx`
- `src/components/question-assets-panel.tsx`
- `src/components/question-detail-image-gallery.tsx`
- `src/lib/question-assets.ts`

This foundation created the `question_assets` relation, the `question-assets`
bucket, Admin asset CRUD, and a gallery below question detail. It was a manual
asset foundation, not yet automatic PDF association. The bucket was public.

### First automatic PDF figure association

| Evidence | Value |
| --- | --- |
| Earliest commit | `b5e2c954089297cdffe491b72366eb0da4105ecb` |
| Date | 2026-06-06 |
| Subject | `WIP ai pdf import` |
| First hardening | `62fb8adebd7805d2b0d621633cec40fb30621acb` |
| Reviewed hardening | `643ab65bbaaec91a1f9f314411cdea2616ddad10` |
| Merge | PR #13, `65b225cea2c903a8d09d9b27f9163555f0edaaf8` |
| Branch | `origin/codex/ai-pdf-import-hardening` |

The Provider output contract added, per question:

```text
asset_placeholders[]
  placeholder
  alt
  page                    // one-based source page
  bbox { x, y, width, height } // normalized page-image coordinates

page_refs[]
```

The functional implementation was:

- `renderPdfPages` / `renderPdfPageNumbers` using `pdfjs-dist` and
  `@napi-rs/canvas` at scale `1.5`;
- `cropPdfPlaceholderImage` mapping normalized bbox values to rendered pixels
  and using `sharp.extract(...).png()`;
- `attachCroppedAssets` matching an imported question through
  `question_code`;
- `uploadQuestionAsset` creating a random UUID and object path
  `questions/<questionId>/<assetId>.png`;
- a pending row, Storage upload, ready-row update, and public URL;
- optional placeholder replacement in `content_html` or `solution_html`;
- a question-detail gallery beneath the question.

The Admin Review query loaded asset rows, but the Review card displayed an
`Image crop refs` count rather than the full gallery. The public question detail
page rendered `QuestionDetailImageGallery`. This is weaker than the current
Teacher Review contract and should not be described as a private, complete
Review implementation.

### Continuity through later parsing work

The visual proposal field remained in history rather than being deleted:

| Commit | Date | Change |
| --- | --- | --- |
| `5c1c30ffad7eca41d356ed8c9f986cda6a139d56` | 2026-06-11 | Parsing/dashboard hardening |
| `75de86020fe801880ee3319aa236d1fab4c349a9` | 2026-06-19 | Masked PDF segmentation |
| `8f2b637ae6549452fdbbc4d8eee078a052d8b96d` | 2026-07-10 | Boundary/duplicate guard |
| `544668e327e39838e679d228e512667fdfe16133` | 2026-07-13 | Coverage recovery executor |
| `59ac19df53f5ef4c02528b25aac7bbdf9a3472e0` | 2026-08-05 | PR #229 visual hardening |

`git log -S cropPdfPlaceholderImage` finds only its introduction at `b5e2c954`;
there is no deletion/reintroduction commit. The following searched branch tips
also retained the shared import architecture rather than introducing another
crop implementation:

- `origin/codex/ai-provider-adapter-foundation` at `98693cc31fda...`
- `origin/codex/ai-parsing-preanalysis-foundation` at `1a8108153bd2...`
- `origin/codex/ai-parsing-packet-builder-foundation` at `3e6c8bbd413a...`
- `origin/codex/pr-c3-summary-merge-consolidation` at `c65074a2060a...`

### Private asset delivery foundation

The old public asset model was hardened later through:

- `3d88b9abf033b9bfd164fb3a44e92b5d0c9885d5`: centralized signed access;
- `2e7bc8f693944b6cbcc950dc45601a0757ae162a`: make question assets private;
- `d502c68ff84d591fe363c78ca78daf15a8c3368f`: integrate private hardening;
- `eff11c41578449dadcad1ba66ec47a6884fc13cd`: validate merged hardening.

This supplied the private bucket and requester-first
`/api/question-assets/[assetId]` boundary used by PR #229. PR #229 did not add a
new bucket or relation.

## Candidate known-good versions

### Historical functional baseline: PR #13 through the competition tree

This version could render and crop a correct region and associate it to an
imported question. It is known-good for the narrow render/crop behavior.

- Structured fields: `asset_placeholders`, normalized bbox, one-based page,
  placeholder, alt, and `page_refs`.
- Storage: public `question-assets` bucket.
- Object identity: random UUID.
- Asset model: `question_assets`, pending/ready lifecycle.
- Association: case-normalized `question_code` map.
- Review: crop reference count; full image gallery on question detail.
- Assignment/Practice: only an inline replacement could flow with HTML; there
  was no independent asset loader.
- Cleanup: row cleanup on upload failure, but incomplete compensation when the
  ready update or later cross-system write failed.
- Idempotency: none; retries could create duplicate objects.
- Required figure behavior: warnings only; no approval lock.

It was not known-good for privacy, deterministic identity, exact lineage,
idempotency, or complete Review gating.

### Current full convergence: PR #229

PR #229 combines the historical crop behavior, the private asset foundation,
and the current Bank/Review ownership model.

- Provider contract: `ai-pdf-visual-evidence/v2`, normalized into application
  types before persistence.
- Visual roles: question figure, answer figure, chart, diagram, graph, table,
  and decorative.
- Required/optional evidence, subquestion ownership, and bounded shared-group
  semantics.
- Exact source asset, import batch, Bank, question, page, and Review lineage.
- Strict finite in-page boxes; invalid bounds are rejected, never normalized by
  silent clipping.
- PNG dimension/format/entropy validation.
- SHA-256 content binding and deterministic asset UUID/path:
  `questions/<questionId>/ai-pdf/<assetId>.png`.
- Existing deterministic assets are reused; new uploads use `upsert=false`.
- Exact compensating Storage and row cleanup.
- Private requester-first route and no-store delivery.
- Missing required evidence changes Review to `needs_more_evidence`; successful
  later attachment returns only to `pending_review`.
- The same `attachCroppedAssets` is used by normal import and Coverage Recovery.

The final PR #229 evidence at `82ebd40` records Q1 and Q4 attachment, Q2
decorative suppression, Q3 `needs_more_evidence`, owner render/reload/remount,
anonymous and cross-organization denial, exact cleanup, and no orphan objects.

## Historical call graph

```text
Admin AI PDF action
-> processAIPdfImport
-> Provider/native PDF or rendered-page request
-> aiPdfExtractionSchema.parse(asset_placeholders, page_refs)
-> buildImportJson
-> shared importer creates draft questions
-> attachCroppedAssets
-> map question_code to created question
-> renderPdfPages(scale 1.5)
-> cropPdfPlaceholderImage(normalized bbox)
-> uploadQuestionAsset(random UUID, public bucket URL)
-> replace exact inline placeholder when present
-> update question HTML
-> Admin Review crop-count / question-detail gallery
```

Crop errors became warnings and processing continued. Missing/invalid required
figures did not create a blocking Review state.

## Current PR #229 call graph

```text
Teacher Bank PDF upload
-> reserveTeacherAIPdfBurst
-> signed private source upload
-> finalizeTeacherAIPdfBurstItem
-> release admission and enqueue durable ai_provider_job
-> protected internal worker route
-> claim + lease + fencing + checkpoint
-> Provider-neutral route
-> processAIPdfImport
-> validate untrusted Provider extraction
-> shared importer creates private Review Draft questions
-> validate exact source/batch/Bank/question/page lineage
-> attachCroppedAssets (normal import and recovery share this function)
-> renderPdfPageNumbers / cropPdfPlaceholderImage
-> validate PNG dimensions and entropy
-> SHA-256 + deterministic asset identity
-> private Storage object + question_assets row
-> Review visualEvidence record and pending_review/needs_more_evidence state
-> requester-scoped Review DTO
-> QuestionDetailImageGallery through /api/question-assets/[assetId]
```

The Admin PDF action calls the same `processAIPdfImport` service directly. It
does not have an Admin-specific cropper or persistence model.

## Regression boundary

No commit deleted the mature crop function, removed `asset_placeholders`, or
replaced the visual store. The reported regression is a reachability and
qualification gap, not a source-code deletion:

1. The competition Demo routes were presentation code and were not the crop
   implementation owner.
2. Later Teacher/PDF50 qualification focused on text-heavy PDFs. Those fixtures
   did not prove the still-reachable visual branch.
3. Historical normalization could omit malformed visual proposals.
4. A missing or failed required crop produced a warning, not a durable blocking
   requirement.
5. Random identity and incomplete compensation made retries unsafe.
6. Coverage Recovery did not originally share complete attachment semantics.

The first missing transition was therefore:

```text
Provider says a figure is required
-> malformed/missing proposal can be dropped or crop can warn
-> no durable required-evidence record
-> Review remains otherwise usable
```

That unsafe boundary existed in the first automatic implementation at
`b5e2c954`; no later deletion commit is responsible. PR #229 closes it by
recording visual requirements, validating proposals, and locking Review to
`needs_more_evidence` when the requirement is not satisfied.

## Architecture comparison and component decision

| Component | Historical implementation | PR #229 implementation | Decision |
| --- | --- | --- | --- |
| 1. Provider visual schema | `asset_placeholders`, page, normalized bbox, placeholder/alt | Same base fields plus role, required, subquestion/shared semantics and safe normalization | `PORT_HISTORICAL_WITH_HARDENING` |
| 2. Page/coordinate representation | One-based page; normalized top-left image box | Same convention; finite and fully in-page validation | `PORT_HISTORICAL_WITH_HARDENING` |
| 3. Question identity mapping | Case-normalized `question_code` | Exact created question plus Review/Bank/source lineage | `KEEP_PR229_IMPLEMENTATION` |
| 4. Shared/multipart figures | No durable semantic contract | Bounded subquestion and shared-group metadata | `KEEP_PR229_IMPLEMENTATION` |
| 5. PDF page rendering | pdfjs + canvas, scale 1.5 | Same implementation | `REUSE_HISTORICAL_EXACTLY` |
| 6. Crop algorithm | Normalized pixel rectangle + `sharp.extract` | Same arithmetic, plus empty-intersection rejection | `PORT_HISTORICAL_WITH_HARDENING` |
| 7. Image quality | No content-quality validation | PNG, 8-4096 dimensions, entropy and byte limits | `KEEP_PR229_IMPLEMENTATION` |
| 8. Storage bucket/path | Public bucket; random `questions/<q>/<id>.png` | Existing private bucket; deterministic `questions/<q>/ai-pdf/<id>.png` | `HISTORICAL_PATH_OBSOLETE` |
| 9. Asset database model | Existing `question_assets` table | Same canonical relation with current columns | `PORT_HISTORICAL_WITH_HARDENING` |
| 10. Content hashing | None | SHA-256 bound to deterministic identity | `KEEP_PR229_IMPLEMENTATION` |
| 11. Idempotency | Retry creates another UUID/object | Reuse exact deterministic asset; `upsert=false` | `KEEP_PR229_IMPLEMENTATION` |
| 12. Authorization | Public Storage URL | Private requester-first asset route | `KEEP_PR229_IMPLEMENTATION` |
| 13. Bank/source/question lineage | Question code only | Exact source asset, batch, Bank, question and Review | `KEEP_PR229_IMPLEMENTATION` |
| 14. Review rendering | Crop count in Admin Review; gallery on question detail | Requester-scoped Teacher Review DTO and shared gallery | `PORT_HISTORICAL_WITH_HARDENING` |
| 15. Reload/remount | Not explicitly proven | Same protected DTO/route, live-proven reload and remount | `KEEP_PR229_IMPLEMENTATION` |
| 16. Approved Bank rendering | Generic detail gallery | Bank preview uses the same requester-scoped DTO/gallery | `KEEP_PR229_IMPLEMENTATION` |
| 17. Assignment/Practice rendering | Inline placeholder only | Inline protected image flows; gallery-only asset has no independent loader | `REQUIRES_PRODUCT_DECISION` |
| 18. Cleanup/orphans | Partial row cleanup | Exact object/row compensation, Review lock on uncertainty | `KEEP_PR229_IMPLEMENTATION` |
| 19. Error behavior | Best-effort warning | Safe counters/reasons and fail-closed required evidence | `KEEP_PR229_IMPLEMENTATION` |
| 20. Missing required figure | No hard gate | `needs_more_evidence`; never auto-approved | `KEEP_PR229_IMPLEMENTATION` |

## Reusable and duplicate components

### Reused canonical components

- `src/lib/ai-pdf-import/pdf.ts`: page renderer and crop arithmetic.
- `src/lib/ai-pdf-import/service.ts`: one attachment application service.
- `question_assets`: one question-asset relation.
- `question-assets`: one bucket, now private.
- `QuestionDetailImageGallery`: one gallery renderer.
- `/api/question-assets/[assetId]`: one protected delivery boundary.

Historical `pdf.ts` blob at the competition snapshot is
`a58ba84a73c99e0c3884ff1b7c1d67e362bb0118`. The PR #229 blob is
`95e6b8fde078c312e6e4bf747c319551f515ef7a`. Their only crop-file delta is the
empty-intersection rejection and `inspectQuestionVisualCrop` quality check.

### Duplicate architecture findings

- No second active PDF renderer was found.
- No second active bbox convention was found.
- No Admin-only or Teacher-only cropper was found.
- No Demo-only asset table or bucket was found.
- No Provider-specific persistence path was found.
- Legacy public-path behavior is obsolete; it is not the current canonical
  route.
- The Assignment/Practice gallery gap is a missing downstream projection, not
  a duplicate visual pipeline.

## Deterministic source-only replay

A temporary detached worktree at `8da2ff1` and the current PR #229 worktree ran
the same generated four-page PDF from
`scripts/ai-parsing-eval/synthetic-visual-pdf.mjs` without a Provider.

- Source PDF SHA-256:
  `09bc5eb8b70e6f5c4cfa122a33fd048cd60448ffeaffc49180cc59b6afa95938`
- Historical rendered pages: `4`
- Current rendered pages: `4`
- Rendered page bytes and dimensions: exact match

| Fixture | Page | Historical crop | Current crop | Result |
| --- | ---: | --- | --- | --- |
| Q1 required diagram | 1 | 495x510, 12,200 bytes, SHA-256 `2e455c7b18cb99068def1c4f48fd68442f02712d5b59196b4310e4069e966d19` | Same; entropy `1.1870292481` | Exact byte match |
| Q4 shared table | 4 | 550x451, 11,482 bytes, SHA-256 `e70a29637cc218a4b0ae51aead68fe6ace6095ba9221f5a2a3213569d5d1daa7` | Same; entropy `1.1571372009` | Exact byte match |

This proves PR #229 reproduces the historical renderer/crop output for the same
source and proposal, while adding current crop validation. The replay did not
write Storage or database rows. The temporary script, dependency junction, and
detached worktree were removed; the branch was clean before the report edit.

The existing source-only suite also passed:

- AI Parsing runtime contract;
- Provider attempt architecture and state;
- Golden Corpus: 14 parsing, 14 taxonomy, and 13 visual cases;
- 18 mutation proofs with order invariance;
- question-asset authorization evidence;
- AI Parsing quality foundation;
- visual live-harness safety and 20 mutation contracts;
- question-assets merged-code/private-cutover contracts;
- security smoke;
- canonical migration reconciliation.

`question-assets-security-smoke.mjs` stopped at its missing Supabase URL/anon-key
gate before a connection. It was not counted as passing and no credentials were
supplied. `teacher-ai-parsing-bank-targeting-smoke.mjs` separately fails a
current viewer-import UI source assertion; it is unrelated to crop convergence
and was not changed in this audit.

## Security and product differences

| Boundary | Historical | Current |
| --- | --- | --- |
| Source trust | Provider page/bbox largely trusted after schema parse | Provider output remains untrusted; application validates source and page lineage |
| Visibility | Public bucket URL | Private route with requester-first authorization |
| Ownership | Question code association | Bank/source/batch/question/Review identity |
| Retry | New random asset each time | Deterministic identity and reuse |
| Failure | Warning and continue | Required evidence blocks Review |
| Cleanup | Incomplete across row/object/update failures | Exact compensation with lock preserved when uncertain |
| Publication | Draft-oriented, but no visual-specific hard gate | `pending_review` or `needs_more_evidence`; never auto-publish/assign |
| Diagnostics | Could propagate raw storage/provider messages | Safe stages, codes and counters only |

## Convergence recommendation

Keep PR #229 as the sole canonical visual-attachment pipeline.

1. Preserve `renderPdfPageNumbers` and `cropPdfPlaceholderImage`; their output
   is the proven historical behavior.
2. Preserve PR #229 validation, deterministic identity, private delivery,
   lineage, cleanup, decorative suppression, and Review lock.
3. Keep Admin and Teacher paths routed through `processAIPdfImport` and the same
   `attachCroppedAssets` function.
4. Do not restore public URLs, random object identity, warning-only required
   figures, or Demo-specific routes.
5. Do not add another table, bucket, bbox convention, or Provider-specific
   persistence adapter.
6. Make a separate product decision for gallery-only visuals in
   Assignment/Practice. If required, project authorized `question_assets` into
   the assignment snapshot or load them through an assignment-scoped DTO. Do
   not make Student visibility equivalent to Bank visibility.

No source correction is warranted by this audit. A correction to downstream
Assignment/Practice rendering would change runtime behavior and must be a
separate reviewed task with Student authorization and snapshot compatibility
coverage.

## Live proof applicability and remaining gates

The prior PR #229 visual live proof remains applicable because this audit made
no runtime, migration, Provider, schema, or environment change. The replay
confirms that the proven current crop output is the historical crop output plus
validation, not a replacement.

No new paid visual-only proof is required for historical convergence. A new
proof would be required only if a later change modifies crop bytes, visual
identity, Storage persistence, requester authorization, Review projection, or
the Assignment/Practice downstream contract.

Remaining independent items:

- decide and test gallery-only visual behavior in Assignment/Practice;
- reconcile the unrelated Teacher Bank targeting smoke assertion;
- do not describe an environment-gated security smoke as passed without its
  separately authorized live inputs.

## Final classification

`HISTORICAL_VISUAL_PIPELINE_REUSED_AND_CONVERGED`
