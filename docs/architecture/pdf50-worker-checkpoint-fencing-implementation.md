# PDF50-2 Checkpointed Worker and Fencing Foundation

## Classification

`PDF50_2_CHECKPOINT_FENCING_SOURCE_COMPLETE`

This is a source-only foundation. Migration `0051_pdf50_worker_checkpoint_fencing.sql`
is canonical but **not applied** by this change.

## Implemented contract

The durable AI worker now uses one fencing contract after claim:

1. Existing atomic claim assigns a new immutable `execution_fence_token` and
   increments `lease_generation` through a claim trigger.
2. Every heartbeat, source-processing start, stage checkpoint, provider-result
   checkpoint, fenced import-item persistence, fenced batch finalization, and
   terminal finish compares job ID, lease owner, token, active status, and
   lease expiration in one database operation.
3. A mismatch returns `STALE_FENCE_REJECTED`; the worker stops rather than
   writing a newer batch state, Review Draft, retry, or completion result.
4. Normalized provider extraction data is stored only in
   `private.ai_provider_job_provider_result_checkpoints`.
5. A recovery lease reads a compatible checkpoint and supplies it to the PDF
   import service. A valid checkpoint bypasses the Provider call.
6. The import service checkpoints `normalized` before draft persistence and
   `drafts_persisted` after it. Each logical item and final import-batch
   status write go through service-role-only fenced RPCs, and terminal
   completion is rejected until the persistence stage exists.

The current queue controls are unchanged: global active `3`, organization
active `1`, PDF active `1`, user outstanding `5`, organization outstanding
`12`, and internal invocation maximum `2`.

## Stage and recovery model

| Stage | Durable record | Replay behavior |
| --- | --- | --- |
| `claimed` | lease generation/token | duplicate wake-up does not claim a live lease |
| `source_validated` | bounded source-ready metadata | revalidates safely after lease loss |
| `provider_request_started` | bounded recovery classification | retry is allowed only when no usable result exists |
| `provider_result_checkpointed` | private normalized extraction envelope + SHA-256 | recovery reuses it and avoids a Provider call |
| `normalized` | bounded item count/reuse signal | repeat is a no-op stage transition |
| `drafts_persisted` | stable persistence lineage and draft count | logical source/item keys prevent duplicate imports |
| `completed` | safe aggregate job result | only allowed after draft persistence |

Checkpoint payloads are bounded to 4 MiB, versioned, private, RLS-enabled,
and accessible only through a service-role RPC. They must not contain source
URLs, credentials, cookies, signed URLs, raw logs, or telemetry payloads.

## Deterministic persistence identity

For checkpointed AI PDF work, the worker derives a hash-backed persistence
lineage key from the source asset, durable job identity, and the versioned
provider-result checkpoint contract. Each logical item receives an item suffix.
The service-role fenced persistence RPC uses the key to join/replay the same
import-batch item, reuse an existing stable question code where present, and
avoid appending another logical Draft. Visible question numbers are not used as
identity.

## Scope limits

- Existing Teacher/Bank target authorization and private Review Draft flow are
  unchanged.
- No output auto-publishes, creates an Assignment, or alters an approved item.
- The internal worker route remains token-protected and accepts no client job
  payload.
- Blueprint and coverage-recovery jobs receive fenced lifecycle stages, but
  PDF extraction alone receives provider-result replay in this foundation.
- No Provider, Vertex, Vercel, hosted Supabase, Storage, or migration apply was
  invoked.

## Local failure matrix

The local fake-provider crash/recovery smoke covers all twenty agreed windows:
claim/source/provider interruption, provider timeout, pre-checkpoint and
post-checkpoint loss, normalization loss, post-persistence/pre-finish loss,
lease takeover, stale checkpoint/persistence/completion rejection, duplicate
wake-ups, valid/corrupt checkpoint replay, recovery races, persistence replay,
and retry exhaustion. It asserts one final outcome, no repeated Provider call
after a valid checkpoint, no duplicate logical drafts, no stuck lease, no
publication, and exact local cleanup.

The deterministic scheduler simulation runs five seeds of fifty PDF jobs with
duplicate wake-ups, worker loss, lease expiry, stale commits, checkpoint
recovery, and organization fairness while preserving the established limits.

## Safe telemetry

Safe operational state records only stage, checkpoint version/time, lease
generation, bounded counts, recovery classification, payload hash, and stable
lineage references. The worker continues to emit aggregate provider routing
telemetry. It does not log PDF bytes, prompts, response bodies, answers,
credentials, signed URLs, identities, or raw database errors.

## Manual apply and rollback

`0051_pdf50_worker_checkpoint_fencing.sql` requires a reviewed manual,
forward-only apply followed by disposable catalog, grant, stale-fence, and
recovery-role validation. It is not safe to apply by replaying historical
migrations. Rollback is a later forward migration that preserves existing
checkpoint rows and safely changes only the verified contract; do not drop
fencing or provider-checkpoint data manually.

## PDF50-3 boundary

PDF50-3 should qualify the applied migration with disposable worker and
Storage-backed crop/asset recovery, hosted worker dispatch behavior, checkpoint
retention/cleanup, and real capacity measurement. This task deliberately does
not validate hosted execution, Provider throughput, Vertex, Vercel, or a
concurrency increase.

## Required next validation

Before a manual `0051` apply, review the SQL as a forward-only migration and
run the local source and fake-provider smokes. After an approved manual apply,
perform a disposable service-role catalog/RPC matrix to verify grants, stale
fence rejection, one recovery replay, and private checkpoint non-readability.
That live validation is deliberately outside this source-only task.
