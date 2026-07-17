-- Question Assets Bucket: Public -> Private (SEC-P1B Commit 2 cutover)
--
-- DEPLOYMENT GATE — DO NOT APPLY THIS MIGRATION TO ANY TARGET ENVIRONMENT UNTIL:
--   1. a database snapshot has been taken;
--   2. scripts/backfill-question-asset-urls.mjs has been dry-run;
--   3. scripts/backfill-question-asset-urls-jsonb.mjs has been dry-run;
--   4. every unmapped/unresolved URL from both dry runs has been resolved or
--      explicitly approved as an acceptable orphan;
--   5. both backfills have been applied (--apply);
--   6. every verification query in scripts/question-asset-url-backfill-verify.sql
--      and scripts/question-asset-url-backfill-jsonb-verify.sql reports zero
--      remaining legacy public question-assets URLs (excluding approved orphans).
-- See docs/storage-private-cutover-report.md for the full procedure. This file may
-- be present in the repository/migration history before the gate is satisfied —
-- its presence here does not mean it has been run against any environment.
--
-- Idempotent: `update ... set public = false` has no INSERT/conflict path and is a
-- pure state assignment — running it once or a hundred times against the same row
-- converges to the same end state (public = false) with no error and no side effect
-- beyond the first application.
--
-- No storage.objects policy changes accompany this migration. The three existing
-- policies on this bucket (question_assets_staff_upload, question_assets_staff_list,
-- question_assets_staff_delete, all defined in
-- 0015_question_assets_storage_bucket.sql) gate INSERT/SELECT/DELETE purely on
-- `bucket_id = 'question-assets'` plus an authenticated-role check
-- (is_admin()/is_org_staff()/created_by) — none of them reference
-- storage.buckets.public. Flipping that flag does not change what those policies
-- evaluate to, so existing authenticated upload, list (used during upload
-- finalization), and delete flows are unaffected by this migration. What changes is
-- only the unauthenticated "public object" access path (the one getPublicUrl() used
-- to rely on), which SEC-P1B Commit 1 already removed every application code path's
-- dependency on (see docs/storage-signed-url-report.md and
-- docs/storage-private-cutover-report.md).

update storage.buckets
set public = false
where id = 'question-assets';
