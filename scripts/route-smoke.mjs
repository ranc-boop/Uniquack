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
const publishedTagsApi = await fetchRoute("/api/tags/published");
const publishedQuestionTagsApi = await fetchRoute(
  "/api/tags/published?usedBy=questions",
);
const videos = await fetchRoute("/videos?q=AP&min=0&max=1000");
const signedOutAdmin = await fetchRoute("/admin");
const signedOutReview = await fetchRoute("/admin/review");
const signedOutImportAssets = await fetchRoute("/admin/imports/assets");
const signedOutPackageImport = await fetchRoute("/admin/imports/package");
const signedOutAiPdfImport = await fetchRoute("/admin/imports/pdf");
const studentAdmin = await fetchRoute("/admin", studentCookie);
const studentReview = await fetchRoute("/admin/review", studentCookie);
const studentImportAssets = await fetchRoute("/admin/imports/assets", studentCookie);
const studentPackageImport = await fetchRoute(
  "/admin/imports/package",
  studentCookie,
);
const studentAiPdfImport = await fetchRoute("/admin/imports/pdf", studentCookie);
const adminHome = await fetchRoute("/admin", adminCookie);
const adminQuestions = await fetchRoute("/admin/questions", adminCookie);
const adminImports = await fetchRoute("/admin/imports", adminCookie);
const adminImportAssets = await fetchRoute("/admin/imports/assets", adminCookie);
const adminPackageImport = await fetchRoute("/admin/imports/package", adminCookie);
const adminAiPdfImport = await fetchRoute("/admin/imports/pdf", adminCookie);
const adminReview = await fetchRoute("/admin/review", adminCookie);
const adminUsers = await fetchRoute("/admin/users", adminCookie);
const adminAiSettings = await fetchRoute("/admin/ai-settings", adminCookie);
const superAdminUsers = await fetchRoute("/admin/users", superAdminCookie);
const superAdminAiSettings = await fetchRoute(
  "/admin/ai-settings",
  superAdminCookie,
);

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
  publishedTagsApi.status === 200 &&
    publishedTagsApi.text.includes('"tags"') &&
    publishedTagsApi.text.includes('"count"'),
  "published tags API is anonymously readable",
);
assertRoute(
  publishedQuestionTagsApi.status === 200 &&
    publishedQuestionTagsApi.text.includes('"tags"') &&
    publishedQuestionTagsApi.text.includes('"usedBy":"questions"'),
  "published tags API can filter to tags used by published questions",
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
  signedOutImportAssets.status === 307 &&
    signedOutImportAssets.location.includes("/auth/login"),
  "signed out user visiting /admin/imports/assets redirects to login",
);
assertRoute(
  signedOutPackageImport.status === 307 &&
    signedOutPackageImport.location.includes("/auth/login"),
  "signed out user visiting /admin/imports/package redirects to login",
);
assertRoute(
  signedOutAiPdfImport.status === 307 &&
    signedOutAiPdfImport.location.includes("/auth/login"),
  "signed out user visiting /admin/imports/pdf redirects to login",
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
  studentImportAssets.status === 307 &&
    studentImportAssets.location.includes("/unauthorized"),
  "student visiting /admin/imports/assets redirects to unauthorized",
);
assertRoute(
  studentPackageImport.status === 307 &&
    studentPackageImport.location.includes("/unauthorized"),
  "student visiting /admin/imports/package redirects to unauthorized",
);
assertRoute(
  studentAiPdfImport.status === 307 &&
    studentAiPdfImport.location.includes("/unauthorized"),
  "student visiting /admin/imports/pdf redirects to unauthorized",
);
assertRoute(
  adminHome.status === 200 &&
    adminHome.text.includes("Create demo records") &&
    adminHome.text.includes("Review Drafts") &&
    adminHome.text.includes("Bulk Assets") &&
    adminHome.text.includes("Package Import") &&
    adminHome.text.includes("AI PDF Import"),
  "admin can access dashboard, Review Drafts nav, Bulk Assets nav, Package Import nav, and AI PDF Import nav",
);
assertRoute(
  adminQuestions.status === 200 &&
    adminQuestions.text.includes("Find questions") &&
    adminQuestions.text.includes("Search tags") &&
    adminQuestions.text.includes("Markdown + LaTeX") &&
    adminQuestions.text.includes("Advanced HTML"),
  "admin questions renders filters, checkbox tag picker, and Markdown LaTeX editor",
);
assertRoute(
  adminImports.status === 200 &&
    adminImports.text.includes("Manual JSON import") &&
    adminImports.text.includes("Asset references are preserved for review only") &&
    adminImports.text.includes("Bulk asset upload") &&
    adminImports.text.includes("Package Import"),
  "admin can access batch import page",
);
assertRoute(
  adminImportAssets.status === 200 &&
    adminImportAssets.text.includes("Bulk asset upload") &&
    adminImportAssets.text.includes("Filename matching rules") &&
    adminImportAssets.text.includes("Select files"),
  "admin can access bulk asset upload page",
);
assertRoute(
  adminPackageImport.status === 200 &&
    adminPackageImport.text.includes("Package import") &&
    adminPackageImport.text.includes("Supported package format") &&
    adminPackageImport.text.includes("Select ZIP"),
  "admin can access package import page",
);
assertRoute(
  adminAiPdfImport.status === 200 &&
    adminAiPdfImport.text.includes("AI PDF Import") &&
    adminAiPdfImport.text.includes("Upload PDF source") &&
    adminAiPdfImport.text.includes("starting AI extraction requires a super admin"),
  "admin can access AI PDF import upload UI without provider-token access",
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
  adminAiSettings.status === 307 &&
    adminAiSettings.location.includes("/unauthorized"),
  "admin is blocked from /admin/ai-settings",
);
assertRoute(
  superAdminUsers.status === 200 && superAdminUsers.text.includes("Update role"),
  "super_admin can access /admin/users",
);
assertRoute(
  superAdminAiSettings.status === 200 &&
    superAdminAiSettings.text.includes("AI Settings") &&
    superAdminAiSettings.text.includes("API keys are"),
  "super_admin can access AI provider settings",
);

const adminSession = await signedInSupabaseClient(
  "TEST_ADMIN_USERNAME",
  "TEST_ADMIN_PASSWORD",
);
const superAdminSession = await signedInSupabaseClient(
  "TEST_SUPER_ADMIN_USERNAME",
  "TEST_SUPER_ADMIN_PASSWORD",
);
const suffix = `route-multi-${Date.now()}`;
const cleanup = {
  batches: [],
  importBatchAssets: [],
  superAdminBatches: [],
  superAdminImportBatchAssets: [],
  videoTags: [],
  questionTags: [],
  videos: [],
  questions: [],
  tags: [],
};

try {
  const { error: sourceColumnsError } = await adminSession.client
    .from("questions")
    .select(
      "content_source,content_source_format,solution_source,solution_source_format",
    )
    .limit(1);
  const hasQuestionSourceColumns = !sourceColumnsError;

  if (hasQuestionSourceColumns) {
    const markdownSource = [
      "## Route Source Preservation",
      "",
      "Inline math $F=ma$, resistance $4\\,\\Omega$, and voltage $12\\,\\mathrm{V}$ with **bold** text.",
      "",
      "| Quantity | Value |",
      "| --- | --- |",
      "| Voltage | `$12\\,\\mathrm{V}$` |",
      "| Resistance | `$4\\,\\Omega$` |",
      "",
      "$$",
      "a = \\frac{F}{m}",
      "$$",
    ].join("\n");
    const markdownHtml = [
      "<h2>Route Source Preservation</h2>",
      '<p>Inline math <span data-type="inline-math" data-latex="F=ma">F=ma</span>, resistance <span data-type="inline-math" data-latex="4\\,\\Omega">4\\,\\Omega</span>, and voltage <span data-type="inline-math" data-latex="12\\,\\mathrm{V}">12\\,\\mathrm{V}</span> with <strong>bold</strong> text.</p>',
      '<div class="rich-html-table-wrap"><table><thead><tr><th>Quantity</th><th>Value</th></tr></thead><tbody><tr><td>Voltage</td><td><span data-type="inline-math" data-latex="12\\,\\mathrm{V}">12\\,\\mathrm{V}</span></td></tr><tr><td>Resistance</td><td><span data-type="inline-math" data-latex="4\\,\\Omega">4\\,\\Omega</span></td></tr></tbody></table></div>',
      '<div data-type="block-math" data-latex="a = \\frac{F}{m}">a = \\frac{F}{m}</div>',
    ].join("\n");
    const sourceQuestion = await insertOne(
      adminSession.client,
      "questions",
      {
        question_code: `ROUTE-SOURCE-${Date.now()}`,
        title: `Route source preservation ${suffix}`,
        content_html: markdownHtml,
        content_source: markdownSource,
        content_source_format: "markdown_latex",
        solution_html:
          '<p>Solution math <span data-type="inline-math" data-latex="I=V/R"></span>.</p>',
        solution_source: "Solution math $I=V/R$.",
        solution_source_format: "markdown_latex",
        difficulty_rating: 500,
        question_type: "frq",
        status: "published",
        created_by: adminSession.user.id,
        updated_by: adminSession.user.id,
        published_at: new Date().toISOString(),
      },
      "id,question_code,title",
    );
    cleanup.questions.push(sourceQuestion.id);

    const htmlFallbackQuestion = await insertOne(
      adminSession.client,
      "questions",
      {
        question_code: `ROUTE-HTML-${Date.now()}`,
        title: `Route HTML fallback ${suffix}`,
        content_html: "<h2>Original HTML fallback route smoke</h2>",
        content_source: "<h2>Original HTML fallback route smoke</h2>",
        content_source_format: "html",
        solution_html: "<p>HTML solution fallback</p>",
        solution_source: "<p>HTML solution fallback</p>",
        solution_source_format: "html",
        difficulty_rating: 510,
        question_type: "frq",
        status: "draft",
        created_by: adminSession.user.id,
        updated_by: adminSession.user.id,
      },
      "id,question_code,title",
    );
    cleanup.questions.push(htmlFallbackQuestion.id);

    const sourceEdit = await fetchRoute(
      `/admin/questions?q=${encodeURIComponent(sourceQuestion.question_code)}`,
      adminCookie,
    );
    const htmlFallbackEdit = await fetchRoute(
      `/admin/questions?status=draft&q=${encodeURIComponent(
        htmlFallbackQuestion.question_code,
      )}`,
      adminCookie,
    );
    const sourceDetail = await fetchRoute(`/questions/${sourceQuestion.id}`);

    assertRoute(
      sourceEdit.status === 200 &&
        sourceEdit.text.includes(sourceQuestion.question_code) &&
        sourceEdit.text.includes("Edit question"),
      "source-preservation question remains reachable in optimized admin list",
    );
    assertRoute(
      htmlFallbackEdit.status === 200 &&
        htmlFallbackEdit.text.includes("Original HTML fallback route smoke") &&
        htmlFallbackEdit.text.includes("Advanced HTML"),
      "Original HTML fallback source reopens",
    );
    assertRoute(
      sourceDetail.status === 200 &&
        sourceDetail.text.includes('data-type="inline-math"') &&
        sourceDetail.text.includes('data-type="block-math"') &&
        sourceDetail.text.includes("4\\,\\Omega") &&
        sourceDetail.text.includes("12\\,\\mathrm{V}") &&
        sourceDetail.text.includes("rich-html-table-wrap"),
      "public question detail renders RichHtml math and table markers",
    );
  } else {
    console.log(
      `SKIP source persistence route checks: apply supabase/migrations/0006_question_content_source.sql (${sourceColumnsError.message})`,
    );
  }

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

  const smokeCacheBust = Date.now();
  const currentPublishedTagsApi = await fetchRoute(
    `/api/tags/published?limit=1000&_smoke=${smokeCacheBust}`,
  );
  const currentPublishedQuestionTagsApi = await fetchRoute(
    `/api/tags/published?usedBy=questions&limit=1000&_smoke=${smokeCacheBust}`,
  );

  for (const tag of tags) {
    assertRoute(
      currentPublishedTagsApi.status === 200 &&
        currentPublishedTagsApi.text.includes(tag.name),
      `published tags API includes published tag ${tag.name}`,
    );
    assertRoute(
      currentPublishedQuestionTagsApi.status === 200 &&
        currentPublishedQuestionTagsApi.text.includes(tag.name),
      `published tags API includes question-used tag ${tag.name}`,
    );
  }

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

  const aiPdfFileName = `Route AI Control ${suffix}.pdf`;
  const aiPdfBatch = await insertOne(
    adminSession.client,
    "import_batches",
    {
      source_type: "ai_pdf",
      status: "imported",
      summary: {
        createdCount: 2,
        aiPdfImport: {
          createdQuestionCount: 2,
          detectedFigureCount: 2,
          fileName: aiPdfFileName,
          missingImageAttachmentCount: 1,
          missingQuestionNumbers: ["3"],
          needsImageReview: true,
          pageCount: 6,
          phase: "completed",
          provider: {
            id: randomUUID(),
            model: "gemini-2.5-flash-lite",
            name: "Route Gemini Native",
            provider: "gemini_native",
          },
          sourceInput: "gemini_native_pdf",
          sourcePageRefs: ["1", "2"],
          uploadedCropCount: 1,
          warnings: [
            "AI provider response was repaired after schema validation failed.",
            "Possible missing question numbers: 3",
          ],
        },
      },
      created_by: adminSession.user.id,
    },
    "id",
  );
  cleanup.batches.push(aiPdfBatch.id);

  const aiPdfAsset = await insertOne(
    adminSession.client,
    "import_batch_assets",
    {
      asset_role: "source_pdf",
      batch_id: aiPdfBatch.id,
      created_by: adminSession.user.id,
      metadata: { pageCount: 6 },
      mime_type: "application/pdf",
      object_path: `route-smoke/private/${suffix}.pdf`,
      original_filename: aiPdfFileName,
      size_bytes: 2_097_152,
      status: "ready",
    },
    "id",
  );
  cleanup.importBatchAssets.push(aiPdfAsset.id);

  const { error: aiPdfImportItemError } = await adminSession.client
    .from("import_batch_items")
    .insert({
      batch_id: aiPdfBatch.id,
      item_index: 0,
      raw_payload: { code: draftQuestion.question_code },
      normalized_question_json: {
        ai_metadata: {
          asset_placeholders: [],
          page_refs: [1],
          source: "ai_pdf_import",
        },
        image_urls: ["https://example.com/ai-pdf-review-draft.png"],
        question_code: draftQuestion.question_code,
        question_asset_ids: [questionAssetRefId],
        source_file_ids: [sourceFileRefId],
        status: "draft",
        title: draftQuestion.title,
      },
      validation_errors: [],
      status: "imported",
      created_question_id: draftQuestion.id,
    });

  if (aiPdfImportItemError) {
    throw new Error(
      `AI PDF import_batch_items insert failed: ${aiPdfImportItemError.message}`,
    );
  }

  const failedAiPdfFileName = `Route AI Failed Control ${suffix}.pdf`;
  const failedFigureWarnings = Array.from(
    { length: 11 },
    (_, index) =>
      `Could not find created question for {{asset:figure_${index + 1}}}.`,
  );
  const failedAiPdfBatch = await insertOne(
    adminSession.client,
    "import_batches",
    {
      source_type: "ai_pdf",
      status: "failed",
      summary: {
        createdCount: 0,
        aiPdfImport: {
          createdQuestionCount: 0,
          detectedFigureCount: 11,
          fileName: failedAiPdfFileName,
          missingImageAttachmentCount: 11,
          pageCount: 27,
          phase: "completed",
          error:
            "AI provider JSON did not match the expected import schema. questions.0.asset_placeholders.0.placeholder: Invalid input. Response preview: {\"asset_placeholders\":[{\"placeholder\":\"bad value\"}]}",
          provider: {
            id: randomUUID(),
            model: "gemini-2.5-flash-lite",
            name: "Route Gemini Native PDF",
            provider: "gemini_native",
          },
          uploadedCropCount: 0,
          warnings: failedFigureWarnings,
        },
      },
      created_by: adminSession.user.id,
    },
    "id",
  );
  cleanup.batches.push(failedAiPdfBatch.id);

  const failedAiPdfAsset = await insertOne(
    adminSession.client,
    "import_batch_assets",
    {
      asset_role: "source_pdf",
      batch_id: failedAiPdfBatch.id,
      created_by: adminSession.user.id,
      metadata: { pageCount: 27 },
      mime_type: "application/pdf",
      object_path: `route-smoke/private/${suffix}-failed.pdf`,
      original_filename: failedAiPdfFileName,
      size_bytes: 6_291_456,
      status: "ready",
    },
    "id",
  );
  cleanup.importBatchAssets.push(failedAiPdfAsset.id);

  const hiddenOtherUserFileName = `Route AI Other User ${suffix}.pdf`;
  const otherUserAiPdfBatch = await insertOne(
    superAdminSession.client,
    "import_batches",
    {
      source_type: "ai_pdf",
      status: "imported",
      summary: {
        createdCount: 1,
        aiPdfImport: {
          createdQuestionCount: 1,
          fileName: hiddenOtherUserFileName,
          pageCount: 1,
          phase: "completed",
          provider: {
            id: randomUUID(),
            model: "gemini-2.5-flash-lite",
            name: "Route Other User Gemini",
            provider: "gemini_native",
          },
          sourceInput: "gemini_native_pdf",
          uploadedCropCount: 0,
          warnings: [],
        },
      },
      created_by: superAdminSession.user.id,
    },
    "id",
  );
  cleanup.superAdminBatches.push(otherUserAiPdfBatch.id);

  const otherUserAiPdfAsset = await insertOne(
    superAdminSession.client,
    "import_batch_assets",
    {
      asset_role: "source_pdf",
      batch_id: otherUserAiPdfBatch.id,
      created_by: superAdminSession.user.id,
      metadata: { pageCount: 1 },
      mime_type: "application/pdf",
      object_path: `route-smoke/private/${suffix}-other-user.pdf`,
      original_filename: hiddenOtherUserFileName,
      size_bytes: 1024,
      status: "ready",
    },
    "id",
  );
  cleanup.superAdminImportBatchAssets.push(otherUserAiPdfAsset.id);

  const aiPdfDashboard = await fetchRoute("/admin/imports/pdf", adminCookie);
  const superAdminAiPdfDashboard = await fetchRoute(
    "/admin/imports/pdf",
    superAdminCookie,
  );

  assertRoute(
    aiPdfDashboard.status === 200 &&
      aiPdfDashboard.text.includes("AI Parsing Control Dashboard") &&
      aiPdfDashboard.text.includes("Route Gemini Native") &&
      !aiPdfDashboard.text.includes("Latest AI PDF extraction") &&
      aiPdfDashboard.text.includes("gemini-2.5-flash-lite") &&
      aiPdfDashboard.text.includes("Gemini Native full PDF") &&
      aiPdfDashboard.text.includes(
        "AI-generated questions are draft-only and are not visible to students until published.",
      ) &&
      aiPdfDashboard.text.includes("Review generated drafts") &&
      aiPdfDashboard.text.includes(`/admin/review?batch=${aiPdfBatch.id}`) &&
      aiPdfDashboard.text.includes(
        "Chunk details are not available for this import yet.",
      ) &&
      aiPdfDashboard.text.includes("Possible missing question numbers: 3") &&
      aiPdfDashboard.text.includes(
        "Questions may need diagrams/images before publishing.",
      ) &&
      aiPdfDashboard.text.includes("Missing figure attachments") &&
      aiPdfDashboard.text.includes("Needs media review"),
    "AI PDF control dashboard renders provider, strategy, draft-only review, warnings, chunks, and figure indicators",
  );
  const dashboardStart = aiPdfDashboard.text.indexOf(
    "AI Parsing Control Dashboard",
  );
  const failedCardStart = aiPdfDashboard.text.indexOf(
    failedAiPdfFileName,
    dashboardStart,
  );
  const failedDashboardBlock = aiPdfDashboard.text.slice(
    Math.max(0, failedCardStart - 2_000),
    failedCardStart + 12_000,
  );
  const failedCard = aiPdfDashboard.text.slice(
    failedCardStart,
    failedCardStart + 10_000,
  );

  assertRoute(failedCardStart >= 0, "AI PDF failed batch fixture renders");
  assertRoute(
    failedDashboardBlock.includes("Failed") &&
      failedDashboardBlock.includes("Phase:") &&
      !failedDashboardBlock.includes("Phase: Completed"),
    "AI PDF failed batch never renders completed phase",
  );
  assertRoute(
    failedCard.includes("Input:") &&
      failedCard.includes("Gemini Native full PDF") &&
      !failedCard.includes("Unsupported"),
    "AI PDF failed Gemini Native batch renders supported full PDF input",
  );
  assertRoute(
    failedCard.includes(
      "The AI returned invalid image placeholder metadata. This should be treated as a warning instead of blocking all questions.",
    ) &&
      failedCard.includes(
        "No draft questions were created because the AI response did not match the expected question schema.",
      ),
    "AI PDF failed batch renders human-readable schema and placeholder summaries",
  );
  assertRoute(
    failedCard.includes("Technical details") &&
      failedCard.includes(
        "11 figure placeholders could not be attached because no matching draft questions were created.",
      ) &&
      failedCard.includes("Debug details"),
    "AI PDF failed batch summarizes repeated figure placeholder warnings",
  );
  assertRoute(
    failedCard.includes("No drafts were created.") &&
      failedCard.includes("The extraction failed before questions could be imported.") &&
      failedCard.includes("Retry the import or upload the PDF again after parser fixes.") &&
      failedCard.includes("No drafts to review"),
    "AI PDF failed batch with zero created questions disables review CTA and explains retry",
  );
  assertRoute(
    failedCard.includes("Source assets:") &&
      failedCard.includes("Question assets:") &&
      failedCard.includes("Uploaded crops:"),
    "AI PDF failed batch uses clear source/question asset labels",
  );

  assertRoute(
    !aiPdfDashboard.text.includes(hiddenOtherUserFileName) &&
      aiPdfDashboard.text.includes("Showing only AI PDF imports uploaded by your account."),
    "normal admin sees only their own AI PDF imports",
  );
  assertRoute(
    superAdminAiPdfDashboard.status === 200 &&
      superAdminAiPdfDashboard.text.includes(hiddenOtherUserFileName) &&
      superAdminAiPdfDashboard.text.includes(
        "Super admins can see all AI PDF imports.",
      ),
    "super_admin can see all AI PDF imports with explicit UI copy",
  );
  const forbiddenDashboardTokens = [
    ["AI_PROVIDER", "ENCRYPTION_KEY"].join("_"),
    ["SUPABASE", "SERVICE_ROLE"].join("_"),
    "s" + "k-",
    "AI" + "za",
  ];

  assertRoute(
    forbiddenDashboardTokens.every(
      (token) => !aiPdfDashboard.text.includes(token),
    ),
    "AI PDF control dashboard does not render provider secrets",
  );

  const publicAiPdfProbe = await fetchRoute("/questions?min=0&max=1000");

  assertRoute(
    publicAiPdfProbe.status === 200 && !publicAiPdfProbe.text.includes(aiPdfFileName),
    "public questions do not expose AI PDF source metadata",
  );

  const reviewDashboard = await fetchRoute(
    `/admin/review?search=${encodeURIComponent(draftQuestion.question_code)}`,
    adminCookie,
  );
  const reviewBatchDashboard = await fetchRoute(
    `/admin/review?batch=${aiPdfBatch.id}`,
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
  assertRoute(
    reviewBatchDashboard.status === 200 &&
      reviewBatchDashboard.text.includes("Showing drafts from AI PDF import") &&
      reviewBatchDashboard.text.includes(aiPdfBatch.id.slice(0, 8)) &&
      reviewBatchDashboard.text.includes(draftQuestion.question_code) &&
      reviewBatchDashboard.text.includes("Clear batch filter"),
    "review dashboard can jump directly to drafts from one AI PDF import batch",
  );

  const adminDraftQuestionEdit = await fetchRoute(
    `/admin/questions?status=draft&q=${encodeURIComponent(draftQuestion.question_code)}`,
    adminCookie,
  );

  assertRoute(
    adminDraftQuestionEdit.status === 200 &&
      adminDraftQuestionEdit.text.includes(draftQuestion.question_code) &&
      adminDraftQuestionEdit.text.includes("Edit question"),
    "admin questions optimized list keeps draft edit entry reachable",
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
  for (const id of cleanup.superAdminImportBatchAssets) {
    await superAdminSession.client
      .from("import_batch_assets")
      .delete()
      .eq("id", id);
  }
  for (const id of cleanup.superAdminBatches) {
    await superAdminSession.client.from("import_batches").delete().eq("id", id);
  }
  for (const id of cleanup.importBatchAssets) {
    await adminSession.client.from("import_batch_assets").delete().eq("id", id);
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
  for (const id of cleanup.batches) {
    await adminSession.client.from("import_batches").delete().eq("id", id);
  }
}

console.log("Route smoke test completed.");
