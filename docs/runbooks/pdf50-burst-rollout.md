# PDF50 Burst Rollout Runbook

## Preconditions

- Review migration `0049` as a forward-only canonical clean migration.
- Confirm no migration number collision on active branches.
- Confirm `ai-import-sources` is private and has no public URLs.
- Confirm current provider concurrency values are unchanged.
- Confirm all PDF50 and existing queue/security/build checks pass without a Provider call.

## Clean-database rehearsal

This PR does not apply a migration. Before rollout, use approved disposable infrastructure only:

1. Apply the full canonical clean chain through `0049` to a fresh database.
2. Verify bucket privacy, RLS, RPC grants, indexes, and constraints.
3. Apply `0049` to a disposable database already at `0048`.
4. Run owner/editor/viewer/student/cross-organization checks.
5. Reserve and finalize synthetic 1-, 10-, and 50-item bursts without a Provider.
6. Verify 50 durable items, bounded queue release, duplicate idempotency, cancellation, and exact cleanup.
7. Record sanitized aggregate evidence only.

## Rollout

1. Deploy schema with the feature UI disabled.
2. Run schema/security smoke in the target non-production environment.
3. Enable for one internal teacher Bank.
4. Validate one PDF, then 10, then 50 synthetic PDFs.
5. Confirm upload concurrency is four while PDF execution remains one globally.
6. Confirm Review Drafts remain private and Bank-scoped.
7. Expand by organization only after queue age and failure alerts remain healthy.

## Operational checks

Monitor burst counts, admission-ready age, queue depth, oldest job, failed items, duplicate prevention, Storage validation failures, lease recovery, and zero-draft imports. A burst can be partially successful; inspect failed items without restarting completed ones.

## Pause and rollback

1. Disable the burst UI or reservation RPC grant.
2. Pause new AI enqueues if queue health requires it.
3. Leave reserved sources and admission-ready items durable.
4. Continue or pause the existing worker independently.
5. Do not delete sources, jobs, or Review Drafts.
6. Do not roll back the migration. Correct schema defects with a new forward migration.

## Remaining work

Vertex dual-project routing, per-project capacity, Vercel async transport, OIDC, OCR, embeddings, and higher execution concurrency are not part of PDF50-1. They require separate implementation and load-test gates.
