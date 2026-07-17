import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`PASS ${message}`);
  } else {
    failures += 1;
    console.error(`FAIL ${message}`);
  }
}

const read = (relativePath) => readFile(resolve(root, relativePath), "utf8");
const [route, helper, bucket, htmlBackfill, jsonBackfill, storageMigration, guard, rehearsal] = await Promise.all([
  read("src/app/api/question-assets/[assetId]/route.ts"),
  read("supabase/clean-migrations/0045_question_read_authorization_helper.sql"),
  read("supabase/clean-migrations/0046_question_assets_bucket_private.sql"),
  read("scripts/backfill-question-asset-urls.mjs"),
  read("scripts/backfill-question-asset-urls-jsonb.mjs"),
  read("supabase/clean-migrations/0015_question_assets_storage_bucket.sql"),
  read("scripts/check-question-assets-public-url.mjs"),
  read("scripts/question-assets-private-cutover-smoke.mjs"),
]);

assert(route.includes('"can_read_question_asset"'), "route authorizes canonical asset ID through the public wrapper");
assert(
  route.indexOf('"can_read_question_asset"') < route.indexOf('.from("question_assets")'),
  "route reaches service-role metadata only after requester authorization",
);
assert(!route.includes("p_question_id"), "route does not accept or expose a caller-supplied question ID");
assert(route.includes("createSignedUrl") && route.includes("private, no-store"), "route signs canonical metadata with no-store response handling");
assert(
    helper.includes("private.can_read_question") &&
    helper.includes("public.can_read_question_asset") &&
    helper.includes("alter function private.can_read_question(uuid) owner to postgres") &&
    helper.includes("alter function public.can_read_question_asset(uuid) owner to postgres") &&
    helper.includes("revoke all on function private.can_read_question(uuid) from public, anon, authenticated") &&
    helper.includes("grant execute on function public.can_read_question_asset(uuid) to anon, authenticated"),
  "0045 keeps the question helper private and exposes only the asset boolean wrapper",
);
assert(
  bucket.includes("expected_bucket_count") &&
    bucket.includes("Expected exactly one question-assets bucket") &&
    bucket.includes("set public = false") &&
    !/\b(update|insert|delete|alter)\s+storage\.objects\b/i.test(bucket),
  "0046 fails closed for a missing bucket and changes only bucket visibility",
);
assert(
  !htmlBackfill.includes("dotenv") &&
    !jsonBackfill.includes("dotenv") &&
    htmlBackfill.includes("assertQuestionAssetBackfillApplyAllowed") &&
    jsonBackfill.includes("assertQuestionAssetBackfillApplyAllowed"),
  "backfills require process-only environment and gate apply before writes",
);
assert(
  !rehearsal.includes(".env.local") &&
    rehearsal.includes("QUESTION_ASSETS_REHEARSAL_CONFIRM_FIXTURES") &&
    rehearsal.includes("QUESTION_ASSETS_REHEARSAL_CONFIRM_CLEANUP") &&
    rehearsal.includes("const fixtureClient") &&
    rehearsal.includes("fixtureClient.from(\"question_assets\").delete") &&
    rehearsal.includes("fixtureClient.from(\"questions\").delete"),
  "live rehearsal requires explicit disposable fixture and cleanup acknowledgement with service-role cleanup",
);
assert(
  storageMigration.includes("question_assets_staff_upload") &&
    storageMigration.includes("question_assets_staff_list") &&
    storageMigration.includes("question_assets_staff_delete") &&
    !storageMigration.includes("for update"),
  "current storage policy surface is upload/list/delete with no replace policy",
);
assert(
  guard.includes("GET_PUBLIC_URL_CALL") && guard.includes("LEGACY_PUBLIC_PATH"),
  "public URL guardrail remains active for executable source",
);

if (failures > 0) process.exitCode = 1;
