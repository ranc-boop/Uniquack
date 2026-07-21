# PDF50 0050 Bucket Adoption Implementation

## Goal

Harden the not-yet-applied canonical migration `0050` so a fresh database can
create `ai-import-sources`, while an upgraded clean-database clone can adopt a
compatible existing bucket without recreating it or deleting objects.

## Non-Goals

- No database, Storage, Provider, or runtime operation was performed.
- At the original source decision, no migration through `0048` changed.
  Sequence reconciliation later retained main's Practice routing migration as
  canonical `0049` and moved PDF50 to `0050`; no PDF50 SQL behavior changed.
- No historical migration ledger repair, content backfill, assignment creation,
  publication, or Provider routing change is included.

## Canonical Contract

| Property | Adoption rule |
|---|---|
| Bucket identity | `id` and `name` must both be `ai-import-sources`. Any mismatch fails closed. |
| Visibility | Must already be private. A public bucket fails closed. |
| MIME types | Must be exactly `application/pdf`. Unset or broader types fail closed rather than repurposing another workload. |
| Size limit | `50 MB` is canonical. Null or larger is tightened; a lower positive limit is retained as stricter. |
| Existing objects | Preserved. The migration never deletes or recreates the bucket. |
| Upload | Authenticated Bank owner/editor or linked admin import only, at one exact reserved pending path. |
| Read/delete | Authenticated manager only, at one exact linked managed source path. |
| Update | No browser `UPDATE` Storage policy is granted. |
| Service role | Continues through trusted server-side finalization and worker paths, not browser grants. |

## Migration Branches

1. **Bucket absent:** create the canonical private PDF-only bucket with a 50 MB
   cap, then create all PDF50 objects and exact-path policies.
2. **Bucket compatible:** row-lock and adopt the existing bucket, retain its
   identity and objects, preserve a stricter positive cap, and only tighten an
   unset or larger cap.
3. **Bucket incompatible:** raise a bounded exception. The migration runner's
   transaction rolls back, so no PDF50 tables, policies, or bucket metadata
   change commits.

## Legacy Policy Treatment

`ai_import_sources_admin_upload`, `ai_import_sources_admin_read`, and
`ai_import_sources_admin_delete` are **BROADER_THAN_CANONICAL** because they
allow arbitrary bucket paths to admins. 0050 drops only those exact names and
installs the canonical reserved-upload, manager-read, and manager-delete
policies. No wildcard policy deletion occurs. Before this replacement, a
catalog preflight aborts the migration if another policy is named for, or whose
expression targets, the source bucket; that policy remains untouched for a
separate review.

## Product and Security Boundaries

The affected workflow remains private source material -> AI Parsing -> Review
Drafts -> Bank. No AI draft is published or assigned by this migration.
Teachers require active Bank owner/editor capability; viewers, students,
unrelated users, and anonymous callers receive no source-object grant. Admin
import remains exact-path and linked-asset based, not a general bucket bypass.
Old-demo overlap is not applicable.

## Freeze and Validation

Changing 0050 is allowed only because it has not been applied. After the first
successful application it is frozen and any defect needs a forward migration.
Local validation is deterministic source coverage only. A disposable clone
must still prove absent/create, compatible/adopt, incompatible/rollback,
legacy-policy replacement, Storage authorization, and 1/10/50 admission
without Provider calls before any current-clean upgrade is considered.
