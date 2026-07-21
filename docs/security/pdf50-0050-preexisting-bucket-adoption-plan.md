# PDF50 0050 Preexisting Bucket Adoption Plan

Source decision: **0050_REQUIRES_PREEXISTING_BUCKET_ADOPTION_HARDENING**

Bucket compatibility classification:
**COMPATIBLE_BUT_REQUIRES_ADOPTION**

This plan is based on a read-only audit of the current clean working database.
No Storage API, Supabase management API, migration apply, migration repair,
row mutation, Provider call, credentials, object rows, signed URLs, or source
content were used or reported.

## Live Bucket Contract

Bucket: `ai-import-sources`

| Check | Read-only result |
|---|---|
| Bucket exists | Yes |
| Public flag | Private |
| File-size limit | Matches 50 MB contract |
| Allowed MIME types | Matches PDF-only contract |
| Creation metadata | Present, timestamp not reported |
| Existing Storage policy count | 3 |
| Exact reserved-path 0050 policy present | No |
| Runtime static references bucket | Yes |

Existing Storage policies:

| Policy | Command | Scope | Gate shape |
|---|---|---|---|
| `ai_import_sources_admin_upload` | INSERT | Bucket-scoped | Admin-only, not exact reserved path |
| `ai_import_sources_admin_read` | SELECT | Bucket-scoped | Admin-only, not exact reserved path |
| `ai_import_sources_admin_delete` | DELETE | Bucket-scoped | Admin-only, not exact reserved path |

The legacy admin policies are not equivalent to 0050. They are bucket-scoped
and admin-gated, but they permit arbitrary admin paths. The intended 0050
contract requires exact reserved object paths linked to pending/managed import
metadata.

Current runtime paths depend on `ai-import-sources` for admin AI PDF import,
teacher bank PDF burst upload, and worker/finalization reads. The admin upload
path already reserves an import batch asset before issuing a signed upload
grant, so it can be covered by the 0050 exact-path helper when validated in a
clone.

## Hardened 0050 Behavior

0050 now locks the named bucket row and takes one deterministic branch:

1. **Absent:** create the canonical private, PDF-only bucket with a 50 MB cap.
2. **Compatible:** adopt the existing row without recreating it or touching any
   object. A null or larger size cap is tightened to 50 MB; a smaller positive
   cap remains unchanged because it is stricter.
3. **Incompatible:** raise a bounded exception so the enclosing migration
   transaction rolls back before any PDF50 schema or policy change commits.

The current live bucket is private, PDF-only, and 50 MB, so it is compatible.
0050 now proves that compatibility instead of silently overwriting it.

## Required 0050 Hardening

0050 must remain valid for an empty fresh-chain database and forward-only for
an upgraded clone. The hardened behavior should be:

1. If `ai-import-sources` is absent, create it with the canonical private,
   PDF-only, 50 MB contract.
2. If it exists, adopt it only when it is private and compatible with the
   canonical PDF-only contract.
3. Fail closed if the existing bucket is public or has a different name.
4. Fail closed unless allowed MIME types are exactly PDF-only. An unset or
   broader MIME list may belong to another workload and is not silently
   repurposed by this migration.
5. Tighten an unset or higher file-size limit to 50 MB; do not raise a
   stricter existing size limit without a separate owner decision.
6. Preserve all existing private objects.
7. Avoid deleting or recreating the bucket.
8. Create missing 0050 exact-path policies idempotently.
9. Do not duplicate policy names.
10. Replace only the three known legacy admin policies transactionally. The
    clone rehearsal must prove the exact-path policy covers current admin
    upload, read, and delete behavior.
11. Fail closed rather than dropping or weakening an unexpected policy that is
    named for, or whose policy expression targets, `ai-import-sources`.

The intended post-hardening policy set should allow:

- authenticated manager upload only to the exact reserved pending object path;
- authenticated manager read/delete only for linked managed source objects;
- admin import paths only when they have a linked import batch asset and pass
  the same exact-path metadata checks;
- service-role operational reads through server-side code, not browser grants;
- no arbitrary authenticated or public source-object access.

The legacy policies are all **BROADER_THAN_CANONICAL**. They authorize admins
at arbitrary paths within the bucket, whereas 0050 authorizes an authenticated
admin only through an exact linked import asset. The migration drops only
`ai_import_sources_admin_upload`, `ai_import_sources_admin_read`, and
`ai_import_sources_admin_delete`; it uses no prefix or wildcard policy drop.
Before those three names are dropped, 0050 checks the Storage catalog and
aborts if any other policy appears to target the source bucket. That policy is
left untouched for a separate review.

## 0050 Object Validation Target

A successful cloned 0050 upgrade must validate all 75 expected 0050 objects:

| Category | Expected |
|---|---:|
| Tables | 2 |
| Columns | 44 |
| Functions | 11 |
| Triggers | 6 |
| Indexes | 4 |
| Named constraints | 0 |
| RLS-enabled tables | 2 |
| Policies | 5 |
| Buckets | 1 |

Current live status before 0050 is bucket-only partial presence:
`PARTIALLY_PRESENT`, 1 of 75 expected objects present.

## Required Clone Evidence

The 0050 clone rehearsal must prove:

- no bucket recreation occurred;
- preexisting private objects remained addressable;
- bucket configuration stayed private, PDF-only, and bounded;
- legacy arbitrary-path admin access no longer grants more access than the
  exact-path 0050 helper;
- teacher bank owner/editor can upload only reserved paths;
- bank viewer, student, unrelated organization, and anonymous actors cannot
  upload, read, delete, reserve, finalize, or cancel;
- admin import still works only through reserved import batch assets;
- the service role can perform finalization and worker reads through server
  code;
- no duplicate burst, item, import batch, source asset, provider job, or Review
  Draft is created by retries.

Do not apply 0050 to the current clean working database until the hardened
source and cloned upgrade rehearsal have passed.
