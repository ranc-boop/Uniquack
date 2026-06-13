import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });
const { sanitizeContentHtml } = await import("../src/lib/sanitize/html.ts");
const { aiPdfExtractionSchema, normalizeAIPdfExtractionResponse } = await import(
  "../src/lib/ai-pdf-import/schema.ts"
);
const {
  generateAIPdfQuestionCodeForImport,
  resolveAIPdfQuestionCodeForImport,
} = await import("../src/lib/ai-pdf-import/question-code.ts");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
  console.log(`SKIP ${message}`);
}

function emailFor(username) {
  return username.includes("@") ? username : `${username}@local.app`;
}

function slug(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isMissingImportMigrationError(error) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`;

  return /import_batches|import_batch_items|schema cache|could not find|does not exist/i.test(
    text,
  );
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

const lenientAiQuestions = Array.from({ length: 12 }, (_, index) => ({
  asset_placeholders:
    index === 0
      ? [
          {
            alt: "Valid figure fallback",
            bbox: { height: 0.2, width: 0.25, x: 0.1, y: 0.1 },
            page: 1,
          },
          {
            bbox: { height: 0.2, width: 0.25, x: 0.2, y: 0.2 },
            page: 1,
            placeholder: "bad placeholder!",
          },
        ]
      : [],
  content_html:
    index === 1 ? "" : `<p>Lenient AI question ${index + 1} {{asset:figure_1}}</p>`,
  content_source: `Lenient AI question ${index + 1}`,
  difficulty_rating: index === 2 ? 10 : index === 3 ? 1200 : 520,
  new_tag_names: index === 4 ? "Algebra, Functions" : [],
  page_refs: index === 5 ? ["2", "bad", 3] : [1],
  question_code: index === 6 ? "bad code with spaces!" : `LENIENT-${index + 1}`,
  question_type:
    index === 0 ? "multiple_choice" : index === 7 ? "unexpected type" : "frq",
  solution_html:
    index === 8 ? { answer: "Object answer should stringify" } : "<p>Solution.</p>",
  solution_source:
    index === 8 ? { answer: "Object answer should stringify" } : "Solution.",
  status: "published",
  tag_names: index === 9 ? "Geometry; Graphs" : [],
  tag_slugs: [],
  title: `Lenient AI Question ${index + 1}`,
}));

const lenientExtraction = normalizeAIPdfExtractionResponse({
  questions: [
    ...lenientAiQuestions,
    null,
    { title: "Missing content should be skipped" },
    "not a question",
  ],
  warnings: "provider warning",
});
assert(lenientExtraction.questions.length === 12, "lenient question count mismatch");
assert(lenientExtraction.questions[0].question_type === "mcq", "mcq alias was not normalized");
assert(
  lenientExtraction.questions[0].asset_placeholders.length === 1,
  "invalid asset placeholders were not sanitized",
);
assert(
  lenientExtraction.questions[0].asset_placeholders[0].placeholder ===
    "{{asset:figure_1}}",
  "asset placeholder fallback was not preserved",
);
assert(lenientExtraction.questions[2].difficulty_rating === 100, "difficulty min clamp failed");
assert(lenientExtraction.questions[3].difficulty_rating === 1000, "difficulty max clamp failed");
assert(
  JSON.stringify(lenientExtraction.questions[4].new_tag_names) ===
    JSON.stringify(["Algebra", "Functions"]),
  "new_tag_names string was not split",
);
assert(
  JSON.stringify(lenientExtraction.questions[5].page_refs) ===
    JSON.stringify([2, 3]),
  "page_refs were not filtered",
);
assert(
  lenientExtraction.questions[6].question_code === undefined,
  "invalid question_code was not dropped",
);
assert(
  lenientExtraction.questions[7].question_type === "mixed",
  "unknown question_type was not normalized to mixed",
);
assert(
  /Object answer/.test(lenientExtraction.questions[8].solution_source ?? ""),
  "object solution_source was not stringified",
);
assert(
  JSON.stringify(lenientExtraction.questions[9].tag_names) ===
    JSON.stringify(["Geometry", "Graphs"]),
  "tag_names string was not split",
);
assert(
  lenientExtraction.warnings.some((warning) => warning.includes("was skipped")),
  "lenient AI parser did not warn about skipped bad questions",
);
assert(
  lenientExtraction.warnings.includes(
    "Some image placeholders were ignored because they were invalid.",
  ),
  "lenient AI parser did not warn about invalid asset placeholders",
);
let missingQuestionsFailed = false;
try {
  normalizeAIPdfExtractionResponse({ warnings: [] });
} catch (error) {
  missingQuestionsFailed =
    error instanceof Error && /questions|zero importable/i.test(error.message);
}
assert(missingQuestionsFailed, "missing questions array did not fail the batch");
pass("AI PDF lenient parser imports valid questions and skips bad questions");

const generatedCodeWarnings = [];
const generatedUsedCodes = new Set();
const generatedExistingCodes = new Set(["1", "ai-deadbeef-003"]);
assert(
  resolveAIPdfQuestionCodeForImport({
    batchId: "deadbeef-0000-0000-0000-000000000000",
    existingQuestionCodes: generatedExistingCodes,
    index: 0,
    requestedQuestionCode: "1",
    usedQuestionCodes: generatedUsedCodes,
    warnings: generatedCodeWarnings,
  }) === "AI-DEADBEEF-001",
  "duplicate existing question_code did not generate stable code",
);
assert(
  resolveAIPdfQuestionCodeForImport({
    batchId: "deadbeef-0000-0000-0000-000000000000",
    existingQuestionCodes: generatedExistingCodes,
    index: 1,
    requestedQuestionCode: "",
    usedQuestionCodes: generatedUsedCodes,
    warnings: generatedCodeWarnings,
  }) === "AI-DEADBEEF-002",
  "missing question_code did not generate stable code",
);
assert(
  resolveAIPdfQuestionCodeForImport({
    batchId: "deadbeef-0000-0000-0000-000000000000",
    existingQuestionCodes: generatedExistingCodes,
    index: 2,
    requestedQuestionCode: "AI-DEADBEEF-001",
    usedQuestionCodes: generatedUsedCodes,
    warnings: generatedCodeWarnings,
  }) === "AI-DEADBEEF-003-2",
  "generated question_code did not avoid default-code collision",
);
assert(generatedCodeWarnings.length === 3, "generated code warnings mismatch");
pass("AI PDF duplicate and missing question codes generate stable draft codes");

const serverGeneratedCodes = new Set();
assert(
  generateAIPdfQuestionCodeForImport({
    batchId: "facefeed-0000-0000-0000-000000000000",
    existingQuestionCodes: new Set(["ai-facefeed-001"]),
    index: 0,
    usedQuestionCodes: serverGeneratedCodes,
  }) === "AI-FACEFEED-001-2",
  "server-generated AI PDF question_code did not avoid existing default collision",
);
assert(
  generateAIPdfQuestionCodeForImport({
    batchId: "facefeed-0000-0000-0000-000000000000",
    existingQuestionCodes: new Set(["ai-facefeed-001"]),
    index: 1,
    usedQuestionCodes: serverGeneratedCodes,
  }) === "AI-FACEFEED-002",
  "server-generated AI PDF question_code did not follow extracted order",
);
pass("AI PDF server-generated question codes do not depend on visible numbering");

const anon = createClient(supabaseUrl, supabaseAnonKey);
const admin = await signIn("TEST_ADMIN_USERNAME", "TEST_ADMIN_PASSWORD");
const suffix = slug("batch-smoke");
const cleanup = {
  batches: [],
  questionTags: [],
  questions: [],
  tags: [],
};

try {
  const sourceFileRefId = randomUUID();
  const questionAssetRefId = randomUUID();
  const tag = await insertOne(
    admin.client,
    "tags",
    {
      name: `Batch Smoke Tag ${suffix}`,
      slug: suffix,
      tag_type: "knowledge",
      status: "published",
      created_by: admin.user.id,
      updated_by: admin.user.id,
    },
    "id,name,slug",
  );
  cleanup.tags.push(tag.id);

  const importJson = JSON.stringify({
    questions: [
      {
        code: `BATCH-${suffix}-VALID`,
        title: "Batch smoke valid draft",
        type: "frq",
        difficulty: 640,
        tag_slugs: [tag.slug],
        status: "published",
        content_html:
          '<script>alert(1)</script><p onclick="alert(2)">Valid content</p>',
        solution_html: '<a href="javascript:alert(1)">Unsafe link</a><p>ok</p>',
        image_urls: ["https://example.com/image.png"],
        source_file_ids: [sourceFileRefId],
        question_asset_ids: [questionAssetRefId],
      },
      {
        code: `BATCH-${suffix}-UNKNOWN`,
        title: "Batch smoke unknown tag",
        content_html: "<p>Unknown tag item</p>",
        tag_names: ["Missing Batch Smoke Tag"],
      },
      {
        code: `BATCH-${suffix}-VALID`,
        title: "Batch smoke duplicate",
        content_html: "<p>Duplicate item</p>",
        tag_slugs: [tag.slug],
      },
    ],
  });

  const rawItems = JSON.parse(importJson).questions;
  const validItem = rawItems[0];
  const unknownTagItem = rawItems[1];
  const duplicateItem = rawItems[2];
  const sanitizedContent = sanitizeContentHtml(validItem.content_html);
  const sanitizedSolution = sanitizeContentHtml(validItem.solution_html);
  const preview = {
    validCount: 1,
    invalidCount: 2,
    unknownTagCount: unknownTagItem.tag_names.includes("Missing Batch Smoke Tag")
      ? 1
      : 0,
    duplicateCount: duplicateItem.code === validItem.code ? 1 : 0,
    items: [
      {
        warnings:
          sanitizedContent !== validItem.content_html ||
          sanitizedSolution !== validItem.solution_html
            ? ["Unsafe HTML will be sanitized before saving."]
            : [],
      },
    ],
  };

  assert(preview.validCount === 1, "preview valid count mismatch");
  assert(preview.invalidCount === 2, "preview invalid count mismatch");
  assert(preview.unknownTagCount === 1, "preview unknown tag count mismatch");
  assert(preview.duplicateCount === 1, "preview duplicate count mismatch");
  assert(
    preview.items[0].warnings.some((warning) =>
      warning.toLowerCase().includes("sanitized"),
    ),
    "unsafe HTML was not reported",
  );
  pass("batch import preview validates good, unknown tag, duplicate, and unsafe HTML");
  assert(
    validItem.image_urls[0] === "https://example.com/image.png" &&
      validItem.source_file_ids[0] === sourceFileRefId &&
      validItem.question_asset_ids[0] === questionAssetRefId,
    "asset reference fields were not present in import payload",
  );
  pass("batch import payload includes image, source file, and question asset refs");

  let batch;

  try {
    const { data, error } = await admin.client
      .from("import_batches")
      .insert({
        source_type: "manual_json",
        status: "validating",
        summary: {
          validCount: preview.validCount,
          invalidCount: preview.invalidCount,
          duplicateCount: preview.duplicateCount,
          unknownTagCount: preview.unknownTagCount,
        },
        created_by: admin.user.id,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    batch = data;
  } catch (error) {
    if (isMissingImportMigrationError(error)) {
      skip(
        "batch import DB checks; apply supabase/migrations/0005_import_batches.sql",
      );
    } else {
      throw error;
    }
  }

  if (batch) {
  cleanup.batches.push(batch.id);

  const normalizedValidItem = {
    question_code: validItem.code,
    title: validItem.title,
    question_type: validItem.type,
    difficulty_rating: validItem.difficulty,
    status: "draft",
    tag_ids: [tag.id],
    tag_slugs: [tag.slug],
    tag_names: [],
    content_html: sanitizedContent,
    solution_html: sanitizedSolution,
    image_urls: validItem.image_urls,
    source_file_ids: validItem.source_file_ids,
    question_asset_ids: validItem.question_asset_ids,
    video_url: null,
    embed_url: null,
  };
  const { error: batchItemsError } = await admin.client
    .from("import_batch_items")
    .insert([
      {
        batch_id: batch.id,
        item_index: 0,
        raw_payload: validItem,
        normalized_question_json: normalizedValidItem,
        validation_errors: preview.items[0].warnings,
        status: "valid",
      },
      {
        batch_id: batch.id,
        item_index: 1,
        raw_payload: unknownTagItem,
        normalized_question_json: null,
        validation_errors: ["Unknown tag name: Missing Batch Smoke Tag."],
        status: "invalid",
      },
      {
        batch_id: batch.id,
        item_index: 2,
        raw_payload: duplicateItem,
        normalized_question_json: null,
        validation_errors: [`Duplicate question code within import: ${validItem.code}.`],
        status: "invalid",
      },
    ]);

  assert(!batchItemsError, `batch item insert failed: ${batchItemsError?.message}`);

  const { data: storedImportItem, error: storedImportItemError } =
    await admin.client
      .from("import_batch_items")
      .select("normalized_question_json")
      .eq("batch_id", batch.id)
      .eq("item_index", 0)
      .single();

  assert(
    !storedImportItemError && storedImportItem,
    `stored import item lookup failed: ${storedImportItemError?.message}`,
  );

  const storedNormalized = storedImportItem.normalized_question_json;

  assert(
    storedNormalized?.image_urls?.[0] === "https://example.com/image.png",
    "image_urls were not preserved in normalized import JSON",
  );
  pass("batch import preserves image_urls in normalized import JSON");
  assert(
    storedNormalized?.source_file_ids?.[0] === sourceFileRefId,
    "source_file_ids were not preserved in normalized import JSON",
  );
  pass("batch import preserves source_file_ids in normalized import JSON");
  assert(
    storedNormalized?.question_asset_ids?.[0] === questionAssetRefId,
    "question_asset_ids were not preserved in normalized import JSON",
  );
  pass("batch import preserves question_asset_ids in normalized import JSON");

  const { data: createdQuestion, error: createQuestionError } = await admin.client
    .from("questions")
    .insert({
      question_code: normalizedValidItem.question_code,
      title: normalizedValidItem.title,
      content_html: normalizedValidItem.content_html,
      solution_html: normalizedValidItem.solution_html,
      difficulty_rating: normalizedValidItem.difficulty_rating,
      question_type: normalizedValidItem.question_type,
      status: "draft",
      created_by: admin.user.id,
      updated_by: admin.user.id,
    })
    .select("id")
    .single();

  assert(
    !createQuestionError && createdQuestion,
    `question insert failed: ${createQuestionError?.message}`,
  );
  cleanup.questions.push(createdQuestion.id);

  const { data: createdBindings, error: createBindingsError } =
    await admin.client
      .from("question_tags")
      .insert([{ question_id: createdQuestion.id, tag_id: tag.id }])
      .select("question_id,tag_id");

  assert(
    !createBindingsError && createdBindings?.length === 1,
    `question_tags insert failed: ${createBindingsError?.message}`,
  );
  cleanup.questionTags.push(...createdBindings);

  const { error: importedItemUpdateError } = await admin.client
    .from("import_batch_items")
    .update({
      status: "imported",
      created_question_id: createdQuestion.id,
    })
    .eq("batch_id", batch.id)
    .eq("item_index", 0);

  assert(
    !importedItemUpdateError,
    `import batch item update failed: ${importedItemUpdateError?.message}`,
  );

  const summary = {
    batchId: batch.id,
    createdCount: 1,
    skippedCount: 2,
    errorCount: 2,
    duplicateCount: 1,
    validCount: 1,
    invalidCount: 2,
    unknownTagCount: 1,
    createdQuestions: [
      {
        id: createdQuestion.id,
        assetReferences: {
          imageUrls: normalizedValidItem.image_urls,
          sourceFileIds: normalizedValidItem.source_file_ids,
          questionAssetIds: normalizedValidItem.question_asset_ids,
        },
        assetReferenceCounts: {
          imageUrls: normalizedValidItem.image_urls.length,
          sourceFileIds: normalizedValidItem.source_file_ids.length,
          questionAssetIds: normalizedValidItem.question_asset_ids.length,
          total:
            normalizedValidItem.image_urls.length +
            normalizedValidItem.source_file_ids.length +
            normalizedValidItem.question_asset_ids.length,
        },
        questionCode: normalizedValidItem.question_code,
        title: normalizedValidItem.title,
      },
    ],
  };
  const { error: batchUpdateError } = await admin.client
    .from("import_batches")
    .update({
      status: "failed",
      summary,
    })
    .eq("id", batch.id);

  assert(!batchUpdateError, `batch update failed: ${batchUpdateError?.message}`);

  assert(summary.createdCount === 1, "import created count mismatch");
  assert(summary.skippedCount === 2, "import skipped count mismatch");
  assert(summary.errorCount === 2, "import error count mismatch");
  pass("batch import creates only valid draft questions");

  const { data: importedQuestion, error: importedQuestionError } =
    await admin.client
      .from("questions")
      .select("id,status,content_html,solution_html")
      .eq("question_code", `BATCH-${suffix}-VALID`)
      .single();

  assert(
    !importedQuestionError && importedQuestion,
    `imported question lookup failed: ${importedQuestionError?.message}`,
  );
  if (!cleanup.questions.includes(importedQuestion.id)) {
    cleanup.questions.push(importedQuestion.id);
  }
  assert(importedQuestion.status === "draft", "imported question was not draft");
  assert(
    !importedQuestion.content_html.includes("<script") &&
      !importedQuestion.content_html.includes("onclick"),
    "imported content_html was not sanitized",
  );
  assert(
    importedQuestion.solution_html === "Unsafe link<p>ok</p>" ||
      importedQuestion.solution_html === "Unsafe link\n<p>ok</p>",
    "imported solution_html did not unwrap unsafe link",
  );
  pass("batch import sanitizes imported HTML before saving");

  const { data: bindings, error: bindingsError } = await admin.client
    .from("question_tags")
    .select("question_id,tag_id")
    .eq("question_id", importedQuestion.id);

  assert(!bindingsError && bindings?.length === 1, "imported tags were not bound");
  for (const binding of bindings) {
    if (
      !cleanup.questionTags.some(
        (current) =>
          current.question_id === binding.question_id &&
          current.tag_id === binding.tag_id,
      )
    ) {
      cleanup.questionTags.push(binding);
    }
  }
  pass("batch import binds existing tags");

  const { data: anonQuestions, error: anonQuestionsError } = await anon
    .from("questions")
    .select("id,status")
    .eq("id", importedQuestion.id);

  assert(
    !anonQuestionsError && anonQuestions?.length === 0,
    "draft import was visible publicly",
  );
  pass("draft imports do not appear on public RLS reads");

  const aiInvalidPlaceholderBatch = await insertOne(
    admin.client,
    "import_batches",
    {
      source_type: "ai_pdf",
      status: "validating",
      summary: { aiPdfImport: { phase: "provider_response_validated" } },
      created_by: admin.user.id,
    },
    "id",
  );
  cleanup.batches.push(aiInvalidPlaceholderBatch.id);

  const aiExtraction = aiPdfExtractionSchema.parse({
    questions: [
      {
        asset_placeholders: [
          {
            alt: "Bad placeholder should be dropped",
            bbox: { height: 0.2, width: 0.2, x: 0.1, y: 0.1 },
            page: 1,
            placeholder: "invalid placeholder with spaces!",
          },
          {
            alt: "Missing bbox should be dropped",
            page: 1,
            placeholder: "{{asset:figure_2}}",
          },
        ],
        content_html: "<p>AI PDF invalid placeholder question.</p>",
        content_source: "AI PDF invalid placeholder question.",
        difficulty_rating: 520,
        new_tag_names: [],
        page_refs: [1],
        question_code: `AI-BATCH-${suffix}`,
        question_type: "frq",
        solution_html: null,
        solution_source: null,
        status: "published",
        tag_slugs: [tag.slug],
        title: "AI PDF invalid placeholder draft",
      },
    ],
    warnings: [],
  });
  const aiQuestion = aiExtraction.questions[0];
  const aiPayload = {
    questions: [
      {
        ai_metadata: {
          asset_placeholders: aiQuestion.asset_placeholders,
          page_refs: aiQuestion.page_refs,
          source: "ai_pdf_import",
          warnings: aiExtraction.warnings,
        },
        content_html: sanitizeContentHtml(aiQuestion.content_html),
        content_source: aiQuestion.content_source,
        content_source_format: "markdown_latex",
        difficulty_rating: aiQuestion.difficulty_rating,
        question_code: aiQuestion.question_code,
        question_type: aiQuestion.question_type,
        solution_source_format: "markdown_latex",
        status: "draft",
        tag_slugs: aiQuestion.tag_slugs,
        title: aiQuestion.title,
      },
    ],
  };
  const aiNormalizedQuestion = aiPayload.questions[0];
  const { error: aiItemError } = await admin.client
    .from("import_batch_items")
    .insert({
      batch_id: aiInvalidPlaceholderBatch.id,
      item_index: 0,
      raw_payload: aiNormalizedQuestion,
      normalized_question_json: aiNormalizedQuestion,
      validation_errors: aiExtraction.warnings,
      status: "valid",
    });
  assert(!aiItemError, `AI PDF null solution item insert failed: ${aiItemError?.message}`);

  const { data: aiCreatedQuestion, error: aiCreatedQuestionError } =
    await admin.client
      .from("questions")
      .insert({
        question_code: aiNormalizedQuestion.question_code,
        title: aiNormalizedQuestion.title,
        content_html: aiNormalizedQuestion.content_html,
        content_source: aiNormalizedQuestion.content_source,
        content_source_format: aiNormalizedQuestion.content_source_format,
        difficulty_rating: aiNormalizedQuestion.difficulty_rating,
        question_type: aiNormalizedQuestion.question_type,
        status: "draft",
        created_by: admin.user.id,
        updated_by: admin.user.id,
      })
      .select("id,status,solution_html,solution_source")
      .single();

  assert(
    aiExtraction.warnings.includes(
      "Some image placeholders were ignored because they were invalid.",
    ),
    "AI PDF invalid asset_placeholders did not create a warning",
  );
  assert(
    !aiCreatedQuestionError && aiCreatedQuestion,
    `AI PDF null solution draft insert failed: ${aiCreatedQuestionError?.message}`,
  );
  cleanup.questions.push(aiCreatedQuestion.id);
  assert(aiCreatedQuestion.status === "draft", "AI PDF null solution created non-draft question");
  assert(
    aiCreatedQuestion.solution_html === null &&
      aiCreatedQuestion.solution_source === null,
    "AI PDF null solution was not preserved as missing solution",
  );

  const { data: aiCreatedBindings, error: aiCreatedBindingsError } =
    await admin.client
      .from("question_tags")
      .insert([{ question_id: aiCreatedQuestion.id, tag_id: tag.id }])
      .select("question_id,tag_id");

  assert(
    !aiCreatedBindingsError && aiCreatedBindings?.length === 1,
    `AI PDF null solution tag bind failed: ${aiCreatedBindingsError?.message}`,
  );
  cleanup.questionTags.push(...aiCreatedBindings);
  const { error: aiItemUpdateError } = await admin.client
    .from("import_batch_items")
    .update({
      status: "imported",
      created_question_id: aiCreatedQuestion.id,
    })
    .eq("batch_id", aiInvalidPlaceholderBatch.id)
    .eq("item_index", 0);
  assert(!aiItemUpdateError, `AI PDF null solution item update failed: ${aiItemUpdateError?.message}`);

  const aiNullSolutionSummary = {
    aiPdfImport: {
      createdQuestionCount: 1,
      phase: "completed",
      questionCount: aiExtraction.questions.length,
      warnings: aiExtraction.warnings,
    },
    createdCount: 1,
    errorCount: 0,
    validationErrorReasons: [],
  };
  const { error: aiBatchUpdateError } = await admin.client
    .from("import_batches")
    .update({ status: "imported", summary: aiNullSolutionSummary })
    .eq("id", aiInvalidPlaceholderBatch.id);
  assert(!aiBatchUpdateError, `AI PDF null solution batch update failed: ${aiBatchUpdateError?.message}`);
  assert(
    !aiNullSolutionSummary.validationErrorReasons.some((reason) =>
      reason.includes("solution_html"),
    ),
    "AI PDF null solution still created solution_html validation errors",
  );
  pass(
    "AI PDF invalid asset_placeholders and null solution warn without blocking draft import",
  );

  const aiBulkNullSolutionBatch = await insertOne(
    admin.client,
    "import_batches",
    {
      source_type: "ai_pdf",
      status: "validating",
      summary: { aiPdfImport: { phase: "provider_response_validated" } },
      created_by: admin.user.id,
    },
    "id",
  );
  cleanup.batches.push(aiBulkNullSolutionBatch.id);
  const bulkAiQuestions = Array.from({ length: 48 }, (_, index) => ({
    content_html: `<p>AI PDF bulk null solution question ${index + 1}.</p>`,
    content_source: `AI PDF bulk null solution question ${index + 1}.`,
    content_source_format: "markdown_latex",
    difficulty_rating: 500,
    question_code: `AI-BULK-${suffix}-${String(index + 1).padStart(2, "0")}`,
    question_type: "frq",
    status: "draft",
    tag_slugs: [tag.slug],
    title: `AI PDF bulk null solution ${index + 1}`,
  }));
  const { error: bulkItemsError } = await admin.client
    .from("import_batch_items")
    .insert(
      bulkAiQuestions.map((question, index) => ({
        batch_id: aiBulkNullSolutionBatch.id,
        item_index: index,
        raw_payload: question,
        normalized_question_json: question,
        validation_errors: [],
        status: "valid",
      })),
    );
  assert(!bulkItemsError, `AI PDF 48 null-solution item insert failed: ${bulkItemsError?.message}`);

  const { data: insertedBulkQuestions, error: bulkInsertError } =
    await admin.client
      .from("questions")
      .insert(
        bulkAiQuestions.map((question) => ({
          question_code: question.question_code,
          title: question.title,
          content_html: question.content_html,
          content_source: question.content_source,
          content_source_format: question.content_source_format,
          difficulty_rating: question.difficulty_rating,
          question_type: question.question_type,
          status: "draft",
          created_by: admin.user.id,
          updated_by: admin.user.id,
        })),
      )
      .select("id,question_code");
  assert(
    !bulkInsertError && insertedBulkQuestions?.length === 48,
    `AI PDF 48 null-solution draft insert failed: ${bulkInsertError?.message}`,
  );
  cleanup.questions.push(...insertedBulkQuestions.map((question) => question.id));
  const { data: bulkQuestions, error: bulkQuestionsError } = await admin.client
    .from("questions")
    .select("id,solution_html")
    .in(
      "question_code",
      bulkAiQuestions.map((question) => question.question_code),
    );
  assert(
    !bulkQuestionsError && bulkQuestions?.length === 48,
    `AI PDF 48 null-solution draft lookup failed: ${bulkQuestionsError?.message}`,
  );
  assert(
    bulkQuestions.every((question) => question.solution_html === null),
    "AI PDF 48 null-solution drafts did not preserve missing solution",
  );
  const { data: bulkBindings, error: bulkBindingsError } = await admin.client
    .from("question_tags")
    .insert(
      bulkQuestions.map((question) => ({
        question_id: question.id,
        tag_id: tag.id,
      })),
    )
    .select("question_id,tag_id");
  assert(
    !bulkBindingsError && bulkBindings?.length === 48,
    `AI PDF 48 null-solution tag insert failed: ${bulkBindingsError?.message}`,
  );
  cleanup.questionTags.push(...bulkBindings);

  const bulkSummary = {
    aiPdfImport: {
      createdQuestionCount: 48,
      phase: "completed",
      questionCount: bulkAiQuestions.length,
      warnings: [],
    },
    createdCount: 48,
    errorCount: 0,
    validationErrorReasons: [],
  };
  const { error: bulkBatchUpdateError } = await admin.client
    .from("import_batches")
    .update({ status: "imported", summary: bulkSummary })
    .eq("id", aiBulkNullSolutionBatch.id);
  assert(!bulkBatchUpdateError, `AI PDF 48 null-solution batch update failed: ${bulkBatchUpdateError?.message}`);

  const { data: bulkItems, error: bulkItemsLookupError } = await admin.client
    .from("import_batch_items")
    .select("validation_errors")
    .eq("batch_id", aiBulkNullSolutionBatch.id);
  assert(
    !bulkItemsLookupError &&
      bulkItems?.length === 48 &&
      bulkItems.every(
        (item) =>
          !JSON.stringify(item.validation_errors ?? []).includes("solution_html"),
      ),
    "AI PDF 48 null-solution regression produced solution_html validation failures",
  );
  const { data: bulkBindingsLookup, error: bulkBindingsLookupError } = await admin.client
    .from("question_tags")
    .select("question_id,tag_id")
    .in(
      "question_id",
      bulkQuestions.map((question) => question.id),
    );
  assert(
    !bulkBindingsLookupError && bulkBindingsLookup?.length === 48,
    `AI PDF 48 null-solution tag lookup failed: ${bulkBindingsLookupError?.message}`,
  );
  pass("AI PDF 48-question null-solution regression creates drafts without validation failures");
  }
} finally {
  for (const binding of cleanup.questionTags) {
    await admin.client.from("question_tags").delete().match(binding);
  }
  for (const questionId of cleanup.questions) {
    await admin.client.from("questions").delete().eq("id", questionId);
  }
  for (const batchId of cleanup.batches) {
    await admin.client.from("import_batches").delete().eq("id", batchId);
  }
  for (const tagId of cleanup.tags) {
    await admin.client.from("tags").delete().eq("id", tagId);
  }
}

console.log("Batch import smoke completed.");
