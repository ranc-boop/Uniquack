# Storage Private Cutover — `question-assets` Bucket

Status: Commit 2 of the `security/p0-storage-private-access` / SEC-P1B plan. Adds the private-bucket migration and route hardening as **code only**. The migration has **not** been applied to any environment as part of this commit, and the live smoke test has **not** been executed against any live Supabase project — both require the deployment gate below to be satisfied first, on infrastructure this task does not have authority to provision or confirm.

## Preconditions checked

All seven architectural preconditions were verified against the current repository state before any implementation work began:

| # | Precondition | Result |
|---|---|---|
| 1 | Zero `getPublicUrl()` calls remain in `src/` | Confirmed — `grep -rn "getPublicUrl" src` matches only a comment in `src/lib/storage/question-assets.ts` documenting that callers must not use it. |
| 2 | All 9 audited legacy URL-bearing fields covered by the two backfill commits | Confirmed — 5 plain-text HTML columns (Commit 1) + 4 JSONB columns (Commit 2 of the backfill plan) = 9, matching the original audit in `docs/storage-url-backfill-report.md`. |
| 3 | Both backfills have documented dry-run, apply, and verification procedures | Confirmed — `docs/storage-url-backfill-report.md` documents both, including `--report`, verification SQL, and rollback for each. |
| 4 | All current asset rendering paths use `/api/question-assets/[assetId]` | Confirmed — `grep -rln "getQuestionAssetUrl" src` returns exactly the 5 call sites listed in the task, plus the helper's own definition. |
| 5 | `private.can_read_question(question_id)` exists | Confirmed — `supabase/clean-migrations/0045_question_read_authorization_helper.sql`. |
| 6 | The asset API route performs authorization in the requesting user's auth context | Confirmed — `src/app/api/question-assets/[assetId]/route.ts` calls `can_read_question` via `createClient()` (the user-session-bound Supabase client), not a service-role client. |
| 7 | No signed URL is stored in the database | Confirmed — the only value ever written to a database column by any of the 5 call sites is `/api/question-assets/{assetId}` (see `getQuestionAssetUrl`); signed URLs are generated per-request inside the route handler and only ever appear in a `Location` redirect header, never persisted. |

No precondition was found missing, so this commit proceeds — as code preparation only, per the deployment gate below.

## Final request flow

1. A page/component renders `<img src="/api/question-assets/{assetId}">` (or an equivalent redirect-following fetch), using the path produced by `getQuestionAssetUrl(assetId)`.
2. `GET /api/question-assets/[assetId]` runs:
   a. Looks up the `question_assets` row (service-role client — metadata only, not an authorization decision; see "Authorization flow").
   b. If the row doesn't exist (or the lookup errors): responds `404`.
   c. Calls `private.can_read_question(question_id)` under the caller's own session.
   d. If denied: responds `403`. If the RPC itself errors: responds `500`. Both cases return a generic, detail-free JSON body.
   e. If allowed: creates a 60-second signed URL via the service-role Storage client and responds `302` with `Location` set to that signed URL.
3. The browser follows the redirect and loads the asset directly from Supabase Storage using the signed URL.

Unchanged from the prior commit's report except for the hardening described below (generic error bodies, `Cache-Control` on every response path, not just the success path).

## Authorization flow

Authorization is decided in exactly one place — the `private.can_read_question(question_id)` call — and nowhere else in this route or in any of the 5 call sites. The call is made via `createClient()` (cookie/session-bound), so `auth.uid()` resolves to the requesting user exactly as it would for direct RLS-scoped access to `questions`, including the anonymous case (no session at all), which `can_read_question` already handles since it was built from the public/published RLS policy.

The route does **not** use a service-role client for this decision — the service-role client (`createServiceRoleClient()`) is used only for two non-authorization purposes: (a) the initial `question_assets` metadata lookup (necessary because that table's own RLS is narrower than `can_read_question`, as documented in the prior commit's report, and the row's `storage_path`/`question_id` are not sensitive on their own), and (b) generating the signed URL itself once authorization has already succeeded. Neither of these introduces a second authorization system — the single gate remains `can_read_question`.

No `can_read_question` logic is duplicated in TypeScript anywhere; the route's only interaction with it is the one `supabase.rpc("can_read_question", ...)` call.

## Migration and Storage policy changes

**Migration**: [supabase/clean-migrations/0046_question_assets_bucket_private.sql](../supabase/clean-migrations/0046_question_assets_bucket_private.sql) — a single idempotent statement:

```sql
update storage.buckets
set public = false
where id = 'question-assets';
```

Idempotent by construction: it's a pure `UPDATE` (no `INSERT`/conflict path), so applying it once or a hundred times converges to the same end state with no error and no cumulative side effect.

**Storage policy changes**: none. The three existing `storage.objects` policies on this bucket — `question_assets_staff_upload` (insert), `question_assets_staff_list` (select), `question_assets_staff_delete` (delete), all defined in `0015_question_assets_storage_bucket.sql` — gate access purely on `bucket_id = 'question-assets'` plus an authenticated-role check (`is_admin()` / `is_org_staff()` / `created_by` match). None of them reference `storage.buckets.public`. Flipping that flag changes nothing about what these three policies evaluate to; it only removes the *unauthenticated* "public object" access path, which no policy governs today (public buckets bypass object policies for that path entirely) and which no application code depends on anymore after the prior two commits. This was verified by reading the full policy definitions, not assumed — see the migration file's own comment for the same reasoning inline.

The existing `questions` table RLS policies were not read for the purpose of modifying them, and were not touched, per the task's restriction.

## Signed URL TTL

**60 seconds** (`SIGNED_URL_TTL_SECONDS` in the route), unchanged from the prior commit. Short enough to limit exposure if a signed URL leaks (referrer, browser history, screenshot metadata); long enough that normal page-load image fetching won't race it. Re-verified as still appropriate for this commit — no change was needed or made.

## Cache-Control behavior

Every response from the route — success (`302`) and every failure path (`404`, `403`, `500`) — now sets `Cache-Control: private, no-store` via a single shared `NO_STORE_HEADERS` constant. This was a gap in the prior commit (only the `302` had it); fixed here so that intermediaries (browser cache, CDN, shared proxy) never cache an authorization decision, not just never cache the signed URL itself.

## Test results

**Offline**: no new pure-logic unit tests were added for this commit — the route's logic is entirely I/O (DB lookup, RPC call, Storage signing), so there is nothing meaningful to unit-test without a live backend; this mirrors why Commits 1/2 of the backfill plan used offline tests (they had extractable pure functions) while this commit's testable surface is inherently an integration concern.

**`tsc --noEmit`**: clean for all touched files. The only errors present are pre-existing and unrelated (`.next/types` stale build artifacts referencing a different route, present before this commit).

**`eslint`**: clean on all touched files.

**Live smoke test**: [scripts/question-assets-private-cutover-smoke.mjs](../scripts/question-assets-private-cutover-smoke.mjs) was written covering all 9 required scenarios (anon access to a published asset via the route; unauthorized student denied a draft asset; authorized staff allowed a draft asset; unknown asset ID rejected; asset attached to an inaccessible question rejected with no `Location` header ever issued; direct public Storage URL check, reported as informational `SKIP` rather than failure when the bucket is still public; signed URL generated only after authorization; upload/replace/delete flows still authorized and functional; migration idempotency via `updateBucket` called twice). **This script was not executed in this session** — this environment has a configured `NEXT_PUBLIC_SUPABASE_URL` and test credentials but no service-role key, and more importantly, running it would exercise a real project whose deployment-gate status (snapshot taken, backfills applied, verification clean) is unknown to this task. Running it is the explicit next step for whoever owns the target environment, not something this commit performs. The bucket-mutation portion of the script additionally requires an explicit `--allow-bucket-mutation` flag even when a service-role key is present, specifically so it can never be invoked accidentally against a real project.

## Exact deployment order

This repeats and consolidates the gate stated in the task and mirrored in the migration file's own header comment — nothing here has been executed:

1. Take a database snapshot of the target environment.
2. Dry-run `scripts/backfill-question-asset-urls.mjs` (Commit 1 of the backfill plan).
3. Dry-run `scripts/backfill-question-asset-urls-jsonb.mjs` (Commit 2 of the backfill plan).
4. Resolve or explicitly approve every unmapped/unresolved URL surfaced by both dry runs.
5. Apply both backfills (`--apply`).
6. Run every verification query in `scripts/question-asset-url-backfill-verify.sql` and `scripts/question-asset-url-backfill-jsonb-verify.sql`; confirm zero remaining legacy public `question-assets` URLs (excluding explicitly approved orphans).
7. Only now: apply migration `0046_question_assets_bucket_private.sql` to the target environment.
8. Run `scripts/question-assets-private-cutover-smoke.mjs` against the target environment (with real, non-shared test accounts) and confirm every check passes or is an expected, understood `SKIP`.
9. Perform the manual post-deployment verification below.

## Rollback procedure

The migration only flips one boolean column on one `storage.buckets` row; it does not touch policies, RLS, or any table data.

1. **Immediate rollback**: run `update storage.buckets set public = true where id = 'question-assets';` (the exact inverse, equally idempotent) to restore public access if the cutover causes an unexpected regression. This is safe to do at any time since no application code depends on the bucket being public — the route works identically regardless of the bucket's public flag (it always signs and redirects), so reverting the bucket flag is a pure safety net, not something the application needs.
2. **No data was altered by this migration**, so there is nothing to restore from a snapshot for this specific commit — the snapshot requirement in the deployment gate exists to protect the two backfill commits (which do rewrite row content), not this one.
3. If a Storage policy had been changed (it wasn't, in this commit), the rollback would be to `drop policy` / re-`create policy` back to the `0015` definitions — noted here for completeness even though it doesn't apply.

## Manual post-deployment verification

After deployment (in a real target environment, not part of this commit):

1. Confirm `select public from storage.buckets where id = 'question-assets';` returns `false`.
2. Confirm a direct legacy-shape public URL (`{SUPABASE_URL}/storage/v1/object/public/question-assets/...`) for a known asset now returns a non-200 status.
3. As an anonymous browser session, load a published question's detail page and confirm images render (via the route + signed redirect).
4. As a signed-in student, confirm draft assets they shouldn't see are not reachable, and any assets they should see (e.g. via an authorized assignment) still render.
5. As staff/admin, confirm the question editor and review pages still show draft images, and that upload/replace/delete of an asset still works end-to-end.
6. Spot-check server logs (application and Supabase) for the deployment window to confirm no signed URL, JWT, cookie, or service-role credential value appears in any log line.

## Known limitations

- The live smoke test has not been run against any environment as part of this commit — its results here are "written and reviewed," not "executed and passed." This is a deliberate consequence of the task's restriction against touching production and this task's lack of authority/knowledge over the deployment-gate status of any specific target project.
- Testing the authenticated (student/staff) HTTP-route paths precisely as a browser would requires a valid SSR session cookie, which is nontrivial to fabricate from a standalone script talking to `@supabase/ssr`'s cookie-based session handling. The smoke script works around this by testing `can_read_question` directly through each persona's own signed-in Supabase client (the exact same call and same auth context the route itself uses), plus testing the anonymous HTTP path end-to-end (which needs no cookie). A true end-to-end browser-driven check of the authenticated HTTP paths is not included and would need a separate browser-automation test, which is out of scope for this commit.
- The "direct public Storage URL no longer works" smoke assertion is only meaningful after migration `0044` has actually been applied to the project being tested against; run before that point, it correctly reports itself as an informational skip rather than a false failure, but it does mean this specific guarantee is not verified until the real cutover happens.
- No CI wiring or recurring guardrail (e.g. a lint rule preventing a future `getPublicUrl()` reintroduction) was added — explicitly out of scope for this commit per the task's restriction against beginning Commit 3 guardrail work.
