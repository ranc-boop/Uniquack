# Current Clean DB History Repair Clone Rehearsal

Recommended strategy for a cloned rehearsal:
**A. Mark the verified missing canonical migrations as applied in migration history.**

This runbook is a plan only. It does not authorize writes to the current clean
working database, Storage, Provider systems, Supabase management APIs, or
environment files.

## Inputs

- Current clean database classification:
  `LIVE_SCHEMA_HISTORY_DIVERGENCE_REQUIRES_REPAIR`.
- Canonical object coverage: `0001-0048`.
- Canonical history recorded: `0001-0019` as legacy aliases.
- Canonical history missing: `0020-0048` (29 migrations).
- Unmapped legacy history rows: 2, both preserved and untouched.
- PDF50 `0050` status before upgrade: `PARTIALLY_PRESENT`, bucket-only. Main
  Practice routing `0049` must be applied first in any canonical replay.
- 0050 source decision:
  `0050_REQUIRES_PREEXISTING_BUCKET_ADOPTION_HARDENING`.

The live migration ledger has this sanitized shape:

| Column | Type | Nullable |
|---|---|---|
| `version` | text | no |
| `statements` | array | yes |
| `name` | text | yes |

Do not expose or copy live row timestamps, operational metadata, users, SQL
statements, credentials, or source content into rehearsal notes.

## Repair Options

| Option | Safety | activeApplyPlan compatibility | Future migration compatibility | Reproducibility | Auditability | Risk of rerunning 0020-0048 | Rollback |
|---|---|---|---|---|---|---|---|
| A. Mark verified missing canonical migrations as applied | High on clone after fingerprints pass | High | High | High if scripted from activeApplyPlan | High | Low | Discard clone or restore clone snapshot |
| B. Add canonical aliases for grouped legacy records | Low for this database | Low | Low | Low | Low | Medium | Requires undoing synthetic aliases |
| C. Create a separate reconciliation baseline record | Medium | Low unless all future tooling is custom | Medium | Medium | Medium | Medium | Discard clone |
| D. Leave history unchanged and start custom apply at 0050 | Low | Low | Low | Medium | Low | High | Future operators inherit hidden state |
| E. Encode a clone-only reconciliation migration | Medium | Medium | Medium | Medium | Medium | Low if carefully gated | Discard clone |

Option A is the only recommended clone strategy. It preserves the two unmapped
legacy rows, records the 29 verified canonical migrations, and aligns future
apply behavior with `activeApplyPlan` so the next canonical migration is
Practice routing `0049`, followed by PDF50 `0050`.

Do not apply Practice `0049` or PDF50 `0050` manually while canonical history
remains unresolved.

## Stage A - History Reconciliation Clone

Goal: prove that the 29 missing canonical history entries can be reconciled on
a disposable clone without changing application schema or application data.

1. Create a disposable clone from the current clean working database or from a
   sanitized schema/data snapshot approved for rehearsal. Do not write to the
   current clean database.
2. Use synthetic or minimal data wherever runtime validation requires rows.
   Preserve enough metadata for schema, RLS, Storage, and migration-history
   validation.
3. Run the read-only audit script against the clone first and confirm:
   `transaction_read_only=on`, 21 history rows, 19 canonical legacy aliases,
   2 unmapped legacy rows, `0001-0048` fully represented, Practice `0049`
   absent, and PDF50 0050 bucket-only partial presence.
4. Capture a sanitized pre-repair schema fingerprint from catalogs:
   tables, columns, views, functions/signatures, triggers, indexes,
   constraints, RLS enablement, policies, and buckets.
5. On the clone only, mark exactly these canonical migration versions as
   applied: `0020` through `0048`.
6. Use the clone ledger's existing row shape. The required canonical identity
   is the four-digit version from `activeApplyPlan`; if the nullable `name`
   column is populated by the chosen repair tool, use the matching canonical
   filename or stem. Do not store raw migration SQL in the history table unless
   the repair tool requires the existing nullable array shape.
7. Preserve all existing 21 rows. Do not delete, rewrite, rename, or reinterpret
   HIST-020 or HIST-021.
8. Re-run the read-only audit against the clone and confirm:
   50 total history rows, 48 canonical migrations through 0048 represented and
   recorded or alias-recorded, 2 unmapped legacy rows still present, no partial
   or absent canonical migration through 0048, and the next canonical applies
   are Practice 0049 followed by PDF50 0050.
9. Diff the pre-repair and post-repair schema fingerprints. The only expected
   change is migration-history metadata on the clone. Application schema,
   application data, Storage objects, bucket configuration, policies, grants,
   triggers, functions, indexes, constraints, and RLS settings must be
   unchanged.
10. Run source-only governance checks against the same commit:
    `node scripts/canonical-migration-governance-smoke.mjs`,
    `node scripts/migration-reconciliation-smoke.mjs`, and
    `node scripts/security-smoke.mjs`.
11. Stop Stage A if the clone cannot prove canonical history through 0048
    without changing application schema or data.

Stage A passes only when the clone proves future canonical migration tooling
starts at Practice 0049 followed by PDF50 0050 and no application object changed.

## Stage B - Practice 0049 and PDF50 0050 Upgrade Clone

Goal: start from the reconciled canonical 0048 clone, apply the approved
Practice routing 0049 then PDF50 0050 exactly once, safely adopt the
preexisting bucket, and validate PDF50 admission
without Provider calls.

Prerequisite: 0050 source has been hardened according to
`docs/security/pdf50-0050-preexisting-bucket-adoption-plan.md`.

1. Snapshot or recreate the Stage A reconciled clone.
2. Confirm the clone has canonical history through `0048`, two preserved
   unmapped legacy rows, and no recorded Practice `0049` or PDF50 `0050`.
3. Confirm the preexisting `ai-import-sources` bucket has the exact canonical
   identity, is private, and is PDF-only. A positive cap below 50 MB is a
   stricter compatible setting; an unset or larger cap is tightened to 50 MB
   by 0050. A public, differently named, MIME-broader, or otherwise unsafe
   bucket must make the upgrade fail closed.
4. Apply Practice 0049 exactly once, then PDF50 0050 exactly once to the clone.
5. Confirm the migration history records both entries exactly once and does not alter
   the preserved legacy rows.
6. Validate all 75 expected 0050 objects:
   2 tables, 44 columns, 11 functions, 6 triggers, 4 indexes, 2 RLS-enabled
   tables, 5 policies, and 1 bucket.
7. Confirm no duplicate bucket, table, policy, function, trigger, index, or
   constraint names exist.
8. Confirm the bucket was adopted, not recreated, and existing private objects
   were preserved.
9. Run the Storage matrix:
   bank owner/editor upload exact reserved path, bank owner/editor read/delete
   managed paths, viewer denied, student denied, unrelated organization denied,
   anonymous denied, admin import exact-path behavior retained, arbitrary-path
   admin behavior closed or explicitly blocked by the hardened migration.
10. Run the RLS matrix:
    burst parent/item safe read for authorized managers only, no browser direct
    insert/update/delete on burst tables, service-role-only reservation,
    service-role-only admission release, service-role-only cancellation RPC,
    and no job ID/provider detail exposure to ordinary users.
11. Run the 1/10/50 PDF admission rehearsal with synthetic PDFs and no Provider
    calls:
    reserve, signed-upload grant, finalize, admission-ready state, bounded
    release into the existing queue window, retry same request key, cancel
    pending items, and exact cleanup.
12. Verify no duplicate burst parent, burst item, import batch, source asset,
    provider job, or Review Draft is created by retries or concurrent
    finalization.
13. Verify Review Drafts remain private, Bank-scoped, and review-gated. No AI
    auto-publish path is introduced.
14. Run source and workflow checks:
    `node scripts/canonical-migration-governance-smoke.mjs`,
    `node scripts/migration-reconciliation-smoke.mjs`,
    `node scripts/security-smoke.mjs`, plus the PDF50 burst security,
    direct-upload, admission, and load smokes if available in the branch.
15. Record only sanitized aggregate evidence: counts, classifications,
    migration numbers, object categories, actor matrix pass/fail, cleanup
    counts, rollback/cleanup result, and git commit.
16. Destroy the disposable clone and remove temporary client files, generated
    keys, dumps, logs, and synthetic PDFs.

Stage B passes only when the clone is reconciled through 0048, Practice 0049
then PDF50 0050 apply once, the preexisting bucket is adopted safely, and PDF50 admission validates
without duplicate durable records or weakened Storage/RLS behavior.

## Cleanup And Failure

- If Stage A fails, discard the clone and do not proceed to Practice 0049 or
  PDF50 0050.
- If Stage B fails, discard the clone and correct source forward-only before
  repeating from Stage A.
- Never repair or apply migrations on the current clean working database as
  part of this rehearsal.
- Never delete noncanonical objects merely because they are noncanonical.
- Preserve the two unmapped legacy rows unless a separate owner-approved
  mapping proves their exact canonical meaning.

## Live Promotion Gate

A live repair proposal can be considered only after a disposable clone proves:

- canonical history through `0048` can be reconciled with no application schema
  or data changes;
- 0050 hardened source safely adopts the preexisting bucket;
- all PDF50 Storage, RLS, and 1/10/50 admission matrices pass;
- cleanup is exact; and
- the final evidence is sanitized and reproducible from `activeApplyPlan`.
