# AI Parsing Coverage Recovery Executor

## Goal

Turn the existing AI Parsing coverage-recovery plans into a bounded, durable,
teacher-review-only recovery workflow:

```text
completed or partial AI PDF import
-> coverage audit identifies concrete missing windows
-> server validates recovery eligibility
-> one durable recovery job per original batch + plan hash
-> worker rereads only the planned source pages
-> boundary and duplicate guard reconciles candidates
-> only new candidates enter private bank Review Drafts
```

## Product Workflow

This work extends the private-materials workflow without changing its safety
gates:

```text
Private PDF -> AI Parsing -> targeted recovery when coverage is uncertain
-> Review Drafts -> Question Bank -> Assignment -> Practice Evidence
```

The recovery worker does not approve, publish, assign, merge, replace, or
delete questions. It never writes official taxonomy assignments; the standard
batch-import handoff creates only pending-review taxonomy assignments for new
drafts.

## Implementation

- Added `coverage_recovery_executor_v1`, a deterministic eligibility plan.
  It requires a completed/partial original import, a concrete existing audit
  plan, ready source asset, active bank, owner/editor authority, exact bounded
  windows, and a recovery scope below 75% of source pages.
- Added the durable queue kind `ai_pdf_coverage_recovery`. Its payload contains
  only safe identifiers: original import batch, source asset, bank, plan hash,
  plan version, and bounded window IDs. The idempotency key is derived from the
  original batch, source asset, and plan hash.
- Added clean migration `0038_ai_pdf_coverage_recovery_jobs.sql`. It extends
  the current PR4-J queue forward-only, preserves service-role worker-only
  claim/finish operations, and permits one active recovery job at a time.
  It has not been applied by this PR.
- The worker materializes a temporary page-window PDF in memory and does not
  fall back to a whole-document reread. Provider output is normalized in
  memory, compared with original candidates, then discarded after the bounded
  import handoff.
- Reconciliation classifies candidates as `new_candidate`, `likely_duplicate`,
  `possible_fragment_completion`, `visible_number_conflict`,
  `answer_alignment_risk`, `visual_association_risk`, or
  `insufficient_evidence`. Only
  `new_candidate` enters a child, bank-scoped AI PDF import batch and thus
  private Review Drafts. Other outcomes stay as safe count/warning metadata.
- The original import summary receives only safe recovery status and count
  metadata. A refreshed coverage audit recognizes recovered source pages.
- Safe queue results retain planned/sent page counts, window count, candidate
  count, reconciliation counts, zero-new status, and new draft count. Existing
  PR4-L telemetry continues to record queue wait, execution latency, provider
  calls, usage, estimated cost, and safe error class without raw payloads.
- The teacher bank import history exposes product-safe recovery states and a
  `Recheck missing sections` action when the existing plan is eligible. It
  shows no provider name, model, prompt, source URL, job payload, or raw ID.

## Teacher States

- Issue found: `Some likely question pages were not represented in the first extraction.`
- Queued: `Targeted recovery is waiting for available AI capacity.`
- Processing: `The system is rechecking the missing sections.`
- Complete: `Additional Review Drafts were recovered for teacher review.`
- No new drafts: `The missing sections were rechecked, but no additional usable drafts were found.`

Transient provider failures keep the source and bank association and use the
existing bounded queue retry policy. Permanent authentication/authorization
errors fail safely without repeated retries or raw provider diagnostics.

## Role And Ownership Boundaries

- Teachers can request recovery only for an active bank where they are an
  owner or editor; the server derives the source, provider profile, plan, and
  page windows.
- Admin provider configuration remains admin-only. Teacher forms reject raw
  provider/model/key fields.
- Student visibility is unchanged: recovery output remains private draft
  content until normal teacher review and later assignment.
- No provider controls, credentials, source bytes, raw provider response,
  prompt, or signed source URL are stored in the recovery plan, queue payload,
  default teacher UI, or telemetry contract.

## Data And Rollback Risk

- The only schema change is forward migration `0038`; it does not edit clean
  migrations `0033` through `0037` and it does not touch the old migration
  chain.
- Applying `0038` enables the new queue kind. Before it is applied, queue
  enqueue correctly fails closed rather than attempting recovery.
- Recovery child batches preserve lineage to the original batch/job/plan and
  avoid mutating original drafts. The original import remains intact if a
  recovery produces no usable candidate or fails.
- Old demo overlap: not applicable. This reuses the production AI Parsing,
  durable queue, Review Draft, and bank-scoping contracts only.

## Validation

Passed:

- `npm.cmd install`
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/ai-parsing-coverage-recovery-executor-smoke.mjs`
- `node scripts/durable-ai-job-queue-smoke.mjs`
- `node scripts/ai-parsing-boundary-duplicate-guard-smoke.mjs`
- `node scripts/ai-parsing-selective-packet-execution-smoke.mjs`
- `node scripts/ai-operations-launch-readiness-smoke.mjs`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`
- `npm.cmd run perf:audit`
- `npm.cmd run analyze`

The first sandboxed attempts at the live RLS and bank checks were blocked by
network isolation (`fetch failed` / `EACCES`). Re-running those existing smoke
commands with the approved clean-Supabase network permission passed. No real
provider call was made for this PR.

## Remaining Work

1. Review and apply clean migration `0038_ai_pdf_coverage_recovery_jobs.sql`
   to the clean Supabase project using the established manual migration flow.
2. Rerun the live queue/RLS smokes with a reachable clean Supabase endpoint.
3. Run one explicitly authorized, tiny, bounded provider validation only after
   the queue migration and live endpoint are available. Verify the resulting
   Review Draft is private and bank-scoped before any manual approval.
