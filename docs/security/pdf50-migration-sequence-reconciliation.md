# PDF50 Migration Sequence Reconciliation

Status: `PDF50_SEQUENCE_RECONCILED_LOCAL_REVALIDATION_REQUIRED`

## Decision

Latest main validly reserved canonical `0049` for
`0049_practice_agent_provider_routing.sql`. The PDF50 branch independently
used `0049_pdf50_burst_upload_admission.sql`, which would create two active
migrations with the same prefix after merge. Duplicate active prefixes are not
permitted by the manifest-driven canonical apply plan.

`0050` was checked across the canonical main inventory and every available
local and remote branch reference. It was unused. PDF50 therefore moves
forward to `0050_pdf50_burst_upload_admission.sql` while main's Practice
routing migration remains canonical `0049`.

Canonical tail:

```text
0048_practice_course_framework_evidence_isolation.sql
0049_practice_agent_provider_routing.sql
0050_pdf50_burst_upload_admission.sql
```

The executable migration count becomes 50 and the canonical head becomes
`0050_pdf50_burst_upload_admission.sql`.

## SQL Comparison

The PDF50 SQL was moved with a Git rename. The only content changes are two
non-executable comments that now identify the migration as `0050`; no table,
function, trigger, RLS, Storage, bucket-adoption, idempotency, queue,
admission, Review Draft, publication, or Assignment behavior changed.

## Evidence Status

The retained PDF50 local fresh-chain, upgrade, clone-history, and RLS/Storage
evidence is explicitly marked **PRE-SEQUENCE-RECONCILIATION EVIDENCE**. It
proves the earlier candidate behavior only. It does not validate the new
canonical ordering and must not be used as a current runtime-readiness claim.

Hosted databases remain untouched. No database, Storage, Provider, or
environment access occurred during this source-only reconciliation.

## Required Local Reruns

Before any forward apply or readiness claim, run all three localhost-only,
disposable paths:

1. Empty local database: apply canonical `0001` through `0050`.
2. Canonical `0048` baseline: apply Practice `0049`, then PDF50 `0050`.
3. Canonical Practice-`0049` baseline with a compatible private
   `ai-import-sources` bucket: apply PDF50 `0050`.

Each path must preserve the private PDF-only bucket contract, Bank owner/editor
authorization, viewer/Student/unrelated/anonymous denial, 50-item admission
limit, four-way browser upload pool, existing worker execution limits, Review
Draft gating, no auto-publish, and no automatic Assignment creation.
