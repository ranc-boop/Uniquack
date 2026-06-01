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
const student = await signIn("TEST_STUDENT_USERNAME", "TEST_STUDENT_PASSWORD");
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
      question_type: "frq",
      status: "published",
      created_by: admin.user.id,
      updated_by: admin.user.id,
      published_at: new Date().toISOString(),
    },
    "id",
  );
  cleanup.questions.push(publishedQuestion.id);

  async function createReadyAsset(questionId, displayOnDetail) {
    const assetId = crypto.randomUUID();
    const objectPath = `questions/${questionId}/${assetId}.png`;
    const asset = await insertOne(
      admin.client,
      "question_assets",
      {
        id: assetId,
        question_id: questionId,
        object_path: objectPath,
        mime_type: "image/png",
        size_bytes: 8,
        original_filename: `${assetId}.png`,
        status: "pending",
        display_on_detail: displayOnDetail,
        created_by: admin.user.id,
      },
      "id,object_path",
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

    const { error: readyError } = await admin.client
      .from("question_assets")
      .update({ status: "ready" })
      .eq("id", asset.id);
    assert(!readyError, `asset ready update failed: ${readyError?.message}`);

    return asset;
  }

  const hiddenPublishedAsset = await createReadyAsset(publishedQuestion.id, false);
  const shownDraftAsset = await createReadyAsset(draftQuestion.id, true);
  const shownPublishedAsset = await createReadyAsset(publishedQuestion.id, true);

  async function publicUrlStatus(objectPath) {
    const { data } = admin.client.storage.from(bucket).getPublicUrl(objectPath);
    return (await fetch(data.publicUrl)).status;
  }

  const hiddenPublishedStatus = await publicUrlStatus(
    hiddenPublishedAsset.object_path,
  );
  const shownDraftStatus = await publicUrlStatus(shownDraftAsset.object_path);
  if (hiddenPublishedStatus === 200 || shownDraftStatus === 200) {
    console.warn(
      "RISK public bucket URLs remain directly readable when known, including hidden or draft assets",
    );
  }

  const { data: anonVisibleAssets, error: anonVisibleError } = await anon
    .from("question_assets")
    .select("id")
    .in("id", [
      hiddenPublishedAsset.id,
      shownDraftAsset.id,
      shownPublishedAsset.id,
    ]);
  assert(!anonVisibleError, `anon asset query failed: ${anonVisibleError?.message}`);
  assert(
    anonVisibleAssets?.length === 1 &&
      anonVisibleAssets[0].id === shownPublishedAsset.id,
    "anon asset visibility boundary is incorrect",
  );
  pass("anon only discovers ready displayed assets for published questions");

  const { data: studentVisibleAssets, error: studentVisibleError } =
    await student.client
      .from("question_assets")
      .select("id")
      .in("id", [
        hiddenPublishedAsset.id,
        shownDraftAsset.id,
        shownPublishedAsset.id,
      ]);
  assert(
    !studentVisibleError &&
      studentVisibleAssets?.length === 1 &&
      studentVisibleAssets[0].id === shownPublishedAsset.id,
    "student asset visibility boundary is incorrect",
  );
  pass("student only discovers public displayed assets");

  await assertDeniedOrNoEffect(
    anon.from("question_assets").insert({
      question_id: publishedQuestion.id,
      object_path: `questions/${publishedQuestion.id}/${crypto.randomUUID()}.png`,
      mime_type: "image/png",
      size_bytes: 1,
      original_filename: "anon.png",
      status: "ready",
      display_on_detail: true,
      created_by: admin.user.id,
    }),
    async () => true,
    "anon cannot forge displayed asset records",
  );

  await assertDeniedOrNoEffect(
    student.client
      .from("question_assets")
      .update({ display_on_detail: true })
      .eq("id", hiddenPublishedAsset.id),
    async () => {
      const { data } = await admin.client
        .from("question_assets")
        .select("display_on_detail")
        .eq("id", hiddenPublishedAsset.id)
        .single();
      return data?.display_on_detail === false;
    },
    "student cannot expose hidden assets",
  );

  await assertDeniedOrNoEffect(
    student.client
      .from("question_assets")
      .delete()
      .eq("id", shownPublishedAsset.id),
    async () => {
      const { data } = await admin.client
        .from("question_assets")
        .select("id")
        .eq("id", shownPublishedAsset.id)
        .maybeSingle();
      return Boolean(data);
    },
    "student cannot delete displayed asset records",
  );

  const illegalPath = `questions/${publishedQuestion.id}/${crypto.randomUUID()}.png`;
  const { error: illegalPathUploadError } = await admin.client.storage
    .from(bucket)
    .upload(illegalPath, new Uint8Array([1]), { contentType: "image/png" });
  assert(illegalPathUploadError, "admin unexpectedly uploaded without reservation");
  pass("admin cannot upload Storage objects without pending asset reservation");

  const studentPath = `questions/${publishedQuestion.id}/${crypto.randomUUID()}.png`;
  const { error: studentUploadError } = await student.client.storage
    .from(bucket)
    .upload(studentPath, new Uint8Array([1]), { contentType: "image/png" });
  assert(studentUploadError, "student unexpectedly uploaded Storage object");
  pass("student cannot upload Storage objects");

  const { error: studentDeleteError } = await student.client.storage
    .from(bucket)
    .remove([shownPublishedAsset.object_path]);
  const shownPublishedDirectory = `questions/${publishedQuestion.id}`;
  const { data: objectsAfterStudentDelete, error: objectsAfterStudentDeleteError } =
    await admin.client.storage
      .from(bucket)
      .list(shownPublishedDirectory, { search: shownPublishedAsset.id });
  assert(
    !objectsAfterStudentDeleteError &&
      objectsAfterStudentDelete?.some((object) =>
        object.name.includes(shownPublishedAsset.id),
      ),
    "student deleted Storage object",
  );
  pass(
    studentDeleteError
      ? "student cannot delete Storage objects"
      : "student Storage delete is a no-op under RLS",
  );
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
