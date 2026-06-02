import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });
const { sanitizeContentHtml } = await import("../src/lib/sanitize/html.ts");

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
        source_file_ids: ["source-file-reserved-review-id"],
        question_asset_ids: ["question-asset-reserved-review-id"],
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
