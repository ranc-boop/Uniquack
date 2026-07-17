# Merged Question-Assets Private Access Audit

Audit date: 2026-07-17

## Scope and conclusion

The initial code audit used the isolated `codex/validate-private-question-assets` worktree at main commit `a7cfb50561a83bf4c3a39ff25b28b3d8e68c0cb0`. The subsequent controlled pre-cutover rehearsal used process-only values only; it did not read an environment file, modify the original workspace's user-owned files or stashes, apply 0046, mutate the bucket, or run a backfill apply.

Final classification: **READY_FOR_CLEAN_DATABASE_REHEARSAL**. This authorizes only the next controlled rehearsal described in the companion runbook. It does not authorize applying 0045 or 0046 to the clean database.

## Historical provenance

Both historical branches are ancestors of current main, with no remaining file diff against main:

| Historical branch | Merged provenance now in main | Audit result |
|---|---|---|
| `feature/storage-read-helper_signed-url-access` | PR #201: question-read helper and centralized route-path access | Fully represented; no omitted branch-only file. |
| `sec/p0-storage-private-access` | PR #202: HTML/JSONB backfills, route hardening, private-bucket cutover, and source guardrails | Fully represented; no omitted branch-only file. |

Main subsequently renumbered the never-applied Storage migrations in `a7cfb50`; the historical `0043/0044` Storage names are now canonical `0045/0046`. Classroom `0043` and `0044` are frozen and unchanged.

## Runtime route result

All executable `src/` asset rendering surfaces use the stable route `/api/question-assets/{assetId}`. The public-URL guard scans `src/` and rejects both direct `getPublicUrl()` calls and legacy public object paths. Asset sources inspected include public question detail, admin questions and review, PDF-import image attachment creation, upload panels, package import, and bulk asset upload.

The route now has this deliberately ordered flow:

1. Validate an asset UUID only; no caller-provided bucket, path, or question ID is accepted.
2. Call `public.can_read_question_asset(asset_id)` with the requester session.
3. Return a generic no-store 404 for false/unknown authorization results and a generic no-store 500 for RPC failure.
4. Only after a true authorization result, use the service role to load the canonical asset row and create a 60-second signed URL.
5. Redirect with `Cache-Control: private, no-store`; the signed URL is never stored or logged by this route.

This fixes the prior ordering defect, where a service-role metadata lookup happened before requester authorization. It also avoids exposing a direct question-ID authorization oracle.

## 0045 authorization helper

Applied migration source hash: `01d0be828386f8262b5ebd6a6c19e9c17b55039132c67daf9d4fe747e447d115`.

`private.can_read_question(p_question_id uuid)` is a `STABLE SECURITY DEFINER` boolean function with fixed `search_path = public, private`. It has an explicit `postgres` owner, no browser-role execute grant, and reproduces the five current question-read paths:

- public published non-deleted, non-bank questions;
- organization staff access to non-bank questions;
- active Bank membership;
- Bank manager access with organization match;
- Assignment-selected question access.

It reuses the current private Bank and Assignment helpers rather than reproducing their identity logic. The new `public.can_read_question_asset(p_asset_id uuid)` wrapper is also `STABLE SECURITY DEFINER` with the same fixed search path and owner. It returns only a boolean after resolving the canonical asset row and delegating to the internal helper. It is the sole anonymous/authenticated RPC grant.

This preserves the intended boundaries: unrelated Students and Teachers are denied, Classroom membership does not grant Bank access, assignment access does not enumerate source Banks, and no Review Draft or Blueprint policy is widened. The helpers are read-only; no write authorization is added.

### Live catalog status

`0045_question_read_authorization_helper.sql` was manually applied exactly once to the clean Supabase project and is not represented in a migration ledger. Its live catalog contract was confirmed: both functions return boolean, are `SECURITY DEFINER`, are owned by `postgres`, and use the fixed `public, private` search path. Browser roles cannot execute `private.can_read_question(uuid)`; this is intentional because the postgres-owned public asset wrapper invokes it internally. `public.can_read_question_asset(uuid)` is executable by anonymous, authenticated, and service-role callers.

Recorded status: `APPLIED_MANUALLY_NOT_LEDGERED / EXACTLY ONCE / LIVE CATALOG VALIDATED`.

## 0046 private-bucket migration

Current pending migration hash: `bb64423637453b70121220fbacd1d940c66c005cc9b0f73d3f98d7915d5843e5`.

`0046_question_assets_bucket_private.sql` now verifies that exactly one `storage.buckets` row has ID `question-assets` before setting only that row's `public` field to false. It is idempotent after a successful cutover and fails closed for a missing or anomalous bucket. It creates no bucket and does not alter `storage.objects` or unrelated buckets.

Current policy audit from canonical `0015_question_assets_storage_bucket.sql`:

| Operation | Current policy | Result |
|---|---|---|
| Upload | `question_assets_staff_upload` | Requires an existing canonical asset reservation and staff/creator authorization. |
| List/read | `question_assets_staff_list` | Staff/admin-only direct Storage listing. Assignment/Bank readers use the signed route instead. |
| Delete | `question_assets_staff_delete` | Requires staff/creator authorization. |
| Update/replace | No policy and no current caller | Replacement upload is intentionally unsupported; current application uploads create a new object path with `upsert: false`. |

No public Storage object policy is added. After the bucket becomes private, only the canonical signed-route path grants non-staff readers access.

## Backfill result

The HTML scope is exactly `questions.content_html`, `questions.solution_html`, `question_rubric_steps.content_html`, `practice_round_questions.content_html`, and `practice_attempts.solution_html`.

The JSONB scope is exactly `practice_round_questions.question_snapshot`, `practice_attempts.question_snapshot`, `practice_wrong_questions.question_snapshot`, and `review_draft_items.draft_payload`.

Both tools now:

- default to dry run and require explicit `--apply`;
- require process-only Supabase URL and service-role values; they never load `.env.local`;
- resolve only known legacy public URLs to existing `question_assets` rows;
- detect malformed candidates as well as unmapped URLs;
- prepare every update in memory before any apply write;
- block the whole apply before the first write if unresolved or malformed occurrences exist;
- preserve JSONB structure by rewriting only string leaves;
- produce sanitized target-level reports with no private content, row IDs, source URLs, or paths.

An unexpected remote write error can still interrupt a REST-based multi-table apply after some rows have succeeded. This is not silent: the report records the applied count, the command fails, and rerunning is idempotent. A target backup remains mandatory before `--apply`.

## Validation evidence

Passed locally:

- public-URL source guard and new merged-code audit smoke;
- HTML and JSONB URL rewrite unit suites;
- new apply-preflight/malformed-input test;
- private-cutover source-only smoke;
- lint, production build, route smoke against a temporary local server, and all performance checks;
- embedded PostgreSQL rehearsal of the reconciled dependency model, including 0045 first/repeat apply, public/Bank/Assignment authorization boundaries, private-helper execute denial, upload/delete behavior, no replace policy, 0046 first/repeat apply, and absent-bucket failure.

The embedded rehearsal models the final post-0044 contract; it does not replay the frozen 0043 partial failure or reapply 0044.

The initial aggregate smoke completed every check before its existing process-environment RLS gate, then stopped because the isolated worktree intentionally had no process-only values. That historical aggregate result does not substitute for the later focused live pre-cutover rehearsal below.

### Controlled pre-cutover rehearsal

The approved exact-ID matrix ran against the authorized disposable environment after 0045 was applied. It passed the public wrapper and actual route boundary for anonymous public access, anonymous private-draft denial, assignment-selected Student access, selected Student denial for an unselected Bank asset, classroom-only Student denial, Bank-manager access, unrelated-Teacher denial for both Bank and draft assets, and unknown-asset denial. Anonymous and authenticated browser roles could not directly execute the private helper. The harness removed all exact-ID fixtures in `finally`; no fixture identity, credential, or signed URL was retained in this report.

Both approved backfill tools ran in their default dry-run mode. The HTML scope and JSONB scope each reported: scanned `0`, mapped/replaced `0`, unmapped `0`, and malformed `0`. No `--apply` command was used.

## Remaining gates

The focused pre-cutover authorization matrix and both zero-residual dry runs are recorded above. `0046` remains `PENDING_MANUAL_APPLY`; no bucket change is authorized until an operator separately approves the 0046 cutover and records a backup/reset point. No backfill apply has been performed.
