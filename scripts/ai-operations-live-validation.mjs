import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import ts from "typescript";

const hasReactServerCondition = process.execArgv.some(
  (arg) => arg === "--conditions=react-server" || arg === "-Creact-server",
);

if (!process.env.O2I_AI_OPERATIONS_LIVE_REEXECED && !hasReactServerCondition) {
  const scriptPath = fileURLToPath(import.meta.url);
  const child = spawnSync(
    process.execPath,
    [...process.execArgv, "--conditions=react-server", scriptPath],
    {
      env: { ...process.env, O2I_AI_OPERATIONS_LIVE_REEXECED: "1" },
      stdio: "inherit",
    },
  );
  process.exit(child.status ?? 1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env.disposable-smoke.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const teacherUsername = process.env.TEST_TEACHER_USERNAME;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;
const unrelatedTeacherUsername = process.env.TEST_UNRELATED_TEACHER_USERNAME;
const unrelatedTeacherPassword = process.env.TEST_UNRELATED_TEACHER_PASSWORD;
const superAdminUsername = process.env.TEST_SUPER_ADMIN_USERNAME;
const superAdminPassword = process.env.TEST_SUPER_ADMIN_PASSWORD;
const adminUsername = process.env.TEST_ADMIN_USERNAME;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function usernameToEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function safeError(error) {
  return String(error?.message ?? "remote operation failed")
    .replace(/(bearer|api[_ -]?key|token|password)\s*[^\s,;]*/gi, "$1 [redacted]")
    .slice(0, 180);
}

function dataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function loadDashboard() {
  const source = (await readFile(resolve(root, "src/lib/ai-operations/dashboard.ts"), "utf8"))
    .replace('import "server-only";', "")
    .replace(/import type\s*\{[\s\S]*?\}\s*from\s*"@\/types\/database";\s*/, "");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "dashboard.ts",
  }).outputText;
  return import(dataUrl(output));
}

async function signIn(username, password, label) {
  assert(username && password, `Missing ${label} smoke credentials.`);
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  assert(!error && data.user?.id, `${label} sign-in failed: ${safeError(error)}`);
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, role, status")
    .eq("id", data.user.id)
    .single();
  assert(!profileError && profile?.status === "active", `${label} profile is not active.`);
  return { client, profile, user: data.user };
}

async function trySignIn(username, password, label) {
  if (!username || !password) return null;
  try {
    return await signIn(username, password, label);
  } catch {
    return null;
  }
}

async function insertQueueJob({ admin, organizationId, profileId, suffix }) {
  const { data, error } = await admin
    .from("ai_provider_jobs")
    .insert({
      created_by: profileId,
      fairness_key: `${organizationId}:${profileId}:${suffix}`,
      idempotency_key: `ai-operations-live:${suffix}`,
      job_kind: "ai_pdf_extract",
      organization_id: organizationId,
      payload: { smokeOnly: true },
      resource_id: randomUUID(),
      resource_type: "import_batch",
      status: "queued",
    })
    .select("id, status")
    .single();
  return { data, error };
}

async function claimAndFinish({ admin, jobId, leaseOwner, status }) {
  const { data: claimed, error: claimError } = await admin.rpc("claim_ai_provider_jobs", {
    p_lease_owner: leaseOwner,
    p_lease_seconds: 900,
    p_limit: 1,
  });
  assert(!claimError && claimed?.[0]?.id === jobId, `Service worker did not claim the expected smoke job: ${safeError(claimError)}`);
  const { data: finished, error: finishError } = await admin.rpc("finish_ai_provider_job", {
    p_available_at: status === "retry_wait" ? new Date(Date.now() + 60_000).toISOString() : null,
    p_job_id: jobId,
    p_lease_owner: leaseOwner,
    p_provider_attempt_count: 1,
    p_retryable: status === "retry_wait",
    p_safe_error_code: status === "retry_wait" ? "provider_temporarily_busy" : null,
    p_safe_message: status === "retry_wait" ? "The AI service is temporarily busy. Your work is safe and will retry automatically." : null,
    p_safe_result: { smokeOnly: true },
    p_status: status,
  });
  assert(!finishError && finished === true, `Service worker did not finish the smoke job: ${safeError(finishError)}`);
}

async function recordTelemetry({
  admin,
  finalStatus = "completed",
  organizationId,
  queueJobId = null,
  safeErrorCode = null,
  fallbackUsed = false,
  draftsCreated = 1,
  provider = "gemini_native",
  model = "gemini-2.5-flash-lite",
  actualTokens = true,
  estimatedCostMicros = 1,
}) {
  const { data, error } = await admin.rpc("record_ai_operation_telemetry", {
    p_actual_cached_input_tokens: actualTokens ? 2 : null,
    p_actual_input_tokens: actualTokens ? 12 : null,
    p_actual_output_tokens: actualTokens ? 5 : null,
    p_actual_total_tokens: actualTokens ? 17 : null,
    p_circuit_outcome: fallbackUsed ? "fallback" : "closed",
    p_drafts_created: draftsCreated,
    p_estimated_cached_input_cost_micros: estimatedCostMicros === null ? null : 0,
    p_estimated_input_cost_micros: estimatedCostMicros === null ? null : estimatedCostMicros,
    p_estimated_input_tokens: actualTokens ? 12 : null,
    p_estimated_output_cost_micros: estimatedCostMicros === null ? null : 0,
    p_estimated_output_tokens: actualTokens ? 5 : null,
    p_estimated_total_cost_micros: estimatedCostMicros,
    p_estimated_total_tokens: actualTokens ? 17 : null,
    p_execution_latency_ms: 12,
    p_fallback_used: fallbackUsed,
    p_final_status: finalStatus,
    p_model: model,
    p_operation_kind: "ai_pdf_extract",
    p_organization_id: organizationId,
    p_provider: provider,
    p_provider_call_count: 1,
    p_provider_latency_ms: 8,
    p_provider_profile_id: null,
    p_provider_retry_attempts: 0,
    p_queue_execution_attempt: 1,
    p_queue_job_id: queueJobId,
    p_queue_wait_ms: 4,
    p_route_policy_version: 1,
    p_route_position: fallbackUsed ? 1 : 0,
    p_safe_error_code: safeErrorCode,
  });
  assert(!error && data, `Service telemetry write failed: ${safeError(error)}`);
  return data;
}

async function main() {
  assert(supabaseUrl && supabaseAnonKey && serviceRoleKey, "Missing disposable clean Supabase configuration.");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [teacher, student, unrelatedTeacher] = await Promise.all([
    signIn(teacherUsername, teacherPassword, "teacher"),
    signIn(studentUsername, studentPassword, "student"),
    signIn(unrelatedTeacherUsername, unrelatedTeacherPassword, "unrelated teacher"),
  ]);
  const superAdmin =
    (await trySignIn(superAdminUsername, superAdminPassword, "super admin")) ??
    (await signIn(adminUsername, adminPassword, "admin fallback"));
  assert(superAdmin.profile.role === "super_admin", "A real super-admin smoke account is required.");

  const { data: outstanding, error: outstandingError } = await admin
    .from("ai_provider_jobs")
    .select("id")
    .in("status", ["queued", "leased", "processing", "retry_wait"]);
  assert(!outstandingError, "Unable to verify queue safety before live operations validation.");
  assert(!(outstanding ?? []).length, "Live operations validation refuses to run while queue work already exists.");

  const { data: controls, error: controlsError } = await admin
    .from("ai_operations_controls")
    .select("*")
    .is("organization_id", null)
    .is("operation_kind", null);
  assert(!controlsError && controls?.length === 1, "0036 global AI operations control row is missing or duplicated.");
  const originalControl = controls[0];
  const { data: telemetryProbe, error: telemetryProbeError } = await admin
    .from("ai_operation_telemetry")
    .select("id")
    .limit(1);
  assert(!telemetryProbeError, "0036 AI operations telemetry table is unavailable.");
  const { data: workerControl, error: workerControlError } = await admin.rpc("get_ai_operations_worker_control");
  assert(!workerControlError && Array.isArray(workerControl), "0036 worker-control RPC is unavailable to service role.");
  console.log("PASS 0036 control, telemetry, and worker-control schema probes");

  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  let organizationId = null;
  let raceBankId = null;
  let raceOrganizationId = null;
  const raceBatchIds = [];
  let syntheticProfileId = null;
  let operationControlId = null;
  const updateGlobalControl = async (patch) => {
    const { error } = await admin
      .from("ai_operations_controls")
      .update(patch)
      .eq("id", originalControl.id);
    assert(!error, `Unable to update disposable operations-control fixture: ${safeError(error)}`);
  };

  try {
    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .insert({
        name: `AI operations live validation ${suffix}`,
        slug: `ai-operations-live-${suffix}`,
      })
      .select("id")
      .single();
    assert(!organizationError && organization?.id, "Unable to create disposable operations validation organization.");
    organizationId = organization.id;

    for (const actor of [anon, teacher.client, student.client]) {
      const { data: controlRows, error: controlReadError } = await actor
        .from("ai_operations_controls")
        .select("id")
        .limit(1);
      assert(!controlReadError && !(controlRows ?? []).length, "A non-admin client read AI operations controls.");
      const { data: telemetryRows, error: telemetryReadError } = await actor
        .from("ai_operation_telemetry")
        .select("id")
        .limit(1);
      assert(!telemetryReadError && !(telemetryRows ?? []).length, "A non-admin client read AI operations telemetry.");
    }
    const { data: teacherWrite, error: teacherWriteError } = await teacher.client
      .from("ai_operations_controls")
      .update({ pause_new_enqueues: true })
      .eq("id", originalControl.id)
      .select("id");
    assert(teacherWriteError || !(teacherWrite ?? []).length, "Teacher unexpectedly changed AI operations controls.");
    const { error: teacherWorkerError } = await teacher.client.rpc("get_ai_operations_worker_control");
    assert(teacherWorkerError, "Teacher unexpectedly read worker-only controls.");
    const { error: teacherTelemetryError } = await teacher.client.rpc("record_ai_operation_telemetry", {});
    assert(teacherTelemetryError, "Teacher unexpectedly wrote worker telemetry.");
    const { data: superAdminControls, error: superAdminControlsError } = await superAdmin.client
      .from("ai_operations_controls")
      .select("id")
      .eq("id", originalControl.id)
      .single();
    assert(!superAdminControlsError && superAdminControls?.id === originalControl.id, "Super admin cannot read operations controls.");
    console.log("PASS operations telemetry, controls, and worker RPC RLS boundaries");

    const syntheticProfile = randomUUID();
    syntheticProfileId = syntheticProfile;
    const { error: profileError } = await admin.from("ai_provider_profiles").insert({
      api_key_last4: "0000",
      base_url: `mock://ai-operations/${syntheticProfile}`,
      enabled: true,
      id: syntheticProfile,
      is_default: false,
      model: "synthetic-operations",
      name: `AI operations validation ${suffix}`,
      organization_id: organizationId,
      provider: "compatible",
      supports_pdf_input: true,
      supports_vision_images: true,
    });
    assert(!profileError, "Unable to create disposable provider circuit fixture.");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await admin.rpc("record_ai_provider_route_outcome", {
        p_circuit_eligible: true,
        p_operation_kind: "ai_pdf_extract",
        p_probe_lease_owner: null,
        p_provider_profile_id: syntheticProfile,
        p_safe_error_code: "provider_busy",
        p_success: false,
      });
      assert(!error, "Unable to create disposable open-circuit fixture.");
    }
    const { error: teacherResetError } = await teacher.client.rpc("reset_ai_provider_runtime_state_for_admin", {
      p_operation_kind: "ai_pdf_extract",
      p_provider_profile_id: syntheticProfile,
    });
    assert(teacherResetError, "Teacher unexpectedly reset a provider circuit.");
    const { data: resetResult, error: resetError } = await superAdmin.client.rpc(
      "reset_ai_provider_runtime_state_for_admin",
      { p_operation_kind: "ai_pdf_extract", p_provider_profile_id: syntheticProfile },
    );
    assert(!resetError && resetResult === true, "Super-admin circuit reset did not complete.");
    console.log("PASS super-admin circuit reset works and normal users are blocked");

    await updateGlobalControl({
      daily_estimated_cost_micros: 2,
      monthly_estimated_cost_micros: 2,
      pause_new_enqueues: false,
      pause_worker_claims: false,
      queue_cost_reservation_micros: 1,
    });
    const firstJob = await insertQueueJob({ admin, organizationId, profileId: teacher.user.id, suffix: `${suffix}-settled` });
    assert(!firstJob.error && firstJob.data?.id, "Budget fixture enqueue failed.");
    await claimAndFinish({ admin, jobId: firstJob.data.id, leaseOwner: `ops-live-settled-${suffix}`, status: "completed" });
    const knownTelemetryId = await recordTelemetry({
      admin,
      organizationId,
      queueJobId: firstJob.data.id,
    });
    const { data: knownTelemetry, error: knownTelemetryError } = await admin
      .from("ai_operation_telemetry")
      .select("actual_input_tokens, actual_cached_input_tokens, actual_output_tokens, actual_total_tokens, estimated_total_cost_micros, provider_call_count, queue_execution_attempt, queue_wait_ms, provider_latency_ms, execution_latency_ms, route_position")
      .eq("id", knownTelemetryId)
      .single();
    assert(
      !knownTelemetryError &&
        knownTelemetry.actual_input_tokens === 12 &&
        knownTelemetry.actual_cached_input_tokens === 2 &&
        knownTelemetry.actual_output_tokens === 5 &&
        knownTelemetry.actual_total_tokens === 17 &&
        knownTelemetry.estimated_total_cost_micros === 1 &&
        knownTelemetry.provider_call_count === 1 &&
        knownTelemetry.queue_execution_attempt === 1 &&
        knownTelemetry.queue_wait_ms !== null &&
        knownTelemetry.provider_latency_ms !== null &&
        knownTelemetry.execution_latency_ms !== null &&
        knownTelemetry.route_position === 0,
      "Actual token, estimate, attempt, route, or latency telemetry was not persisted.",
    );
    const unknownTelemetryId = await recordTelemetry({
      actualTokens: false,
      admin,
      estimatedCostMicros: null,
      model: "unknown-model",
      organizationId,
      provider: "unknown-provider",
    });
    const { data: unknownTelemetry, error: unknownTelemetryError } = await admin
      .from("ai_operation_telemetry")
      .select("actual_total_tokens, estimated_total_cost_micros")
      .eq("id", unknownTelemetryId)
      .single();
    assert(
      !unknownTelemetryError &&
        unknownTelemetry.actual_total_tokens === null &&
        unknownTelemetry.estimated_total_cost_micros === null,
      "Unknown provider pricing fabricated token or cost data.",
    );

    const retryJob = await insertQueueJob({ admin, organizationId, profileId: teacher.user.id, suffix: `${suffix}-retry` });
    assert(!retryJob.error && retryJob.data?.id, "Retry reservation fixture enqueue failed.");
    await claimAndFinish({ admin, jobId: retryJob.data.id, leaseOwner: `ops-live-retry-${suffix}`, status: "retry_wait" });
    const blockedDuringRetry = await insertQueueJob({ admin, organizationId, profileId: teacher.user.id, suffix: `${suffix}-blocked` });
    assert(blockedDuringRetry.error, "Retry-wait reservation did not block additional budget consumption.");
    const { data: retryRows, error: retryRowsError } = await admin
      .from("ai_provider_jobs")
      .select("id, status")
      .eq("id", retryJob.data.id);
    assert(!retryRowsError && retryRows?.length === 1 && retryRows[0].status === "retry_wait", "Retry changed or duplicated its queue reservation.");
    const { error: cancelRetryError } = await admin
      .from("ai_provider_jobs")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), retryable: false })
      .eq("id", retryJob.data.id);
    assert(!cancelRetryError, "Unable to cancel disposable retry fixture.");
    const releasedJob = await insertQueueJob({ admin, organizationId, profileId: teacher.user.id, suffix: `${suffix}-released` });
    assert(!releasedJob.error && releasedJob.data?.id, "Cancelled reservation did not release capacity.");
    const { data: cancelledByAdmin, error: cancelByAdminError } = await superAdmin.client.rpc("cancel_ai_provider_job", {
      p_job_id: releasedJob.data.id,
    });
    assert(!cancelByAdminError && cancelledByAdmin === true, "Super admin could not safely cancel a queued job.");
    console.log("PASS budget reservation, retry retention, completion settlement, cancellation release, and safe admin cancellation");

    const { data: raceOrganization, error: raceOrganizationError } = await admin
      .from("organizations")
      .insert({
        name: `AI operations budget race ${suffix}`,
        slug: `ai-operations-race-${suffix}`,
      })
      .select("id")
      .single();
    assert(!raceOrganizationError && raceOrganization?.id, "Unable to create budget-race organization.");
    raceOrganizationId = raceOrganization.id;
    raceBankId = randomUUID();
    const { error: raceBankError } = await admin.from("question_banks").insert({
      created_by: teacher.user.id,
      id: raceBankId,
      name: `AI operations budget race ${suffix}`,
      organization_id: raceOrganizationId,
      owner_id: teacher.user.id,
      status: "active",
      updated_by: teacher.user.id,
      visibility: "private",
    });
    assert(!raceBankError, "Unable to create budget-race private bank.");
    const { error: raceMemberError } = await admin.from("bank_members").insert([
      {
        bank_id: raceBankId,
        joined_at: new Date().toISOString(),
        role: "owner",
        status: "active",
        user_id: teacher.user.id,
      },
      {
        bank_id: raceBankId,
        joined_at: new Date().toISOString(),
        role: "editor",
        status: "active",
        user_id: unrelatedTeacher.user.id,
      },
    ]);
    assert(!raceMemberError, "Unable to add isolated teachers to the budget-race bank.");
    const firstRaceBatchId = randomUUID();
    const secondRaceBatchId = randomUUID();
    raceBatchIds.push(firstRaceBatchId, secondRaceBatchId);
    const { error: raceBatchError } = await admin.from("import_batches").insert([
      {
        created_by: teacher.user.id,
        id: firstRaceBatchId,
        organization_id: raceOrganizationId,
        source_type: "ai_pdf",
        status: "draft",
        summary: { aiPdfImport: { smokeOnly: true, targetBankId: raceBankId } },
        target_bank_id: raceBankId,
      },
      {
        created_by: unrelatedTeacher.user.id,
        id: secondRaceBatchId,
        organization_id: raceOrganizationId,
        source_type: "ai_pdf",
        status: "draft",
        summary: { aiPdfImport: { smokeOnly: true, targetBankId: raceBankId } },
        target_bank_id: raceBankId,
      },
    ]);
    assert(!raceBatchError, "Unable to create budget-race import batches.");
    await updateGlobalControl({
      daily_estimated_cost_micros: 1,
      monthly_estimated_cost_micros: 1,
      pause_new_enqueues: false,
      pause_worker_claims: false,
      queue_cost_reservation_micros: 1,
    });
    const [firstRace, secondRace] = await Promise.all([
      teacher.client.rpc("enqueue_ai_provider_job", {
        p_idempotency_key: `ai-operations-race:${firstRaceBatchId}`,
        p_job_kind: "ai_pdf_extract",
        p_payload: { smokeOnly: true },
        p_provider_profile_id: null,
        p_resource_id: firstRaceBatchId,
        p_resource_type: "import_batch",
        p_target_bank_id: raceBankId,
      }),
      unrelatedTeacher.client.rpc("enqueue_ai_provider_job", {
        p_idempotency_key: `ai-operations-race:${secondRaceBatchId}`,
        p_job_kind: "ai_pdf_extract",
        p_payload: { smokeOnly: true },
        p_provider_profile_id: null,
        p_resource_id: secondRaceBatchId,
        p_resource_type: "import_batch",
        p_target_bank_id: raceBankId,
      }),
    ]);
    assert(
      [firstRace, secondRace].filter((result) => !result.error && result.data).length === 1 &&
        [firstRace, secondRace].filter((result) => Boolean(result.error)).length === 1,
      "Concurrent normal-user enqueues exceeded the same-organization budget reservation.",
    );
    const { data: raceJobs, error: raceJobsError } = await admin
      .from("ai_provider_jobs")
      .select("id")
      .eq("organization_id", raceOrganizationId)
      .in("status", ["queued", "leased", "processing", "retry_wait"]);
    assert(!raceJobsError && raceJobs?.length === 1, "Budget-race fixture left more than one reserved job.");
    await admin.from("ai_provider_jobs").delete().eq("organization_id", raceOrganizationId);
    await admin.from("import_batches").delete().in("id", raceBatchIds);
    await admin.from("question_banks").delete().eq("id", raceBankId);
    await admin.from("organizations").delete().eq("id", raceOrganizationId);
    raceBatchIds.length = 0;
    raceBankId = null;
    raceOrganizationId = null;
    console.log("PASS concurrent normal-user enqueue budget reservation remains race-safe");

    await updateGlobalControl({
      daily_estimated_cost_micros: 100_000,
      monthly_estimated_cost_micros: 100_000,
      pause_new_enqueues: true,
      pause_worker_claims: false,
      queue_cost_reservation_micros: 1,
    });
    const pausedEnqueue = await insertQueueJob({ admin, organizationId, profileId: teacher.user.id, suffix: `${suffix}-global-paused` });
    assert(
      pausedEnqueue.error?.message?.includes("temporarily unavailable"),
      "Global enqueue pause did not return the safe generic teacher-facing status.",
    );
    await updateGlobalControl({ pause_new_enqueues: false });
    const { data: operationControl, error: operationControlError } = await admin
      .from("ai_operations_controls")
      .insert({ operation_kind: "ai_pdf_extract", pause_new_enqueues: true })
      .select("id")
      .single();
    assert(!operationControlError && operationControl?.id, "Unable to create operation pause fixture.");
    operationControlId = operationControl.id;
    const operationPausedEnqueue = await insertQueueJob({ admin, organizationId, profileId: teacher.user.id, suffix: `${suffix}-operation-paused` });
    assert(
      operationPausedEnqueue.error?.message?.includes("temporarily unavailable"),
      "Operation-specific enqueue pause did not return the safe generic status.",
    );
    const { error: clearOperationPauseError } = await admin
      .from("ai_operations_controls")
      .update({ pause_new_enqueues: false })
      .eq("id", operationControlId);
    assert(!clearOperationPauseError, "Unable to clear operation pause fixture.");
    const workerPausedJob = await insertQueueJob({ admin, organizationId, profileId: teacher.user.id, suffix: `${suffix}-worker-paused` });
    assert(!workerPausedJob.error && workerPausedJob.data?.id, "Worker-pause fixture enqueue failed.");
    await updateGlobalControl({ pause_worker_claims: true });
    const require = createRequire(import.meta.url);
    const jiti = require("jiti")(import.meta.url, { alias: { "@": resolve(root, "src") } });
    const { runDurableAIProviderJobs } = jiti("../src/lib/ai-jobs/worker.ts");
    const pausedWorker = await runDurableAIProviderJobs({
      limit: 2,
      supabase: admin,
      workerId: `ops-live-paused-${suffix}`,
    });
    const { data: queuedAfterPause, error: queuedAfterPauseError } = await admin
      .from("ai_provider_jobs")
      .select("status")
      .eq("id", workerPausedJob.data.id)
      .single();
    assert(
      !queuedAfterPauseError && pausedWorker.claimed === 0 && queuedAfterPause.status === "queued",
      "Worker claim pause did not preserve queued work.",
    );
    await updateGlobalControl({ pause_worker_claims: false });
    await claimAndFinish({ admin, jobId: workerPausedJob.data.id, leaseOwner: `ops-live-resume-${suffix}`, status: "completed" });
    console.log("PASS global pause, operation pause, worker pause/resume, and queued-work preservation");

    await updateGlobalControl({
      alert_fallback_rate_basis_points: 1,
      alert_oldest_queue_seconds: 60,
      alert_queue_depth: 1,
      daily_estimated_cost_micros: 100_000,
      monthly_estimated_cost_micros: 100_000,
      pause_new_enqueues: false,
      pause_worker_claims: false,
      queue_cost_reservation_micros: 1,
    });
    const oldQueueJob = await insertQueueJob({ admin, organizationId, profileId: teacher.user.id, suffix: `${suffix}-alert-queue` });
    assert(!oldQueueJob.error && oldQueueJob.data?.id, "Alert queue fixture enqueue failed.");
    const { error: ageError } = await admin
      .from("ai_provider_jobs")
      .update({ created_at: new Date(Date.now() - 120_000).toISOString() })
      .eq("id", oldQueueJob.data.id);
    assert(!ageError, "Unable to age disposable queued-job alert fixture.");
    await updateGlobalControl({
      daily_estimated_cost_micros: 1,
      monthly_estimated_cost_micros: 1,
    });
    for (let index = 0; index < 3; index += 1) {
      await recordTelemetry({
        admin,
        draftsCreated: 0,
        fallbackUsed: index === 0,
        organizationId,
      });
    }
    for (const safeErrorCode of ["lease_expired", "lease_expired", "provider_configuration", "provider_configuration"]) {
      await recordTelemetry({
        admin,
        draftsCreated: 0,
        finalStatus: "failed",
        organizationId,
        safeErrorCode,
      });
    }
    const { getAIOperationsDashboard } = await loadDashboard();
    const dashboard = await getAIOperationsDashboard(superAdmin.client);
    assert(dashboard.schemaReady, "Admin operations dashboard does not recognize applied 0036 schema.");
    const alertCodes = new Set(dashboard.alerts.map((alert) => alert.code));
    for (const expectedCode of ["queue_depth", "queue_oldest", "fallback_rate", "budget_threshold", "zero_draft", "stale_lease", "permanent_configuration"]) {
      assert(alertCodes.has(expectedCode), `Expected safe alert condition was not observed: ${expectedCode}`);
    }
    assert(
      !/prompt|response|pdf|signed|url|key|student|answer|note/i.test(JSON.stringify(dashboard.alerts)),
      "Admin operations alerts exposed private content instead of safe metadata.",
    );
    console.log("PASS live dashboard alert conditions use safe metadata only");
  } finally {
    if (operationControlId) {
      await admin.from("ai_operations_controls").delete().eq("id", operationControlId);
    }
    if (organizationId) {
      await admin.from("ai_operation_telemetry").delete().eq("organization_id", organizationId);
      await admin.from("ai_provider_jobs").delete().eq("organization_id", organizationId);
    }
    if (raceOrganizationId) {
      await admin.from("ai_provider_jobs").delete().eq("organization_id", raceOrganizationId);
    }
    if (raceBatchIds.length) {
      await admin.from("import_batches").delete().in("id", raceBatchIds);
    }
    if (raceBankId) {
      await admin.from("question_banks").delete().eq("id", raceBankId);
    }
    if (raceOrganizationId) {
      await admin.from("organizations").delete().eq("id", raceOrganizationId);
    }
    if (syntheticProfileId) {
      await admin.from("ai_provider_profiles").delete().eq("id", syntheticProfileId);
    }
    if (organizationId) {
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    await admin
      .from("ai_operations_controls")
      .update({
        alert_circuit_open_seconds: originalControl.alert_circuit_open_seconds,
        alert_fallback_rate_basis_points: originalControl.alert_fallback_rate_basis_points,
        alert_oldest_queue_seconds: originalControl.alert_oldest_queue_seconds,
        alert_queue_depth: originalControl.alert_queue_depth,
        alert_worker_stale_seconds: originalControl.alert_worker_stale_seconds,
        daily_estimated_cost_micros: originalControl.daily_estimated_cost_micros,
        max_jobs_per_invocation: originalControl.max_jobs_per_invocation,
        max_provider_calls_per_execution: originalControl.max_provider_calls_per_execution,
        monthly_estimated_cost_micros: originalControl.monthly_estimated_cost_micros,
        pause_new_enqueues: originalControl.pause_new_enqueues,
        pause_worker_claims: originalControl.pause_worker_claims,
        queue_cost_reservation_micros: originalControl.queue_cost_reservation_micros,
        updated_by: originalControl.updated_by,
      })
      .eq("id", originalControl.id);
    console.log("PASS live operations validation cleanup restored controls and removed disposable rows");
  }
}

await main();
