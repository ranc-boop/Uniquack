# Question-Assets Clean Database Rehearsal

## Preconditions

This runbook is for the approved clean disposable Supabase project only. Do not run it against production, the old Supabase project, or a database with unknown cutover state.

Use process-only values. Do not put credentials, URLs, project identities, or fixture identities in a file, command history, report, or commit. The pre-cutover matrix rejects `NODE_ENV=production`, requires an explicit disposable-environment acknowledgement plus exact-fixture creation and cleanup acknowledgements, and verifies a bare expected project reference derived from the configured Supabase URL. Its service-role client is limited to exact-ID fixture setup and cleanup; requester sessions exercise authorization through the public wrapper and actual route.

`0043` remains `PARTIALLY_APPLIED_FAILED`; `0044` remains `APPLIED_MANUALLY_NOT_LEDGERED`; neither is rerun. `0045` is `APPLIED_MANUALLY_NOT_LEDGERED / EXACTLY ONCE / LIVE CATALOG VALIDATED`: do not rerun or modify it. Its private helper intentionally has no browser or service-role execute grant; the postgres-owned public asset wrapper is the only callable authorization surface.

## Controlled pre-cutover result

The approved 0045-only exact-ID authorization matrix passed. It confirmed the asset route and public wrapper permit only public, assignment-selected, and Bank-manager readers, while anonymous private-draft, classroom-only Student, unrelated-Teacher, unselected-Bank, and unknown-asset requests receive generic denials. Anonymous and authenticated browser roles could not directly execute the private helper. Exact-ID fixture cleanup completed.

Both backfill tools then ran in default dry-run mode. HTML and JSONB scopes each reported `0` scanned, `0` mapped/replaced, `0` unmapped, and `0` malformed occurrences. No `--apply` was used because no legacy occurrence existed.

## Completed clean-database cutover

After the zero-residual gate, the operator applied final reviewed `0046_question_assets_bucket_private.sql` exactly once through SQL Editor. The migration was not rerun or represented as a Supabase migration-ledger entry.

The post-cutover read-only aggregate check confirmed exactly one `question-assets` bucket and `public = false`. All five HTML fields and all four JSONB fields remained at zero legacy public URL residuals. The complete requester-first matrix then passed for anonymous public access, private-draft denial, assignment-selected Student access, unselected Bank denial, Classroom-only Student denial, Bank-manager access, unrelated-Teacher denial, and unknown-asset denial. Browser roles still could not directly execute the private helper, while the authorized route continued to return a no-store signed redirect.

The live private-bucket check confirmed that a legacy direct public Storage URL is rejected after cutover. Authorized staff upload and delete behavior remained functional. Replacement remains unsupported by the reviewed no-UPDATE-policy design; no replacement mutation was introduced or exercised. Every harness-owned row and object was cleaned by exact identifier. The migration and harnesses touched no unrelated bucket or object.

No production historical data migration is claimed: the backfill apply was a no-op because the verified clean database contained no legacy occurrence.

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

1. Record a clean-database backup/reset point before any future mutation.
2. Keep the already-applied 0045 contract unchanged.
3. Preserve the recorded matrix and dry-run evidence; no fixture or credential is retained.
4. Do not use `--apply` until every future occurrence remains mapped and non-malformed under a new approved operator run.
5. Obtain explicit operator approval before applying either backfill.
6. Apply final reviewed `0046_question_assets_bucket_private.sql` exactly once only after the approved backfill and backup gates are complete.
7. Run the post-cutover private-bucket checks only after 0046 is explicitly approved and applied.

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

For the approved 0045-only pre-cutover matrix, inject only process values, start the local route server from that same process environment, then invoke `node scripts/question-assets-precutover-authorization-matrix.mjs --live`. The harness requires an explicit disposable-environment acknowledgement, a bare expected project reference, and separate exact-fixture creation and cleanup acknowledgements. It creates only disposable exact-ID roles, content, asset objects, and assignments; it verifies browser-style route access and removes them in `finally`.

Run the HTML and JSONB backfills separately in their default dry-run mode. Record only their aggregate scanned, mapped/replaced, unmapped, and malformed counts. Stop before any `--apply` if unmapped or malformed occurrences are nonzero. Do not pass the bucket-mutation flag to the older cutover smoke, and do not apply `0046` without a separate explicit approval.

## Decision

`0045` is `APPLIED_MANUALLY_NOT_LEDGERED / EXACTLY ONCE / LIVE CATALOG VALIDATED`. `0046` is `APPLIED_MANUALLY_NOT_LEDGERED / EXACTLY ONCE / CLEAN-DB LIVE VALIDATED`.

**P0-STORAGE-01: COMPLETED / CLEAN-DB LIVE VALIDATED.** This closes the private question-assets clean-database gate only. It does not claim that production historical data was migrated and does not declare the overall website deployment-ready.
