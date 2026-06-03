import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { createBrowserClient } from "@supabase/ssr";
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
  throw new Error("Missing Supabase URL or anon key.");
}

function usernameToEmail(username) {
  return username.includes("@")
    ? username
    : `${username.trim().toLowerCase()}@local.app`;
}

function createClientAndCookieJar() {
  const jar = new Map();
  const client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return jar.get(name);
      },
      set(name, value) {
        jar.set(name, value);
      },
      remove(name) {
        jar.delete(name);
      },
    },
  });

  return { client, jar };
}

async function sessionCookies(usernameEnv, passwordEnv) {
  const username = process.env[usernameEnv];
  const password = process.env[passwordEnv];

  if (!username || !password) {
    throw new Error(`Missing ${usernameEnv} or ${passwordEnv}.`);
  }

  const { client, jar } = createClientAndCookieJar();
  const { error } = await client.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error) {
    throw new Error(`${usernameEnv} sign-in failed: ${error.message}`);
  }

  return [...jar.entries()]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("; ");
}

async function signedInSupabaseClient(usernameEnv, passwordEnv) {
  const username = process.env[usernameEnv];
  const password = process.env[passwordEnv];

  if (!username || !password) {
    throw new Error(`Missing ${usernameEnv} or ${passwordEnv}.`);
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

async function fetchRoute(path, cookie = "") {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });

  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    text: await response.text(),
  };
}

function assertRoute(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS ${message}`);
}

async function insertOne(client, table, payload, select = "*") {
  const { data, error } = await client
    .from(table)
    .insert(payload)
    .select(select)
    .single();

  if (error || !data) {
    throw new Error(`${table} insert failed: ${error?.message}`);
  }

  return data;
}

async function syncVideoTagsFromQuestion(client, videoId, questionId) {
  const { data: questionTags, error: questionTagsError } = await client
    .from("question_tags")
    .select("tag_id")
    .eq("question_id", questionId);

  if (questionTagsError) {
    throw new Error(`question_tags read failed: ${questionTagsError.message}`);
  }

  const tagIds = [...new Set((questionTags ?? []).map((binding) => binding.tag_id))];

  const { error: deleteVideoTagsError } = await client
    .from("video_tags")
    .delete()
    .eq("video_id", videoId);

  if (deleteVideoTagsError) {
    throw new Error(`video_tags sync delete failed: ${deleteVideoTagsError.message}`);
  }

  if (!tagIds.length) {
    return [];
  }

  const { data: videoTags, error: insertVideoTagsError } = await client
    .from("video_tags")
    .insert(
      tagIds.map((tagId) => ({
        video_id: videoId,
        tag_id: tagId,
      })),
    )
    .select("video_id,tag_id");

  if (insertVideoTagsError) {
    throw new Error(`video_tags sync insert failed: ${insertVideoTagsError.message}`);
  }

  return videoTags ?? [];
}

const studentCookie = await sessionCookies(
  "TEST_STUDENT_USERNAME",
  "TEST_STUDENT_PASSWORD",
);
const adminCookie = await sessionCookies(
  "TEST_ADMIN_USERNAME",
  "TEST_ADMIN_PASSWORD",
);
const superAdminCookie = await sessionCookies(
  "TEST_SUPER_ADMIN_USERNAME",
  "TEST_SUPER_ADMIN_PASSWORD",
);

const home = await fetchRoute("/");
const login = await fetchRoute("/auth/login");
const questions = await fetchRoute("/questions?q=AP&min=0&max=1000");
const videos = await fetchRoute("/videos?q=AP&min=0&max=1000");
const signedOutAdmin = await fetchRoute("/admin");
const signedOutReview = await fetchRoute("/admin/review");
const studentAdmin = await fetchRoute("/admin", studentCookie);
const studentReview = await fetchRoute("/admin/review", studentCookie);
const adminHome = await fetchRoute("/admin", adminCookie);
const adminQuestions = await fetchRoute("/admin/questions", adminCookie);
const adminImports = await fetchRoute("/admin/imports", adminCookie);
const adminReview = await fetchRoute("/admin/review", adminCookie);
const adminUsers = await fetchRoute("/admin/users", adminCookie);
const superAdminUsers = await fetchRoute("/admin/users", superAdminCookie);

assertRoute(
  home.status === 200 &&
    home.text.includes("AI-powered AP content management platform"),
  "home renders product positioning",
);
assertRoute(
  login.status === 200 && !login.text.includes('value="/admin"'),
  "normal login does not default students into admin",
);
assertRoute(
  questions.status === 200 &&
    questions.text.includes("Published AP questions") &&
    questions.text.includes("Filter"),
  "questions page renders filters",
);
assertRoute(
  videos.status === 200 &&
    videos.text.includes("Published video explanations") &&
    videos.text.includes("Filter"),
  "videos page renders filters",
);
assertRoute(
  signedOutAdmin.status === 307 &&
    signedOutAdmin.location.includes("/auth/login"),
  "signed out user visiting /admin redirects to login",
);
assertRoute(
  signedOutReview.status === 307 &&
    signedOutReview.location.includes("/auth/login"),
  "signed out user visiting /admin/review redirects to login",
);
assertRoute(
  studentAdmin.status === 307 && studentAdmin.location.includes("/unauthorized"),
  "student visiting /admin redirects to unauthorized",
);
assertRoute(
  studentReview.status === 307 && studentReview.location.includes("/unauthorized"),
  "student visiting /admin/review redirects to unauthorized",
);
assertRoute(
  adminHome.status === 200 &&
    adminHome.text.includes("Create demo records") &&
    adminHome.text.includes("Review Drafts"),
  "admin can access dashboard and Review Drafts nav",
);
assertRoute(
  adminQuestions.status === 200 &&
    adminQuestions.text.includes("Find questions") &&
    adminQuestions.text.includes("Search tags"),
  "admin questions renders filters and checkbox tag picker",
);
assertRoute(
  adminImports.status === 200 &&
    adminImports.text.includes("Manual JSON import") &&
    adminImports.text.includes("Asset references are preserved for review only"),
  "admin can access batch import page",
);
assertRoute(
  adminReview.status === 200 &&
    adminReview.text.includes("Review Drafts") &&
    adminReview.text.includes("Search drafts"),
  "admin can access review dashboard",
);
assertRoute(
  adminUsers.status === 307 && adminUsers.location.includes("/unauthorized"),
  "admin is blocked from /admin/users",
);
assertRoute(
  superAdminUsers.status === 200 && superAdminUsers.text.includes("Update role"),
  "super_admin can access /admin/users",
);

const adminSession = await signedInSupabaseClient(
  "TEST_ADMIN_USERNAME",
  "TEST_ADMIN_PASSWORD",
);
const suffix = `route-multi-${Date.now()}`;
const cleanup = {
  batches: [],
  videoTags: [],
  questionTags: [],
  videos: [],
  questions: [],
  tags: [],
};

try {
  const tagPayloads = [
    {
      name: `Route Multi AP Physics ${suffix}`,
      slug: `route-multi-ap-physics-${suffix}`,
      tag_type: "knowledge",
    },
    {
      name: `Route Multi AP Calculus ${suffix}`,
      slug: `route-multi-ap-calculus-${suffix}`,
      tag_type: "knowledge",
    },
    {
      name: `Route Multi FRQ ${suffix}`,
      slug: `route-multi-frq-${suffix}`,
      tag_type: "attribute",
    },
  ];
  const tags = [];

  for (const payload of tagPayloads) {
    const tag = await insertOne(
      adminSession.client,
      "tags",
      {
        ...payload,
        status: "published",
        created_by: adminSession.user.id,
        updated_by: adminSession.user.id,
      },
      "id,name",
    );
    tags.push(tag);
    cleanup.tags.push(tag.id);
  }

  const question = await insertOne(
    adminSession.client,
    "questions",
    {
      question_code: `ROUTE-MULTI-${Date.now()}`,
      title: `Route multi-tag question ${suffix}`,
      content_html: "<p>Route smoke multi-tag question content.</p>",
      solution_html: "<p>Route smoke multi-tag solution.</p>",
      difficulty_rating: 612,
      question_type: "frq",
      status: "published",
      created_by: adminSession.user.id,
      updated_by: adminSession.user.id,
      published_at: new Date().toISOString(),
    },
    "id,question_code,title",
  );
  cleanup.questions.push(question.id);

  const { data: questionTags, error: questionTagsError } =
    await adminSession.client
      .from("question_tags")
      .insert(
        tags.map((tag) => ({
          question_id: question.id,
          tag_id: tag.id,
        })),
      )
      .select("question_id,tag_id");

  assertRoute(
    !questionTagsError && questionTags?.length === tags.length,
    "admin can create a question with multiple tags",
  );
  cleanup.questionTags.push(...questionTags);

  const draftQuestion = await insertOne(
    adminSession.client,
    "questions",
    {
      question_code: `REVIEW-DRAFT-${Date.now()}`,
      title: `Route review draft ${suffix}`,
      content_html: "<p>Route smoke review draft content.</p>",
      solution_html: null,
      difficulty_rating: 455,
      question_type: "frq",
      status: "draft",
      created_by: adminSession.user.id,
      updated_by: adminSession.user.id,
    },
    "id,question_code,title",
  );
  cleanup.questions.push(draftQuestion.id);

  const { data: draftTags, error: draftTagsError } = await adminSession.client
    .from("question_tags")
    .insert([{ question_id: draftQuestion.id, tag_id: tags[0].id }])
    .select("question_id,tag_id");

  if (draftTagsError) {
    throw new Error(`draft question_tags insert failed: ${draftTagsError.message}`);
  }
  cleanup.questionTags.push(...draftTags);

  const sourceFileRefId = randomUUID();
  const questionAssetRefId = randomUUID();
  const importBatch = await insertOne(
    adminSession.client,
    "import_batches",
    {
      source_type: "manual_json",
      status: "imported",
      summary: { createdCount: 1 },
      created_by: adminSession.user.id,
    },
    "id",
  );
  cleanup.batches.push(importBatch.id);

  const { error: importItemError } = await adminSession.client
    .from("import_batch_items")
    .insert({
      batch_id: importBatch.id,
      item_index: 0,
      raw_payload: { code: draftQuestion.question_code },
      normalized_question_json: {
        question_code: draftQuestion.question_code,
        title: draftQuestion.title,
        status: "draft",
        image_urls: ["https://example.com/review-draft.png"],
        source_file_ids: [sourceFileRefId],
        question_asset_ids: [questionAssetRefId],
      },
      validation_errors: [],
      status: "imported",
      created_question_id: draftQuestion.id,
    });

  if (importItemError) {
    throw new Error(`import_batch_items insert failed: ${importItemError.message}`);
  }

  const reviewDashboard = await fetchRoute(
    `/admin/review?search=${encodeURIComponent(draftQuestion.question_code)}`,
    adminCookie,
  );

  assertRoute(
    reviewDashboard.status === 200 &&
      reviewDashboard.text.includes(draftQuestion.question_code) &&
      reviewDashboard.text.includes("Needs solution") &&
      reviewDashboard.text.includes("Has tags") &&
      reviewDashboard.text.includes("Has imported asset refs") &&
      reviewDashboard.text.includes("Needs media review") &&
      reviewDashboard.text.includes("Edit question"),
    "draft imported question appears in review queue with readiness indicators",
  );
  assertRoute(
    !reviewDashboard.text.includes(question.title),
    "published question does not appear in review queue",
  );

  const { data: loadedQuestionTags, error: loadedQuestionTagsError } =
    await adminSession.client
      .from("question_tags")
      .select("question_id,tag_id")
      .eq("question_id", question.id);

  assertRoute(
    !loadedQuestionTagsError && loadedQuestionTags?.length === tags.length,
    "multiple question_tags rows exist for one question",
  );

  const video = await insertOne(
    adminSession.client,
    "videos",
    {
      question_id: question.id,
      title: `Route multi-tag video ${suffix}`,
      video_url: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
      embed_url: "https://www.youtube.com/embed/ysz5S6PUM-U",
      thumbnail_url: "https://img.youtube.com/vi/ysz5S6PUM-U/hqdefault.jpg",
      provider: "YouTube",
      status: "published",
      created_by: adminSession.user.id,
      updated_by: adminSession.user.id,
      published_at: new Date().toISOString(),
    },
    "id,title",
  );
  cleanup.videos.push(video.id);

  const inheritedVideoTags = await syncVideoTagsFromQuestion(
    adminSession.client,
    video.id,
    question.id,
  );

  assertRoute(
    inheritedVideoTags.length === tags.length,
    "video inherits multiple question tags",
  );
  cleanup.videoTags.push(...inheritedVideoTags);

  const questionList = await fetchRoute(
    `/questions?q=${encodeURIComponent(question.question_code)}&min=0&max=1000`,
  );
  const questionFilteredByTag = await fetchRoute(
    `/questions?tag=${tags[1].id}&min=0&max=1000`,
  );
  const questionDetail = await fetchRoute(`/questions/${question.id}`);
  const videoList = await fetchRoute(
    `/videos?q=${encodeURIComponent(video.title)}&min=0&max=1000`,
  );
  const videoFilteredByTag = await fetchRoute(
    `/videos?tag=${tags[2].id}&min=0&max=1000`,
  );
  const videoDetail = await fetchRoute(`/videos/${video.id}`);

  for (const tag of tags) {
    assertRoute(
      questionList.text.includes(tag.name),
      `/questions displays multi-tag ${tag.name}`,
    );
    assertRoute(
      questionDetail.text.includes(tag.name),
      `/questions/[id] displays multi-tag ${tag.name}`,
    );
    assertRoute(
      videoList.text.includes(tag.name),
      `/videos displays inherited multi-tag ${tag.name}`,
    );
    assertRoute(
      videoDetail.text.includes(tag.name),
      `/videos/[id] displays inherited multi-tag ${tag.name}`,
    );
  }

  assertRoute(
    questionFilteredByTag.text.includes(question.title),
    "question tag filter works with multi-tag question",
  );
  assertRoute(
    videoFilteredByTag.text.includes(video.title),
    "video tag filter works with multi-tag video",
  );

  const keptTags = tags.slice(0, 2);
  const removedTag = tags[2];
  const { error: deleteQuestionTagsError } = await adminSession.client
    .from("question_tags")
    .delete()
    .eq("question_id", question.id);

  if (deleteQuestionTagsError) {
    throw new Error(
      `question_tags update delete failed: ${deleteQuestionTagsError.message}`,
    );
  }

  const { data: updatedQuestionTags, error: updateQuestionTagsError } =
    await adminSession.client
      .from("question_tags")
      .insert(
        keptTags.map((tag) => ({
          question_id: question.id,
          tag_id: tag.id,
        })),
      )
      .select("question_id,tag_id");

  assertRoute(
    !updateQuestionTagsError && updatedQuestionTags?.length === keptTags.length,
    "admin can update question tags from three to two",
  );
  cleanup.questionTags = updatedQuestionTags ?? [];

  const syncedVideoTags = await syncVideoTagsFromQuestion(
    adminSession.client,
    video.id,
    question.id,
  );
  cleanup.videoTags = syncedVideoTags;

  assertRoute(
    syncedVideoTags.length === keptTags.length,
    "bound video tags mirror edited question tags",
  );

  const syncedQuestionList = await fetchRoute(
    `/questions?q=${encodeURIComponent(question.question_code)}&min=0&max=1000`,
  );
  const syncedQuestionDetail = await fetchRoute(`/questions/${question.id}`);
  const syncedVideoList = await fetchRoute(
    `/videos?q=${encodeURIComponent(video.title)}&min=0&max=1000`,
  );
  const syncedVideoDetail = await fetchRoute(`/videos/${video.id}`);

  for (const tag of keptTags) {
    assertRoute(
      syncedQuestionList.text.includes(tag.name),
      `/questions displays synced kept tag ${tag.name}`,
    );
    assertRoute(
      syncedQuestionDetail.text.includes(tag.name),
      `/questions/[id] displays synced kept tag ${tag.name}`,
    );
    assertRoute(
      syncedVideoList.text.includes(tag.name),
      `/videos displays synced kept tag ${tag.name}`,
    );
    assertRoute(
      syncedVideoDetail.text.includes(tag.name),
      `/videos/[id] displays synced kept tag ${tag.name}`,
    );
  }

  assertRoute(
    !syncedQuestionList.text.includes(removedTag.name) &&
      !syncedQuestionDetail.text.includes(removedTag.name),
    "removed question tag no longer appears publicly",
  );
  assertRoute(
    !syncedVideoList.text.includes(removedTag.name) &&
      !syncedVideoDetail.text.includes(removedTag.name),
    "removed video tag no longer appears publicly",
  );

  const syncedQuestionFilteredByTag = await fetchRoute(
    `/questions?tag=${keptTags[0].id}&min=0&max=1000`,
  );
  const syncedVideoFilteredByTag = await fetchRoute(
    `/videos?tag=${keptTags[1].id}&min=0&max=1000`,
  );

  assertRoute(
    syncedQuestionFilteredByTag.text.includes(question.title),
    "question tag filter works after tag sync",
  );
  assertRoute(
    syncedVideoFilteredByTag.text.includes(video.title),
    "video tag filter works after tag sync",
  );
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
  for (const id of cleanup.batches) {
    await adminSession.client.from("import_batches").delete().eq("id", id);
  }
}

console.log("Route smoke test completed.");
