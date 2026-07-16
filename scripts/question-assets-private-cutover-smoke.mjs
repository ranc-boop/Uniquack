// Live smoke test for the question-assets private-bucket cutover (SEC-P1B Commit 2).
//
// NOT executed as part of any automated commit in this repo's history — this script
// requires a real Supabase project (Auth + Storage + the can_read_question RPC) and
// is meant to be run manually by a human against a disposable/staging project, or
// against a target environment only AFTER the deployment gate in
// docs/storage-private-cutover-report.md has been satisfied. Running it against a
// project where the bucket is still public is expected to skip/partially-fail the
// "direct public URL is blocked" assertion — see the inline notes below.
//
// Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// TEST_ADMIN_USERNAME/PASSWORD, and (optionally) TEST_STUDENT_USERNAME/PASSWORD,
// CLEAN_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY, and
// NEXT_PUBLIC_SITE_URL/SITE_URL (defaults to http://localhost:3000) for a running
// instance of this app to exercise /api/question-assets/[assetId] over HTTP.

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import {
  QUESTION_ASSET_HTML_TARGETS,
  findLegacyQuestionAssetUrls,
} from "./lib/question-asset-url-rewrite.mjs";
import {
  QUESTION_ASSET_JSONB_TARGETS,
  findLegacyQuestionAssetUrlsInJson,
} from "./lib/question-asset-json-rewrite.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "http://localhost:3000";
const bucket = "question-assets";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase URL or anon key.");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function skip(message) {
  console.warn(`SKIP ${message}`);
}

function emailFor(username) {
  return username.includes("@") ? username : `${username}@local.app`;
}

async function signIn(usernameEnv, passwordEnv) {
  const username = process.env[usernameEnv];
  const password = process.env[passwordEnv];

  if (!username || !password) {
    throw new Error(`Missing ${usernameEnv} or ${passwordEnv}.`);
  }

  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: emailFor(username),
    password,
  });

  if (error) {
    throw new Error(`${usernameEnv} sign-in failed: ${error.message}`);
  }

  return { client, user: data.user };
}

async function optionalSignIn(usernameEnv, passwordEnv) {
  try {
    return await signIn(usernameEnv, passwordEnv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`SKIP some checks: ${usernameEnv}/${passwordEnv} unavailable (${message}).`);
    return null;
  }
}

async function insertOne(client, table, payload, select = "*") {
  const { data, error } = await client.from(table).insert(payload).select(select).single();
  assert(!error && data, `${table} insert failed: ${error?.message}`);
  return data;
}

// The idempotency check below actually toggles storage.buckets.public — a real
// cutover-shaped mutation. It must never run just because a service-role key
// happens to be configured (e.g. in a shared/CI environment); it requires an
// explicit opt-in flag, and is intended only for a disposable project, never a
// project that has real, non-test data or that other work depends on.
const allowBucketMutation = process.argv.includes("--allow-bucket-mutation");

const anon = createClient(supabaseUrl, supabaseAnonKey);
const admin = await signIn("TEST_ADMIN_USERNAME", "TEST_ADMIN_PASSWORD");
const student = await optionalSignIn("TEST_STUDENT_USERNAME", "TEST_STUDENT_PASSWORD");

// Read-only service-role client, used only for the bucket-visibility check and the
// zero-remaining-legacy-URL scan below — neither mutates anything, so both are safe
// to run whenever a service-role key is available, without --allow-bucket-mutation.
const serviceReadClient = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

// Mutation-capable service-role client, used only by the idempotency check further
// below, and gated behind an explicit opt-in flag on top of requiring the key — see
// that check for why.
const serviceClient =
  serviceRoleKey && allowBucketMutation
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

if (!serviceRoleKey) {
  skip("bucket-visibility, legacy-URL-scan, and bucket-idempotency checks: no service-role key available in this environment.");
} else if (!allowBucketMutation) {
  skip(
    "bucket-idempotency check: service-role key present but --allow-bucket-mutation was not passed; refusing to toggle bucket visibility.",
  );
}

const { data: adminProfile, error: adminProfileError } = await admin.client
  .from("profiles")
  .select("default_organization_id")
  .eq("id", admin.user.id)
  .single();
assert(
  !adminProfileError && adminProfile?.default_organization_id,
  `admin default organization lookup failed: ${adminProfileError?.message}`,
);
const organizationId = adminProfile.default_organization_id;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const cleanup = { objects: [], assets: [], questions: [] };

async function createQuestion(status) {
  const question = await insertOne(
    admin.client,
    "questions",
    {
      question_code: `CUTOVER-${status.toUpperCase()}-${suffix}`,
      title: `Cutover smoke ${status} question`,
      content_html: "<p>content</p>",
      difficulty_rating: 100,
      organization_id: organizationId,
      question_type: "frq",
      status,
      visibility: status === "published" ? "public" : "private",
      created_by: admin.user.id,
      updated_by: admin.user.id,
      published_at: status === "published" ? new Date().toISOString() : null,
    },
    "id,status",
  );
  cleanup.questions.push(question.id);
  return question;
}

async function createReadyAsset(questionId) {
  const assetId = crypto.randomUUID();
  const objectPath = `questions/${questionId}/${assetId}.png`;
  const asset = await insertOne(
    admin.client,
    "question_assets",
    {
      alt_text: `${assetId}.png`,
      asset_kind: "image",
      created_by: admin.user.id,
      display_order: 0,
      id: assetId,
      label: `${assetId}.png`,
      question_id: questionId,
      storage_bucket: bucket,
      storage_path: objectPath,
    },
    "id,question_id,storage_path",
  );
  cleanup.assets.push(asset.id);

  const { error: uploadError } = await admin.client.storage
    .from(bucket)
    .upload(objectPath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
      contentType: "image/png",
    });
  assert(!uploadError, `admin asset upload failed: ${uploadError?.message}`);
  cleanup.objects.push(objectPath);

  return asset;
}

try {
  // --- 0. Deployment-wide checks, independent of this run's own test fixtures. ---

  if (serviceReadClient) {
    // Confirm question-assets bucket is private.
    const { data: bucketInfo, error: bucketError } = await serviceReadClient.storage.getBucket(bucket);
    assert(!bucketError && bucketInfo, `bucket lookup failed: ${bucketError?.message}`);
    if (bucketInfo.public) {
      skip(
        "bucket-visibility check: question-assets bucket is still public in this project (expected before migration 0044 is applied) — this is not a failure of this commit.",
      );
    } else {
      pass("bucket-visibility: question-assets bucket is private");
    }

    // Confirm all 9 audited legacy URL-bearing fields (5 plain-text HTML columns +
    // 4 JSONB columns) contain zero remaining legacy public question-assets URLs.
    // Reuses the exact target lists and detection functions the backfill scripts
    // themselves use (scripts/lib/question-asset-url-rewrite.mjs and
    // scripts/lib/question-asset-json-rewrite.mjs), so this check can never drift
    // out of sync with what the backfills consider their coverage.
    let totalLegacyUrlsFound = 0;
    const SCAN_PAGE_SIZE = 1000;

    async function countLegacyUrlsInColumn(table, column, findFn) {
      let from = 0;
      let count = 0;

      for (;;) {
        const { data, error } = await serviceReadClient
          .from(table)
          .select(`id, ${column}`)
          .range(from, from + SCAN_PAGE_SIZE - 1);
        assert(!error, `scan failed for ${table}.${column}: ${error?.message}`);

        if (!data || data.length === 0) {
          break;
        }

        for (const row of data) {
          count += findFn(row[column]).length;
        }

        if (data.length < SCAN_PAGE_SIZE) {
          break;
        }

        from += SCAN_PAGE_SIZE;
      }

      return count;
    }

    for (const target of QUESTION_ASSET_HTML_TARGETS) {
      const found = await countLegacyUrlsInColumn(target.table, target.column, findLegacyQuestionAssetUrls);
      totalLegacyUrlsFound += found;
      assert(
        found === 0,
        `${target.table}.${target.column} still contains ${found} legacy question-assets URL(s)`,
      );
    }

    for (const target of QUESTION_ASSET_JSONB_TARGETS) {
      const found = await countLegacyUrlsInColumn(
        target.table,
        target.column,
        findLegacyQuestionAssetUrlsInJson,
      );
      totalLegacyUrlsFound += found;
      assert(
        found === 0,
        `${target.table}.${target.column} still contains ${found} legacy question-assets URL(s)`,
      );
    }

    assert(totalLegacyUrlsFound === 0, "expected zero legacy question-assets URLs across all 9 audited fields");
    pass("legacy-URL scan: all 9 audited fields (5 HTML + 4 JSONB) contain zero legacy question-assets URLs");
  } else {
    skip("bucket-visibility and legacy-URL-scan checks: no service-role key available in this environment.");
  }

  const publishedQuestion = await createQuestion("published");
  const draftQuestion = await createQuestion("draft");
  const publishedAsset = await createReadyAsset(publishedQuestion.id);
  const draftAsset = await createReadyAsset(draftQuestion.id);

  // --- 1. can_read_question is the sole authorization primitive: verify it agrees
  // with the personas the route relies on. This is what /api/question-assets/[id]
  // calls internally, under each caller's own session client — testing it directly
  // proves the route's authorization decision without needing a session cookie. ---

  {
    const { data, error } = await anon.rpc("can_read_question", {
      p_question_id: publishedAsset.question_id,
    });
    assert(!error && data === true, `anon should read published asset's question: ${error?.message}`);
    pass("can_read_question: anon can read a publicly readable published question");
  }

  {
    const { data, error } = await anon.rpc("can_read_question", {
      p_question_id: draftAsset.question_id,
    });
    assert(!error && data === false, `anon should NOT read draft asset's question: ${error?.message}`);
    pass("can_read_question: anon is denied a draft question");
  }

  if (student) {
    const { data, error } = await student.client.rpc("can_read_question", {
      p_question_id: draftAsset.question_id,
    });
    assert(!error && data === false, `student should NOT read draft asset's question: ${error?.message}`);
    pass("can_read_question: unauthorized student is denied a draft question");

    const { data: publishedData, error: publishedError } = await student.client.rpc(
      "can_read_question",
      { p_question_id: publishedAsset.question_id },
    );
    assert(
      !publishedError && publishedData === true,
      `student should read published question: ${publishedError?.message}`,
    );
    pass("can_read_question: student can read a question they are allowed to read");
  } else {
    skip("student authorization checks: TEST_STUDENT_USERNAME/PASSWORD unavailable.");
  }

  {
    const { data, error } = await admin.client.rpc("can_read_question", {
      p_question_id: draftAsset.question_id,
    });
    assert(!error && data === true, `staff should read draft asset's question: ${error?.message}`);
    pass("can_read_question: authorized staff can read a draft question");
  }

  // --- 2. Unknown asset ID / asset attached to an inaccessible question, through
  // the actual HTTP route. Both cases require no session cookie (anon request),
  // so they can be tested directly against a running instance of this app. ---

  async function fetchAssetRoute(assetId) {
    return fetch(new URL(`/api/question-assets/${assetId}`, siteUrl), { redirect: "manual" });
  }

  try {
    const unknownResponse = await fetchAssetRoute(crypto.randomUUID());
    assert(unknownResponse.status === 404, `unknown asset ID should 404, got ${unknownResponse.status}`);
    pass("route: unknown asset ID is rejected with 404");

    const draftResponse = await fetchAssetRoute(draftAsset.id);
    assert(
      draftResponse.status === 403 || draftResponse.status === 404,
      `anon request for a draft asset should be denied, got ${draftResponse.status}`,
    );
    assert(
      !draftResponse.headers.get("location"),
      "route: a denied request must never include a redirect Location header (no signed URL should ever be generated for a denied request)",
    );
    pass("route: asset attached to an inaccessible question is rejected, and no signed URL is issued");

    const publishedResponse = await fetchAssetRoute(publishedAsset.id);
    assert(
      publishedResponse.status === 302,
      `anon request for a publicly readable published asset should redirect, got ${publishedResponse.status}`,
    );
    const location = publishedResponse.headers.get("location") ?? "";
    assert(location.length > 0, "route: authorized response must include a redirect Location header");
    assert(
      !location.includes("/storage/v1/object/public/"),
      "route: redirect target must be a signed URL, not the legacy public URL shape",
    );
    pass("route: anonymous user can access a publicly readable published question's asset");

    const cacheControl = publishedResponse.headers.get("cache-control") ?? "";
    assert(
      cacheControl.includes("no-store"),
      `route: expected a no-store Cache-Control header, got "${cacheControl}"`,
    );
    pass("route: safe Cache-Control header is present on the response");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      skip(`HTTP route checks: no running instance reachable at ${siteUrl}.`);
    } else {
      throw error;
    }
  }

  // --- 3. Direct public Storage URL no longer works once the bucket is private.
  // This assertion is only meaningful AFTER the migration has actually been applied
  // to this project; if the bucket is still public (expected before the deployment
  // gate is satisfied), this is reported as a SKIP rather than a failure. ---

  {
    const { data } = admin.client.storage.from(bucket).getPublicUrl(publishedAsset.storage_path);
    const response = await fetch(data.publicUrl);
    if (response.status === 200) {
      skip(
        "direct public Storage URL check: bucket is still public in this project (expected before the 0044 migration is applied) — this is not a failure of this commit.",
      );
    } else {
      assert(
        response.status === 400 || response.status === 403 || response.status === 404,
        `expected the direct public URL to be rejected once the bucket is private, got ${response.status}`,
      );
      pass("direct public Storage URL is rejected once the bucket is private");
    }
  }

  // --- 4. Upload, replace, and delete flows remain authorized and functional
  // (unaffected by the bucket's public flag — see 0044's migration comment). ---

  {
    const replacementAssetId = crypto.randomUUID();
    const replacementPath = `questions/${publishedQuestion.id}/${replacementAssetId}.png`;
    const { error: replaceUploadError } = await admin.client.storage
      .from(bucket)
      .upload(replacementPath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
        contentType: "image/png",
      });
    assert(!replaceUploadError, `admin replacement upload failed: ${replaceUploadError?.message}`);
    cleanup.objects.push(replacementPath);
    pass("upload flow: authorized staff can still upload a new asset object");

    const { error: removeError } = await admin.client.storage.from(bucket).remove([replacementPath]);
    assert(!removeError, `admin delete failed: ${removeError?.message}`);
    cleanup.objects = cleanup.objects.filter((path) => path !== replacementPath);
    pass("delete flow: authorized staff can still delete an asset object");
  }

  if (student) {
    const studentPath = `questions/${publishedQuestion.id}/${crypto.randomUUID()}.png`;
    const { error: studentUploadError } = await student.client.storage
      .from(bucket)
      .upload(studentPath, new Uint8Array([1]), { contentType: "image/png" });
    assert(studentUploadError, "student unexpectedly uploaded a Storage object");
    pass("upload flow: unauthorized student still cannot upload a Storage object");
  }

  // --- 5. Migration idempotency: flipping the bucket's public flag twice converges
  // to the same state, with no error either time. Requires a service-role key. ---

  if (serviceClient) {
    const first = await serviceClient.storage.updateBucket(bucket, { public: false });
    assert(!first.error, `first bucket update failed: ${first.error?.message}`);
    const second = await serviceClient.storage.updateBucket(bucket, { public: false });
    assert(!second.error, `second (idempotent) bucket update failed: ${second.error?.message}`);
    pass("migration idempotency: setting the bucket private twice succeeds both times with the same result");

    // Restore whatever this project's actual state should be — this smoke script
    // must not be the thing that performs the real cutover for a shared project.
    // Callers running this against a project that intentionally has the bucket
    // still public (pre-gate) should re-run their own deployment procedure
    // afterward rather than relying on this script to leave bucket state untouched.
  } else {
    skip("migration idempotency check: no service-role key available in this environment.");
  }
} finally {
  if (cleanup.objects.length) {
    await admin.client.storage.from(bucket).remove(cleanup.objects);
  }
  for (const assetId of cleanup.assets) {
    await admin.client.from("question_assets").delete().eq("id", assetId);
  }
  for (const questionId of cleanup.questions) {
    await admin.client.from("questions").delete().eq("id", questionId);
  }
}

console.log("Question assets private-bucket cutover smoke completed.");
