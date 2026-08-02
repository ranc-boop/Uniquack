# Official Public Library 0076 Hosted Apply Evidence

Status: **APPLIED AND VALIDATED on the configured disposable project**

Applied at: `2026-08-02T22:04:31+08:00`

Migration SHA-256: `4329193168f9f01974a5bf87a65c2949b9e81d16fbca49a24826f38d34d1411e`

## Scope

- Canonical migration: `supabase/clean-migrations/0076_official_public_library_two_state_approval.sql`
- Target class: configured disposable Supabase project only
- Apply mechanism: `scripts/official-public-library-0076-hosted-apply.mjs`
- Legacy `supabase/migrations` chain: not consumed

## Required gates

- API URL hostname matches `DISPOSABLE_SUPABASE_PROJECT_REF`.
- Database password and server-only API key are present without being logged.
- 0075 baseline is complete.
- 0076 state is wholly unapplied or wholly applied; partial state stops closed.
- The historical 0043/0044 drift has an explicit owner decision; the separate provider-gateway metadata capture remains honestly marked partial and was not represented as complete.
- Formal commit requires `OFFICIAL_PUBLIC_LIBRARY_HOSTED_APPLY_GATE=AUTHORIZED_EXACTLY_ONCE`.

Run the rollback-only rehearsal first:

```powershell
node scripts/official-public-library-0076-hosted-apply.mjs --preflight
```

Only after reviewing that result, authorize the exact commit in the current process:

```powershell
$env:OFFICIAL_PUBLIC_LIBRARY_HOSTED_APPLY_GATE="AUTHORIZED_EXACTLY_ONCE"
node scripts/official-public-library-0076-hosted-apply.mjs
Remove-Item Env:OFFICIAL_PUBLIC_LIBRARY_HOSTED_APPLY_GATE
```

## Evidence to record after execution

| Gate | Result | Evidence summary |
| --- | --- | --- |
| Exact target identity | PASS | API hostname and configured disposable project ref matched; no project ref or credential value was logged. |
| 0076 rollback preflight | PASS | Full migration, catalog validation, preservation checks, and role matrix ran inside a transaction and rolled back before commit. |
| Catalog, constraints, indexes | PASS | Four constraints, four indexes, official-read policies, the immutability trigger, v2 workbench/public RPCs, revision asset RPC, and compatibility wrappers were present. |
| RLS and function grants | PASS | Student, Teacher, Admin, and Super Admin returned the same four official question IDs; anonymous RPC execution was denied; server-only pull and revision-asset RPCs remained service-role only. |
| Data preservation | PASS | Official approved/pending counts were `4 / 51`; broken Assignment question references were `0`; migration assertions confirmed question and Assignment identity/count preservation. |
| Hosted commit | PASS | One exact transaction committed after the explicit `AUTHORIZED_EXACTLY_ONCE` gate; a second read-only applied-state verification passed. |
| Data API schema cache | PASS | The v2 official search RPC resolved without a missing-function/schema-cache error. |
| Security/performance advisors | NOT RUN | The available API secret is a Data API credential, not a management API token; static security, hosted catalog/RLS checks, and runtime role checks passed. Advisor review remains a separate operational follow-up. |

## Failure handling

- Preflight or apply failure before commit: transaction must roll back.
- Partial baseline: stop and reconcile; never replay blindly.
- Validation failure after commit: keep application code undeployed and add a forward-only 0077 correction.
- Never edit or delete an applied clean migration and never claim migration-ledger history for a direct transaction.
