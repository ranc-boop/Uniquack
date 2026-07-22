# PDF50 Worker Recovery Runbook

## Purpose

Use this runbook after a worker interruption, lease expiry, or stale-fence
telemetry event. It is for trusted operations staff; Teachers do not manage
leases, provider profiles, or checkpoints.

## Safe recovery behavior

1. A trusted internal worker claims only an eligible job and receives a new
   lease generation/fence token.
2. It performs source validation and reads the protected checkpoint with its
   current fence.
3. If the checkpoint contract is compatible, it resumes normalization and
   private Review Draft persistence without another Provider call.
4. If no checkpoint exists, it can make the normal bounded Provider attempt.
5. If the checkpoint is corrupt, incomplete, expired, or incompatible, it must
   enter a bounded retry/failure classification. Do not manually copy its
   payload, modify it, or treat it as trusted draft content.
6. The job is completed only after the `drafts_persisted` checkpoint succeeds.

## Operator checks

- Confirm the worker is using the fenced RPCs and retains the current limit of
  two jobs per invocation.
- Inspect only safe job status/telemetry fields: stage, retryability, recovery
  classification, and bounded counts.
- Do not inspect provider result payloads, credentials, source PDF content, or
  signed URLs as part of routine recovery.
- A stale-fence result is expected during lease takeover. Do not retry that old
  execution; the current fence holder owns recovery.

## Escalation criteria

Escalate rather than manually repairing data when a checkpoint is incompatible,
a job exhausts retries, the same logical persistence lineage produces a conflict,
or a fenced RPC denies the currently expected service-role worker. Preserve the
Review Draft gate: no manual publication or assignment is a recovery action.

## Scope note

This source foundation has not applied migration `0051` to a hosted database.
Run disposable catalog and role validation only after an approved manual apply.
