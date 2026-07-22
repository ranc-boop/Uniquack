# PDF50-2 Worker Fencing Security

## Boundary

`0051_pdf50_worker_checkpoint_fencing.sql` replaces the runtime worker's
unfenced heartbeat and finish entrypoints with fenced service-role-only RPCs.
The older RPC definitions remain historical migration artifacts but have their
service-role execute grants revoked by the forward migration.

## Authorization rules

- Claims remain service-role-only and issue a new immutable token per lease.
- `heartbeat_ai_provider_job_fenced`, stage checkpoints, protected provider
  result read/write, fenced batch-processing start, fenced import-item
  persistence, fenced batch finalization, and fenced finish are service-role-only.
- Browser roles cannot execute those RPCs.
- The protected checkpoint table is in `private`, has RLS enabled, has no
  browser grants or policies, and is accessed by a service-role security
  definer RPC only.
- The Teacher-facing queue status continues to expose only safe aggregate job
  fields. It cannot return a fence token or provider checkpoint payload.

## Stale worker handling

Every worker-owned terminal, checkpoint, and Review Draft persistence mutation
verifies the current owner, immutable token, active status, and unexpired lease
while holding the target job row. A stale worker gets `STALE_FENCE_REJECTED`;
it cannot checkpoint output, persist an import item, finalize the batch,
schedule a retry, release a newer lease, or complete the job.

## Data handling

The recovery envelope contains normalized extraction data needed only to resume
private Review Draft persistence. It is versioned, size-bounded, and never used
as public content. Safe queue metadata contains only stage, counts, recovery
classification, hashes, and deterministic lineage references. It excludes PDF
contents, prompts, credentials, signed URLs, cookie/session material, answers
in logs, raw Provider payloads, and raw database errors.

No AI output is published, assigned, or exposed to non-members by this change.
