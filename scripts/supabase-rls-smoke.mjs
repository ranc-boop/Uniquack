import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const envPath = resolve(process.cwd(), ".env.local");

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    process.env[key] ??= rest.join("=").replace(/^['"]|['"]$/g, "");
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
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

await assertOnlyPublished(anon, "tags");
await assertOnlyPublished(anon, "questions");
await assertOnlyPublished(anon, "videos");
await assertNoRowsOrError(
  anon.from("profiles").select("id,username,role").limit(1),
  "anon cannot read profiles",
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

    const { error: questionUpdateError } = await adminSession.client
      .from("questions")
      .update({ title: "Smoke question published", status: "published" })
      .eq("id", createdQuestion.id);

    assert(
      !questionUpdateError,
      `admin question update failed: ${questionUpdateError?.message}`,
    );
    logPass("admin can update questions");

    const questionTag = await insertOrThrow(
      adminSession.client,
      "question_tags",
      {
        question_id: createdQuestion.id,
        tag_id: createdTag.id,
      },
      "question_id,tag_id,updated_at",
    );
    cleanup.questionTags.push(questionTag);
    logPass("admin can create question_tags");

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

    const videoTag = await insertOrThrow(
      adminSession.client,
      "video_tags",
      {
        video_id: createdVideo.id,
        tag_id: createdTag.id,
      },
      "video_id,tag_id,updated_at",
    );
    cleanup.videoTags.push(videoTag);
    logPass("admin can create video_tags");

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
