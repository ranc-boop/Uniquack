# PDF50-1 Burst Admission Implementation

Status: implementation contract for PDF50-1

## Decision

Use a narrow PDF upload burst parent/item model linked to the existing import and queue records. Do not repurpose `import_batch_items`.

The existing contracts have distinct meanings:

- one `import_batches` row is one AI PDF extraction resource;
- one `import_batch_assets` `source_pdf` row is that resource's private PDF;
- `import_batch_items` contains extracted question candidates, not uploaded files;
- one `ai_provider_jobs` row executes one `import_batch`.

Therefore each burst item owns one existing import batch and source asset, then receives at most one AI provider job. The burst layer adds reservation, upload, admission, cancellation, and aggregate progress only. It does not create a parallel parser or Review Draft system.

## Lifecycle

Burst:

```text
reserved -> uploading -> admission_wait -> queued -> processing
-> completed | partial | failed | cancelled
```

Item:

```text
reserved -> finalizing -> admission_ready -> queued -> processing
-> completed | failed | cancelled
```

An invalid or missing upload fails only its item. Cancelling a burst marks only unstarted `reserved` or `admission_ready` items cancelled. It never deletes a private source, an existing job, or a Review Draft.

## Reservation and direct upload

1. A teacher/admin with owner or editor capability selects an active Bank.
2. The browser submits metadata for 1-50 PDFs and a client request key. No PDF bytes enter the Server Action.
3. A service-role-only reservation RPC rechecks active profile role, Bank membership, organization, count, filenames, MIME, size, and duplicate request key.
4. In one transaction it creates the burst, one existing `import_batch`, one `source_pdf` asset, and one immutable burst item for each PDF.
5. Object paths use server-generated IDs only: `ai-pdf-bursts/<burst>/<item>.pdf`.
6. The server creates one signed private upload grant for each exact reserved path.
7. The browser uploads with a four-worker pool.
8. Finalization accepts IDs only, downloads one exact object, verifies bytes, PDF MIME/signature, page count, ownership, and current Bank capability, then marks the item `admission_ready`.

The bucket remains private. Neither database rows nor UI store or display signed URLs.

## Idempotency

- reservation: unique `(created_by, client_request_key)`;
- item identity: unique `(burst_id, client_item_key)` and `(burst_id, item_index)`;
- object identity: unique immutable `object_path`;
- import linkage: unique `import_batch_id` and `source_asset_id` per item;
- job linkage: unique nullable `ai_provider_job_id`;
- queue identity: existing `ai_pdf_extract:<batch>:<asset>:v1:retry:0` key and queue uniqueness.

A duplicate reservation returns the original logical burst only when the Bank and item manifest match. A duplicate finalization returns the current safe state and may retry admission; it cannot create a second job.

## Admission window

The existing user limit of 5 and organization limit of 12 are fairness and budget controls. Raising the organization limit to 50 would let one burst occupy the entire ready queue and would bypass current admission intent.

Instead, all 50 items remain durable in `ai_pdf_upload_burst_items`. Valid items wait in `admission_ready`. A service-role-only release RPC promotes only items that fit the existing user and organization outstanding limits into `ai_provider_jobs`. The worker invokes this pump before and after its normal claim cycle. Existing active limits remain unchanged:

Each pump handles one burst and acquires the same user-then-organization advisory locks as the existing enqueue RPC. Concurrent finalization and worker calls therefore cannot race past the 5/12 outstanding windows.

- global active: 3;
- organization active: 1;
- PDF active: 1;
- worker invocation: at most 2 jobs.

The queue still uses its original lease, heartbeat, retry, fairness, and idempotency behavior.

## Aggregate state

Database triggers synchronize an item's safe state from its linked job and derive burst counters. User-facing reads expose filenames, counts, page totals, timestamps, safe error categories, and Review Draft link only. They omit object paths, grants, provider/profile data, job IDs, and raw errors.

## Compatibility

Admin single-file direct upload remains valid. Teacher Bank upload moves from raw `File.arrayBuffer()` Server Action handling to the shared signed-upload contract. Every AI output remains a Bank-scoped Review Draft; no Assignment or publication action is introduced.

## Migration classification

Migration `0050` is a forward-only canonical clean migration following main's
Practice routing `0049`. It adds the narrow burst tables, RPCs, triggers, RLS,
and canonical private `ai-import-sources` bucket/policies. It does not alter
historical rows, execution concurrency, model routing, or provider
configuration.

The migration must be rehearsed against a fresh clean database and an upgraded disposable clean database before any live apply. Applied migrations are corrected forward only.

## Remaining phases

PDF50-1 does not add Vertex adapters, project-aware capacity, Vercel Queues/Workflow, OIDC, model escalation, OCR, embeddings, or increased execution concurrency. Those remain separate gated phases described in `dual-vertex-50-pdf-plan.md`.
