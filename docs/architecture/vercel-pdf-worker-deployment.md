# Vercel PDF Worker Deployment Plan

Status: future deployment design; nothing is deployed by this document

Audit date: 2026-07-19

## 1. Current deployment gap

The repository has no `vercel.json`. The current trusted worker endpoint is `POST /api/internal/ai-jobs/run`, uses Node runtime, sets `maxDuration = 240`, accepts an internal token, and runs at most two claimed jobs. A PDF job downloads the full private object and completes provider execution and persistence in the same invocation.

This is acceptable for controlled beta traffic but is not the target architecture for a 50-PDF burst. Vercel now documents longer function durations, but actual plan/runtime limits must be verified at implementation time. Long duration alone does not provide durable progress or idempotency.

Official references:

- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel Functions up to 30 minutes announcement](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes)
- [Vercel Queues concepts](https://vercel.com/docs/queues/concepts)
- [Vercel OIDC](https://vercel.com/docs/oidc)
- [Vercel OIDC with Google Cloud](https://vercel.com/docs/oidc/gcp)

## 2. Deployment topology

```text
Vercel Next.js web deployment
  - authenticated product routes
  - burst reservation/finalization APIs
  - direct-to-private-Storage signed upload grants
  - status/read-only dashboard

Asynchronous execution
  - WorkSignalTransport: DB wake-up initially or Vercel Queue later
  - authoritative DurableJobStore: existing Supabase job lifecycle
  - worker/step: claim exact job, execute one bounded stage, checkpoint
  - Vertex OIDC adapter: project A or B
```

The browser never receives Google credentials, a service-role key, provider profile details, or a Vertex project identifier.

## 3. Direct-to-storage upload

The production upload path must use the existing admin pattern:

1. Server authorizes the Bank and reserves an immutable object path.
2. Browser uploads the PDF directly to private `ai-import-sources` using a short-lived signed grant.
3. Server finalizes only the reserved object and validates size, MIME, page count, owner, and source metadata.
4. Finalization creates or releases the durable job idempotently.

The Teacher Bank path must stop accepting the whole PDF through a Server Action. Upload grants must be scoped to one object, short-lived, private, and unusable for arbitrary paths. Source PDFs never enter `public/` and are never exposed as permanent public URLs.

## 4. Queue versus Workflow

Vercel Queues documents at-least-once delivery, visibility leases, retries, idempotency keys, and push concurrency. It is currently beta. Messages have finite retention and no built-in dead-letter queue. Therefore:

- database job state remains authoritative;
- a message carries only `{version, jobId, wakeReason}`;
- the consumer atomically claims that exact job with a fencing token;
- duplicate messages become no-ops;
- final failed jobs are retained in the database even after queue retention expires;
- poisoned messages are acknowledged only after the database records a final bounded failure.

Use Vercel Workflow instead only if the implementation spike proves that durable step checkpoints, sleep, and retry visibility are more reliable than the existing database checkpoints. Never operate both as independent state machines.

Recommended abstraction:

```ts
interface WorkSignalTransport {
  publish(input: { jobId: string; notBefore?: string; key: string }): Promise<void>;
}

interface DurableJobStore {
  claimById(input: { jobId: string; worker: string }): Promise<Claim | null>;
  heartbeat(claim: Claim): Promise<boolean>;
  checkpoint(claim: Claim, stage: string, safeResult: object): Promise<boolean>;
  finish(claim: Claim, outcome: SafeOutcome): Promise<boolean>;
}
```

## 5. Function boundaries and duration

Suggested durable stages:

1. `validate_source`
2. `acquire_execution_target`
3. `extract`
4. `normalize_validate`
5. `persist_review_drafts`
6. `enqueue_embedding`
7. `finalize`

Each stage has a timeout below the verified Vercel limit and a lease longer than its own timeout plus persistence margin. A provider call may not be resumable internally, but retrying the stage is safe because target acquisition and output persistence are fenced and idempotent.

Do not configure duration from the current marketing maximum. Record the verified runtime/plan maximum in deployment config and use at most 80% for a stage timeout. If measured p95 extraction cannot fit, move the worker to a longer-lived runtime while keeping the same `DurableJobStore` and `WorkSignalTransport` contracts.

## 6. OIDC credential plan

Vercel OIDC provides short-lived identity tokens, and Google documents using them with Workload Identity Federation. The target design uses no service-account JSON and no Vertex API key.

For each Google execution project:

1. Create a Workload Identity Pool and Vercel OIDC provider.
2. Restrict subject/audience claims to the exact Vercel team, project, and environment.
3. Map to a dedicated service account with only the required Vertex invocation permissions.
4. Allow project A identity to call only project A resources; repeat independently for B.
5. Exchange the request-scoped Vercel OIDC token for short-lived Google credentials in the server worker.
6. Never persist or log either token.

Google identifiers needed for configuration, such as project number, pool/provider name, and service-account email, are non-secret but still belong in server environment configuration and redacted operational views. Secrets already required by the app, such as Supabase server credentials, remain server-only and are outside the Vertex OIDC trust path.

### Least privilege

Prefer a custom role limited to the exact prediction APIs and model resources. If implementation begins with a standard Vertex role, review and narrow it before production. Separate deploy administration from runtime inference; the Vercel runtime must not create models, change IAM, or manage billing.

## 7. Preview and production separation

Preferred topology:

```text
preview: Vertex preview-A + preview-B, preview Supabase/Storage, preview queue
production: Vertex prod-A + prod-B, production Supabase/Storage, production queue
```

If four Google projects are not available, use distinct environment-bound OIDC providers and service accounts inside A/B, separate quotas where possible, and deny preview access to production data. This is a weaker isolation option and requires explicit security approval.

Requirements:

- Vercel preview subjects cannot impersonate production service accounts.
- Preview and production use different queue topics/consumer groups and database projects.
- Preview source PDFs cannot be read by production workers, or vice versa.
- Model enablement, concurrency, budgets, and rollout flags are environment-specific.
- Pull-request previews default to fake/no-provider execution unless explicitly authorized.

## 8. Worker security

- Queue push consumers should use Vercel's internal trigger rather than a public URL when that feature is selected.
- If the existing internal route remains, rotate and scope its token, accept no client-selected job/provider payload, and return aggregates only.
- Claim and finish RPCs remain service-role-only.
- Revalidate Bank ownership and job creator at execution time.
- Download only the job's private source object.
- Apply egress allowlists where supported: Google identity/token and approved Vertex/model endpoints only.
- Redact prompts, PDF bytes, model outputs, signed URLs, cookies, headers, cloud IDs, and credentials from logs.
- No AI result can publish, assign, or alter a source question.

## 9. Configuration plan

Future non-secret configuration:

- execution target aliases `vertex-a` and `vertex-b`;
- Google location per target;
- model-role allowlist and lifecycle version;
- capacity limits and cooldown bounds;
- queue topic/consumer version;
- stage timeout/lease/heartbeat values;
- canary organization/percentage;
- budget and alert thresholds.

Future identity bindings are managed in Vercel/GCP control planes, not committed files. Do not store project credentials in provider profile ciphertext intended for API keys.

## 10. Deployment sequence

1. Add deployment configuration and fake consumer in preview only.
2. Prove duplicate delivery, timeout, lease expiry, and deployment-rollover behavior without cloud models.
3. Configure environment-bound OIDC after separate approval.
4. Run an identity-only Vertex permission check without PDF content after separate approval.
5. Enable one preview target at concurrency one and pass a tiny approved synthetic request.
6. Enable both preview targets and pass the 10/25/50 test gates.
7. Deploy disabled production identities/configuration.
8. Canary one internal organization, then increase by measured gates.

## 11. Rollback

Rollback controls, in order:

1. pause new PDF admission;
2. pause worker claims while preserving ready jobs;
3. disable quality/OCR/embedding stages independently;
4. set one target capacity to zero and route to the healthy peer;
5. restore the previous worker deployment/message contract;
6. drain or leave jobs queued for later retry.

Never delete private sources or Review Drafts as an operational rollback. Never roll back an applied clean migration; correct forward.

## 12. Deployment readiness checklist

- [ ] Actual Vercel plan/runtime duration, memory, concurrency, and region verified
- [ ] Queue/Workflow beta and pricing risk accepted
- [ ] Exact-message claim and fencing implemented
- [ ] Direct upload used by both admin and Teacher Bank paths
- [ ] Preview cannot access production identities or data
- [ ] OIDC/WIF works independently for both targets
- [ ] No service-account JSON or Vertex API key exists
- [ ] Target/model quotas and regions verified
- [ ] 10/25/50 gates pass
- [ ] Review Draft/no-auto-publish tests pass
- [ ] Alerts and pause/disable rollback controls rehearsed
