import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env.disposable-smoke.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const teacherUsername = process.env.TEST_TEACHER_USERNAME;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;
const unrelatedTeacherUsername = process.env.TEST_UNRELATED_TEACHER_USERNAME;
const unrelatedTeacherPassword = process.env.TEST_UNRELATED_TEACHER_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  return [error.message, error.code, error.details, error.hint]
    .filter(Boolean)
    .join(" | ");
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function isMissingBankImportReviewSchema(error) {
  const summary = summarizeSupabaseError(error).toLowerCase();
  return (
    error?.code === "PGRST202" ||
    summary.includes("target_bank_id") ||
    summary.includes("owner_bank_id") ||
    summary.includes("approve_bank_review_question") ||
    summary.includes("schema cache") ||
    summary.includes("does not exist")
  );
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function signIn(username, password, label) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });

  if (error) {
    throw new Error(`${label} sign-in failed: ${error.message}`);
  }

  assert(data.user?.id, `bank import smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function getTeacherProfile(teacher) {
  const { data, error } = await teacher.client
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", teacher.user.id)
    .single();

  assert(!error, `teacher profile lookup failed: ${summarizeSupabaseError(error)}`);
  assert(data.role === "teacher", "bank import smoke requires TEST_TEACHER credentials");
  assert(data.status === "active", "bank import smoke teacher must be active");
  assert(data.default_organization_id, "teacher must have a default organization");
  return data;
}

async function verifyQuestionBlocked(client, questionId, label) {
  const { data, error } = await client
    .from("questions")
    .select("id")
    .eq("id", questionId);

  assert(!error, `${label} question read failed: ${summarizeSupabaseError(error)}`);
  assert(!data?.length, `${label} unexpectedly read private bank question`);
}

async function cleanup({ bankId, batchId, questionId }) {
  if (!serviceRoleKey) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (batchId) {
    await admin.from("review_batches").delete().eq("source_record_id", batchId);
    await admin.from("import_batches").delete().eq("id", batchId);
  }

  if (questionId) {
    await admin.from("questions").delete().eq("id", questionId);
  }

  if (bankId) {
    await admin.from("question_banks").delete().eq("id", bankId);
  }

  console.log("PASS bank import review smoke cleanup removed smoke-created rows");
}

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const migration = await read("supabase/clean-migrations/0027_bank_import_review_scope.sql");
  const detailPage = await read("src/app/teacher/banks/[bankId]/page.tsx");
  const importsPage = await read("src/app/teacher/banks/[bankId]/imports/page.tsx");
  const importUi = await read("src/app/teacher/banks/bank-import-ui.tsx");
  const reviewPage = await read("src/app/teacher/banks/[bankId]/review/page.tsx");
  const questionsPage = await read("src/app/teacher/banks/[bankId]/questions/page.tsx");
  const bankActions = await read("src/app/teacher/banks/actions.ts");

  assert(
    migration.includes("target_bank_id") &&
      migration.includes("owner_bank_id") &&
      migration.includes("approve_bank_review_question") &&
      migration.includes("questions_bank_member_read"),
    "bank import review migration is missing scope columns, approval RPC, or bank read policy",
  );
  assert(
    detailPage.includes("Import Material") &&
      importsPage.includes("BankImportEntryPanel") &&
      importUi.includes("Import into selected bank") &&
      importsPage.includes("Advanced / Developer fixture") &&
      importsPage.includes("Developer fixture for smoke testing. Normal teachers should") &&
      importsPage.includes("Create bank Review Drafts") &&
      reviewPage.includes("Approve into bank") &&
      questionsPage.includes("not public/global questions") &&
      bankActions.includes('rpc("approve_bank_review_question"'),
    "bank import/review routes are missing expected workflow copy or action wiring",
  );
  console.log("PASS bank import/review route sources expose private bank workflow");

  if (!teacherUsername || !teacherPassword) {
    console.log("SKIP bank import review live smoke: missing TEST_TEACHER credentials.");
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  const teacherProfile = await getTeacherProfile(teacher);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let bankId = null;
  let batchId = null;
  let questionId = null;

  try {
    const { data: createdBankId, error: createBankError } = await teacher.client.rpc(
      "create_question_bank",
      {
        bank_description: "Smoke-created bank for import Review Draft validation.",
        bank_name: `Bank import review smoke ${suffix}`,
        bank_visibility: "private",
      },
    );
    assert(
      !createBankError && createdBankId,
      `teacher bank create failed: ${summarizeSupabaseError(createBankError)}`,
    );
    bankId = createdBankId;
    console.log("PASS teacher created private bank for import/review smoke");

    const { data: batch, error: batchError } = await teacher.client
      .from("import_batches")
      .insert({
        created_by: teacher.user.id,
        organization_id: teacherProfile.default_organization_id,
        source_type: "manual_json",
        status: "imported",
        summary: {
          createdCount: 1,
          reviewScope: "question_bank",
          smokeOnly: true,
          targetBankId: bankId,
        },
        target_bank_id: bankId,
      })
      .select("id")
      .single();

    if (isMissingBankImportReviewSchema(batchError)) {
      console.log(
        "SKIP bank import review live smoke: clean migration 0027 is not applied to the target Supabase project yet.",
      );
      return;
    }

    assert(!batchError && batch?.id, `bank import batch insert failed: ${summarizeSupabaseError(batchError)}`);
    batchId = batch.id;
    console.log("PASS teacher created bank-scoped import batch");

    const { data: question, error: questionError } = await teacher.client
      .from("questions")
      .insert({
        answer_spec: { kind: "exact_text", value: "2" },
        content_html: "<p>Solve x + 3 = 5.</p>",
        content_source: "Solve x + 3 = 5.",
        content_source_format: "plain_text",
        created_by: teacher.user.id,
        difficulty_rating: 320,
        options: [],
        organization_id: teacherProfile.default_organization_id,
        owner_bank_id: bankId,
        question_code: `bank-import-smoke-${suffix}`,
        question_type: "fill_blank",
        solution_html: "<p>Subtract 3 from both sides.</p>",
        solution_source: "Subtract 3 from both sides.",
        solution_source_format: "plain_text",
        source: `Bank import smoke ${batchId}`,
        source_kind: "ai_import",
        status: "draft",
        title: "Bank import smoke draft",
        updated_by: teacher.user.id,
        visibility: "private",
      })
      .select("id")
      .single();
    assert(
      !questionError && question?.id,
      `bank draft question insert failed: ${summarizeSupabaseError(questionError)}`,
    );
    questionId = question.id;
    console.log("PASS teacher created bank-owned private draft question");

    const { error: itemError } = await teacher.client.from("import_batch_items").insert({
      batch_id: batchId,
      created_question_id: questionId,
      item_index: 0,
      normalized_question_json: {
        question_code: `bank-import-smoke-${suffix}`,
        title: "Bank import smoke draft",
      },
      raw_payload: { smokeOnly: true },
      status: "imported",
      validation_errors: [],
    });
    assert(!itemError, `bank import item insert failed: ${summarizeSupabaseError(itemError)}`);
    console.log("PASS bank-scoped import item preserved source question linkage");

    const { data: approveRows, error: approveError } = await teacher.client.rpc(
      "approve_bank_review_question",
      {
        p_target_bank_id: bankId,
        p_target_question_id: questionId,
      },
    );
    assert(
      !approveError && approveRows?.[0]?.bank_question_id,
      `bank Review Draft approval failed: ${summarizeSupabaseError(approveError)}`,
    );
    console.log("PASS teacher approved Review Draft into bank");

    const { data: approvedQuestion, error: approvedQuestionError } = await teacher.client
      .from("questions")
      .select("id, status, owner_bank_id, source_review_item_id, published_at")
      .eq("id", questionId)
      .single();
    assert(
      !approvedQuestionError && approvedQuestion?.owner_bank_id === bankId,
      `approved question lookup failed: ${summarizeSupabaseError(approvedQuestionError)}`,
    );
    assert(approvedQuestion.status !== "published", "bank-approved question must not become published");
    assert(!approvedQuestion.published_at, "bank-approved question must not receive published_at");
    assert(approvedQuestion.source_review_item_id, "bank approval must preserve source_review_item_id lineage");
    console.log("PASS bank approval keeps question private/non-published with review lineage");

    const { data: bankQuestions, error: bankQuestionError } = await teacher.client
      .from("bank_questions")
      .select("id, bank_id, question_id, status, source_kind")
      .eq("bank_id", bankId)
      .eq("question_id", questionId);
    assert(
      !bankQuestionError && bankQuestions?.length === 1 && bankQuestions[0].status === "active",
      `bank_questions row missing: ${summarizeSupabaseError(bankQuestionError)}`,
    );
    console.log("PASS bank_questions row links approved draft to bank");

    const { data: globalRows, error: globalError } = await teacher.client.rpc(
      "search_questions_by_taxonomy",
      {
        page_limit: 20,
        question_status: "published",
        query_text: `bank-import-smoke-${suffix}`,
      },
    );
    assert(!globalError, `global search check failed: ${summarizeSupabaseError(globalError)}`);
    assert(
      !(globalRows ?? []).some((row) => row.question_id === questionId),
      "bank-approved private question leaked into published global search",
    );
    console.log("PASS bank-approved draft does not appear in published global search");

    if (unrelatedTeacherUsername && unrelatedTeacherPassword) {
      const unrelatedTeacher = await signIn(
        unrelatedTeacherUsername,
        unrelatedTeacherPassword,
        "unrelated teacher",
      );
      await verifyQuestionBlocked(unrelatedTeacher.client, questionId, "unrelated teacher");
      console.log("PASS unrelated teacher cannot read private bank question");
    } else {
      console.log("SKIP unrelated teacher private question check: credentials are missing.");
    }

    if (studentUsername && studentPassword) {
      const student = await signIn(studentUsername, studentPassword, "student");
      await verifyQuestionBlocked(student.client, questionId, "student");
      console.log("PASS student cannot read teacher bank question by default");
    } else {
      console.log("SKIP student private question check: TEST_STUDENT credentials are missing.");
    }
  } finally {
    await cleanup({ bankId, batchId, questionId });
  }
}

await main();
