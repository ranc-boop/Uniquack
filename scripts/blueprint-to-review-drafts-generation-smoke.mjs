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

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

function sourceFunctionBody(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  assert(start >= 0, `${name} must exist`);
  const nextExport = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, nextExport >= 0 ? nextExport : source.length);
}

async function signIn(username, password, label) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });

  if (error) {
    console.log(
      `SKIP Blueprint generation ${label} check: credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `Blueprint generation smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function cleanup(ids) {
  if (!serviceRoleKey) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (ids.bankQuestionId) {
    await admin.from("bank_questions").delete().eq("id", ids.bankQuestionId);
  }
  if (ids.approvedBankQuestionId) {
    await admin.from("bank_questions").delete().eq("id", ids.approvedBankQuestionId);
  }
  if (ids.reviewItemId) {
    await admin.from("review_draft_items").delete().eq("id", ids.reviewItemId);
  }
  if (ids.reviewBatchId) {
    await admin.from("review_batches").delete().eq("id", ids.reviewBatchId);
  }
  if (ids.importBatchId) {
    await admin.from("import_batch_items").delete().eq("batch_id", ids.importBatchId);
    await admin.from("import_batches").delete().eq("id", ids.importBatchId);
  }
  if (ids.generatedQuestionId) {
    await admin.from("questions").delete().eq("id", ids.generatedQuestionId);
  }
  if (ids.blueprintId) {
    await admin.from("bank_blueprints").delete().eq("blueprint_id", ids.blueprintId);
    await admin.from("question_blueprints").delete().eq("id", ids.blueprintId);
  }
  if (ids.sourceQuestionId) {
    await admin.from("questions").delete().eq("id", ids.sourceQuestionId);
  }
  if (ids.bankId) {
    await admin.from("question_banks").delete().eq("id", ids.bankId);
  }

  console.log("PASS Blueprint generation cleanup removed smoke-created rows");
}

async function runSourceSmoke() {
  const generation = await read("src/lib/teacher-blueprint-generation.ts");
  const actions = await read("src/app/teacher/blueprints/actions.ts");
  const detailPage = await read("src/app/teacher/blueprints/[blueprintId]/page.tsx");
  const reviewPage = await read("src/app/teacher/banks/[bankId]/review/page.tsx");
  const questionBanks = await read("src/lib/question-banks.ts");
  const batchImport = await read("src/lib/batch-import/service.ts");
  const geminiNative = await read("src/lib/ai-providers/gemini-native.ts");
  const smokeAll = await read("scripts/smoke-all.mjs");
  const actionBody = sourceFunctionBody(actions, "generateTeacherBlueprintReviewDraftsAction");

  assert(
    generation.includes('import "server-only"') &&
      generation.includes("listEnabledAIProviderProfilesForServerUse") &&
      generation.includes("loadAIProviderProfileForServerUse") &&
      generation.includes("buildTeacherBlueprintGenerationPrompt") &&
      generation.includes("generateTeacherBlueprintReviewDrafts") &&
      generation.includes("getTeacherQuestionBankDetail") &&
      generation.includes("canManageBankContent") &&
      generation.includes("listBankApprovedQuestions") &&
      generation.includes("activeAssignableTagIds") &&
      generation.includes("importBatchImportJson") &&
      generation.includes('sourceType: "course_builder"') &&
      generation.includes('source_kind: "blueprint_generation"') &&
      generation.includes("review_batches") &&
      generation.includes("review_draft_items") &&
      generation.includes('source: "teacher_course_blueprint_generation"') &&
      generation.includes("TEACHER_BLUEPRINT_TRANSIENT_PROVIDER_FAILURE_MESSAGE") &&
      !generation.includes("process.env.AI_PROVIDER") &&
      !generation.includes("providerProfileId") &&
      !generation.includes("createAssignment"),
    "teacher Blueprint generation helper must be server-only, provider-resolved, bank-scoped, and Review Draft gated",
  );

  assert(
    actionBody.includes("await requireTeacher()") &&
      actionBody.includes("getTeacherBlueprintDetail") &&
      actionBody.includes("generateTeacherBlueprintReviewDrafts") &&
      actionBody.includes("revalidatePath(`/teacher/banks/${summary.targetBankId}/review`)") &&
      actionBody.includes("redirectWithSaved") &&
      !actionBody.includes("providerId") &&
      !actionBody.includes("model") &&
      !actionBody.includes("apiKey") &&
      !actionBody.includes("createAssignment"),
    "teacher Blueprint generation action must authenticate, load Blueprint server-side, and avoid provider/client config",
  );

  assert(
    detailPage.includes("Generate Review Drafts") &&
      detailPage.includes("generateTeacherBlueprintReviewDraftsAction") &&
      detailPage.includes("listTeacherBlueprintGenerationProviderStatus") &&
      detailPage.includes("buildTeacherBlueprintGenerationGate") &&
      detailPage.includes("Provider choice, model, and credentials stay admin-only") &&
      detailPage.includes("Recent generation history") &&
      detailPage.includes("Open Review Drafts") &&
      !detailPage.includes("providerProfileId") &&
      !detailPage.includes("apiKey"),
    "Blueprint detail page must expose Review Draft generation without provider configuration",
  );

  assert(
    reviewPage.includes("Generated from Blueprint") &&
      reviewPage.includes("Open source Blueprint") &&
      reviewPage.includes("reviewItemPayload") &&
      reviewPage.includes("Approval adds this question") &&
      reviewPage.includes("not globally published"),
    "bank Review Draft page must show Blueprint lineage and keep bank approval boundary copy",
  );

  assert(
    questionBanks.includes("reviewItemPayload") &&
      questionBanks.includes("draft_payload") &&
      questionBanks.includes("validation_warnings") &&
      questionBanks.includes("warningMessagesByQuestionId"),
    "bank Review Draft loader must expose review-item payloads and warnings",
  );

  assert(
    batchImport.includes('| "course_builder"') &&
      batchImport.includes('status: "draft"') &&
      batchImport.includes("owner_bank_id: targetBankContext?.bankId") &&
      batchImport.includes("published_at") === false,
    "batch import service must allow course_builder source batches while preserving draft bank ownership",
  );

  assert(
    geminiNative.includes("generateWithGeminiNativeText") &&
      geminiNative.includes('"X-Goog-Api-Key": "[redacted]"'),
    "Gemini native adapter must support server-side text generation with redacted debug headers",
  );

  assert(
    smokeAll.includes("blueprint-to-review-drafts-generation-smoke.mjs"),
    "smoke-all must include Blueprint to Review Drafts smoke",
  );

  console.log("PASS Blueprint to Review Drafts source smoke");
}

async function runLiveNonProviderSmoke() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("SKIP Blueprint generation live smoke: missing Supabase URL/anon key.");
    return;
  }
  if (!teacherUsername || !teacherPassword) {
    console.log("SKIP Blueprint generation live smoke: missing TEST_TEACHER credentials.");
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
    `teacher profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile.role === "teacher", "Blueprint generation smoke requires TEST_TEACHER credentials");
  assert(profile.default_organization_id, "teacher must have default organization");

  const { data: tag, error: tagError } = await teacher.client
    .from("taxonomy_nodes")
    .select("tag_id")
    .eq("status", "active")
    .eq("is_assignable", true)
    .eq("node_kind", "tag")
    .limit(1)
    .maybeSingle();

  assert(!tagError, `taxonomy tag probe failed: ${summarizeSupabaseError(tagError)}`);
  if (!tag?.tag_id) {
    console.log("SKIP Blueprint generation live smoke: no active assignable taxonomy tag exists.");
    return;
  }

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ids = {
    approvedBankQuestionId: null,
    bankId: null,
    bankQuestionId: null,
    blueprintId: randomUUID(),
    generatedQuestionId: randomUUID(),
    importBatchId: randomUUID(),
    reviewBatchId: randomUUID(),
    reviewItemId: randomUUID(),
    sourceQuestionId: randomUUID(),
  };

  try {
    const { data: bankId, error: bankError } = await teacher.client.rpc(
      "create_question_bank",
      {
        bank_description: "Smoke-created bank for Blueprint generation validation.",
        bank_name: `Blueprint generation smoke ${suffix}`,
        bank_visibility: "private",
      },
    );
    assert(
      !bankError && bankId,
      `bank create failed: ${summarizeSupabaseError(bankError)}`,
    );
    ids.bankId = bankId;
    console.log("PASS Blueprint generation smoke created private target bank");

    const { error: sourceQuestionError } = await teacher.client.from("questions").insert({
      answer_spec: { accepted_answers: ["5"], final_answers: ["5"], kind: "fill_blank" },
      content_html: "<p>What is 2 + 3?</p>",
      content_source: "What is 2 + 3?",
      content_source_format: "plain_text",
      created_by: teacher.user.id,
      difficulty_rating: 250,
      id: ids.sourceQuestionId,
      options: [],
      organization_id: profile.default_organization_id,
      owner_bank_id: bankId,
      question_code: `bpgen-source-${suffix}`,
      question_type: "fill_blank",
      solution_html: "<p>2 + 3 = 5.</p>",
      solution_source: "2 + 3 = 5.",
      solution_source_format: "plain_text",
      source: "Blueprint generation smoke source",
      source_kind: "manual",
      status: "draft",
      title: "Blueprint generation smoke source question",
      updated_by: teacher.user.id,
      visibility: "private",
    });
    assert(
      !sourceQuestionError,
      `source question insert failed: ${summarizeSupabaseError(sourceQuestionError)}`,
    );

    ids.bankQuestionId = randomUUID();
    const { error: bankQuestionError } = await teacher.client.from("bank_questions").insert({
      added_by: teacher.user.id,
      bank_id: bankId,
      id: ids.bankQuestionId,
      metadata: { smokeOnly: true },
      question_id: ids.sourceQuestionId,
      source_kind: "manual",
      status: "active",
    });
    assert(
      !bankQuestionError,
      `source bank question insert failed: ${summarizeSupabaseError(bankQuestionError)}`,
    );

    const { error: sourceTagError } = await teacher.client.from("question_taxonomy_assignments").insert({
      question_id: ids.sourceQuestionId,
      review_status: "approved",
      source: "manual",
      tag_id: tag.tag_id,
    });
    assert(
      !sourceTagError,
      `source taxonomy insert failed: ${summarizeSupabaseError(sourceTagError)}`,
    );

    const { error: blueprintError } = await teacher.client.from("question_blueprints").insert({
      answer_spec_pattern: {
        guidance: "Fill-blank answer with one exact numeric result.",
        source: "teacher_blueprint_builder",
      },
      blueprint_kind: "bank_generated",
      created_by: teacher.user.id,
      description: "Smoke Blueprint that generates review-gated bank drafts.",
      difficulty_profile: { teacherMix: "One warm-up level item." },
      distractor_pattern: { guidance: "No distractors for fill blank." },
      generation_blocking_reasons: [],
      generation_constraints: {
        expectedQuestionCount: 1,
        questionTypeMix: { observed: { fill_blank: 1 }, teacherMix: "fill_blank" },
        reviewDraftGateRequired: true,
      },
      generation_ready: false,
      generation_readiness: "uncalibrated",
      id: ids.blueprintId,
      metadata: {
        productSurface: "teacher_blueprint_generation_smoke",
        safety: {
          noAutoPublish: true,
          noDirectStudentDelivery: true,
          reviewDraftGateRequired: true,
        },
      },
      organization_id: profile.default_organization_id,
      originality_constraints: {
        guidance: "Change wording and numbers; preserve only the structure.",
        source: "teacher_blueprint_builder",
      },
      owner_id: teacher.user.id,
      owner_scope: "teacher",
      question_pattern: {
        purpose: "Generate a simple arithmetic fill-blank transfer item.",
        sourceExampleCount: 1,
        summary: "Generate a simple arithmetic fill-blank transfer item.",
      },
      required_elements: ["one arithmetic expression", "one exact answer"],
      source_bank_id: bankId,
      source_kind: "question_bank",
      source_refs: [
        {
          bank_question_id: ids.bankQuestionId,
          kind: "bank_question",
          question_id: ids.sourceQuestionId,
          question_type: "fill_blank",
          title: "Blueprint generation smoke source question",
        },
      ],
      status: "pending_review",
      taxonomy_targets: [{ facet_key: "concept", label: "Smoke tag", tag_id: tag.tag_id }],
      title: `Blueprint generation smoke ${suffix}`,
      updated_by: teacher.user.id,
      visibility: "private",
    });
    assert(
      !blueprintError,
      `Blueprint insert failed: ${summarizeSupabaseError(blueprintError)}`,
    );

    const { error: linkError } = await teacher.client.from("bank_blueprints").insert({
      added_by: teacher.user.id,
      bank_id: bankId,
      blueprint_id: ids.blueprintId,
      metadata: { smokeOnly: true },
      relation_kind: "generated_from_bank",
      status: "active",
    });
    assert(!linkError, `bank Blueprint link failed: ${summarizeSupabaseError(linkError)}`);

    const { error: importBatchError } = await teacher.client.from("import_batches").insert({
      created_by: teacher.user.id,
      id: ids.importBatchId,
      organization_id: profile.default_organization_id,
      source_type: "course_builder",
      status: "imported",
      summary: {
        blueprintGeneration: {
          blueprintId: ids.blueprintId,
          createdDraftCount: 1,
          sourceQuestionCount: 1,
          targetBankId: bankId,
        },
        importedFrom: "teacher_blueprint_generation",
        reviewGate: "bank_review_required",
        reviewScope: "question_bank",
        targetBankId: bankId,
      },
      target_bank_id: bankId,
    });
    assert(
      !importBatchError,
      `import batch insert failed: ${summarizeSupabaseError(importBatchError)}`,
    );

    const { error: generatedQuestionError } = await teacher.client.from("questions").insert({
      answer_spec: { accepted_answers: ["9"], final_answers: ["9"], kind: "fill_blank" },
      content_html: "<p>What is 4 + 5?</p>",
      content_source: "What is 4 + 5?",
      content_source_format: "markdown_latex",
      created_by: teacher.user.id,
      difficulty_rating: 260,
      id: ids.generatedQuestionId,
      options: [],
      organization_id: profile.default_organization_id,
      owner_bank_id: bankId,
      published_at: null,
      question_code: `bpgen-draft-${suffix}`,
      question_type: "fill_blank",
      solution_html: "<p>4 + 5 = 9.</p>",
      solution_source: "4 + 5 = 9.",
      solution_source_format: "markdown_latex",
      source: `blueprint_generation:${ids.blueprintId}:${ids.importBatchId}`,
      source_kind: "blueprint_generation",
      status: "draft",
      title: "Blueprint-generated smoke draft",
      updated_by: teacher.user.id,
      visibility: "private",
    });
    assert(
      !generatedQuestionError,
      `generated question insert failed: ${summarizeSupabaseError(generatedQuestionError)}`,
    );

    const { error: importItemError } = await teacher.client.from("import_batch_items").insert({
      batch_id: ids.importBatchId,
      created_question_id: ids.generatedQuestionId,
      item_index: 0,
      normalized_question_json: {
        question_code: `bpgen-draft-${suffix}`,
        source: "blueprint_generation",
      },
      raw_payload: {
        ai_metadata: {
          blueprintId: ids.blueprintId,
          reviewRequired: true,
          source: "blueprint_generation",
        },
      },
      status: "imported",
      validation_errors: ["Smoke warning stays review-only."],
    });
    assert(
      !importItemError,
      `import item insert failed: ${summarizeSupabaseError(importItemError)}`,
    );

    const { error: reviewBatchError } = await teacher.client.from("review_batches").insert({
      created_by: teacher.user.id,
      id: ids.reviewBatchId,
      organization_id: profile.default_organization_id,
      source_kind: "blueprint_generation",
      source_record_id: ids.importBatchId,
      status: "pending_review",
      summary: {
        blueprintGeneration: {
          blueprintId: ids.blueprintId,
          blueprintTitle: `Blueprint generation smoke ${suffix}`,
          targetBankId: bankId,
        },
        reviewGate: "bank_review_required",
      },
      target_bank_id: bankId,
      title: "Blueprint generation smoke Review Drafts",
    });
    assert(
      !reviewBatchError,
      `review batch insert failed: ${summarizeSupabaseError(reviewBatchError)}`,
    );

    const { error: reviewItemError } = await teacher.client.from("review_draft_items").insert({
      created_question_id: ids.generatedQuestionId,
      draft_payload: {
        blueprintId: ids.blueprintId,
        blueprintTitle: `Blueprint generation smoke ${suffix}`,
        source: "blueprint_generation",
        sourceQuestionCount: 1,
        targetBankId: bankId,
      },
      id: ids.reviewItemId,
      item_kind: "question",
      review_batch_id: ids.reviewBatchId,
      status: "pending_review",
      target_bank_id: bankId,
      validation_warnings: ["Smoke warning stays review-only."],
    });
    assert(
      !reviewItemError,
      `review item insert failed: ${summarizeSupabaseError(reviewItemError)}`,
    );

    const { error: questionLineageError } = await teacher.client
      .from("questions")
      .update({ source_review_item_id: ids.reviewItemId })
      .eq("id", ids.generatedQuestionId)
      .eq("owner_bank_id", bankId)
      .is("published_at", null);
    assert(
      !questionLineageError,
      `generated question lineage update failed: ${summarizeSupabaseError(questionLineageError)}`,
    );

    const { error: generatedTagError } = await teacher.client.from("question_taxonomy_assignments").insert({
      question_id: ids.generatedQuestionId,
      review_status: "pending_review",
      source: "teacher_course_blueprint_generation",
      tag_id: tag.tag_id,
    });
    assert(
      !generatedTagError,
      `generated taxonomy insert failed: ${summarizeSupabaseError(generatedTagError)}`,
    );
    console.log("PASS generated Blueprint draft stays private, bank-scoped, and pending taxonomy review");

    const { data: draft, error: draftReadError } = await teacher.client
      .from("questions")
      .select("id, owner_bank_id, status, published_at, source_kind, visibility, source_review_item_id")
      .eq("id", ids.generatedQuestionId)
      .single();
    assert(
      !draftReadError,
      `generated draft read failed: ${summarizeSupabaseError(draftReadError)}`,
    );
    assert(draft.owner_bank_id === bankId, "generated draft owner_bank_id must be target bank");
    assert(draft.status === "draft", "generated draft must stay draft");
    assert(draft.published_at === null, "generated draft must not be published");
    assert(draft.source_kind === "blueprint_generation", "generated draft must preserve Blueprint source kind");
    assert(draft.source_review_item_id === ids.reviewItemId, "generated draft must link to review item");

    if (studentUsername && studentPassword) {
      const student = await signIn(studentUsername, studentPassword, "student");
      if (student) {
        const { data: studentDraft, error: studentDraftError } = await student.client
          .from("questions")
          .select("id")
          .eq("id", ids.generatedQuestionId);
        assert(
          !studentDraftError,
          `student private draft probe failed: ${summarizeSupabaseError(studentDraftError)}`,
        );
        assert(!studentDraft?.length, "student unexpectedly read private Blueprint-generated draft");
        console.log("PASS students cannot read unapproved Blueprint-generated bank drafts");
      }
    } else {
      console.log("SKIP student Blueprint generation boundary check: TEST_STUDENT credentials are missing.");
    }

    const { data: approved, error: approveError } = await teacher.client.rpc(
      "approve_bank_review_question",
      {
        p_target_bank_id: bankId,
        p_target_question_id: ids.generatedQuestionId,
      },
    );
    assert(
      !approveError,
      `approve generated draft into bank failed: ${summarizeSupabaseError(approveError)}`,
    );
    ids.approvedBankQuestionId = approved?.[0]?.bank_question_id ?? null;
    assert(ids.approvedBankQuestionId, "approval must return bank_question_id");

    const { data: approvedQuestion, error: approvedQuestionError } = await teacher.client
      .from("questions")
      .select("id, status, published_at, owner_bank_id")
      .eq("id", ids.generatedQuestionId)
      .single();
    assert(
      !approvedQuestionError,
      `approved draft question read failed: ${summarizeSupabaseError(approvedQuestionError)}`,
    );
    assert(approvedQuestion.status !== "published", "bank-approved generated question must not become globally published");
    assert(approvedQuestion.published_at === null, "bank-approved generated question must keep published_at null");
    assert(approvedQuestion.owner_bank_id === bankId, "bank-approved generated question must remain bank-owned");
    console.log("PASS generated Review Draft approves into bank without publishing globally");

    const { data: sourceQuestion, error: sourceReadError } = await teacher.client
      .from("questions")
      .select("id, status, published_at, owner_bank_id")
      .eq("id", ids.sourceQuestionId)
      .single();
    assert(
      !sourceReadError,
      `source question read failed: ${summarizeSupabaseError(sourceReadError)}`,
    );
    assert(sourceQuestion.status === "draft", "source question must remain unchanged draft");
    assert(sourceQuestion.published_at === null, "source question must not be published by generation");
    assert(sourceQuestion.owner_bank_id === bankId, "source question must remain in source bank");
    console.log("PASS source question remained unchanged");
  } finally {
    await cleanup(ids);
  }
}

await runSourceSmoke();
await runLiveNonProviderSmoke();
