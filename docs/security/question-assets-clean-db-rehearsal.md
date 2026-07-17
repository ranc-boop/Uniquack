# Question-Assets Clean Database Rehearsal

## Preconditions

This runbook is for the approved clean disposable Supabase project only. Do not run it against production, the old Supabase project, or a database with unknown cutover state.

Use process-only values. Do not put credentials, URLs, project identities, or fixture identities in a file, command history, report, or commit. The live harness rejects `NODE_ENV=production`, requires `QUESTION_ASSETS_REHEARSAL_ENVIRONMENT=disposable`, requires explicit create-fixture and cleanup acknowledgements, and verifies an expected project-reference value derived from the configured Supabase URL. Its service-role client is limited to exact-ID fixture setup, cleanup, and deployment-wide verification; requester sessions only exercise authorization.

No migration is applied by this audit. `0043` remains `PARTIALLY_APPLIED_FAILED`; `0044` remains `APPLIED_MANUALLY_NOT_LEDGERED`; neither is rerun.

## Local rehearsal completed

The embedded PostgreSQL rehearsal applies the canonical question-assets policy dependency model, then applies 0045 and 0046. It verifies:

- 0045 creates the private question helper and public asset-only wrapper with fixed search paths and reviewed grants;
- 0045 can be applied twice safely;
- anonymous access is limited to a public published asset;
- a selected Assignment reader can read only the selected private asset;
- a Bank manager can read a private Bank asset; unrelated users are denied;
- the private helper is not directly executable by anonymous users;
- staff upload/delete policy works; no replace policy exists;
- 0046 makes the expected bucket private, can be applied twice, and fails if the bucket is absent.

The embedded environment cannot prove Supabase Storage HTTP behavior or browser session cookies. Those remain live gates below.

## Clean-database order

1. Record a clean-database backup/reset point.
2. Apply final reviewed `0045_question_read_authorization_helper.sql` exactly once. Do not apply 0046 yet.
3. Deploy the route build that calls `public.can_read_question_asset(asset_id)` before its service-role metadata lookup.
4. Create exact-ID disposable fixtures only. Required categories: anonymous requester, authorized Assignment Student, unrelated Student, authorized Teacher/Bank manager, unrelated Teacher, public published question, private draft question, selected private question, unselected private Bank question, and minimal asset objects.
5. Run both backfills in dry-run mode. Review the sanitized count reports and operator-only verification query results.
6. Stop if any unmapped or malformed legacy URL exists. Do not use `--apply` until every occurrence is resolved; accepted orphan exceptions require a separately documented product/security decision.
7. Apply both backfills with `--apply`. Preserve the backup until the verification queries report zero residual legacy public URLs in all nine fields.
8. Apply final reviewed `0046_question_assets_bucket_private.sql` exactly once.
9. Run the live rehearsal and browser checks. Confirm direct legacy public URLs are non-200 and authorized route access continues to render.
10. Remove only the exact-ID fixtures in `finally` cleanup. Verify no fixture, test asset, credential, or report with private content remains.

## Live authorization matrix

| Requester or operation | Expected result |
|---|---|
| Anonymous + public published asset | Authorized route redirects to a short-lived signed URL. |
| Anonymous + private draft asset | Generic no-store denial with no signed redirect. |
| Assignment-selected Student + selected private asset | Authorized route redirects. |
| Same Student + unselected Bank asset | Generic denial; no source Bank enumeration. |
| Bank manager + private Bank asset | Authorized route redirects. |
| Unrelated Teacher | Generic denial for private Bank and draft assets. |
| Classroom-only Student | No source-Bank access merely from Classroom membership. |
| Unknown or malformed asset ID | Generic no-store 404. |
| Authorized staff upload/delete | Existing reservation-based upload and delete behavior remains available. |
| Replacement upload | Denied by design until a separately reviewed UPDATE policy and caller exist. |

## Required commands

Run source/local checks before live work:

```powershell
npm.cmd run lint
npm.cmd run build
node scripts/question-assets-merged-code-audit-smoke.mjs
node scripts/question-asset-url-backfill-test.mjs
node scripts/question-asset-url-backfill-jsonb-test.mjs
node scripts/question-assets-backfill-plan-test.mjs
node scripts/question-assets-private-cutover-smoke.mjs
node scripts/question-assets-embedded-rehearsal.mjs
```

For later approved live rehearsal, inject only the required process values, including `QUESTION_ASSETS_REHEARSAL_CONFIRM_FIXTURES=CREATE_QUESTION_ASSETS_FIXTURES` and `QUESTION_ASSETS_REHEARSAL_CONFIRM_CLEANUP=CLEANUP_QUESTION_ASSETS_FIXTURES`, start a local server, then invoke `node scripts/question-assets-private-cutover-smoke.mjs --live`. Do not pass the bucket-mutation flag unless the operator explicitly authorizes a disposable bucket-state test.

## Decision

The code is ready for this controlled rehearsal. It is **not** authorized for clean-database application until an operator explicitly approves this runbook and confirms the backup, exact fixture cleanup, and zero-residual backfill gate.
