# Storage Signed URL Authorization — Question Assets

Status: bucket visibility unchanged (`question-assets` remains `public = true`). This PR wires an authorized access path and removes every direct `getPublicUrl()` call from application code; the bucket itself is intentionally left public until all paths are verified against this new flow (see Remaining Limitations).

## Request flow

1. A page/Server Action needs to render a question asset. Instead of calling Supabase Storage directly, it calls `getQuestionAssetUrl(assetId)` ([src/lib/storage/question-assets.ts](../src/lib/storage/question-assets.ts)), which returns `/api/question-assets/{assetId}` — a stable path, not a signed URL.
2. That path is used as-is (`<img src="...">`, or embedded into stored `content_html` for AI-imported figures). No signed URL is generated at this point — generation is deferred to request time.
3. When a browser actually requests `/api/question-assets/{assetId}` (e.g. to load the image), the route handler ([src/app/api/question-assets/[assetId]/route.ts](../src/app/api/question-assets/[assetId]/route.ts)) runs:
   - Looks up the `question_assets` row by `assetId` (service-role client — see Authorization flow for why).
   - Calls `private.can_read_question(question_id)` under the requesting user's own session.
   - If denied: `403 { error: "Not authorized." }` (or `404` if the asset row doesn't exist).
   - If allowed: generates a 60-second signed URL via `createSignedUrl()` and responds `302` to it, with `Cache-Control: private, no-store` so intermediaries don't cache the redirect.
4. The browser follows the redirect and loads the image from the signed URL directly from Supabase Storage.

Because generation happens per-request rather than once at SSR time, a signed URL never goes stale inside server-rendered HTML — every image load re-authorizes and re-signs.

## Authorization flow

Authorization is decided in exactly one place: the `private.can_read_question(question_id)` RPC call inside the route handler, executed via `createClient()` (the user-session-bound Supabase client), so `auth.uid()` resolves to the requesting user exactly as it would for any RLS-scoped query — anonymous requests included, since `can_read_question` covers the public/published path without requiring a session.

The route also does a metadata lookup (`question_assets` table, to find `question_id`/`storage_path`) via `createServiceRoleClient()`, not the user's session. This is a lookup-only step, not an authorization decision: `question_assets` table RLS (`question_assets_public_read`, `question_assets_staff_access`) is narrower than `can_read_question` — it has no equivalent for the bank-member or assignment-scoped read paths — so using the user's own client for this lookup would incorrectly 404 legitimate assignment/bank readers before authorization is even evaluated. The row's `storage_path`/`question_id` are not sensitive by themselves; nothing is returned to the client from this step. The signed URL itself is also generated via the service-role client, for the same reason — storage.objects RLS (`question_assets_staff_list`) only covers admin/staff and would otherwise block signing for public/bank/assignment readers who `can_read_question` already approved. No new authorization logic was written for either step; `can_read_question` remains the sole gate before a signed URL is ever issued.

## Files changed

| File | Change |
|---|---|
| [src/lib/storage/question-assets.ts](../src/lib/storage/question-assets.ts) | New. Centralized helper: `getQuestionAssetUrl(assetId)` → `/api/question-assets/{assetId}`. |
| [src/app/api/question-assets/[assetId]/route.ts](../src/app/api/question-assets/[assetId]/route.ts) | New. GET route: lookup → `can_read_question` → signed URL → 302 redirect. |
| [src/types/database.ts](../src/types/database.ts) | Added `can_read_question` to the generated `Functions` type map so `supabase.rpc("can_read_question", ...)` typechecks (the migration predates the last `supabase gen types` run). |
| [src/app/admin/questions/asset-actions.ts](../src/app/admin/questions/asset-actions.ts) | `finalizeQuestionAssetUpload` now returns `getQuestionAssetUrl(asset.id)` instead of a public URL. |
| [src/app/admin/questions/page.tsx](../src/app/admin/questions/page.tsx) | Asset list building now uses the helper; unused `QUESTION_ASSETS_BUCKET` import removed. |
| [src/app/admin/review/page.tsx](../src/app/admin/review/page.tsx) | Same as above. |
| [src/app/questions/[id]/page.tsx](../src/app/questions/[id]/page.tsx) | Public question detail page's image gallery now uses the helper; unused `QUESTION_ASSETS_BUCKET` import removed. |
| [src/lib/ai-pdf-import/service.ts](../src/lib/ai-pdf-import/service.ts) | AI-imported figure crop attachment now embeds `getQuestionAssetUrl(assetId)` into the generated `<img>` HTML instead of a public URL. |
| [supabase/clean-migrations/0045_question_read_authorization_helper.sql](../supabase/clean-migrations/0045_question_read_authorization_helper.sql) | (Prior PR) introduces `private.can_read_question`; unchanged by this PR. |

No frontend rendering components (`question-detail-image-gallery.tsx`, `question-assets-panel.tsx`) needed changes — they already just render whatever URL string they're given.

## Replaced `getPublicUrl()` locations

All 5 previously-identified call sites, confirmed zero remaining via repo-wide search:

1. `src/app/admin/questions/asset-actions.ts:195` (upload finalize)
2. `src/app/admin/questions/page.tsx:428` (admin question list)
3. `src/app/admin/review/page.tsx:401` (admin review/draft view)
4. `src/app/questions/[id]/page.tsx:203` (public question detail)
5. `src/lib/ai-pdf-import/service.ts:2962` (AI PDF import crop attachment)

## Compatibility notes

- **Behavior for authorized users is unchanged**: the bucket is still public, so even the pre-existing `getPublicUrl()`-style permanent link would still resolve if someone had it cached — this PR does not tighten access yet (see Limitations). What changes is that all *application-generated* links now go through authorization first.
- **`QuestionAssetView.publicUrl` / `QuestionDetailImage.publicUrl` field names were kept as-is** — they now hold an internal route path rather than a Supabase Storage URL, but no consuming component needed changes since they only ever did `<img src={publicUrl}>`.
- **AI-imported figure HTML**: the `<img src="...">` markup generated during PDF import and stored in `content_html` now embeds the internal route path. This is stored once at import time and rendered later (draft and, after publish, to students) — every render re-hits the authorized route, so this does not go stale and does not require a migration of previously-imported content (old rows still have old public-URL-embedded HTML until re-generated; see Limitations).
- **60-second TTL**: chosen to be short enough to limit exposure if a signed URL leaks (e.g. via referrer, browser history, screenshot metadata), long enough that normal page-load image fetching won't race it.

## Remaining limitations

1. **Bucket is still public.** Per the task's explicit instruction, this PR does not flip `question-assets` to private. Until that happens, anyone who already has (or can guess/enumerate) a direct `storage_path`-based public URL can still bypass this entire authorization flow. This PR only guarantees that *application-generated* links are authorized; it does not yet close the direct-access gap. That is the explicit next step, gated on verification below.
2. **Previously-generated content may still contain old public URLs.** Question `content_html` rows imported before this change (via the AI PDF import path) have the old public URL baked into stored HTML, not the new route path. These will keep working today (bucket is still public) but will break once the bucket goes private, and won't automatically pick up the new authorized path. A backfill/re-write pass over existing `content_html` is needed before (or as part of) the bucket-visibility change.
3. **No caching/CDN layer for the redirect target.** Every asset load now costs one extra round trip (client → `/api/question-assets/{id}` → 302 → Storage) versus a direct public URL. Not addressed here since it doesn't affect correctness, but worth measuring before wide rollout if asset-heavy pages show a perceptible load-time regression.
4. **`question_assets` metadata lookup uses service-role**, which is standard for this pattern but means a malformed/missing `assetId` returns a generic 404 without leaking anything — that's intended, not a gap, but worth noting since it's a slightly different failure mode than the RLS-driven 404s elsewhere in the app.

## Future migration recommendation

Before changing bucket `public` → `false`:
1. Confirm no other code path (outside `src/`, e.g. seed scripts, ops tooling, external consumers) constructs a `question-assets` public URL directly.
2. Backfill/re-generate `content_html` for existing questions with AI-imported figures so stored markup references the new route path (Limitation 2).
3. Re-run this session's Storage Permission Audit's "5 sites" check against the then-current `src/` to confirm zero direct `getPublicUrl()` regressions were reintroduced.
4. Only then flip `public = false` on the `question-assets` bucket and drop/tighten the now-unnecessary broad `storage.objects` public-read assumption — at that point the `question_assets_staff_list` storage policy (admin/staff only) becomes the sole *fallback* path, with this route as the primary one for all other readers.
