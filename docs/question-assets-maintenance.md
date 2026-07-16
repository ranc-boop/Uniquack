# Question Assets — Maintenance Guide

This is the operating manual for the `question-assets` Storage bucket and its authorization model, for anyone touching this system after the SEC-P1B cutover (Commits 1–3). Read this before adding a new field that might render a question asset, before touching `src/app/api/question-assets/[assetId]/route.ts`, or before running any deployment step involving this bucket.

## Always render through `/api/question-assets/[assetId]`

Never call `.getPublicUrl()` on the `question-assets` bucket, and never hard-code `/storage/v1/object/public/question-assets/...` anywhere in `src/`. Use `getQuestionAssetUrl(assetId)` from `@/lib/storage/question-assets` to build the URL, and let `<img src={...}>` (or an equivalent fetch) hit the route directly. The route itself authorizes and signs on every request — there is no other supported way to reach an asset's bytes from application code.

This is enforced automatically: `scripts/check-question-assets-public-url.mjs` runs as part of `npm run lint` and fails the build if either forbidden pattern reappears in `src/`. See "Guardrail" below for exactly what it checks and its one narrow exclusion.

## Store asset IDs, storage paths, or canonical route paths — never signed URLs

Anywhere you persist a reference to a question asset (a new column, a new JSONB snapshot field, a cache, a queue payload), store one of:
- the `question_assets.id` (preferred — resolve to a route path at render time via `getQuestionAssetUrl`), or
- the canonical route path itself (`/api/question-assets/{assetId}`, i.e. what `getQuestionAssetUrl` already returns).

Never store a signed URL. Signed URLs are short-lived (60 seconds — see below) and are generated fresh on every request by the route; persisting one anywhere guarantees it will be expired and useless by the time it's read back, and defeats the entire point of gating access through `can_read_question` on every request.

## Preserve requesting-user auth context for `private.can_read_question`

`private.can_read_question(question_id)` reads `auth.uid()` internally. Any code that calls it — the route, a smoke test, a future feature — must call it through a Supabase client bound to the requesting user's own session (`createClient()` in `src/lib/supabase/server.ts`, or the equivalent signed-in client in a script), never through a service-role/userless client. Calling it with a service-role client makes `auth.uid()` null and the function will deny every caller, which is easy to mistake for "it's broken" rather than "it was called the wrong way." If you ever see a service-role client passed to `can_read_question`, that's a bug — fix the call, don't change the function.

Do not duplicate `can_read_question`'s logic in TypeScript, ever — not even a "quick" client-side approximation for a loading state or a UI hint. If a new UI surface needs to know in advance whether an asset would be visible, call the route (or the RPC, if server-side) and use its real answer.

## Update backfill coverage if new HTML, snapshot, or payload fields are introduced

The 9 audited legacy-URL-bearing fields are the complete set found as of this cutover:

- Plain-text HTML columns (`scripts/lib/question-asset-url-rewrite.mjs`, `QUESTION_ASSET_HTML_TARGETS`): `questions.content_html`, `questions.solution_html`, `question_rubric_steps.content_html`, `practice_round_questions.content_html`, `practice_attempts.solution_html`.
- JSONB columns (`scripts/lib/question-asset-json-rewrite.mjs`, `QUESTION_ASSET_JSONB_TARGETS`): `practice_round_questions.question_snapshot`, `practice_attempts.question_snapshot`, `practice_wrong_questions.question_snapshot`, `review_draft_items.draft_payload`.

If a future migration adds a new `*_html` column, a new JSONB snapshot/payload column, or any other field that could embed a rendered question (including a question asset reference), you must:

1. Add it to the appropriate `QUESTION_ASSET_HTML_TARGETS` or `QUESTION_ASSET_JSONB_TARGETS` array (both scripts that consume these arrays — the backfill and `scripts/question-assets-private-cutover-smoke.mjs`'s legacy-URL scan — pick it up automatically once it's listed there; nothing else needs to change).
2. Update the field/column table in `docs/storage-url-backfill-report.md`.
3. Run the relevant backfill (dry-run first) against any environment where the new field might already contain legacy-shaped data, even if you don't expect any (better to confirm zero than assume it).

Do not write a new, separate URL-detection or rewrite implementation for a new field — reuse `findLegacyQuestionAssetUrls`/`rewriteQuestionAssetUrls` (plain string columns) or `findLegacyQuestionAssetUrlsInJson`/`rewriteQuestionAssetUrlsInJson` (JSONB columns) from the existing lib modules.

## Test deletion for orphaned Storage objects

Deleting a `question_assets` row does not automatically delete the underlying Storage object, and deleting a Storage object does not automatically delete the `question_assets` row — these are two separate operations (see `deleteQuestionAsset` / `.storage.remove()` call sites in `src/app/admin/questions/asset-actions.ts`). When testing or reviewing a deletion flow:

- Confirm both the DB row and the Storage object are removed together, or document why not (e.g. soft-delete semantics).
- Check for orphans periodically: a Storage object with no matching `question_assets.storage_path` row is invisible to `can_read_question`-gated access (nothing references it, so nothing can resolve a route path to it) but still consumes bucket storage. This is a maintenance/cost concern, not a security one — an orphaned object with no `question_assets` row can never be signed or served through the route.
- The reverse (a `question_assets` row whose Storage object no longer exists) surfaces as a `500` from `createSignedUrl` in the route when someone with legitimate access tries to view it — this is a data-integrity bug to fix at the source, not something the route should paper over.

## Signed URL TTL and cache expectations

- **TTL: 60 seconds** (`SIGNED_URL_TTL_SECONDS` in `src/app/api/question-assets/[assetId]/route.ts`). Chosen to limit exposure if a URL leaks (referrer headers, browser history, screenshots) while comfortably covering a normal image load.
- **Every response from the route** — the `302` redirect and every `404`/`403`/`500` — carries `Cache-Control: private, no-store`. Nothing about this route's output should ever be cached by a browser, CDN, or shared proxy: not the signed URL (it would be stale/wrong for a different user before long), and not the authorization decision (a 403 for one user must never be served to a different user from a cache).
- If a future change needs a longer TTL (e.g. for a bulk-print/export feature), treat that as a deliberate, reviewed decision — not a default to raise casually — since it directly trades off exposure window against convenience.

## Rollback and incident-response guidance

- **Bucket visibility**: `update storage.buckets set public = true where id = 'question-assets';` is the exact, equally-idempotent inverse of migration `0044`. Safe to run at any time — the route works identically regardless of the bucket's public flag (it always signs and redirects), so this is a pure safety net, never something the application depends on.
- **Backfill rollback**: neither backfill script drops or restructures a column; rollback is a point-in-time restore of the affected tables from a pre-`--apply` snapshot (see `docs/storage-url-backfill-report.md`, "Rollback procedure," for both the plain-text and JSONB cases). The `--report` output identifies which rows changed but is not a full before/after diff — the snapshot is the actual rollback mechanism.
- **If authorization looks wrong in production** (users seeing assets they shouldn't, or not seeing ones they should): the single place to look is `private.can_read_question` and the five RLS policies it consolidates (`questions_published_read`, `questions_staff_access`, `questions_bank_member_read`, `questions_bank_manager_write`, `questions_assignment_item_read` — see `docs/storage-read-helper-report.md`). Do not add a workaround in the route or in TypeScript; if the RPC's answer is wrong, the bug is in the RPC or the RLS policies it mirrors, and both are out of scope for a quick patch — escalate rather than duplicate logic around it.
- **If the guardrail (`scripts/check-question-assets-public-url.mjs`) fires in CI**: it means a `getPublicUrl()` call or a hard-coded legacy path was reintroduced into `src/`. Fix the call site to use `getQuestionAssetUrl` — do not suppress the guardrail. If you believe a specific line is a legitimate exception (extremely rare — the only current one is a single documentation comment), the suppression marker is `guardrail-allow:question-assets-public-url`, and adding it requires a comment immediately explaining why, matching the one existing usage in `src/lib/storage/question-assets.ts`.

## Deployment and post-deployment checklist

This is the exact, enforced order for the private-bucket cutover. Do not reorder or skip steps.

1. Take a database snapshot of the target environment.
2. Dry-run both backfills:
   - `node scripts/backfill-question-asset-urls.mjs --report ./tmp/backfill-html-dry-run.json`
   - `node scripts/backfill-question-asset-urls-jsonb.mjs --report ./tmp/backfill-jsonb-dry-run.json`
3. Resolve or explicitly approve every unmapped/unresolved URL surfaced by both dry runs.
4. Apply both backfills:
   - `node scripts/backfill-question-asset-urls.mjs --apply --report ./tmp/backfill-html-apply.json`
   - `node scripts/backfill-question-asset-urls-jsonb.mjs --apply --report ./tmp/backfill-jsonb-apply.json`
5. Run every verification query in `scripts/question-asset-url-backfill-verify.sql` and `scripts/question-asset-url-backfill-jsonb-verify.sql`, and confirm zero remaining legacy URLs (excluding explicitly approved orphans).
6. Apply migration `supabase/clean-migrations/0044_question_assets_bucket_private.sql` to the target environment.
7. Run the live smoke script against that environment: `node scripts/question-assets-private-cutover-smoke.mjs` (add `--allow-bucket-mutation` only if you also intend to exercise the idempotency check against a disposable project — never against a real environment's data).
8. Perform browser-level verification with three real sessions:
   - **Anonymous**: load a published question's detail page; confirm images render.
   - **Student**: confirm draft assets they shouldn't see are unreachable, and any assets they're entitled to (e.g. via an assignment) still render.
   - **Staff/admin**: confirm the question editor and review pages still show draft images.
9. Verify upload, replace, and delete behavior end-to-end as staff/admin (covered by the smoke script's Storage-level checks, but worth a manual pass through the actual admin UI too).
10. Verify direct legacy public URLs no longer work (`{SUPABASE_URL}/storage/v1/object/public/question-assets/...` for a known asset should return a non-200 status).
11. Monitor logs for authorization or asset-rendering failures for a reasonable window after deployment (elevated `403`/`404`/`500` rates from `/api/question-assets/*`, or user reports of missing images) before considering the cutover complete.

## Guardrail

`scripts/check-question-assets-public-url.mjs`, run automatically by `npm run lint`, fails the build if `src/**/*.{ts,tsx}` contains:

- a real `.getPublicUrl(` method-call, or
- the literal legacy path segment `/storage/v1/object/public/question-assets` (which also catches any hard-coded full URL for this bucket, since a hard-coded URL necessarily contains this substring).

**Scope**: only `src/` is scanned. Everything outside `src/` is out of scope by directory, not by an allowlist:

| Excluded location | Why it's safe |
|---|---|
| `supabase/migrations/`, `supabase/clean-migrations/` | SQL schema/policy files; cannot contain a JS method call, and the one migration that references bucket visibility (`0044`) contains no forbidden URL pattern. |
| `scripts/*.mjs` (backfill, verify, smoke) | These files' entire purpose is to detect and report legacy URLs — they must reference the pattern to find it. They are operator-run tooling, not application code that renders to end users. |
| `scripts/*.sql` (verification queries) | Same reasoning — the verification queries must contain the pattern to search for it. |
| `docs/*.md` | Historical/reference documentation describing what was removed and why; prose and code-block examples here don't execute. |

**The one exclusion inside `src/`**: `src/lib/storage/question-assets.ts` carries a doc comment explaining why `getPublicUrl()` must not be called — that comment used to contain the literal call shape as an example, which would have false-positived the guardrail. It was reworded to describe the method in prose instead, and additionally carries the `guardrail-allow:question-assets-public-url` marker as a second layer of protection in case a future edit reintroduces literal call syntax there. This is the only suppression marker in the codebase; if you ever see a second one appear, treat that as worth double-checking during review.
