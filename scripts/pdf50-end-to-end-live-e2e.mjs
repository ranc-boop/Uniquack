#!/usr/bin/env node

// One-file, real-browser PDF50 proof for the approved Current Clean project.
// The harness never reads environment files, never prints fixture identities,
// and uses service role only for bounded preflight, evidence, and exact cleanup.

import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

import {
  classifyPDF50ProviderCounterContract,
  formatPDF50ProviderCounters,
} from "./lib/pdf50-provider-counter-contract.mjs";
import {
  estimatePDF50ProviderProofCostMicros,
  loadPDF50ProviderProofControl,
  pdf50ProviderProofEnvironment,
} from "./lib/pdf50-provider-proof-control.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const sourceBucket = "ai-import-sources";
const workerRoutePath = "/api/internal/ai-jobs/run";
const syntheticBankPrefix = "!pdf50-provider-e2e-";
const disposableEnvironment = "DISPOSABLE_PDF50_PROVIDER_E2E";
const cleanupConfirmation = "DELETE_PDF50_PROVIDER_E2E_FIXTURES";
const proofControl = await loadPDF50ProviderProofControl();
const proofControlEnvironment = pdf50ProviderProofEnvironment(proofControl);
const knownProviderModel = proofControl.model;
const providerBudgetMicros = proofControl.approvedBudgetUsd * 1_000_000;
const providerCostUpperBoundMicros =
  estimatePDF50ProviderProofCostMicros(proofControl);

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "TEST_TEACHER_USERNAME",
  "TEST_TEACHER_PASSWORD",
  "PDF50_E2E_ENVIRONMENT",
  "PDF50_E2E_EXPECTED_PROJECT_REF",
  "PDF50_E2E_CONFIRM_CLEANUP",
  "PDF50_PROVIDER_TEST_MODE",
  "AI_JOBS_LOCAL_MAX_INVOCATIONS",
  "PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS",
  "PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS",
  "PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS",
  "PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD",
];

const exactControlValues = Object.freeze({
  ...proofControlEnvironment,
  PDF50_E2E_CONFIRM_CLEANUP: cleanupConfirmation,
  PDF50_E2E_ENVIRONMENT: disposableEnvironment,
});

const safeProviderErrorCodes = new Set([
  "operation_cancelled",
  "provider_busy",
  "provider_configuration_error",
  "provider_execution_budget_exhausted",
  "provider_invalid_response",
  "provider_network_error",
  "provider_permission_error",
  "provider_rate_limited",
  "provider_timeout",
  "request_invalid",
  "unknown_provider_error",
]);

const safeWorkerCheckpointStages = new Set([
  "queued",
  "claimed",
  "source_validated",
  "provider_request_started",
  "provider_result_checkpointed",
  "normalized",
  "drafts_persisted",
  "completed",
]);

const safeImportFailurePhases = new Set([
  "queued",
  "preparing_native_pdf_input",
  "calling_provider",
  "provider_response_validated",
  "importing_questions",
  "cropping_assets",
  "provider_retry_exhausted",
  "completed",
  "failed",
]);

const allowedFailureCategories = new Set([
  "browser_login_failed",
  "browser_review_draft_missing",
  "browser_server_failed",
  "browser_upload_failed",
  "cleanup_failed",
  "expected_project_identity_mismatch",
  "hosted_readiness_failed",
  "known_cost_provider_required",
  "local_edge_browser_missing",
  "missing_process_environment",
  "active_worker_queue_refused",
  "pdf50_schema_not_ready",
  "production_environment_refused",
  "provider_cleanup_failed",
  "provider_cost_budget_exceeded",
  "provider_cost_telemetry_missing",
  "provider_permanent_failure",
  "provider_transient_failure",
  "stale_synthetic_fixture_refused",
  "teacher_not_eligible",
  "trusted_provider_test_control_rejected",
  "unexpected_failure",
  "worker_cli_failed",
  "worker_evidence_failed",
  "worker_provider_counter_contract_failed",
  "worker_route_failed",
  "worker_target_not_claimed",
  "worker_target_not_finished",
  "worker_timeout",
  ...safeProviderErrorCodes,
]);

class HarnessError extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

function assert(condition, category) {
  if (!condition) throw new HarnessError(category);
}

function safeFailureCategory(error) {
  const candidate = String(error?.category ?? "unexpected_failure");
  return allowedFailureCategories.has(candidate) ? candidate : "unexpected_failure";
}

function requireData(result, category) {
  if (result?.error) throw new HarnessError(category);
  return result?.data;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sleep(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function projectRefFromSupabaseUrl(value) {
  try {
    const parsed = new URL(value);
    const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(parsed.hostname);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function usernameToEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function printEnvironmentPresence() {
  for (const name of requiredEnvironment) {
    console.log(`${name}=${process.env[name]?.trim() ? "PRESENT" : "MISSING"}`);
  }
}

function requireProcessEnvironment() {
  printEnvironmentPresence();
  if (requiredEnvironment.some((name) => !process.env[name]?.trim())) {
    throw new HarnessError("missing_process_environment");
  }
  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new HarnessError("production_environment_refused");
  }
  for (const [name, expected] of Object.entries(exactControlValues)) {
    if (process.env[name] !== expected) {
      throw new HarnessError("trusted_provider_test_control_rejected");
    }
  }
  if (providerCostUpperBoundMicros > providerBudgetMicros) {
    throw new HarnessError("provider_cost_budget_exceeded");
  }

  const projectRef = projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const expectedProjectRef = process.env.PDF50_E2E_EXPECTED_PROJECT_REF.trim().toLowerCase();
  if (
    !projectRef ||
    !/^[a-z0-9]{16,32}$/.test(expectedProjectRef) ||
    projectRef !== expectedProjectRef
  ) {
    throw new HarnessError("expected_project_identity_mismatch");
  }

  const edgePath = edgeCandidates.find((candidate) => existsSync(candidate));
  if (!edgePath) throw new HarnessError("local_edge_browser_missing");

  return {
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    edgePath,
    encryptionKey: process.env.AI_PROVIDER_ENCRYPTION_KEY,
    projectRef,
    serviceRoleKey: process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY,
    teacherPassword: process.env.TEST_TEACHER_PASSWORD,
    teacherUsername: process.env.TEST_TEACHER_USERNAME,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

function clearProcessEnvironment() {
  for (const name of requiredEnvironment) delete process.env[name];
}

function minimalChildEnvironment() {
  const environment = {};
  for (const name of [
    "APPDATA",
    "COMSPEC",
    "HOME",
    "LOCALAPPDATA",
    "NUMBER_OF_PROCESSORS",
    "PATH",
    "Path",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "SYSTEMROOT",
    "SystemRoot",
    "TEMP",
    "TMP",
    "USERPROFILE",
  ]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return environment;
}

function buildSyntheticPdf() {
  const lines = [
    "Question 1",
    "What is 2 + 3?",
    "A) 4",
    "B) 5",
    "C) 6",
    "D) 7",
    "Answer: B",
    "Explanation: 2 + 3 = 5.",
  ];
  const escapedLines = lines.map((line) =>
    line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"),
  );
  const stream = [
    "BT",
    "/F1 14 Tf",
    "24 TL",
    "54 720 Td",
    ...escapedLines.flatMap((line, index) => [index ? "T*" : "", `(${line}) Tj`]),
    "ET",
  ]
    .filter(Boolean)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
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

function providerStrategy(profile) {
  const provider = String(profile.provider ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const baseUrl = String(profile.base_url ?? "").trim().toLowerCase();
  if (provider === "mock" || baseUrl.startsWith("mock://")) return "mock";
  if (provider.includes("gemini_native") || provider.includes("google_native")) {
    return profile.supports_pdf_input ? "gemini_native_pdf" : "unsupported";
  }
  if (provider.includes("gemini") || provider.includes("google")) {
    return profile.supports_vision_images ? "page_images" : "unsupported";
  }
  if (profile.supports_pdf_input) return "openai_file";
  if (profile.supports_vision_images) return "page_images";
  return "unsupported";
}

function isKnownCostGemini(profile) {
  return (
    providerStrategy(profile) === "gemini_native_pdf" &&
    String(profile.model ?? "").trim().toLowerCase() === knownProviderModel
  );
}

async function signInTeacher(config) {
  const client = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const auth = await client.auth.signInWithPassword({
    email: usernameToEmail(config.teacherUsername),
    password: config.teacherPassword,
  });
  if (auth.error || !auth.data.user) throw new HarnessError("teacher_not_eligible");
  const profile = requireData(
    await client
      .from("profiles")
      .select("id, role, status, default_organization_id")
      .eq("id", auth.data.user.id)
      .maybeSingle(),
    "teacher_not_eligible",
  );
  if (
    !profile ||
    profile.role !== "teacher" ||
    profile.status !== "active" ||
    !profile.default_organization_id
  ) {
    throw new HarnessError("teacher_not_eligible");
  }
  return { client, profile, user: auth.data.user };
}

async function countRows(query, category) {
  const result = await query;
  if (result.error) throw new HarnessError(category);
  return Number(result.count ?? 0);
}

async function runReadinessPreflight({ service, teacher }) {
  const schemaProbe = await service
    .from("ai_pdf_upload_bursts")
    .select("id, status, target_bank_id", { head: true, count: "exact" })
    .limit(1);
  if (schemaProbe.error) throw new HarnessError("pdf50_schema_not_ready");

  const checkpointProbe = await service
    .from("ai_provider_jobs")
    .select(
      "id, execution_fence_token, lease_generation, checkpoint_stage, checkpoint_version, checkpointed_at, persisted_output_lineage",
    )
    .limit(1);
  if (checkpointProbe.error) throw new HarnessError("pdf50_schema_not_ready");

  const checkpointRpcProbe = await service.rpc(
    "read_ai_provider_job_provider_result_checkpoint",
    {
      p_execution_fence_token: randomUUID(),
      p_job_id: randomUUID(),
      p_lease_owner: "pdf50-e2e-readiness-probe",
    },
  );
  if (checkpointRpcProbe.error) throw new HarnessError("pdf50_schema_not_ready");

  const controlResult = await service.rpc("get_ai_operations_worker_control");
  const controlRows = requireData(controlResult, "hosted_readiness_failed");
  const control = Array.isArray(controlRows) ? controlRows[0] : controlRows;
  if (!control || control.pause_worker_claims === true) {
    throw new HarnessError("hosted_readiness_failed");
  }

  const active = await countRows(
    service
      .from("ai_provider_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["leased", "processing"]),
    "hosted_readiness_failed",
  );
  if (active !== 0) throw new HarnessError("active_worker_queue_refused");

  const staleBanks = await countRows(
    service
      .from("question_banks")
      .select("id", { count: "exact", head: true })
      .like("name", `${syntheticBankPrefix}%`),
    "hosted_readiness_failed",
  );
  if (staleBanks !== 0) {
    throw new HarnessError("stale_synthetic_fixture_refused");
  }

  const profiles = requireData(
    await service
      .from("ai_provider_profiles")
      .select(
        "id, name, provider, base_url, model, enabled, is_default, supports_pdf_input, supports_vision_images, api_key_last4, organization_id, deleted_at",
      )
      .eq("enabled", true)
      .is("deleted_at", null)
      .not("api_key_last4", "is", null),
    "hosted_readiness_failed",
  ) ?? [];
  const compatible = profiles.filter((profile) => {
    const strategy = providerStrategy(profile);
    const organizationMatches =
      profile.organization_id === null ||
      profile.organization_id === teacher.profile.default_organization_id;
    return strategy !== "unsupported" && organizationMatches;
  });
  if (!compatible.length || compatible.some((profile) => !isKnownCostGemini(profile))) {
    throw new HarnessError("known_cost_provider_required");
  }

  console.log("PASS hosted readiness and known-cost Provider gate");
  console.log(`PROVIDER_COST_UPPER_BOUND_MICROS=${providerCostUpperBoundMicros}`);
  return { strategy: "gemini_native_pdf" };
}

async function createSyntheticBank(teacher) {
  const result = await teacher.client.rpc("create_question_bank", {
    bank_description: "Run-scoped PDF50 provider proof. Exact cleanup required.",
    bank_name: `${syntheticBankPrefix}${randomUUID()}`,
    bank_visibility: "private",
  });
  const bankId = requireData(result, "hosted_readiness_failed");
  if (typeof bankId !== "string") throw new HarnessError("hosted_readiness_failed");
  return bankId;
}

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : null;
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!port) throw new HarnessError("browser_server_failed");
  return port;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return true;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    sleep(8_000),
  ]);
  return child.exitCode !== null;
}

async function startNextServer({ config, internalToken }) {
  const port = await findFreePort();
  const nextBin = resolve(root, "node_modules", "next", "dist", "bin", "next");
  const environment = {
    ...minimalChildEnvironment(),
    AI_JOBS_INTERNAL_TOKEN: internalToken,
    ...proofControlEnvironment,
    AI_PROVIDER_ENCRYPTION_KEY: config.encryptionKey,
    CLEAN_SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NODE_ENV: "development",
    PRACTICE_AGENT_FULL_CALL_LOGS: "false",
    PRACTICE_AGENT_TOKEN_STATS_LOGS: "false",
  };
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--webpack", "--port", String(port)],
    { cwd: root, env: environment, stdio: "ignore", windowsHide: true },
  );
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${origin}/auth/login`, { redirect: "manual" });
      if (response.status < 500) return { child, origin };
    } catch {
      // Bounded startup polling; no server output is relayed.
    }
    await sleep(250);
  }
  await stopChild(child);
  throw new HarnessError("browser_server_failed");
}

async function signInThroughBrowser(page, origin, config, nextPath) {
  await page.goto(`${origin}/auth/login?next=${encodeURIComponent(nextPath)}`, {
    waitUntil: "networkidle",
  });
  await page.locator("#username").fill(config.teacherUsername);
  await page.locator("#password").fill(config.teacherPassword);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/auth/login"), {
      timeout: 30_000,
    }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]).catch(() => {
    throw new HarnessError("browser_login_failed");
  });
}

function assertSafeBrowserText(text, secrets) {
  for (const secret of secrets) {
    if (secret && text.includes(secret)) throw new HarnessError("worker_evidence_failed");
  }
  if (
    /api_key_ciphertext|api_key_iv|api_key_tag|credential_ref|bearer\s+[a-z0-9._-]+|permission denied for relation|row-level security policy|postgresql:\/\//i.test(
      text,
    )
  ) {
    throw new HarnessError("worker_evidence_failed");
  }
}

async function waitForBurstFixture({ bankId, service, teacherId }) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const burstResult = await service
      .from("ai_pdf_upload_bursts")
      .select("id, target_bank_id, created_by, provider_profile_id, status, item_count")
      .eq("target_bank_id", bankId)
      .eq("created_by", teacherId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (burstResult.error) throw new HarnessError("browser_upload_failed");
    if (burstResult.data?.id) {
      const itemResult = await service
        .from("ai_pdf_upload_burst_items")
        .select(
          "id, burst_id, import_batch_id, source_asset_id, ai_provider_job_id, object_path, status, page_count, safe_error_code",
        )
        .eq("burst_id", burstResult.data.id)
        .maybeSingle();
      if (itemResult.error) throw new HarnessError("browser_upload_failed");
      if (itemResult.data?.ai_provider_job_id) {
        return { burst: burstResult.data, item: itemResult.data };
      }
      if (itemResult.data?.status === "failed") {
        throw new HarnessError("browser_upload_failed");
      }
    }
    await sleep(250);
  }
  throw new HarnessError("browser_upload_failed");
}

async function uploadThroughBrowser({ bankId, config, origin, page, service, teacher }) {
  const importPath = `/teacher/banks/${bankId}/imports?mode=ai`;
  await signInThroughBrowser(page, origin, config, importPath);
  if (!page.url().includes(`/teacher/banks/${bankId}/imports`)) {
    await page.goto(`${origin}${importPath}`, { waitUntil: "networkidle" });
  }
  const fileInput = page.locator('input[type="file"][accept*="pdf"]');
  if (!(await fileInput.isEnabled().catch(() => false))) {
    throw new HarnessError("hosted_readiness_failed");
  }
  const pdf = buildSyntheticPdf();
  assert(pdf.byteLength <= 4_096, "trusted_provider_test_control_rejected");
  await fileInput.setInputFiles({
    buffer: pdf,
    mimeType: "application/pdf",
    name: "pdf50-provider-proof.pdf",
  });
  await page.getByRole("button", { name: "Reserve and upload" }).click();
  return waitForBurstFixture({
    bankId,
    service,
    teacherId: teacher.user.id,
  });
}

async function runLocalWorkerOnce({ internalToken, jobId, origin }) {
  const workerPath = resolve(root, "scripts", "local-ai-jobs-worker.mjs");
  let output = "";
  const child = spawn(process.execPath, [workerPath], {
    cwd: root,
    env: {
      ...minimalChildEnvironment(),
      AI_JOBS_INTERNAL_TOKEN: internalToken,
      AI_JOBS_LOCAL_MAX_INVOCATIONS:
        proofControlEnvironment.AI_JOBS_LOCAL_MAX_INVOCATIONS,
      AI_JOBS_LOCAL_ROUTE_URL: `${origin}${workerRoutePath}`,
      AI_JOBS_LOCAL_TARGET_JOB_ID: jobId,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const capture = (chunk) => {
    if (output.length < 16_384) output += chunk.toString("utf8");
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const outcome = await Promise.race([
    new Promise((resolveExit) => child.once("exit", (code) => resolveExit({ code }))),
    sleep(270_000).then(() => ({ timeout: true })),
  ]);
  if (outcome.timeout) {
    await stopChild(child);
    throw new HarnessError("worker_timeout");
  }
  if (outcome.code !== 0) {
    const safeReason = [
      "trusted_provider_test_claim_capacity_failed",
      "trusted_provider_test_claim_fence_missing",
      "trusted_provider_test_claim_read_failed",
      "trusted_provider_test_claim_update_failed",
      "trusted_provider_test_job_id_rejected",
      "trusted_provider_test_target_required",
      "worker_execution_failed",
    ].find((candidate) => output.includes(`safeReason=${candidate}`));
    if (safeReason) console.log(`WORKER_ROUTE_FAILURE=${safeReason}`);
    throw new HarnessError(safeReason ? "worker_route_failed" : "worker_cli_failed");
  }
  if (!output.includes("status=worker_accepted") || !output.includes("claimed=1")) {
    throw new HarnessError("worker_target_not_claimed");
  }
}

function assertSafeStoredFailure(job) {
  const stored = `${job.safe_message ?? ""} ${job.safe_error_code ?? ""}`;
  if (
    stored.length > 800 ||
    /api[_ -]?key|bearer\s|https?:\/\/|\b503\b|credential|ciphertext|provider response|raw payload/i.test(
      stored,
    )
  ) {
    throw new HarnessError("worker_evidence_failed");
  }
}

function safeProviderErrorCode(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return safeProviderErrorCodes.has(normalized)
    ? normalized
    : "unknown_provider_error";
}

function safeWorkerCheckpointStage(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return safeWorkerCheckpointStages.has(normalized) ? normalized : "unknown";
}

function safeImportFailurePhase(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return safeImportFailurePhases.has(normalized) ? normalized : "unknown";
}

async function loadFinishedJob({ jobId, service }) {
  const job = requireData(
    await service
      .from("ai_provider_jobs")
      .select(
        "id, status, target_bank_id, resource_id, provider_profile_id, execution_fence_token, lease_generation, checkpoint_stage, checkpoint_version, checkpointed_at, persisted_output_lineage, safe_result, safe_message, safe_error_code, retryable, execution_attempt_count, completed_at",
      )
      .eq("id", jobId)
      .maybeSingle(),
    "worker_evidence_failed",
  );
  if (!job) throw new HarnessError("worker_evidence_failed");
  assertSafeStoredFailure(job);
  if (["queued", "retry_wait"].includes(job.status) && job.execution_attempt_count === 0) {
    throw new HarnessError("worker_target_not_claimed");
  }
  if (["leased", "processing"].includes(job.status)) {
    throw new HarnessError("worker_target_not_finished");
  }
  return job;
}

function providerCountersFromJob(job) {
  const safeResult = asRecord(job.safe_result);
  return {
    cleanupFailures: numeric(safeResult.providerCleanupFailures),
    cleanup: numeric(safeResult.providerCleanupRequests),
    inference: numeric(safeResult.providerInferenceAttempts),
    inferenceRequests: numeric(safeResult.providerInferenceRequests),
    network: numeric(safeResult.providerNetworkRequests),
    polls: numeric(safeResult.providerPollRequests),
    uploads: numeric(safeResult.providerUploadRequests),
  };
}

function assertProviderCounters(counters, { completed }) {
  console.log(`PROVIDER_COUNTERS=${formatPDF50ProviderCounters(counters)}`);
  const failureCategory = classifyPDF50ProviderCounterContract(counters, {
    completed,
    maxInferenceAttempts: proofControl.providerInferenceAttempts,
    maxNetworkRequests: proofControl.providerMaxNetworkRequests,
  });
  if (failureCategory) throw new HarnessError(failureCategory);
}

async function verifyFailedEvidence({ bankId, fixture, job, service }) {
  assert(job.target_bank_id === bankId, "worker_evidence_failed");
  assert(job.resource_id === fixture.item.import_batch_id, "worker_evidence_failed");
  assert(Boolean(job.execution_fence_token), "worker_evidence_failed");
  assert(numeric(job.lease_generation) >= 1, "worker_evidence_failed");
  console.log("PHASE=worker_provider_counters");
  assertProviderCounters(providerCountersFromJob(job), { completed: false });

  const batch = requireData(
    await service
      .from("import_batches")
      .select("id, status, summary, target_bank_id, source_type")
      .eq("id", fixture.item.import_batch_id)
      .maybeSingle(),
    "worker_evidence_failed",
  );
  assert(
    batch?.target_bank_id === bankId && batch.source_type === "ai_pdf",
    "worker_evidence_failed",
  );

  const importItems =
    requireData(
      await service
        .from("import_batch_items")
        .select("created_question_id")
        .eq("batch_id", batch.id),
      "worker_evidence_failed",
    ) ?? [];
  const questionIds = importItems.map((item) => item.created_question_id).filter(Boolean);
  const importPhase = asRecord(asRecord(batch.summary).aiPdfImport).phase;
  console.log(`IMPORT_FAILURE_PHASE=${safeImportFailurePhase(importPhase)}`);
  console.log(`FAILED_EXECUTION_DRAFT_COUNT=${Math.min(questionIds.length, 999)}`);
  if (questionIds.length) {
    const questions =
      requireData(
        await service
          .from("questions")
          .select("id, owner_bank_id, status, published_at, visibility, deleted_at")
          .in("id", questionIds),
        "worker_evidence_failed",
      ) ?? [];
    assert(
      questions.length === questionIds.length &&
        questions.every(
          (question) =>
            question.owner_bank_id === bankId &&
            question.status === "draft" &&
            question.published_at === null &&
            question.visibility === "private" &&
            question.deleted_at === null,
        ),
      "worker_evidence_failed",
    );
    const reviewItems =
      requireData(
        await service
          .from("review_draft_items")
          .select("created_question_id, target_bank_id, status")
          .in("created_question_id", questionIds),
        "worker_evidence_failed",
      ) ?? [];
    assert(
      reviewItems.every(
        (item) => item.target_bank_id === bankId && item.status === "pending_review",
      ),
      "worker_evidence_failed",
    );
  }

  const bankQuestionCount = questionIds.length
    ? await countRows(
        service
          .from("bank_questions")
          .select("id", { count: "exact", head: true })
          .in("question_id", questionIds),
        "worker_evidence_failed",
      )
    : 0;
  const assignmentCount = await countRows(
    service
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("source_record_id", batch.id),
    "worker_evidence_failed",
  );
  assert(bankQuestionCount === 0 && assignmentCount === 0, "worker_evidence_failed");
  console.log("PASS failed Provider execution remained private, bank-scoped, and unassigned");
}

async function verifyCompletedEvidence({ bankId, fixture, job, service }) {
  if (job.status === "retry_wait" || job.status === "failed") {
    await verifyFailedEvidence({ bankId, fixture, job, service });
    console.log(
      `WORKER_FAILURE_CHECKPOINT_STAGE=${safeWorkerCheckpointStage(job.checkpoint_stage)}`,
    );
    const safeErrorCode = safeProviderErrorCode(job.safe_error_code);
    console.log(`PROVIDER_SAFE_ERROR_CODE=${safeErrorCode}`);
    throw new HarnessError(safeErrorCode);
  }
  console.log("PHASE=worker_terminal_contract");
  assert(job.status === "completed", "worker_evidence_failed");
  assert(job.target_bank_id === bankId, "worker_evidence_failed");
  assert(job.resource_id === fixture.item.import_batch_id, "worker_evidence_failed");
  assert(Boolean(job.execution_fence_token), "worker_evidence_failed");
  assert(numeric(job.lease_generation) >= 1, "worker_evidence_failed");
  assert(job.checkpoint_stage === "completed", "worker_evidence_failed");
  assert(numeric(job.checkpoint_version) >= 1, "worker_evidence_failed");
  assert(Boolean(job.checkpointed_at), "worker_evidence_failed");

  const counters = providerCountersFromJob(job);
  console.log("PHASE=worker_provider_counters");
  assertProviderCounters(counters, { completed: true });

  console.log("PHASE=worker_batch_lineage");
  const batch = requireData(
    await service
      .from("import_batches")
      .select("id, status, target_bank_id, source_type, summary")
      .eq("id", fixture.item.import_batch_id)
      .maybeSingle(),
    "worker_evidence_failed",
  );
  assert(batch?.status === "imported", "worker_evidence_failed");
  assert(batch.target_bank_id === bankId && batch.source_type === "ai_pdf", "worker_evidence_failed");
  const aiPdfSummary = asRecord(asRecord(batch.summary).aiPdfImport);
  assert(aiPdfSummary.sourceAssetId === fixture.item.source_asset_id, "worker_evidence_failed");

  const importItems = requireData(
    await service
      .from("import_batch_items")
      .select(
        "id, item_index, status, created_question_id, normalized_question_json, persistence_lineage_key, validation_errors",
      )
      .eq("batch_id", batch.id)
      .order("item_index"),
    "worker_evidence_failed",
  ) ?? [];
  const importedItems = importItems.filter((item) => item.status === "imported" && item.created_question_id);
  assert(importedItems.length > 0, "worker_evidence_failed");
  const lineageKeys = importedItems.map((item) => item.persistence_lineage_key);
  assert(lineageKeys.every(Boolean), "worker_evidence_failed");
  assert(new Set(lineageKeys).size === lineageKeys.length, "worker_evidence_failed");
  assert(
    importedItems.every((item) => {
      const metadata = asRecord(asRecord(item.normalized_question_json).ai_metadata);
      return Array.isArray(metadata.page_refs) && metadata.page_refs.length > 0;
    }),
    "worker_evidence_failed",
  );

  const questionIds = importedItems.map((item) => item.created_question_id);
  console.log("PHASE=worker_private_drafts");
  const questions = requireData(
    await service
      .from("questions")
      .select(
        "id, question_code, title, owner_bank_id, status, published_at, visibility, source, source_kind, source_review_item_id, deleted_at",
      )
      .in("id", questionIds),
    "worker_evidence_failed",
  ) ?? [];
  assert(questions.length === questionIds.length, "worker_evidence_failed");
  assert(new Set(questions.map((question) => question.question_code)).size === questions.length, "worker_evidence_failed");
  assert(
    questions.every(
      (question) =>
        question.owner_bank_id === bankId &&
        question.status === "draft" &&
        question.published_at === null &&
        question.visibility === "private" &&
        question.source === `ai_pdf_import:${batch.id}` &&
        question.source_kind === "ai_import" &&
        question.deleted_at === null,
    ),
    "worker_evidence_failed",
  );

  console.log("PHASE=worker_review_gate");
  const reviewItems = requireData(
    await service
      .from("review_draft_items")
      .select("id, review_batch_id, target_bank_id, created_question_id, status")
      .in("created_question_id", questionIds),
    "worker_evidence_failed",
  ) ?? [];
  assert(reviewItems.length === questionIds.length, "worker_evidence_failed");
  assert(
    reviewItems.every(
      (item) => item.target_bank_id === bankId && item.status === "pending_review",
    ),
    "worker_evidence_failed",
  );
  const reviewByQuestion = new Map(reviewItems.map((item) => [item.created_question_id, item]));
  assert(
    questions.every(
      (question) => reviewByQuestion.get(question.id)?.id === question.source_review_item_id,
    ),
    "worker_evidence_failed",
  );

  const reviewBatchIds = [...new Set(reviewItems.map((item) => item.review_batch_id))];
  const reviewBatches = requireData(
    await service
      .from("review_batches")
      .select("id, source_record_id, target_bank_id, status")
      .in("id", reviewBatchIds),
    "worker_evidence_failed",
  ) ?? [];
  assert(
    reviewBatches.length === reviewBatchIds.length &&
      reviewBatches.every(
        (reviewBatch) =>
          reviewBatch.source_record_id === batch.id &&
          reviewBatch.target_bank_id === bankId &&
          reviewBatch.status === "pending_review",
      ),
    "worker_evidence_failed",
  );

  console.log("PHASE=worker_taxonomy_gate");
  const taxonomy = requireData(
    await service
      .from("question_taxonomy_assignments")
      .select("question_id, review_status")
      .in("question_id", questionIds),
    "worker_evidence_failed",
  ) ?? [];
  assert(taxonomy.every((row) => row.review_status === "pending_review"), "worker_evidence_failed");

  console.log("PHASE=worker_publication_gate");
  const bankQuestionCount = await countRows(
    service
      .from("bank_questions")
      .select("id", { count: "exact", head: true })
      .in("question_id", questionIds),
    "worker_evidence_failed",
  );
  const assignmentCount = await countRows(
    service
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("source_record_id", batch.id),
    "worker_evidence_failed",
  );
  assert(bankQuestionCount === 0 && assignmentCount === 0, "worker_evidence_failed");

  console.log("PHASE=worker_provider_telemetry");
  const telemetry = requireData(
    await service
      .from("ai_operation_telemetry")
      .select(
        "final_status, provider, model, actual_input_tokens, actual_output_tokens, actual_total_tokens, estimated_total_cost_micros, provider_call_count, provider_retry_attempts",
      )
      .eq("queue_job_id", job.id)
      .order("created_at", { ascending: false }),
    "worker_evidence_failed",
  ) ?? [];
  if (!telemetry.length || telemetry.some((row) => row.estimated_total_cost_micros === null)) {
    throw new HarnessError("provider_cost_telemetry_missing");
  }
  const estimatedCostMicros = telemetry.reduce(
    (total, row) => total + Math.max(0, Number(row.estimated_total_cost_micros) || 0),
    0,
  );
  if (estimatedCostMicros > providerBudgetMicros) {
    throw new HarnessError("provider_cost_budget_exceeded");
  }
  assert(
    telemetry.every(
      (row) =>
        row.final_status === "completed" &&
        String(row.provider).toLowerCase() === "gemini_native" &&
        String(row.model).toLowerCase() === knownProviderModel &&
        Number(row.actual_output_tokens) <=
          proofControl.providerInferenceAttempts *
            proofControl.providerMaxOutputTokens,
    ),
    "worker_evidence_failed",
  );

  return {
    draftCount: questions.length,
    estimatedCostMicros,
    firstQuestionTitle: questions[0].title,
    providerCounters: counters,
    questionIds,
    reviewBatchIds,
    reviewItemIds: reviewItems.map((item) => item.id),
  };
}

async function verifyTeacherVisibleCompletion({ bankId, evidence, origin, page, secrets }) {
  await page.goto(`${origin}/teacher/banks/${bankId}/imports?mode=ai`, {
    waitUntil: "networkidle",
  });
  const importText = await page.locator("body").innerText();
  assertSafeBrowserText(importText, secrets);
  if (!/Completed\s+1/i.test(importText)) throw new HarnessError("worker_evidence_failed");

  await page.goto(`${origin}/teacher/banks/${bankId}/review`, {
    waitUntil: "networkidle",
  });
  const reviewText = await page.locator("body").innerText();
  assertSafeBrowserText(reviewText, secrets);
  await page
    .getByRole("heading", { name: evidence.firstQuestionTitle, exact: true })
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => {
      throw new HarnessError("browser_review_draft_missing");
    });
  console.log("PASS Teacher-visible completion and Review Draft surface");
}

async function safeDelete(action, failures, label) {
  try {
    const result = await action();
    if (result?.error) failures.push(label);
  } catch {
    failures.push(label);
  }
}

async function cleanupFixture({ bankId, fixture, service }) {
  const failures = [];
  const batchId = fixture?.item?.import_batch_id ?? null;
  const jobId = fixture?.item?.ai_provider_job_id ?? null;
  const burstId = fixture?.burst?.id ?? null;
  const objectPath = fixture?.item?.object_path ?? null;
  let questionIds = [];
  let reviewBatchIds = [];

  if (batchId) {
    const items = await service
      .from("import_batch_items")
      .select("created_question_id")
      .eq("batch_id", batchId);
    if (!items.error) {
      questionIds = (items.data ?? []).map((item) => item.created_question_id).filter(Boolean);
    } else {
      failures.push("collect_questions");
    }
    const batches = await service
      .from("review_batches")
      .select("id")
      .eq("source_record_id", batchId);
    if (!batches.error) reviewBatchIds = (batches.data ?? []).map((row) => row.id);
    else failures.push("collect_review_batches");
  }

  if (reviewBatchIds.length) {
    await safeDelete(
      () => service.from("review_batches").delete().in("id", reviewBatchIds),
      failures,
      "review_batches",
    );
  }
  if (questionIds.length) {
    for (const [table, column] of [
      ["question_taxonomy_assignments", "question_id"],
      ["question_assets", "question_id"],
      ["question_source_files", "question_id"],
      ["bank_questions", "question_id"],
    ]) {
      await safeDelete(
        () => service.from(table).delete().in(column, questionIds),
        failures,
        table,
      );
    }
    await safeDelete(
      () => service.from("questions").delete().in("id", questionIds),
      failures,
      "questions",
    );
  }
  if (burstId) {
    await safeDelete(
      () => service.from("ai_pdf_upload_burst_items").delete().eq("burst_id", burstId),
      failures,
      "burst_items",
    );
    await safeDelete(
      () => service.from("ai_pdf_upload_bursts").delete().eq("id", burstId),
      failures,
      "bursts",
    );
  }
  if (jobId) {
    await safeDelete(
      () => service.from("ai_operation_telemetry").delete().eq("queue_job_id", jobId),
      failures,
      "telemetry",
    );
    await safeDelete(
      () => service.from("ai_provider_jobs").delete().eq("id", jobId),
      failures,
      "jobs",
    );
  }
  if (batchId) {
    await safeDelete(
      () => service.from("ai_provider_operation_logs").delete().eq("related_record_id", batchId),
      failures,
      "operation_logs",
    );
    await safeDelete(
      () => service.from("import_batches").delete().eq("id", batchId),
      failures,
      "import_batch",
    );
  }
  if (objectPath) {
    await safeDelete(
      () => service.storage.from(sourceBucket).remove([objectPath]),
      failures,
      "storage_object",
    );
  }
  if (bankId) {
    await safeDelete(
      () => service.from("bank_members").delete().eq("bank_id", bankId),
      failures,
      "bank_members",
    );
    await safeDelete(
      () => service.from("question_banks").delete().eq("id", bankId),
      failures,
      "question_bank",
    );
  }

  const remaining = [];
  for (const [table, column, values] of [
    ["question_banks", "id", bankId ? [bankId] : []],
    ["ai_pdf_upload_bursts", "id", burstId ? [burstId] : []],
    ["ai_provider_jobs", "id", jobId ? [jobId] : []],
    ["import_batches", "id", batchId ? [batchId] : []],
    ["questions", "id", questionIds],
    ["review_batches", "id", reviewBatchIds],
  ]) {
    if (!values.length) continue;
    const result = await service
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, values);
    if (result.error || Number(result.count ?? 0) !== 0) remaining.push(table);
  }
  if (objectPath) {
    const directory = objectPath.slice(0, objectPath.lastIndexOf("/"));
    const filename = objectPath.slice(directory.length + 1);
    const listed = await service.storage.from(sourceBucket).list(directory, { search: filename });
    if (listed.error || (listed.data ?? []).some((item) => item.name === filename)) {
      remaining.push("storage_object");
    }
  }

  return { ok: failures.length === 0 && remaining.length === 0 };
}

async function main() {
  let browser = null;
  let page = null;
  let server = null;
  let service = null;
  let teacher = null;
  let bankId = null;
  let fixture = null;
  let failure = null;
  let cleanup = { ok: true };
  const internalToken = randomBytes(48).toString("base64url");

  try {
    const config = requireProcessEnvironment();
    service = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    teacher = await signInTeacher(config);

    console.log("PHASE=hosted_readiness_preflight");
    await runReadinessPreflight({ service, teacher });
    bankId = await createSyntheticBank(teacher);

    console.log("PHASE=local_next_server");
    server = await startNextServer({ config, internalToken });
    browser = await chromium.launch({ executablePath: config.edgePath, headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    console.log("PHASE=browser_private_pdf_upload");
    fixture = await uploadThroughBrowser({
      bankId,
      config,
      origin: server.origin,
      page,
      service,
      teacher,
    });
    assert(
      fixture.burst.item_count === 1 && fixture.item.page_count === 1,
      "browser_upload_failed",
    );
    console.log("PASS browser upload created one bank-scoped durable job");

    console.log("PHASE=local_worker_one_job");
    await runLocalWorkerOnce({
      internalToken,
      jobId: fixture.item.ai_provider_job_id,
      origin: server.origin,
    });
    const job = await loadFinishedJob({
      jobId: fixture.item.ai_provider_job_id,
      service,
    });
    const evidence = await verifyCompletedEvidence({
      bankId,
      fixture,
      job,
      service,
    });
    console.log("PASS fenced Provider execution and private draft persistence");

    const secrets = [
      config.anonKey,
      config.encryptionKey,
      config.serviceRoleKey,
      config.teacherPassword,
      internalToken,
    ];
    await verifyTeacherVisibleCompletion({
      bankId,
      evidence,
      origin: server.origin,
      page,
      secrets,
    });

    console.log(`DRAFT_COUNT=${Math.min(evidence.draftCount, 999)}`);
    console.log(`PROVIDER_INFERENCE_ATTEMPTS=${evidence.providerCounters.inference}`);
    console.log(`PROVIDER_INFERENCE_REQUESTS=${evidence.providerCounters.inferenceRequests}`);
    console.log(`PROVIDER_NETWORK_REQUESTS=${evidence.providerCounters.network}`);
    console.log(`ESTIMATED_PROVIDER_COST_MICROS=${evidence.estimatedCostMicros}`);
    console.log("PDF50_ONE_FILE_E2E=PASS");
  } catch (error) {
    failure = error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    const serverStopped = await stopChild(server?.child);
    if (!serverStopped && !failure) failure = new HarnessError("cleanup_failed");
    if (service) cleanup = await cleanupFixture({ bankId, fixture, service });
    console.log(`EXACT_ID_CLEANUP=${cleanup.ok ? "PASS" : "FAIL"}`);
    if (!cleanup.ok && !failure) failure = new HarnessError("cleanup_failed");
    await teacher?.client?.auth?.signOut().catch(() => undefined);
    clearProcessEnvironment();
    const environmentCleared = requiredEnvironment.every((name) => !process.env[name]);
    console.log(`PROCESS_ENVIRONMENT_CLEARED=${environmentCleared ? "PASS" : "FAIL"}`);
    if (!environmentCleared && !failure) failure = new HarnessError("cleanup_failed");
  }

  if (failure) {
    console.error(`PDF50_ONE_FILE_E2E=BLOCKED`);
    console.error(`FAILURE_CATEGORY=${safeFailureCategory(failure)}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch {
  clearProcessEnvironment();
  console.error("PDF50_ONE_FILE_E2E=BLOCKED");
  console.error("FAILURE_CATEGORY=unexpected_failure");
  process.exitCode = 1;
}
