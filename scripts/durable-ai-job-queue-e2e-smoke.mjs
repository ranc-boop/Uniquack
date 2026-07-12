import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const hasReactServerCondition = process.execArgv.some(
  (arg) => arg === "--conditions=react-server" || arg === "-Creact-server",
);

if (!process.env.O2I_QUEUE_E2E_REEXECED && !hasReactServerCondition) {
  const scriptPath = fileURLToPath(import.meta.url);
  const child = spawnSync(
    process.execPath,
    [...process.execArgv, "--conditions=react-server", scriptPath, ...process.argv.slice(2)],
    { env: { ...process.env, O2I_QUEUE_E2E_REEXECED: "1" }, stdio: "inherit" },
  );
  process.exit(child.status ?? 1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env.disposable-smoke.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const teacherUsername = process.env.TEST_TEACHER_USERNAME;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;
const sourceBucket = "ai-import-sources";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function usernameToEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function jobFromRpc(data) {
  return Array.isArray(data) ? data[0] : data;
}

function buildSyntheticPdf() {
  const pageCount = 12;
  const pageText = new Map([
    [1, "Cover"],
    [2, "Question 1. What is 2 + 3? A) 4 B) 5 C) 6 D) 7"],
    [3, "Question 2. What is 4 + 4? A) 6 B) 7 C) 8 D) 9"],
    [8, "Answer key. Question 1: 5. Question 2: 8."],
  ]);
  const fontObjectId = 3 + pageCount * 2;
  const pageObjectIds = Array.from(
    { length: pageCount },
    (_, index) => 3 + index * 2,
  );
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  ];

  const escapePdfLiteral = (value) =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  for (const [index, pageObjectId] of pageObjectIds.entries()) {
    const contentObjectId = pageObjectId + 1;
    const text = pageText.get(index + 1) ?? "";
    const stream = text
      ? `BT\n/F1 14 Tf\n72 720 Td (${escapePdfLiteral(text)}) Tj\nET`
      : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

async function signInTeacher() {
  const client = createClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: usernameToEmail(teacherUsername),
    password: teacherPassword,
  });
  if (error || !data.user) throw new Error("Teacher smoke sign-in failed.");
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", data.user.id)
    .single();
  if (profileError || profile?.role !== "teacher" || profile.status !== "active") {
    throw new Error("Teacher smoke profile is not eligible.");
  }
  return { client, profile, user: data.user };
}

async function ensureNoOutstandingJobs(admin) {
  const { data, error } = await admin
    .from("ai_provider_jobs")
    .select("id")
    .in("status", ["queued", "leased", "processing", "retry_wait"]);
  assert(!error, "Unable to check queue safety before E2E smoke.");
  assert(!(data ?? []).length, "E2E smoke will not run while pre-existing queue work exists.");
}

async function createBank(teacher, suffix) {
  const { data, error } = await teacher.client.rpc("create_question_bank", {
    bank_description: "Smoke-only durable queue provider validation.",
    bank_name: `AI queue E2E smoke ${suffix}`,
    bank_visibility: "private",
  });
  assert(!error && data, "E2E smoke bank creation failed.");
  return data;
}

async function cleanupImport({ admin, bankId, batchId, jobId, sourcePath }) {
  if (batchId) {
    const { data: items } = await admin
      .from("import_batch_items")
      .select("created_question_id")
      .eq("batch_id", batchId);
    const questionIds = (items ?? []).map((item) => item.created_question_id).filter(Boolean);
    await admin.from("review_batches").delete().eq("source_record_id", batchId);
    if (questionIds.length) {
      await admin.from("question_taxonomy_assignments").delete().in("question_id", questionIds);
      await admin.from("questions").delete().in("id", questionIds);
    }
    await admin.from("ai_provider_operation_logs").delete().eq("related_record_id", batchId);
    await admin.from("import_batches").delete().eq("id", batchId);
  }
  if (sourcePath) await admin.storage.from(sourceBucket).remove([sourcePath]);
  if (jobId) await admin.from("ai_provider_jobs").delete().eq("id", jobId);
  if (bankId) await admin.from("question_banks").delete().eq("id", bankId);
}

function assertSafeJob(job, label) {
  const text = `${job.safe_message ?? ""} ${job.safe_error_code ?? ""}`.toLowerCase();
  assert(!text.includes("api key") && !text.includes("bearer ") && !text.includes("503"), `${label} stored raw provider diagnostics`);
}

async function runPdfE2E({ admin, runWorker, teacher, suffix }) {
  let bankId = null;
  let batchId = null;
  let jobId = null;
  let sourcePath = null;
  try {
    bankId = await createBank(teacher, `${suffix}-pdf`);
    const { data: provider, error: providerError } = await admin
      .from("ai_provider_profiles")
      .select("id, enabled, is_default, supports_pdf_input, api_key_last4")
      .eq("enabled", true)
      .eq("supports_pdf_input", true)
      .not("api_key_last4", "is", null)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    assert(!providerError && provider?.id, "No enabled AI PDF-capable provider is available.");

    batchId = randomUUID();
    const assetId = randomUUID();
    sourcePath = `ai-pdf-imports/${batchId}/${assetId}-queue-e2e.pdf`;
    const pdf = buildSyntheticPdf();
    const { error: batchError } = await admin.from("import_batches").insert({
      created_by: teacher.user.id,
      id: batchId,
      organization_id: teacher.profile.default_organization_id,
      source_type: "ai_pdf",
      status: "draft",
      summary: { aiPdfImport: { smokeOnly: true, sourceAssetId: assetId, targetBankId: bankId } },
      target_bank_id: bankId,
    });
    assert(!batchError, "PDF E2E batch creation failed.");
    const { error: assetError } = await admin.from("import_batch_assets").insert({
      asset_role: "source_pdf",
      batch_id: batchId,
      created_by: teacher.user.id,
      id: assetId,
      metadata: { smokeOnly: true },
      mime_type: "application/pdf",
      object_path: sourcePath,
      original_filename: "queue-e2e.pdf",
      size_bytes: pdf.length,
      status: "ready",
    });
    assert(!assetError, "PDF E2E source asset creation failed.");
    const { error: uploadError } = await admin.storage
      .from(sourceBucket)
      .upload(sourcePath, pdf, { contentType: "application/pdf", upsert: false });
    assert(!uploadError, "PDF E2E source upload failed.");

    const { data: queued, error: enqueueError } = await teacher.client.rpc("enqueue_ai_provider_job", {
      p_idempotency_key: `queue-e2e-pdf:${batchId}`,
      p_job_kind: "ai_pdf_extract",
      p_payload: { operationVersion: 1, sourceAssetId: assetId },
      p_provider_profile_id: provider.id,
      p_resource_id: batchId,
      p_resource_type: "import_batch",
      p_target_bank_id: bankId,
    });
    const job = jobFromRpc(queued);
    assert(!enqueueError && job?.id, "PDF E2E enqueue failed.");
    jobId = job.id;
    assert(job.status === "queued", "PDF action did not return before provider completion.");

    let summary = { completed: 0, retryWaiting: 0 };
    let workerThrew = false;
    try {
      summary = await runWorker({ limit: 1 });
    } catch {
      workerThrew = true;
    }
    const { data: finished, error: finishedError } = await admin
      .from("ai_provider_jobs")
      .select("status, retryable, available_at, safe_message, safe_error_code, target_bank_id")
      .eq("id", jobId)
      .single();
    assert(!finishedError && finished?.target_bank_id === bankId, "PDF job lost target bank scope.");
    assertSafeJob(finished, "PDF job");

    if (workerThrew && !["retry_wait", "failed"].includes(finished.status)) {
      throw new Error("PDF worker exited before recording a safe terminal provider state.");
    }

    if (finished.status === "completed") {
      const { data: completedBatch, error: completedBatchError } = await admin
        .from("import_batches")
        .select("summary")
        .eq("id", batchId)
        .single();
      const selectiveExecutionPlan = completedBatch?.summary?.aiPdfImport?.selectiveExecutionPlan;
      assert(
        !completedBatchError &&
          selectiveExecutionPlan?.version === "ai_pdf_selective_execution_v1" &&
          selectiveExecutionPlan?.eligibility === "eligible" &&
          selectiveExecutionPlan?.sentPageCount < selectiveExecutionPlan?.totalPageCount &&
          Array.isArray(selectiveExecutionPlan?.originalPageMap),
        "completed PDF job did not retain an eligible selective execution plan with original page mapping",
      );
      assert(
        !/base64|signed.?url|raw.?prompt|provider.?response|secret/i.test(
          JSON.stringify(selectiveExecutionPlan),
        ),
        "selective execution summary retained private provider or source content",
      );
      const { data: items, error: itemsError } = await admin
        .from("import_batch_items")
        .select("created_question_id")
        .eq("batch_id", batchId);
      assert(!itemsError && (items ?? []).length > 0, "completed PDF job created no import items");
      const questionIds = items.map((item) => item.created_question_id).filter(Boolean);
      const { data: questions, error: questionsError } = await admin
        .from("questions")
        .select("id, owner_bank_id, status, published_at, visibility")
        .in("id", questionIds);
      assert(!questionsError && questions.length === questionIds.length, "completed PDF job lost generated drafts");
      assert(
        questions.every((question) => question.owner_bank_id === bankId && question.status === "draft" && question.published_at === null && question.visibility !== "public"),
        "PDF queue generated public or non-bank-private content",
      );
      // AI PDF import Review Drafts are the private, bank-owned question rows
      // shown by /teacher/banks/[bankId]/review. A separate review_batches row
      // is optional for this path, so do not mistake its absence for a failed
      // teacher review handoff.
      assert(
        questions.every((question) => question.owner_bank_id === bankId && question.status === "draft"),
        "PDF queue did not leave generated questions in the bank Review Draft state",
      );
      const { data: assignments, error: assignmentError } = await admin
        .from("assignments")
        .select("id")
        .eq("source_record_id", batchId);
      assert(!assignmentError && !(assignments ?? []).length, "PDF queue created an Assignment");
      const { data: telemetry, error: telemetryError } = await admin
        .from("ai_operation_telemetry")
        .select("actual_input_tokens, actual_output_tokens, actual_total_tokens, estimated_total_cost_micros, provider_latency_ms, execution_latency_ms, final_status")
        .eq("queue_job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      assert(
        !telemetryError &&
          telemetry?.final_status === "completed" &&
          (telemetry.actual_input_tokens === null || telemetry.actual_input_tokens >= 0) &&
          (telemetry.actual_output_tokens === null || telemetry.actual_output_tokens >= 0) &&
          (telemetry.actual_total_tokens === null || telemetry.actual_total_tokens >= 0) &&
          (telemetry.estimated_total_cost_micros === null || telemetry.estimated_total_cost_micros >= 0) &&
          (telemetry.provider_latency_ms === null || telemetry.provider_latency_ms >= 0) &&
          telemetry.execution_latency_ms >= 0,
        "completed PDF job did not retain safe operations telemetry",
      );
      console.log(`PASS bounded AI PDF queue E2E completed (${summary.completed} job)`);
      return "completed";
    }

    assert(
      ["retry_wait", "failed"].includes(finished.status),
      "PDF provider failure was not retained as a safe terminal queue state",
    );
    if (finished.status === "retry_wait") {
      assert(
        finished.retryable === true && new Date(finished.available_at) > new Date(),
        "Retryable PDF provider failure did not preserve a future retry window.",
      );
      console.log(`BLOCKED bounded AI PDF queue E2E at transient provider availability (${summary.retryWaiting} retrying job)`);
      return "retry_wait";
    }
    assert(finished.retryable === false, "Permanent PDF provider failure was incorrectly marked retryable.");
    console.log("BLOCKED bounded AI PDF queue E2E at a safe permanent provider failure");
    return "failed";
  } finally {
    await cleanupImport({ admin, bankId, batchId, jobId, sourcePath });
  }
}

async function runBlueprintE2E({ admin, runWorker, teacher, suffix }) {
  let bankId = null;
  let blueprintId = null;
  let sourceQuestionId = null;
  let jobId = null;
  let generatedBatchId = null;
  try {
    const { data: tag, error: tagError } = await admin
      .from("taxonomy_nodes")
      .select("tag_id, label, facet_key")
      .eq("status", "active")
      .eq("is_assignable", true)
      .eq("node_kind", "tag")
      .limit(1)
      .maybeSingle();
    assert(!tagError && tag?.tag_id, "No active assignable taxonomy tag is available for Blueprint E2E.");

    bankId = await createBank(teacher, `${suffix}-blueprint`);
    sourceQuestionId = randomUUID();
    const sourceBankQuestionId = randomUUID();
    blueprintId = randomUUID();
    const { error: sourceQuestionError } = await admin.from("questions").insert({
      answer_spec: { accepted_answers: ["5"], final_answers: ["5"], kind: "fill_blank" },
      content_html: "<p>What is 2 + 3?</p>",
      content_source: "What is 2 + 3?",
      content_source_format: "plain_text",
      created_by: teacher.user.id,
      difficulty_rating: 250,
      id: sourceQuestionId,
      options: [],
      organization_id: teacher.profile.default_organization_id,
      owner_bank_id: bankId,
      question_code: `queue-e2e-source-${suffix}`,
      question_type: "fill_blank",
      solution_html: "<p>2 + 3 = 5.</p>",
      solution_source: "2 + 3 = 5.",
      solution_source_format: "plain_text",
      source: "Durable queue Blueprint E2E source",
      source_kind: "manual",
      status: "draft",
      title: "Durable queue Blueprint source",
      updated_by: teacher.user.id,
      visibility: "private",
    });
    assert(!sourceQuestionError, "Blueprint E2E source question create failed.");
    const { error: sourceBankQuestionError } = await admin.from("bank_questions").insert({
      added_by: teacher.user.id,
      bank_id: bankId,
      id: sourceBankQuestionId,
      metadata: { smokeOnly: true },
      question_id: sourceQuestionId,
      source_kind: "manual",
      status: "active",
    });
    assert(!sourceBankQuestionError, "Blueprint E2E source bank link failed.");
    const { error: sourceTagError } = await admin.from("question_taxonomy_assignments").insert({
      question_id: sourceQuestionId,
      review_status: "approved",
      source: "manual",
      tag_id: tag.tag_id,
    });
    assert(!sourceTagError, "Blueprint E2E source taxonomy setup failed.");

    const { error: blueprintError } = await admin.from("question_blueprints").insert({
      answer_spec_pattern: { guidance: "One exact numeric fill-blank answer.", kind: "fill_blank" },
      blueprint_kind: "bank_generated",
      calibration_status: "calibrated",
      created_by: teacher.user.id,
      description: "Generate one original arithmetic fill-blank transfer item.",
      difficulty_profile: { teacherMix: "One warm-up item." },
      distractor_pattern: { guidance: "No distractors for fill blank." },
      generation_blocking_reasons: [],
      generation_constraints: {
        expectedQuestionCount: 1,
        questionTypeMix: { observed: { fill_blank: 1 }, teacherMix: "fill_blank" },
        reviewDraftGateRequired: true,
      },
      generation_ready: true,
      generation_readiness: "generation_ready",
      id: blueprintId,
      metadata: { builderCore: { sourceQuestionCount: 1 }, smokeOnly: true },
      organization_id: teacher.profile.default_organization_id,
      originality_constraints: { guidance: "Use different wording and numbers; preserve only assessment structure." },
      owner_id: teacher.user.id,
      owner_scope: "teacher",
      question_pattern: { purpose: "Original arithmetic transfer item.", summary: "Original arithmetic fill blank." },
      required_elements: ["one arithmetic expression", "one exact answer"],
      source_bank_id: bankId,
      source_kind: "question_bank",
      source_refs: [{ bank_question_id: sourceBankQuestionId, question_id: sourceQuestionId, title: "Durable queue Blueprint source" }],
      status: "approved",
      taxonomy_targets: [{ facet_key: tag.facet_key, label: tag.label, tag_id: tag.tag_id }],
      title: `Durable queue Blueprint ${suffix}`,
      updated_by: teacher.user.id,
      visibility: "private",
    });
    assert(!blueprintError, "Blueprint E2E ready Blueprint create failed.");
    const { error: blueprintLinkError } = await admin.from("bank_blueprints").insert({
      added_by: teacher.user.id,
      bank_id: bankId,
      blueprint_id: blueprintId,
      metadata: { smokeOnly: true },
      relation_kind: "generated_from_bank",
      status: "active",
    });
    assert(!blueprintLinkError, "Blueprint E2E bank link failed.");

    const { data: queued, error: enqueueError } = await teacher.client.rpc("enqueue_ai_provider_job", {
      p_idempotency_key: `queue-e2e-blueprint:${blueprintId}`,
      p_job_kind: "blueprint_generate_questions",
      p_payload: { blueprintVersion: 1, operationVersion: 1 },
      p_provider_profile_id: null,
      p_resource_id: blueprintId,
      p_resource_type: "question_blueprint",
      p_target_bank_id: bankId,
    });
    const queuedJob = jobFromRpc(queued);
    assert(!enqueueError && queuedJob?.id && queuedJob.status === "queued", "Blueprint E2E enqueue did not return immediately.");
    jobId = queuedJob.id;

    const summary = await runWorker({ limit: 1 });
    const { data: finished, error: finishedError } = await admin
      .from("ai_provider_jobs")
      .select("status, retryable, available_at, safe_message, safe_error_code, target_bank_id")
      .eq("id", jobId)
      .single();
    assert(!finishedError && finished?.target_bank_id === bankId, "Blueprint job lost target bank scope.");
    assertSafeJob(finished, "Blueprint job");

    const { data: sourceAfter, error: sourceAfterError } = await admin
      .from("questions")
      .select("content_source, status, owner_bank_id, published_at")
      .eq("id", sourceQuestionId)
      .single();
    assert(
      !sourceAfterError &&
        sourceAfter.content_source === "What is 2 + 3?" &&
        sourceAfter.status === "draft" &&
        sourceAfter.owner_bank_id === bankId &&
        sourceAfter.published_at === null,
      "Blueprint queue mutated its source question",
    );

    if (finished.status === "completed") {
      const { data: batches, error: batchesError } = await admin
        .from("import_batches")
        .select("id, summary")
        .eq("target_bank_id", bankId)
        .eq("source_type", "course_builder")
        .order("created_at", { ascending: false })
        .limit(1);
      assert(!batchesError && batches?.[0]?.id, "completed Blueprint queue created no import batch");
      generatedBatchId = batches[0].id;
      const { data: items, error: itemsError } = await admin
        .from("import_batch_items")
        .select("created_question_id")
        .eq("batch_id", generatedBatchId);
      assert(!itemsError && (items ?? []).length === 1 && items[0].created_question_id, "Blueprint queue did not create one draft item");
      const generatedQuestionId = items[0].created_question_id;
      const { data: generated, error: generatedError } = await admin
        .from("questions")
        .select("owner_bank_id, status, published_at, source_kind, visibility, source_review_item_id")
        .eq("id", generatedQuestionId)
        .single();
      assert(
        !generatedError &&
          generated.owner_bank_id === bankId &&
          generated.status === "draft" &&
          generated.published_at === null &&
          generated.source_kind === "blueprint_generation" &&
          generated.visibility !== "public" &&
          generated.source_review_item_id,
        "Blueprint queue did not create a private, review-gated bank draft",
      );
      const { data: assignments, error: assignmentError } = await admin
        .from("assignments")
        .select("id")
        .eq("source_record_id", generatedBatchId);
      assert(!assignmentError && !(assignments ?? []).length, "Blueprint queue created an Assignment");
      console.log(`PASS bounded Blueprint queue E2E completed (${summary.completed} job)`);
      return "completed";
    }

    assert(
      ["retry_wait", "failed"].includes(finished.status),
      "Blueprint provider failure was not retained as a safe terminal queue state",
    );
    if (finished.status === "retry_wait") {
      assert(
        finished.retryable === true && new Date(finished.available_at) > new Date(),
        "Retryable Blueprint provider failure did not preserve a future retry window.",
      );
      console.log(`BLOCKED bounded Blueprint queue E2E at transient provider availability (${summary.retryWaiting} retrying job)`);
      return "retry_wait";
    }
    assert(finished.retryable === false, "Permanent Blueprint provider failure was incorrectly marked retryable.");
    console.log("BLOCKED bounded Blueprint queue E2E at a safe permanent provider failure");
    return "failed";
  } finally {
    if (generatedBatchId) {
      const { data: items } = await admin
        .from("import_batch_items")
        .select("created_question_id")
        .eq("batch_id", generatedBatchId);
      const generatedIds = (items ?? []).map((item) => item.created_question_id).filter(Boolean);
      await admin.from("review_batches").delete().eq("source_record_id", generatedBatchId);
      if (generatedIds.length) {
        await admin.from("question_taxonomy_assignments").delete().in("question_id", generatedIds);
        await admin.from("questions").delete().in("id", generatedIds);
      }
      await admin.from("import_batches").delete().eq("id", generatedBatchId);
    }
    if (sourceQuestionId) {
      await admin.from("question_taxonomy_assignments").delete().eq("question_id", sourceQuestionId);
      await admin.from("questions").delete().eq("id", sourceQuestionId);
    }
    if (blueprintId) {
      await admin.from("bank_blueprints").delete().eq("blueprint_id", blueprintId);
      await admin.from("question_blueprints").delete().eq("id", blueprintId);
    }
    if (jobId) await admin.from("ai_provider_jobs").delete().eq("id", jobId);
    if (bankId) await admin.from("question_banks").delete().eq("id", bankId);
  }
}

async function validateSelectivePdfFixture() {
  const require = createRequire(import.meta.url);
  const jiti = require("jiti")(import.meta.url, { alias: { "@": resolve(root, "src") } });
  const { getPdfPageCount } = jiti("../src/lib/ai-pdf-import/pdf.ts");
  const { generatePdfPreanalysis } = jiti("../src/lib/ai-pdf-import/preanalysis.ts");
  const { buildAIPacketPlanFromPreanalysis } = jiti("../src/lib/ai-pdf-import/packets.ts");
  const { buildAIExtractionBatchPlanFromPacketPlan } = jiti(
    "../src/lib/ai-pdf-import/extraction-batches.ts",
  );
  const { buildAISelectiveExecutionPlan } = jiti(
    "../src/lib/ai-pdf-import/selective-execution.ts",
  );
  const pdf = buildSyntheticPdf();
  const pageCount = await getPdfPageCount(pdf);
  const preanalysis = await generatePdfPreanalysis({ pageCount, pdfBuffer: pdf });
  const packetPlan = buildAIPacketPlanFromPreanalysis(preanalysis);
  const extractionBatchPlan = buildAIExtractionBatchPlanFromPacketPlan(packetPlan);
  const plan = buildAISelectiveExecutionPlan({
    extractionBatchPlan,
    packetPlan,
    preanalysis,
    providerStrategy: "gemini_native_pdf",
  });

  assert(pageCount === 12, "selective fixture must retain all 12 original source pages");
  assert(
    plan.eligibility === "eligible" &&
      plan.sentPageCount < plan.totalPageCount &&
      plan.originalPageMap.some((item) => item.localPage !== item.originalPage),
    "selective fixture must yield a real reduced-page plan with original-page mapping",
  );
  console.log(
    `PASS selective PDF fixture preanalysis (${plan.sentPageCount}/${plan.totalPageCount} source pages selected)`,
  );
}

async function main() {
  assert(url && anonKey && serviceRoleKey && teacherUsername && teacherPassword, "Missing clean queue E2E environment.");
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  await ensureNoOutstandingJobs(admin);
  const teacher = await signInTeacher();
  const require = createRequire(import.meta.url);
  const jiti = require("jiti")(import.meta.url, { alias: { "@": resolve(root, "src") } });
  const { runDurableAIProviderJobs: runWorker } = jiti("../src/lib/ai-jobs/worker.ts");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pdfResult = process.argv.includes("--blueprint-only")
    ? "previous_completed_run"
    : await runPdfE2E({ admin, runWorker, teacher, suffix });
  await ensureNoOutstandingJobs(admin);
  const blueprintResult = await runBlueprintE2E({ admin, runWorker, teacher, suffix });
  await ensureNoOutstandingJobs(admin);
  console.log(`PASS durable AI queue E2E completed with PDF=${pdfResult}, Blueprint=${blueprintResult}`);
}

if (process.argv.includes("--validate-selective-fixture")) {
  await validateSelectivePdfFixture();
} else {
  await main();
}
