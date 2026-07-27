import { randomUUID } from "node:crypto";
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

function isMissingBlueprintBuilderSchema(error) {
  const summary = summarizeSupabaseError(error).toLowerCase();
  return (
    error?.code === "42703" ||
    error?.code === "42P01" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    summary.includes("question_blueprints") ||
    summary.includes("bank_blueprints") ||
    summary.includes("owner_bank_id") ||
    summary.includes("schema cache") ||
    summary.includes("does not exist")
  );
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
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
    console.log(
      `SKIP blueprint builder ${label} check: credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `blueprint builder smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function cleanup({ bankId, bankQuestionId, blueprintId, questionId }) {
  if (!serviceRoleKey) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (blueprintId) {
    await admin.from("bank_blueprints").delete().eq("blueprint_id", blueprintId);
    await admin.from("question_blueprints").delete().eq("id", blueprintId);
  }

  if (bankQuestionId) {
    await admin.from("bank_questions").delete().eq("id", bankQuestionId);
  }

  if (questionId) {
    await admin.from("questions").delete().eq("id", questionId);
  }

  if (bankId) {
    await admin.from("question_banks").delete().eq("id", bankId);
  }

  console.log("PASS blueprint builder cleanup removed smoke-created rows");
}

async function runSourceSmoke() {
  const builder = await read("src/lib/teacher-blueprint-builder.ts");
  const actions = await read("src/app/teacher/blueprints/actions.ts");
  const newPage = await read("src/app/teacher/blueprints/new/page.tsx");
  const detailPage = await read("src/app/teacher/blueprints/[blueprintId]/page.tsx");
  const libraryUi = await read("src/app/teacher/blueprints/blueprint-library-ui.tsx");
  const bankBlueprintsPage = await read("src/app/teacher/banks/[bankId]/blueprints/page.tsx");
  const questionBanks = await read("src/lib/question-banks.ts");
  const smokeAll = await read("scripts/smoke-all.mjs");
  const blueprintMigration = await read("supabase/clean-migrations/0007_blueprint_engine.sql");
  const libraryMigration = await read("supabase/clean-migrations/0031_blueprint_library_foundation.sql");

  assert(
    builder.includes('import "server-only"') &&
      builder.includes("buildTeacherBlueprintPayload") &&
      builder.includes("buildTeacherBlueprintReadiness") &&
      builder.includes("sourceExampleFromBankQuestion") &&
      builder.includes("sourceQuestionIds") &&
      builder.includes("noProviderCall: true") &&
      builder.includes("reviewDraftGateRequired: true") &&
      !builder.includes("generateContent") &&
      !builder.includes("executeDeepSeek") &&
      !builder.includes("AI_PROVIDER"),
    "teacher Blueprint builder helper must be server-only, typed, and provider-free",
  );

  assert(
    actions.includes("canManageBankContent") &&
      actions.includes("listBankApprovedQuestions") &&
      actions.includes("sourceBankQuestionIds") &&
      actions.includes('row.status === "active"') &&
      actions.includes('row.question?.status === "draft"') &&
      actions.includes("!row.question.published_at") &&
      actions.includes('blueprint_kind: sourceBankId ? "bank_generated" : "manual"') &&
      actions.includes('relation_kind: sourceExamples.length ? "generated_from_bank" : "linked"') &&
      actions.includes("updateTeacherBlueprintPlan") &&
      actions.includes('generation_readiness: "uncalibrated"') &&
      actions.includes('calibration_status: "invalidated"') &&
      !actions.includes("createReviewDraft") &&
      !actions.includes("executeDeepSeek") &&
      !actions.includes("callAIPdfExtractionProvider") &&
      !actions.includes("publishAssignment"),
    "Blueprint actions must build from approved bank questions, invalidate readiness on edit, and avoid provider/review/publish shortcuts",
  );

  assert(
    newPage.includes("Select source/example questions") &&
      newPage.includes("sourceBankQuestionIds") &&
      newPage.includes("Planning structure") &&
      newPage.includes("expectedQuestionCount") &&
      newPage.includes("questionTypeMix") &&
      newPage.includes("requiredElements") &&
      newPage.includes("answerPattern") &&
      newPage.includes("Blueprint output must flow through Review Drafts and Library approval") &&
      bankBlueprintsPage.includes("Build from Library questions") &&
      bankBlueprintsPage.includes("/teacher/blueprints/new?bankId="),
    "Blueprint builder UI must expose bank source selection and structured planning fields",
  );

  assert(
    detailPage.includes("Structured Blueprint editor") &&
      detailPage.includes("Blueprint preview") &&
      detailPage.includes("Readiness checklist") &&
      detailPage.includes("Warnings for missing fields") &&
      detailPage.includes("Save Blueprint plan") &&
      detailPage.includes("Source lineage and constraints") &&
      detailPage.includes("Generate Review Drafts") &&
      detailPage.includes("Provider choice, model, and credentials stay admin-only") &&
      libraryUi.includes("Source examples") &&
      libraryUi.includes("Readiness"),
    "Blueprint detail/library UI must expose preview, edit, readiness, and gated Review Draft generation",
  );

  assert(
    questionBanks.includes('"published_at"') &&
      questionBanks.includes("BankApprovedQuestion") &&
      questionBanks.includes("listBankApprovedQuestions"),
    "Bank approved-question projection must include published_at for source eligibility checks",
  );

  assert(
    blueprintMigration.includes("generation_ready") &&
      blueprintMigration.includes("generation_readiness") &&
      blueprintMigration.includes("source_refs") &&
      libraryMigration.includes("source_bank_id") &&
      libraryMigration.includes("create table if not exists public.bank_blueprints") &&
      libraryMigration.includes("blueprint_kind"),
    "Existing clean Blueprint schema must support builder payloads without a new migration",
  );

  assert(
    smokeAll.includes("blueprint-builder-core-smoke.mjs"),
    "smoke-all must include Blueprint Builder core smoke coverage",
  );

  console.log("PASS blueprint builder core source smoke");
}

async function verifyPrivateBlueprintBlocked(client, blueprintId, label) {
  const { data, error } = await client
    .from("question_blueprints")
    .select("id")
    .eq("id", blueprintId);

  assert(
    !error,
    `${label} private Blueprint query failed: ${summarizeSupabaseError(error)}`,
  );
  assert(!data?.length, `${label} unexpectedly read private teacher Blueprint`);
}

async function runLiveSmoke() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("SKIP blueprint builder live smoke: missing Supabase URL/anon key.");
    return;
  }

  if (!teacherUsername || !teacherPassword) {
    console.log("SKIP blueprint builder live smoke: missing TEST_TEACHER credentials.");
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  if (!teacher) return;

  const { data: profile, error: profileError } = await teacher.client
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", teacher.user.id)
    .single();

  assert(
    !profileError,
    `blueprint builder teacher profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile.role === "teacher", "blueprint builder smoke requires TEST_TEACHER credentials");
  assert(profile.status === "active", "blueprint builder smoke teacher must be active");
  assert(profile.default_organization_id, "teacher must have a default organization");

  const probe = await teacher.client
    .from("question_blueprints")
    .select("id, source_refs, source_bank_id, generation_constraints")
    .limit(1);

  if (isMissingBlueprintBuilderSchema(probe.error)) {
    console.log(
      "SKIP blueprint builder live smoke: clean Blueprint/bank schema is not applied to the target Supabase project yet.",
    );
    return;
  }

  assert(
    !probe.error,
    `blueprint builder schema probe failed: ${summarizeSupabaseError(probe.error)}`,
  );

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let bankId = null;
  let bankQuestionId = null;
  let blueprintId = null;
  let questionId = null;

  try {
    const { data: createdBankId, error: createBankError } = await teacher.client.rpc(
      "create_question_bank",
      {
        bank_description: "Smoke-created bank for Blueprint Builder validation.",
        bank_name: `Blueprint Builder smoke ${suffix}`,
        bank_visibility: "private",
      },
    );

    assert(
      !createBankError && createdBankId,
      `blueprint builder bank create failed: ${summarizeSupabaseError(createBankError)}`,
    );
    bankId = createdBankId;
    console.log("PASS blueprint builder live smoke created private source bank");

    questionId = randomUUID();
    const { error: questionError } = await teacher.client.from("questions").insert({
      answer_spec: { kind: "exact_text", value: "5" },
      content_html: "<p>What is 2 + 3?</p>",
      content_source: "What is 2 + 3?",
      content_source_format: "plain_text",
      created_by: teacher.user.id,
      difficulty_rating: 240,
      id: questionId,
      options: [],
      organization_id: profile.default_organization_id,
      owner_bank_id: bankId,
      question_code: `blueprint-builder-smoke-${suffix}`,
      question_type: "fill_blank",
      solution_html: "<p>2 + 3 = 5.</p>",
      solution_source: "2 + 3 = 5.",
      solution_source_format: "plain_text",
      source: "Blueprint Builder smoke source question",
      source_kind: "manual",
      status: "draft",
      title: "Blueprint Builder smoke source question",
      updated_by: teacher.user.id,
      visibility: "private",
    });

    if (isMissingBlueprintBuilderSchema(questionError)) {
      console.log(
        "SKIP blueprint builder live smoke: bank-scoped question schema is not applied to the target Supabase project yet.",
      );
      return;
    }

    assert(
      !questionError,
      `blueprint builder source question insert failed: ${summarizeSupabaseError(questionError)}`,
    );
    console.log("PASS teacher can create a private bank source question");

    bankQuestionId = randomUUID();
    const { error: bankQuestionError } = await teacher.client.from("bank_questions").insert({
      added_by: teacher.user.id,
      bank_id: bankId,
      id: bankQuestionId,
      metadata: { smokeOnly: true },
      question_id: questionId,
      source_kind: "manual",
      status: "active",
    });

    assert(
      !bankQuestionError,
      `blueprint builder bank question link failed: ${summarizeSupabaseError(bankQuestionError)}`,
    );
    console.log("PASS source question is active in the selected bank");

    blueprintId = randomUUID();
    const sourceRefs = [
      {
        bank_question_id: bankQuestionId,
        kind: "bank_question",
        question_code: `blueprint-builder-smoke-${suffix}`,
        question_id: questionId,
        question_type: "fill_blank",
        source_kind: "manual",
        source_review_item_id: null,
        title: "Blueprint Builder smoke source question",
      },
    ];
    const { error: blueprintError } = await teacher.client
      .from("question_blueprints")
      .insert({
        answer_spec_pattern: {
          guidance: "Exact numeric answer with simple arithmetic reasoning.",
          source: "teacher_blueprint_builder",
        },
        blueprint_kind: "bank_generated",
        created_by: teacher.user.id,
        description: "Smoke-created Blueprint built from one approved bank source question.",
        difficulty_profile: {
          average: 240,
          distribution: { 240: 1 },
          max: 240,
          min: 240,
          teacherMix: "One simple warm-up item.",
        },
        distractor_pattern: {
          guidance: "No distractors for fill-blank source example.",
          source: "teacher_blueprint_builder",
        },
        generation_blocking_reasons: [
          "Source examples need existing taxonomy targets before generation readiness.",
        ],
        generation_constraints: {
          expectedQuestionCount: 1,
          noDirectStudentDelivery: true,
          questionTypeMix: {
            observed: { fill_blank: 1 },
            teacherMix: "fill_blank",
          },
          reviewDraftGateRequired: true,
        },
        generation_ready: false,
        generation_readiness: "uncalibrated",
        id: blueprintId,
        metadata: {
          builderCore: {
            sourceBankId: bankId,
            sourceQuestionCount: 1,
            sourceQuestionIds: [questionId],
            version: 1,
          },
          productSurface: "teacher_blueprint_builder_core",
          safety: {
            noAutoPublish: true,
            noDirectStudentDelivery: true,
            noProviderCall: true,
            noReviewDraftCreation: true,
            reviewDraftGateRequired: true,
          },
          smokeOnly: true,
        },
        organization_id: profile.default_organization_id,
        originality_constraints: {
          guidance: "Keep the structure without copying source wording.",
          source: "teacher_blueprint_builder",
        },
        owner_id: teacher.user.id,
        owner_scope: "teacher",
        question_pattern: {
          purpose: "Smoke source-grounded arithmetic pattern.",
          sourceExampleCount: 1,
          summary: "Smoke source-grounded arithmetic pattern.",
        },
        required_elements: ["One direct arithmetic operation"],
        source_bank_id: bankId,
        source_kind: "question_bank",
        source_refs: sourceRefs,
        status: "pending_review",
        taxonomy_targets: [],
        title: `Blueprint Builder smoke ${suffix}`,
        updated_by: teacher.user.id,
        visibility: "private",
      });

    assert(
      !blueprintError,
      `teacher Blueprint Builder insert failed: ${summarizeSupabaseError(blueprintError)}`,
    );

    const { error: linkError } = await teacher.client.from("bank_blueprints").upsert(
      {
        added_by: teacher.user.id,
        bank_id: bankId,
        blueprint_id: blueprintId,
        metadata: { source: "teacher_blueprint_builder_core", sourceQuestionCount: 1 },
        relation_kind: "generated_from_bank",
        status: "active",
      },
      { onConflict: "bank_id,blueprint_id" },
    );

    assert(
      !linkError,
      `teacher Blueprint Builder bank link failed: ${summarizeSupabaseError(linkError)}`,
    );

    const { data: blueprint, error: readError } = await teacher.client
      .from("question_blueprints")
      .select("id, blueprint_kind, source_bank_id, source_refs, metadata, generation_ready, generation_constraints, status, visibility")
      .eq("id", blueprintId)
      .single();

    assert(
      !readError && blueprint?.id === blueprintId,
      `teacher could not read built Blueprint: ${summarizeSupabaseError(readError)}`,
    );
    assert(blueprint.blueprint_kind === "bank_generated", "built Blueprint must be bank_generated");
    assert(blueprint.source_bank_id === bankId, "built Blueprint must preserve source bank");
    assert(blueprint.status === "pending_review", "built Blueprint must start as pending review/draft");
    assert(blueprint.visibility === "private", "built Blueprint must start private");
    assert(blueprint.generation_ready === false, "built Blueprint must not be generation-ready automatically");
    assert(
      blueprint.generation_constraints?.reviewDraftGateRequired === true,
      "built Blueprint must preserve Review Draft gate metadata",
    );
    assert(
      Array.isArray(blueprint.source_refs) && blueprint.source_refs[0]?.question_id === questionId,
      "built Blueprint must preserve source question lineage",
    );
    assert(
      blueprint.metadata?.safety?.noProviderCall === true &&
        blueprint.metadata?.safety?.noReviewDraftCreation === true &&
        blueprint.metadata?.safety?.noDirectStudentDelivery === true,
      "built Blueprint must preserve safety metadata",
    );
    console.log("PASS teacher can create private Blueprint from approved bank source question");

    const { data: links, error: linkReadError } = await teacher.client
      .from("bank_blueprints")
      .select("id, relation_kind, status")
      .eq("bank_id", bankId)
      .eq("blueprint_id", blueprintId);

    assert(
      !linkReadError && links?.length === 1 && links[0].relation_kind === "generated_from_bank",
      `teacher could not read generated bank Blueprint link: ${summarizeSupabaseError(linkReadError)}`,
    );
    console.log("PASS Blueprint is linked back to the selected bank");

    const { data: providerLogs, error: providerLogError } = await teacher.client
      .from("provider_operation_logs")
      .select("id")
      .eq("source_record_id", blueprintId);

    if (!providerLogError) {
      assert(!providerLogs?.length, "Blueprint Builder smoke unexpectedly created provider logs");
      console.log("PASS Blueprint Builder did not create provider operation logs");
    } else {
      console.log("SKIP provider log check: provider logs are not readable by this smoke account.");
    }

    const anon = createClient(supabaseUrl, supabaseAnonKey);
    await verifyPrivateBlueprintBlocked(anon, blueprintId, "anonymous user");
    console.log("PASS anonymous users cannot browse private built Blueprints");

    if (studentUsername && studentPassword) {
      const student = await signIn(studentUsername, studentPassword, "student");
      if (student) {
        await verifyPrivateBlueprintBlocked(student.client, blueprintId, "student");
        console.log("PASS students cannot browse private built Blueprints");
      }
    } else {
      console.log("SKIP student Blueprint Builder check: TEST_STUDENT credentials are missing.");
    }
  } finally {
    await cleanup({ bankId, bankQuestionId, blueprintId, questionId });
  }
}

await runSourceSmoke();
await runLiveSmoke();
