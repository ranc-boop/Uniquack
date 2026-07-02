import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    if (
      message.includes("Missing ") ||
      message.includes("Invalid login credentials")
    ) {
      console.warn(
        `SKIP student-specific asset checks: ${usernameEnv}/${passwordEnv} is unavailable in this environment.`,
      );
      return null;
    }

    throw error;
  }
}

async function insertOne(client, table, payload, select = "*") {
  const { data, error } = await client
    .from(table)
    .insert(payload)
    .select(select)
    .single();

  assert(!error && data, `${table} insert failed: ${error?.message}`);
  return data;
}

async function assertDeniedOrNoEffect(query, verify, label) {
  const { error } = await query;
  const safe = await verify();
  assert(error || safe, `${label} unexpectedly succeeded`);
  pass(label);
}

const anon = createClient(supabaseUrl, supabaseAnonKey);
const admin = await signIn("TEST_ADMIN_USERNAME", "TEST_ADMIN_PASSWORD");
const student = await optionalSignIn(
  "TEST_STUDENT_USERNAME",
  "TEST_STUDENT_PASSWORD",
);
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
const cleanup = {
  objects: [],
  assets: [],
  questions: [],
};

try {
  const draftQuestion = await insertOne(
    admin.client,
    "questions",
    {
      question_code: `SEC-DRAFT-${suffix}`,
      title: "Security smoke draft question",
      content_html: "<p>Draft</p>",
      difficulty_rating: 100,
      organization_id: organizationId,
      question_type: "frq",
      status: "draft",
      created_by: admin.user.id,
      updated_by: admin.user.id,
    },
    "id",
  );
  cleanup.questions.push(draftQuestion.id);

  const publishedQuestion = await insertOne(
    admin.client,
    "questions",
    {
      question_code: `SEC-PUB-${suffix}`,
      title: "Security smoke published question",
      content_html: "<p>Published</p>",
      difficulty_rating: 100,
      organization_id: organizationId,
      question_type: "frq",
      status: "published",
      created_by: admin.user.id,
      updated_by: admin.user.id,
      published_at: new Date().toISOString(),
    },
    "id",
  );
  cleanup.questions.push(publishedQuestion.id);

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
      "id,storage_path",
    );
    cleanup.assets.push(asset.id);

    const { error: uploadError } = await admin.client.storage
      .from(bucket)
      .upload(
        objectPath,
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        { contentType: "image/png" },
    );
    assert(!uploadError, `admin asset upload failed: ${uploadError?.message}`);
    cleanup.objects.push(objectPath);

    return asset;
  }

  const draftAsset = await createReadyAsset(draftQuestion.id);
  const publishedAsset = await createReadyAsset(publishedQuestion.id);

  async function publicUrlStatus(objectPath) {
    const { data } = admin.client.storage.from(bucket).getPublicUrl(objectPath);
    return (await fetch(data.publicUrl)).status;
  }

  const draftAssetStatus = await publicUrlStatus(draftAsset.storage_path);
  if (draftAssetStatus === 200) {
    console.warn(
      "RISK public bucket URLs remain directly readable when known, including draft assets",
    );
  }

  const { data: anonVisibleAssets, error: anonVisibleError } = await anon
    .from("question_assets")
    .select("id")
    .in("id", [draftAsset.id, publishedAsset.id]);
  assert(!anonVisibleError, `anon asset query failed: ${anonVisibleError?.message}`);
  assert(
    anonVisibleAssets?.length === 1 &&
      anonVisibleAssets[0].id === publishedAsset.id,
    "anon asset visibility boundary is incorrect",
  );
  pass("anon only discovers assets for published questions");

  if (student) {
    const { data: studentVisibleAssets, error: studentVisibleError } =
      await student.client
        .from("question_assets")
        .select("id")
        .in("id", [draftAsset.id, publishedAsset.id]);
    assert(
      !studentVisibleError &&
        studentVisibleAssets?.length === 1 &&
        studentVisibleAssets[0].id === publishedAsset.id,
      "student asset visibility boundary is incorrect",
    );
    pass("student only discovers published question assets");
  }

  await assertDeniedOrNoEffect(
    anon.from("question_assets").insert({
      alt_text: "anon.png",
      asset_kind: "image",
      display_order: 0,
      label: "anon.png",
      question_id: publishedQuestion.id,
      created_by: admin.user.id,
      storage_bucket: bucket,
      storage_path: `questions/${publishedQuestion.id}/${crypto.randomUUID()}.png`,
    }),
    async () => true,
    "anon cannot forge question asset records",
  );

  if (student) {
    await assertDeniedOrNoEffect(
      student.client
        .from("question_assets")
        .update({ label: "student-mutated.png" })
        .eq("id", publishedAsset.id),
      async () => {
        const { data } = await admin.client
          .from("question_assets")
          .select("label")
          .eq("id", publishedAsset.id)
          .single();
        return data?.label !== "student-mutated.png";
      },
      "student cannot mutate question asset metadata",
    );

    await assertDeniedOrNoEffect(
      student.client
        .from("question_assets")
        .delete()
        .eq("id", publishedAsset.id),
      async () => {
        const { data } = await admin.client
          .from("question_assets")
          .select("id")
          .eq("id", publishedAsset.id)
          .maybeSingle();
        return Boolean(data);
      },
      "student cannot delete question asset records",
    );
  }

  const illegalPath = `questions/${publishedQuestion.id}/${crypto.randomUUID()}.png`;
  const { error: illegalPathUploadError } = await admin.client.storage
    .from(bucket)
    .upload(illegalPath, new Uint8Array([1]), { contentType: "image/png" });
  assert(illegalPathUploadError, "admin unexpectedly uploaded without reservation");
  pass("admin cannot upload Storage objects without pending asset reservation");

  if (student) {
    const studentPath = `questions/${publishedQuestion.id}/${crypto.randomUUID()}.png`;
    const { error: studentUploadError } = await student.client.storage
      .from(bucket)
      .upload(studentPath, new Uint8Array([1]), { contentType: "image/png" });
    assert(studentUploadError, "student unexpectedly uploaded Storage object");
    pass("student cannot upload Storage objects");

    const { error: studentDeleteError } = await student.client.storage
      .from(bucket)
      .remove([publishedAsset.storage_path]);
    const shownPublishedDirectory = `questions/${publishedQuestion.id}`;
    const {
      data: objectsAfterStudentDelete,
      error: objectsAfterStudentDeleteError,
    } = await admin.client.storage
      .from(bucket)
      .list(shownPublishedDirectory, { search: publishedAsset.id });
    assert(
      !objectsAfterStudentDeleteError &&
        objectsAfterStudentDelete?.some((object) =>
          object.name.includes(publishedAsset.id),
        ),
      "student deleted Storage object",
    );
    pass(
      studentDeleteError
        ? "student cannot delete Storage objects"
        : "student Storage delete is a no-op under RLS",
    );
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

console.log("Question asset security smoke completed.");
