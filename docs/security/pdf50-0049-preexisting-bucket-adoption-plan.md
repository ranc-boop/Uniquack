# PDF50 0049 Preexisting Bucket Adoption Plan

Source decision: **0049_REQUIRES_PREEXISTING_BUCKET_ADOPTION_HARDENING**

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
| Exact reserved-path 0049 policy present | No |
| Runtime static references bucket | Yes |

Existing Storage policies:

| Policy | Command | Scope | Gate shape |
|---|---|---|---|
| `ai_import_sources_admin_upload` | INSERT | Bucket-scoped | Admin-only, not exact reserved path |
| `ai_import_sources_admin_read` | SELECT | Bucket-scoped | Admin-only, not exact reserved path |
| `ai_import_sources_admin_delete` | DELETE | Bucket-scoped | Admin-only, not exact reserved path |

The legacy admin policies are not equivalent to 0049. They are bucket-scoped
and admin-gated, but they permit arbitrary admin paths. The intended 0049
contract requires exact reserved object paths linked to pending/managed import
metadata.

Current runtime paths depend on `ai-import-sources` for admin AI PDF import,
teacher bank PDF burst upload, and worker/finalization reads. The admin upload
path already reserves an import batch asset before issuing a signed upload
grant, so it can be covered by the 0049 exact-path helper when validated in a
clone.

## Current 0049 Behavior

As currently written, 0049 would:

- safely reuse the existing bucket row instead of failing on bucket insert;
- overwrite bucket configuration through its conflict-update clause;
- preserve private objects because it does not delete or recreate the bucket;
- create the new 0049 Storage policy names without duplicating those names;
- not collide with 0049 table, function, trigger, index, constraint, or policy
  names;
- collide only with the existing bucket category;
- leave the three legacy admin policies in place;
- not fail closed if a preexisting bucket is public or otherwise incompatible.

The current live bucket happens to be private, PDF-only, and 50 MB, so it is
compatible. The source still requires hardening because the migration should
prove compatibility before adoption and should not silently overwrite an
incompatible bucket.

## Required 0049 Hardening

0049 must remain valid for an empty fresh-chain database and forward-only for
an upgraded clone. The hardened behavior should be:

1. If `ai-import-sources` is absent, create it with the canonical private,
   PDF-only, 50 MB contract.
2. If it exists, adopt it only when it is private and compatible with the
   canonical PDF-only contract.
3. Fail closed if the existing bucket is public.
4. Fail closed if the existing bucket omits PDF support.
5. Tighten a broader or unset MIME list to PDF-only; never broaden allowed
   MIME types.
6. Tighten an unset or higher file-size limit to 50 MB; do not raise a
   stricter existing size limit without a separate owner decision.
7. Preserve all existing private objects.
8. Avoid deleting or recreating the bucket.
9. Create missing 0049 exact-path policies idempotently.
10. Do not duplicate policy names.
11. Replace only the three known legacy admin policies after the clone proves
    the 0049 exact-path policy covers current admin upload, read, and delete
    behavior.
12. Fail closed rather than dropping or weakening any unexpected policy with an
    `ai_import_sources_` prefix.

The intended post-hardening policy set should allow:

- authenticated manager upload only to the exact reserved pending object path;
- authenticated manager read/delete only for linked managed source objects;
- admin import paths only when they have a linked import batch asset and pass
  the same exact-path metadata checks;
- service-role operational reads through server-side code, not browser grants;
- no arbitrary authenticated or public source-object access.

## 0049 Object Validation Target

A successful cloned 0049 upgrade must validate all 75 expected 0049 objects:

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

Current live status before 0049 is bucket-only partial presence:
`PARTIALLY_PRESENT`, 1 of 75 expected objects present.

## Required Clone Evidence

The 0049 clone rehearsal must prove:

- no bucket recreation occurred;
- preexisting private objects remained addressable;
- bucket configuration stayed private, PDF-only, and bounded;
- legacy arbitrary-path admin access no longer grants more access than the
  exact-path 0049 helper;
- teacher bank owner/editor can upload only reserved paths;
- bank viewer, student, unrelated organization, and anonymous actors cannot
  upload, read, delete, reserve, finalize, or cancel;
- admin import still works only through reserved import batch assets;
- the service role can perform finalization and worker reads through server
  code;
- no duplicate burst, item, import batch, source asset, provider job, or Review
  Draft is created by retries.

Do not apply 0049 to the current clean working database until the hardened
source and cloned upgrade rehearsal have passed.
