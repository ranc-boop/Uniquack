import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// 动态计算项目根目录下 .env.local 的绝对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const envPath = resolve(projectRoot, ".env.local");

// 前置加载环境变量
dotenv.config({ path: envPath });

// 前置核心变量声明
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 健壮性校验
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "【错误】当前绝对路径下未找到环境变量，路径为:",
    envPath
  );
  console.error("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl);
  console.error("NEXT_PUBLIC_SUPABASE_ANON_KEY:", supabaseAnonKey);
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

function usernameToEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function logPass(message) {
  console.log(`PASS ${message}`);
}

function logSkip(message) {
  console.log(`SKIP ${message}`);
}

function isMissingMigrationError(error) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`;

  return /question_source_files|question-source-files|schema cache|could not find|does not exist|bucket not found|not found/i.test(
    text,
  );
}

function nowSlug(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function signIn(usernameEnv, passwordEnv) {
  const username = process.env[usernameEnv];
  const password = process.env[passwordEnv];

  if (!username || !password) {
    return null;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error) {
    throw new Error(`${usernameEnv} sign-in failed: ${error.message}`);
  }

  return { client, user: data.user };
}

async function assertOnlyPublished(client, table) {
  const { data, error } = await client.from(table).select("id,status").limit(100);

  if (error) {
    throw new Error(`${table} read failed: ${error.message}`);
  }

  assert(
    (data ?? []).every((row) => row.status === "published"),
    `${table} exposed non-published rows`,
  );
  logPass(`${table} exposes only published rows`);
}

async function assertInsertDenied(client, table, payload, label) {
  const { error } = await client.from(table).insert(payload);
  assert(error, `${label} unexpectedly inserted into ${table}`);
  logPass(`${label} cannot insert into ${table}`);
}

async function assertNoRowsOrError(queryPromise, label) {
  const { data, error } = await queryPromise;

  assert(error || !data?.length, `${label} unexpectedly returned rows`);
  logPass(label);
}

async function assertUpdateDeniedOrNoEffect({
  actor,
  actorLabel,
  adminClient,
  table,
  match,
  update,
  verifySelect = "*",
  verify,
}) {
  const { error } = await actor.from(table).update(update).match(match);
  const { data, error: verifyError } = await adminClient
    .from(table)
    .select(verifySelect)
    .match(match)
    .maybeSingle();

  assert(!verifyError, `${actorLabel} ${table} verify failed`);
  assert(error || verify(data), `${actorLabel} unexpectedly updated ${table}`);
  logPass(`${actorLabel} cannot update ${table}`);
}

async function assertDeleteDeniedOrNoEffect({
  actor,
  actorLabel,
  adminClient,
  table,
  match,
}) {
  const { error } = await actor.from(table).delete().match(match);
  const { data, error: verifyError } = await adminClient
    .from(table)
    .select("*")
    .match(match)
    .maybeSingle();

  assert(!verifyError, `${actorLabel} ${table} delete verify failed`);
  assert(error || data, `${actorLabel} unexpectedly deleted from ${table}`);
  logPass(`${actorLabel} cannot delete from ${table}`);
}

async function insertOrThrow(client, table, payload, select = "*") {
  const { data, error } = await client
    .from(table)
    .insert(payload)
    .select(select)
    .single();

  assert(!error && data, `${table} insert failed: ${error?.message}`);
  return data;
}

const anon = createClient(supabaseUrl, supabaseAnonKey);
const questionAssetsBucket = "question-assets";
const questionSourceFilesBucket = "question-source-files";

await assertOnlyPublished(anon, "tags");
await assertOnlyPublished(anon, "questions");
await assertOnlyPublished(anon, "videos");
await assertNoRowsOrError(
  anon.from("profiles").select("id,username,role").limit(1),
  "anon cannot read profiles",
);
await assertNoRowsOrError(
  anon
    .from("question_assets")
    .select("id,question_id,display_on_detail")
    .eq("display_on_detail", false)
    .limit(1),
  "anon cannot read hidden question assets",
);
await assertInsertDenied(
  anon,
  "tags",
  {
    name: "Anon blocked smoke tag",
    slug: `anon-blocked-${Date.now()}`,
    tag_type: "attribute",
    status: "published",
  },
  "anon",
);

const studentSession = await signIn(
  "TEST_STUDENT_USERNAME",
  "TEST_STUDENT_PASSWORD",
);

if (studentSession) {
  await assertOnlyPublished(studentSession.client, "tags");
  await assertOnlyPublished(studentSession.client, "questions");
  await assertOnlyPublished(studentSession.client, "videos");
  await assertNoRowsOrError(
    studentSession.client
      .from("profiles")
      .select("id,username,role")
      .neq("id", studentSession.user.id)
      .limit(10),
    "student cannot read other users' profiles",
  );
  await assertInsertDenied(
    studentSession.client,
    "tags",
    {
      name: "Student blocked smoke tag",
      slug: `student-blocked-${Date.now()}`,
      tag_type: "attribute",
      status: "published",
    },
    "student",
  );
  await assertInsertDenied(
    studentSession.client,
    "user_question_attempts",
    {
      user_id: studentSession.user.id,
      question_id: "00000000-0000-0000-0000-000000000000",
    },
    "student MVP",
  );
  await assertInsertDenied(
    studentSession.client,
    "question_assets",
    {
      question_id: "00000000-0000-0000-0000-000000000000",
      object_path: `questions/blocked/${crypto.randomUUID()}.png`,
      mime_type: "image/png",
      size_bytes: 1,
      original_filename: "student-blocked.png",
      created_by: studentSession.user.id,
    },
    "student",
  );
} else {
  logSkip("student checks; set TEST_STUDENT_USERNAME and TEST_STUDENT_PASSWORD");
}

const adminSession = await signIn("TEST_ADMIN_USERNAME", "TEST_ADMIN_PASSWORD");

if (adminSession) {
  const cleanup = {
    videoTags: [],
    questionTags: [],
    videos: [],
    questions: [],
    questionAssets: [],
    questionSourceFiles: [],
    sourceStorageObjects: [],
    storageObjects: [],
    tags: [],
  };

  try {
    const createdTag = await insertOrThrow(
      adminSession.client,
      "tags",
      {
        name: "Admin smoke tag",
        slug: nowSlug("admin-smoke-tag"),
        tag_type: "knowledge",
        status: "draft",
      },
      "id,status,slug",
    );
    cleanup.tags.push(createdTag.id);
    logPass("admin can create tags");

    const { error: tagUpdateError } = await adminSession.client
      .from("tags")
      .update({ status: "published" })
      .eq("id", createdTag.id);

    assert(!tagUpdateError, `admin tag update failed: ${tagUpdateError?.message}`);
    logPass("admin can update tags");

    const secondaryTag = await insertOrThrow(
      adminSession.client,
      "tags",
      {
        name: "Admin smoke secondary tag",
        slug: nowSlug("admin-smoke-secondary-tag"),
        tag_type: "attribute",
        status: "published",
      },
      "id,status,slug",
    );
    cleanup.tags.push(secondaryTag.id);

    const multiTagA = await insertOrThrow(
      adminSession.client,
      "tags",
      {
        name: "Admin smoke multi tag A",
        slug: nowSlug("admin-smoke-multi-tag-a"),
        tag_type: "knowledge",
        status: "published",
      },
      "id,status,slug",
    );
    cleanup.tags.push(multiTagA.id);

    const multiTagB = await insertOrThrow(
      adminSession.client,
      "tags",
      {
        name: "Admin smoke multi tag B",
        slug: nowSlug("admin-smoke-multi-tag-b"),
        tag_type: "attribute",
        status: "published",
      },
      "id,status,slug",
    );
    cleanup.tags.push(multiTagB.id);

    const createdQuestion = await insertOrThrow(
      adminSession.client,
      "questions",
      {
        question_code: `SMOKE-${Date.now()}`,
        title: "Smoke question draft",
        content_html: "<p>Smoke question</p>",
        difficulty_rating: 420,
        question_type: "frq",
        status: "draft",
      },
      "id,title,status",
    );
    cleanup.questions.push(createdQuestion.id);
    logPass("admin can create questions");

    const assetId = crypto.randomUUID();
    const assetPath = `questions/${createdQuestion.id}/${assetId}.png`;
    const createdQuestionAsset = await insertOrThrow(
      adminSession.client,
      "question_assets",
      {
        id: assetId,
        question_id: createdQuestion.id,
        object_path: assetPath,
        mime_type: "image/png",
        size_bytes: 8,
        original_filename: "admin-smoke.png",
        status: "pending",
        created_by: adminSession.user.id,
      },
      "id,question_id,object_path,status",
    );
    cleanup.questionAssets.push(createdQuestionAsset.id);

    const { error: storageUploadError } = await adminSession.client.storage
      .from(questionAssetsBucket)
      .upload(assetPath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
        contentType: "image/png",
      });

    assert(!storageUploadError, `admin storage upload failed: ${storageUploadError?.message}`);
    cleanup.storageObjects.push(assetPath);
    logPass("admin can upload question assets");

    const { error: assetReadyError } = await adminSession.client
      .from("question_assets")
      .update({ status: "ready" })
      .eq("id", createdQuestionAsset.id);

    assert(!assetReadyError, `admin question asset update failed: ${assetReadyError?.message}`);
    logPass("admin can finalize question assets");

    const { data: hiddenAnonAssets, error: hiddenAnonAssetsError } = await anon
      .from("question_assets")
      .select("id")
      .eq("id", createdQuestionAsset.id);

    assert(
      !hiddenAnonAssetsError && hiddenAnonAssets?.length === 0,
      "anon unexpectedly read a hidden question asset",
    );
    logPass("anon cannot read hidden question assets");

    const { data: publicAssetUrl } = adminSession.client.storage
      .from(questionAssetsBucket)
      .getPublicUrl(assetPath);
    const publicAssetResponse = await fetch(publicAssetUrl.publicUrl);

    assert(publicAssetResponse.ok, "public question asset URL was not readable");
    logPass("question asset public URL is readable");

    const sourceFileId = crypto.randomUUID();
    const sourceFilePath = `questions/${createdQuestion.id}/${sourceFileId}.pdf`;
    const { data: createdSourceFile, error: sourceFileInsertError } =
      await adminSession.client
        .from("question_source_files")
        .insert({
          id: sourceFileId,
          question_id: createdQuestion.id,
          object_path: sourceFilePath,
          mime_type: "application/pdf",
          size_bytes: 8,
          original_filename: "admin-smoke.pdf",
          status: "pending",
          created_by: adminSession.user.id,
        })
        .select("id,question_id,object_path,status")
        .single();

    if (sourceFileInsertError) {
      if (isMissingMigrationError(sourceFileInsertError)) {
        logSkip(
          "question source file RLS checks; apply supabase/migrations/0004_question_source_files.sql",
        );
      } else {
        throw new Error(
          `question_source_files insert failed: ${sourceFileInsertError.message}`,
        );
      }
    } else {
      cleanup.questionSourceFiles.push(createdSourceFile.id);
      logPass("admin can create question source file records");

      const { error: sourceStorageUploadError } =
        await adminSession.client.storage
          .from(questionSourceFilesBucket)
          .upload(
            sourceFilePath,
            new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]),
            { contentType: "application/pdf" },
          );

      if (sourceStorageUploadError) {
        if (isMissingMigrationError(sourceStorageUploadError)) {
          logSkip(
            "question source file storage checks; apply supabase/migrations/0004_question_source_files.sql",
          );
        } else {
          throw new Error(
            `admin source file upload failed: ${sourceStorageUploadError.message}`,
          );
        }
      } else {
        cleanup.sourceStorageObjects.push(sourceFilePath);
        logPass("admin can upload private question source files");

        const { error: sourceReadyError } = await adminSession.client
          .from("question_source_files")
          .update({ status: "ready" })
          .eq("id", createdSourceFile.id);

        assert(
          !sourceReadyError,
          `admin source file update failed: ${sourceReadyError?.message}`,
        );
        logPass("admin can finalize question source files");

        const { data: signedSourceUrl, error: signedSourceUrlError } =
          await adminSession.client.storage
            .from(questionSourceFilesBucket)
            .createSignedUrl(sourceFilePath, 60);

        assert(
          !signedSourceUrlError && signedSourceUrl?.signedUrl,
          `admin source file signed URL failed: ${signedSourceUrlError?.message}`,
        );
        const sourceFileResponse = await fetch(signedSourceUrl.signedUrl);

        assert(sourceFileResponse.ok, "private source file signed URL failed");
        logPass("admin can read source files with a signed URL");

        await assertNoRowsOrError(
          anon
            .from("question_source_files")
            .select("id")
            .eq("id", createdSourceFile.id),
          "anon cannot read question source files",
        );
        await assertDeleteDeniedOrNoEffect({
          actor: anon,
          actorLabel: "anon",
          adminClient: adminSession.client,
          table: "question_source_files",
          match: { id: createdSourceFile.id },
        });

        const { error: anonSourceStorageUploadError } = await anon.storage
          .from(questionSourceFilesBucket)
          .upload(
            `questions/${createdQuestion.id}/${crypto.randomUUID()}.pdf`,
            new Uint8Array([37, 80, 68, 70, 45]),
            { contentType: "application/pdf" },
          );

        assert(
          anonSourceStorageUploadError,
          "anon unexpectedly uploaded a question source file",
        );
        logPass("anon cannot upload question source files");

        const { error: anonSourceStorageDeleteError } = await anon.storage
          .from(questionSourceFilesBucket)
          .remove([sourceFilePath]);
        const sourceDirectory = `questions/${createdQuestion.id}`;
        const { data: sourceObjectsAfterAnonDelete, error: sourceListError } =
          await adminSession.client.storage
            .from(questionSourceFilesBucket)
            .list(sourceDirectory, { search: sourceFileId });

        assert(
          !sourceListError &&
            sourceObjectsAfterAnonDelete?.some((object) =>
              object.name.includes(sourceFileId),
            ),
          "anon deleted a question source file",
        );
        logPass(
          anonSourceStorageDeleteError
            ? "anon cannot delete question source files"
            : "anon source file delete is a no-op under RLS",
        );

        if (studentSession) {
          await assertInsertDenied(
            studentSession.client,
            "question_source_files",
            {
              question_id: createdQuestion.id,
              object_path: `questions/${createdQuestion.id}/${crypto.randomUUID()}.pdf`,
              mime_type: "application/pdf",
              size_bytes: 8,
              original_filename: "student-blocked.pdf",
              status: "pending",
              created_by: studentSession.user.id,
            },
            "student",
          );

          const { error: studentSourceStorageUploadError } =
            await studentSession.client.storage
              .from(questionSourceFilesBucket)
              .upload(
                `questions/${createdQuestion.id}/${crypto.randomUUID()}.pdf`,
                new Uint8Array([37, 80, 68, 70, 45]),
                { contentType: "application/pdf" },
              );

          assert(
            studentSourceStorageUploadError,
            "student unexpectedly uploaded a question source file",
          );
          logPass("student cannot upload question source files");

          await assertUpdateDeniedOrNoEffect({
            actor: studentSession.client,
            actorLabel: "student",
            adminClient: adminSession.client,
            table: "question_source_files",
            match: { id: createdSourceFile.id },
            update: { status: "deleted" },
            verifySelect: "status",
            verify: (row) => row?.status === "ready",
          });
          await assertDeleteDeniedOrNoEffect({
            actor: studentSession.client,
            actorLabel: "student",
            adminClient: adminSession.client,
            table: "question_source_files",
            match: { id: createdSourceFile.id },
          });
        }
      }
    }

    const { error: questionUpdateError } = await adminSession.client
      .from("questions")
      .update({ title: "Smoke question published", status: "published" })
      .eq("id", createdQuestion.id);

    assert(
      !questionUpdateError,
      `admin question update failed: ${questionUpdateError?.message}`,
    );
    logPass("admin can update questions");

    const { error: assetDisplayError } = await adminSession.client
      .from("question_assets")
      .update({ display_on_detail: true })
      .eq("id", createdQuestionAsset.id);

    assert(!assetDisplayError, `admin asset display update failed: ${assetDisplayError?.message}`);
    logPass("admin can show question assets on detail pages");

    const { data: displayedAnonAssets, error: displayedAnonAssetsError } =
      await anon
        .from("question_assets")
        .select("id,display_on_detail")
        .eq("id", createdQuestionAsset.id);

    assert(
      !displayedAnonAssetsError &&
        displayedAnonAssets?.length === 1 &&
        displayedAnonAssets[0].display_on_detail,
      "anon could not read the displayed question asset",
    );
    logPass("anon can read displayed assets for published questions");

    const multiQuestionTagPayload = [createdTag.id, multiTagA.id, multiTagB.id].map(
      (tagId) => ({
        question_id: createdQuestion.id,
        tag_id: tagId,
      }),
    );
    const { data: questionTags, error: questionTagsError } =
      await adminSession.client
        .from("question_tags")
        .insert(multiQuestionTagPayload)
        .select("question_id,tag_id,updated_at");

    assert(
      !questionTagsError && questionTags?.length === 3,
      `admin multi question_tags insert failed: ${questionTagsError?.message}`,
    );
    cleanup.questionTags.push(...questionTags);
    logPass("admin can create multiple question_tags");

    const { data: loadedQuestionTags, error: loadedQuestionTagsError } =
      await adminSession.client
        .from("question_tags")
        .select("question_id,tag_id")
        .eq("question_id", createdQuestion.id);

    assert(
      !loadedQuestionTagsError && loadedQuestionTags?.length === 3,
      "admin multi question_tags row count mismatch",
    );
    logPass("question can have multiple question_tags rows");

    const createdVideo = await insertOrThrow(
      adminSession.client,
      "videos",
      {
        question_id: createdQuestion.id,
        title: "Smoke video draft",
        video_url: "https://example.com/watch/smoke",
        embed_url: "https://example.com/embed/smoke",
        provider: "example",
        status: "draft",
      },
      "id,title,status,question_id",
    );
    cleanup.videos.push(createdVideo.id);
    logPass("admin can create videos");

    const { error: videoUpdateError } = await adminSession.client
      .from("videos")
      .update({ title: "Smoke video published", status: "published" })
      .eq("id", createdVideo.id);

    assert(!videoUpdateError, `admin video update failed: ${videoUpdateError?.message}`);
    logPass("admin can update videos");

    const inheritedVideoTagPayload = (loadedQuestionTags ?? []).map((binding) => ({
      video_id: createdVideo.id,
      tag_id: binding.tag_id,
    }));
    const { data: videoTags, error: videoTagsError } = await adminSession.client
      .from("video_tags")
      .insert(inheritedVideoTagPayload)
      .select("video_id,tag_id,updated_at");

    assert(
      !videoTagsError && videoTags?.length === 3,
      `admin multi video_tags insert failed: ${videoTagsError?.message}`,
    );
    cleanup.videoTags.push(...videoTags);
    logPass("admin can create multiple video_tags");

    const { data: inheritedVideoTags, error: inheritedVideoTagsError } =
      await adminSession.client
        .from("video_tags")
        .select("video_id,tag_id")
        .eq("video_id", createdVideo.id);

    assert(
      !inheritedVideoTagsError && inheritedVideoTags?.length === 3,
      "video did not inherit multiple question tags",
    );
    logPass("video can inherit multiple question tags");

    const { error: updateRoleError } = await adminSession.client
      .from("profiles")
      .update({ role: "super_admin" })
      .eq("id", adminSession.user.id)
      .select("role");

    assert(updateRoleError, "admin unexpectedly updated profiles.role");
    logPass("admin cannot update profiles.role");

    if (studentSession) {
      await assertInsertDenied(
        studentSession.client,
        "questions",
        {
          question_code: `STUDENT-BLOCKED-${Date.now()}`,
          title: "Student blocked question",
          content_html: "<p>Blocked</p>",
          difficulty_rating: 100,
          question_type: "frq",
          status: "published",
        },
        "student",
      );
      const { error: studentStorageUploadError } =
        await studentSession.client.storage
          .from(questionAssetsBucket)
          .upload(
            `questions/${createdQuestion.id}/${crypto.randomUUID()}.png`,
            new Uint8Array([1]),
            { contentType: "image/png" },
          );

      assert(studentStorageUploadError, "student unexpectedly uploaded a question asset");
      logPass("student cannot upload question assets");
      await assertInsertDenied(
        studentSession.client,
        "videos",
        {
          question_id: createdQuestion.id,
          title: "Student blocked video",
          video_url: "https://example.com/watch/student-blocked",
          embed_url: "https://example.com/embed/student-blocked",
          status: "published",
        },
        "student",
      );
      await assertInsertDenied(
        studentSession.client,
        "question_tags",
        {
          question_id: createdQuestion.id,
          tag_id: secondaryTag.id,
        },
        "student",
      );
      await assertInsertDenied(
        studentSession.client,
        "video_tags",
        {
          video_id: createdVideo.id,
          tag_id: secondaryTag.id,
        },
        "student",
      );

      await assertUpdateDeniedOrNoEffect({
        actor: studentSession.client,
        actorLabel: "student",
        adminClient: adminSession.client,
        table: "questions",
        match: { id: createdQuestion.id },
        update: { title: "Student should not update this" },
        verifySelect: "title",
        verify: (row) => row?.title === "Smoke question published",
      });
      await assertUpdateDeniedOrNoEffect({
        actor: studentSession.client,
        actorLabel: "student",
        adminClient: adminSession.client,
        table: "videos",
        match: { id: createdVideo.id },
        update: { title: "Student should not update this" },
        verifySelect: "title",
        verify: (row) => row?.title === "Smoke video published",
      });
      await assertUpdateDeniedOrNoEffect({
        actor: studentSession.client,
        actorLabel: "student",
        adminClient: adminSession.client,
        table: "question_tags",
        match: {
          question_id: createdQuestion.id,
          tag_id: createdTag.id,
        },
        update: { updated_at: new Date().toISOString() },
        verifySelect: "question_id,tag_id",
        verify: (row) => Boolean(row),
      });
      await assertUpdateDeniedOrNoEffect({
        actor: studentSession.client,
        actorLabel: "student",
        adminClient: adminSession.client,
        table: "video_tags",
        match: {
          video_id: createdVideo.id,
          tag_id: createdTag.id,
        },
        update: { updated_at: new Date().toISOString() },
        verifySelect: "video_id,tag_id",
        verify: (row) => Boolean(row),
      });
      await assertDeleteDeniedOrNoEffect({
        actor: studentSession.client,
        actorLabel: "student",
        adminClient: adminSession.client,
        table: "questions",
        match: { id: createdQuestion.id },
      });
      await assertDeleteDeniedOrNoEffect({
        actor: studentSession.client,
        actorLabel: "student",
        adminClient: adminSession.client,
        table: "videos",
        match: { id: createdVideo.id },
      });
      await assertDeleteDeniedOrNoEffect({
        actor: studentSession.client,
        actorLabel: "student",
        adminClient: adminSession.client,
        table: "question_tags",
        match: {
          question_id: createdQuestion.id,
          tag_id: createdTag.id,
        },
      });
      await assertDeleteDeniedOrNoEffect({
        actor: studentSession.client,
        actorLabel: "student",
        adminClient: adminSession.client,
        table: "video_tags",
        match: {
          video_id: createdVideo.id,
          tag_id: createdTag.id,
        },
      });
    }
  } finally {
    if (cleanup.sourceStorageObjects.length) {
      await adminSession.client.storage
        .from(questionSourceFilesBucket)
        .remove(cleanup.sourceStorageObjects);
    }
    if (cleanup.storageObjects.length) {
      await adminSession.client.storage
        .from(questionAssetsBucket)
        .remove(cleanup.storageObjects);
    }
    for (const id of cleanup.questionSourceFiles) {
      await adminSession.client
        .from("question_source_files")
        .delete()
        .eq("id", id);
    }
    for (const id of cleanup.questionAssets) {
      await adminSession.client.from("question_assets").delete().eq("id", id);
    }
    for (const binding of cleanup.videoTags) {
      await adminSession.client.from("video_tags").delete().match(binding);
    }
    for (const binding of cleanup.questionTags) {
      await adminSession.client.from("question_tags").delete().match(binding);
    }
    for (const id of cleanup.videos) {
      await adminSession.client.from("videos").delete().eq("id", id);
    }
    for (const id of cleanup.questions) {
      await adminSession.client.from("questions").delete().eq("id", id);
    }
    for (const id of cleanup.tags) {
      await adminSession.client.from("tags").delete().eq("id", id);
    }
  }

  logPass("admin can delete smoke questions, videos, tags, and bindings");
} else {
  logSkip("admin checks; set TEST_ADMIN_USERNAME and TEST_ADMIN_PASSWORD");
}

const superAdminSession = await signIn(
  "TEST_SUPER_ADMIN_USERNAME",
  "TEST_SUPER_ADMIN_PASSWORD",
);

if (superAdminSession) {
  const { error } = await superAdminSession.client
    .from("profiles")
    .select("id,username,role")
    .limit(10);

  assert(!error, `super_admin profiles read failed: ${error?.message}`);
  logPass("super_admin can read profiles");
} else {
  logSkip(
    "super_admin checks; set TEST_SUPER_ADMIN_USERNAME and TEST_SUPER_ADMIN_PASSWORD",
  );
}

console.log("RLS smoke test completed.");
