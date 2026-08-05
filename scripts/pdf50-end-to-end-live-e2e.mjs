#!/usr/bin/env node

// One-file, real-browser PDF50 proof for the approved Current Clean project.
// The harness never reads environment files, never prints fixture identities,
// and uses service role only for bounded preflight, evidence, and exact cleanup.

import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import ts from "typescript";

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
const syntheticOrganizationSlugPrefix = "pdf50-provider-e2e-";
const fixtureKind = "pdf50_provider_e2e";
const disposableEnvironment = "DISPOSABLE_PDF50_PROVIDER_E2E";
const cleanupConfirmation = "DELETE_PDF50_PROVIDER_E2E_FIXTURES";
const proofControl = await loadPDF50ProviderProofControl();
const proofControlEnvironment = pdf50ProviderProofEnvironment(proofControl);
const knownProviderModel = proofControl.model;
const providerBudgetMicros = proofControl.approvedBudgetUsd * 1_000_000;
const providerCostUpperBoundMicros =
  estimatePDF50ProviderProofCostMicros(proofControl);
const serverGracefulStopTimeoutMs = 4_000;
const serverForcedStopTimeoutMs = 8_000;
const serverPortCloseTimeoutMs = 5_000;

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
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
const unusedStandingTeacherEnvironment = [
  "TEST_TEACHER_USERNAME",
  "TEST_TEACHER_PASSWORD",
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

const safePostPersistenceFailureStages = new Set([
  "asset_attachment",
  "summary_preparation",
  "batch_finalization",
  "review_plans",
]);

const safeBatchFinalizationFailureReasons = new Set([
  "summary_too_large",
  "rpc_rejected",
  "stale_fence",
  "unexpected_outcome",
]);

const safeFinalSummaryFields = [
  "adaptiveRereadPlan",
  "chunking",
  "coverageRecoveryMergePlan",
  "coverageRecoveryPlan",
  "coverageRecoveryRunPlan",
  "extractionBatchPlan",
  "extractionCoverageAuditPlan",
  "packetPlan",
  "preanalysis",
  "providerRequestPlan",
  "providerRunPlan",
  "questionBoundaryGuardPlan",
  "selectiveExecutionPlan",
  "taggingV2Plan",
  "taxonomyBootstrapPlan",
  "taxonomyPersistencePlan",
  "taxonomyReviewPlan",
];

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
  "source_privacy_failed",
  "stale_synthetic_fixture_refused",
  "synthetic_fixture_failed",
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

async function readEvidenceWithRetry({ label, operation }) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await operation();
    if (!result?.error) {
      console.log(`EVIDENCE_READ=${label};RESULT=PASS;ATTEMPTS=${attempt}`);
      return result?.data;
    }
    if (attempt < 3) await sleep(attempt * 250);
  }
  console.log(`EVIDENCE_READ=${label};RESULT=FAIL;ATTEMPTS=3`);
  throw new HarnessError("worker_evidence_failed");
}

function assertEvidence(condition, label) {
  console.log(`EVIDENCE_PREDICATE=${label};RESULT=${condition ? "PASS" : "FAIL"}`);
  assert(condition, "worker_evidence_failed");
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

function printEnvironmentPresence() {
  for (const name of requiredEnvironment) {
    console.log(`${name}=${process.env[name]?.trim() ? "PRESENT" : "MISSING"}`);
  }
}

function requireProcessEnvironment() {
  for (const name of unusedStandingTeacherEnvironment) delete process.env[name];
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
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

function clearProcessEnvironment() {
  for (const name of [...requiredEnvironment, ...unusedStandingTeacherEnvironment]) {
    delete process.env[name];
  }
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

function randomFixturePassword() {
  return `PDF50!${randomBytes(24).toString("base64url")}aA1`;
}

function createFixtureState(service) {
  return {
    authUserIds: [],
    organizationIds: [],
    organizationMemberIds: [],
    profileIds: [],
    service,
  };
}

async function insertFixtureId(query) {
  const row = requireData(
    await query.select("id").single(),
    "synthetic_fixture_failed",
  );
  if (!row?.id) throw new HarnessError("synthetic_fixture_failed");
  return row.id;
}

async function createSyntheticOrganization(fixtures, runId, label) {
  const id = await insertFixtureId(
    fixtures.service.from("organizations").insert({
      name: `PDF50 provider proof ${label}`,
      slug: `${syntheticOrganizationSlugPrefix}${runId}-${label}`,
      status: "active",
    }),
  );
  fixtures.organizationIds.push(id);
  return id;
}

async function createSyntheticTeacher({ fixtures, label, organizationId, runId }) {
  const username = `pdf50-${runId}-${label}`;
  const email = `${username}@local.app`;
  const password = randomFixturePassword();
  const authResult = await fixtures.service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { fixture_kind: fixtureKind, fixture_run: runId },
  });
  if (authResult.error || !authResult.data.user?.id) {
    throw new HarnessError("synthetic_fixture_failed");
  }
  const id = authResult.data.user.id;
  fixtures.authUserIds.push(id);
  fixtures.profileIds.push(id);

  requireData(
    await fixtures.service.from("profiles").upsert(
      {
        default_organization_id: organizationId,
        display_name: "PDF50 synthetic teacher",
        email,
        id,
        role: "teacher",
        status: "active",
        username,
      },
      { onConflict: "id" },
    ),
    "synthetic_fixture_failed",
  );

  const organizationMemberId = await insertFixtureId(
    fixtures.service.from("organization_members").insert({
      organization_id: organizationId,
      role: "teacher",
      status: "active",
      user_id: id,
    }),
  );
  fixtures.organizationMemberIds.push(organizationMemberId);
  return { email, id, organizationId, password };
}

async function importTranspiledTypescriptModule(relativePath) {
  const source = await readFile(resolve(root, relativePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

function buildSyntheticPdf({ variant = 1 } = {}) {
  const normalizedVariant = Number.isSafeInteger(variant) && variant > 0 ? variant : 1;
  const left = normalizedVariant === 1 ? 2 : normalizedVariant + 2;
  const right = normalizedVariant === 1 ? 3 : (normalizedVariant % 7) + 1;
  const answer = left + right;
  const lines = normalizedVariant === 1
    ? [
        "Question 1",
        "What is 2 + 3?",
        "A) 4",
        "B) 5",
        "C) 6",
        "D) 7",
        "Answer: B",
        "Explanation: 2 + 3 = 5.",
      ]
    : [
        `Question ${normalizedVariant}`,
        `What is ${left} + ${right}?`,
        `A) ${answer - 2}`,
        `B) ${answer - 1}`,
        `C) ${answer}`,
        `D) ${answer + 1}`,
        "Answer: C",
        `Explanation: ${left} + ${right} = ${answer}.`,
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

async function signInTeacher(config, actor) {
  const client = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const auth = await client.auth.signInWithPassword({
    email: actor.email,
    password: actor.password,
  });
  if (auth.error || !auth.data.user) throw new HarnessError("teacher_not_eligible");
  const profile = requireData(
    await client
      .from("profiles")
      .select("id, role, status, default_organization_id")
      .eq("id", actor.id)
      .maybeSingle(),
    "teacher_not_eligible",
  );
  if (
    !profile ||
    profile.role !== "teacher" ||
    profile.status !== "active" ||
    profile.default_organization_id !== actor.organizationId
  ) {
    throw new HarnessError("teacher_not_eligible");
  }
  return { actor, client, profile, user: auth.data.user };
}

async function countRows(query, category) {
  const result = await query;
  if (result.error) throw new HarnessError(category);
  return Number(result.count ?? 0);
}

async function runReadinessPreflight({ service }) {
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
  const staleOrganizations = await countRows(
    service
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .like("slug", `${syntheticOrganizationSlugPrefix}%`),
    "hosted_readiness_failed",
  );
  if (staleOrganizations !== 0) {
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
    return strategy !== "unsupported" && profile.organization_id === null;
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

function childExitObserved(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildExit(child, timeoutMs) {
  if (childExitObserved(child)) return Promise.resolve(true);

  return new Promise((resolveExit) => {
    let settled = false;
    let timer = null;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.off("exit", onExit);
      resolveExit(exited);
    };
    const onExit = () => finish(true);
    child.once("exit", onExit);
    timer = setTimeout(
      () => finish(childExitObserved(child)),
      timeoutMs,
    );
    if (childExitObserved(child)) finish(true);
  });
}

function portIsListening(port) {
  return new Promise((resolveListening) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolveListening(listening);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function waitForPortClosed(port, timeoutMs) {
  if (!Number.isInteger(port) || port <= 0) return false;
  const deadline = Date.now() + timeoutMs;
  do {
    if (!(await portIsListening(port))) return true;
    await sleep(100);
  } while (Date.now() < deadline);
  return !(await portIsListening(port));
}

function terminateWindowsProcessTree(childPid) {
  if (!Number.isInteger(childPid) || childPid <= 0) {
    return Promise.resolve(false);
  }

  return new Promise((resolveTermination) => {
    let settled = false;
    const killer = spawn("taskkill", ["/PID", String(childPid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    const finish = (terminated) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveTermination(terminated);
    };
    const timer = setTimeout(() => {
      killer.kill();
      finish(false);
    }, serverGracefulStopTimeoutMs);
    killer.once("error", () => finish(false));
    killer.once("exit", (code) => finish(code === 0));
  });
}

async function stopOwnedTemporaryServer(server) {
  const child = server?.child;
  const port = server?.port;
  if (!child) return true;

  const childPid = child.pid;
  if (!Number.isInteger(childPid) || childPid <= 0) return false;

  if (process.platform === "win32" && !childExitObserved(child)) {
    await terminateWindowsProcessTree(childPid);
    const treeExit = await waitForChildExit(child, serverForcedStopTimeoutMs);
    const treePortClosed = await waitForPortClosed(
      port,
      serverPortCloseTimeoutMs,
    );
    return treeExit && treePortClosed;
  }

  if (!childExitObserved(child)) {
    try {
      child.kill("SIGTERM");
    } catch {
      // The bounded exit and port checks below determine the actual outcome.
    }
  }

  const gracefulExit = await waitForChildExit(
    child,
    serverGracefulStopTimeoutMs,
  );
  if (gracefulExit && (await waitForPortClosed(port, serverPortCloseTimeoutMs))) {
    return true;
  }

  if (!childExitObserved(child)) {
    try {
      child.kill("SIGKILL");
    } catch {
      return false;
    }
  }

  const forcedExit = await waitForChildExit(child, serverForcedStopTimeoutMs);
  const portClosed = await waitForPortClosed(port, serverPortCloseTimeoutMs);
  return forcedExit && portClosed;
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
      if (response.status < 500) return { child, origin, port };
    } catch {
      // Bounded startup polling; no server output is relayed.
    }
    await sleep(250);
  }
  await stopOwnedTemporaryServer({ child, port });
  throw new HarnessError("browser_server_failed");
}

async function signInThroughBrowser(page, origin, actor, nextPath) {
  await page.goto(`${origin}/auth/login?next=${encodeURIComponent(nextPath)}`, {
    waitUntil: "networkidle",
  });
  await page.locator("#username").fill(actor.email);
  await page.locator("#password").fill(actor.password);
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

async function uploadThroughBrowser({ bankId, origin, page, service, teacher }) {
  const importPath = `/teacher/banks/${bankId}/imports?mode=ai`;
  await signInThroughBrowser(page, origin, teacher.actor, importPath);
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

function safePostPersistenceFailureStage(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return safePostPersistenceFailureStages.has(normalized) ? normalized : "none";
}

function safeBatchFinalizationFailureReason(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return safeBatchFinalizationFailureReasons.has(normalized)
    ? normalized
    : "none";
}

function safeSummaryBytes(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 999_999
    ? parsed
    : 0;
}

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function formatFinalSummaryFieldBytes(summary) {
  const record = asRecord(summary);
  const aiPdfImport = asRecord(record.aiPdfImport);
  const values = [
    ...safeFinalSummaryFields.map((field) => [field, jsonBytes(aiPdfImport[field])]),
    ["createdQuestions", jsonBytes(record.createdQuestions)],
    ["validationErrorReasons", jsonBytes(record.validationErrorReasons)],
  ];
  return values
    .filter(([, bytes]) => bytes > 4)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([field, bytes]) => `${field}:${Math.min(bytes, 999_999)}`)
    .join(",");
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
  console.log(
    `POST_PERSISTENCE_FAILURE_STAGE=${safePostPersistenceFailureStage(
      asRecord(job.safe_result).postPersistenceFailureStage,
    )}`,
  );
  console.log(
    `BATCH_FINALIZATION_FAILURE_REASON=${safeBatchFinalizationFailureReason(
      asRecord(job.safe_result).batchFinalizationFailureReason,
    )}`,
  );
  console.log(
    `BATCH_FINALIZATION_SUMMARY_BYTES=${safeSummaryBytes(
      asRecord(job.safe_result).batchFinalizationSummaryBytes,
    )}`,
  );

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
  console.log(
    `FINALIZATION_SUMMARY_FIELD_BYTES=${formatFinalSummaryFieldBytes(batch.summary)}`,
  );
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

  console.log("PHASE=worker_burst_item_terminal_contract");
  const terminalItem = await readEvidenceWithRetry({
    label: "burst_item_terminal",
    operation: () =>
      service
        .from("ai_pdf_upload_burst_items")
        .select("id, burst_id, ai_provider_job_id, status, completed_at")
        .eq("id", fixture.item.id)
        .maybeSingle(),
  });
  const terminalBurst = await readEvidenceWithRetry({
    label: "burst_terminal",
    operation: () =>
      service
        .from("ai_pdf_upload_bursts")
        .select(
          "id, status, item_count, completed_count, failed_count, cancelled_count, completed_at",
        )
        .eq("id", fixture.burst.id)
        .maybeSingle(),
  });
  assertEvidence(
    terminalItem?.status === "completed" &&
      terminalItem.burst_id === fixture.burst.id &&
      terminalItem.ai_provider_job_id === job.id &&
      Boolean(terminalItem.completed_at),
    "burst_item_completed",
  );
  assertEvidence(
    terminalBurst?.status === "completed" &&
      terminalBurst.item_count === 1 &&
      terminalBurst.completed_count === 1 &&
      terminalBurst.failed_count === 0 &&
      terminalBurst.cancelled_count === 0 &&
      Boolean(terminalBurst.completed_at),
    "burst_completed",
  );
  const scopedJobCount = await countRows(
    service
      .from("ai_provider_jobs")
      .select("id", { count: "exact", head: true })
      .eq("resource_id", fixture.item.import_batch_id)
      .eq("target_bank_id", bankId),
    "worker_evidence_failed",
  );
  assertEvidence(scopedJobCount === 1, "exactly_one_bank_scoped_job");

  console.log("PHASE=worker_batch_lineage");
  const batch = await readEvidenceWithRetry({
    label: "import_batch",
    operation: () =>
      service
        .from("import_batches")
        .select("id, status, target_bank_id, source_type, summary")
        .eq("id", fixture.item.import_batch_id)
        .maybeSingle(),
  });
  assertEvidence(batch?.status === "imported", "batch_status_imported");
  assertEvidence(
    batch.target_bank_id === bankId && batch.source_type === "ai_pdf",
    "batch_bank_and_source_scope",
  );
  const aiPdfSummary = asRecord(asRecord(batch.summary).aiPdfImport);
  assertEvidence(
    aiPdfSummary.sourceAssetId === fixture.item.source_asset_id,
    "batch_source_asset_lineage",
  );

  const importItems =
    (await readEvidenceWithRetry({
      label: "import_items",
      operation: () =>
        service
          .from("import_batch_items")
          .select(
            "id, item_index, status, created_question_id, normalized_question_json, persistence_lineage_key, validation_errors",
          )
          .eq("batch_id", batch.id)
          .order("item_index"),
    })) ?? [];
  const importedItems = importItems.filter((item) => item.status === "imported" && item.created_question_id);
  assertEvidence(importedItems.length > 0, "imported_items_present");
  const lineageKeys = importedItems.map((item) => item.persistence_lineage_key);
  assertEvidence(lineageKeys.every(Boolean), "lineage_keys_present");
  assertEvidence(
    new Set(lineageKeys).size === lineageKeys.length,
    "lineage_keys_unique",
  );
  assertEvidence(
    importedItems.every((item) => {
      const metadata = asRecord(asRecord(item.normalized_question_json).ai_metadata);
      return (
        Array.isArray(metadata.page_refs) &&
        metadata.page_refs.length === 1 &&
        metadata.page_refs[0] === 1
      );
    }),
    "canonical_page_1_lineage",
  );

  const questionIds = importedItems.map((item) => item.created_question_id);
  console.log("PHASE=worker_private_drafts");
  const questions =
    (await readEvidenceWithRetry({
      label: "private_questions",
      operation: () =>
        service
          .from("questions")
          .select(
            "id, question_code, title, owner_bank_id, status, published_at, visibility, source, source_kind, source_review_item_id, deleted_at",
          )
          .in("id", questionIds),
    })) ?? [];
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
  const reviewItems =
    (await readEvidenceWithRetry({
      label: "review_items",
      operation: () =>
        service
          .from("review_draft_items")
          .select("id, review_batch_id, target_bank_id, created_question_id, status")
          .in("created_question_id", questionIds),
    })) ?? [];
  assert(reviewItems.length === questionIds.length, "worker_evidence_failed");
  const duplicateReviewDraftCount =
    reviewItems.length - new Set(reviewItems.map((item) => item.created_question_id)).size;
  assert(duplicateReviewDraftCount === 0, "worker_evidence_failed");
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
  const reviewBatches =
    (await readEvidenceWithRetry({
      label: "review_batches",
      operation: () =>
        service
          .from("review_batches")
          .select("id, source_record_id, target_bank_id, status")
          .in("id", reviewBatchIds),
    })) ?? [];
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
  const taxonomy =
    (await readEvidenceWithRetry({
      label: "taxonomy_assignments",
      operation: () =>
        service
          .from("question_taxonomy_assignments")
          .select("question_id, review_status")
          .in("question_id", questionIds),
    })) ?? [];
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
  const telemetry =
    (await readEvidenceWithRetry({
      label: "provider_telemetry",
      operation: () =>
        service
          .from("ai_operation_telemetry")
          .select(
            "final_status, provider, model, actual_input_tokens, actual_output_tokens, actual_total_tokens, estimated_total_cost_micros, provider_call_count, provider_retry_attempts",
          )
          .eq("queue_job_id", job.id)
          .order("created_at", { ascending: false }),
    })) ?? [];
  if (!telemetry.length || telemetry.some((row) => row.estimated_total_cost_micros === null)) {
    throw new HarnessError("provider_cost_telemetry_missing");
  }
  if (
    telemetry.some(
      (row) =>
        numeric(row.actual_input_tokens) === null ||
        numeric(row.actual_output_tokens) === null ||
        numeric(row.actual_total_tokens) === null,
    )
  ) {
    throw new HarnessError("provider_cost_telemetry_missing");
  }
  const estimatedCostMicros = telemetry.reduce(
    (total, row) => total + Math.max(0, Number(row.estimated_total_cost_micros) || 0),
    0,
  );
  if (estimatedCostMicros > providerBudgetMicros) {
    throw new HarnessError("provider_cost_budget_exceeded");
  }
  const inputTokens = telemetry.reduce(
    (total, row) => total + Number(row.actual_input_tokens),
    0,
  );
  const outputTokens = telemetry.reduce(
    (total, row) => total + Number(row.actual_output_tokens),
    0,
  );
  const totalTokens = telemetry.reduce(
    (total, row) => total + Number(row.actual_total_tokens),
    0,
  );
  assert(
    telemetry.every(
      (row) =>
        row.final_status === "completed" &&
        String(row.provider).toLowerCase() === "gemini_native" &&
        String(row.model).toLowerCase() === knownProviderModel &&
        Number(row.provider_call_count) === 1 &&
        Number(row.provider_retry_attempts) === 0 &&
        Number(row.actual_output_tokens) <=
          proofControl.providerInferenceAttempts *
            proofControl.providerMaxOutputTokens,
    ),
    "worker_evidence_failed",
  );

  return {
    approvalCount: bankQuestionCount,
    assignmentCount,
    batchStatus: batch.status,
    burstStatus: terminalBurst.status,
    draftCount: questions.length,
    duplicateReviewDraftCount,
    estimatedCostMicros,
    firstQuestionTitle: questions[0].title,
    inputTokens,
    itemStatus: terminalItem.status,
    jobStatus: job.status,
    outputTokens,
    providerCounters: counters,
    publicationCount: questions.filter(
      (question) => question.published_at !== null || question.status === "published",
    ).length,
    questionIds,
    reviewBatchIds,
    reviewItemIds: reviewItems.map((item) => item.id),
    totalTokens,
  };
}

async function assertRequesterSeesNoRows(label, operation) {
  const result = await operation();
  assert(!result.error, "worker_evidence_failed");
  assertEvidence((result.data ?? []).length === 0, label);
}

async function verifyCrossOrganizationIsolation({
  bankId,
  evidence,
  fixture,
  outsider,
}) {
  const ownProfile = requireData(
    await outsider.client
      .from("profiles")
      .select("id")
      .eq("id", outsider.user.id)
      .maybeSingle(),
    "worker_evidence_failed",
  );
  assert(ownProfile?.id === outsider.user.id, "worker_evidence_failed");

  await assertRequesterSeesNoRows("cross_org_bank_hidden", () =>
    outsider.client.from("question_banks").select("id").eq("id", bankId),
  );
  await assertRequesterSeesNoRows("cross_org_burst_hidden", () =>
    outsider.client
      .from("ai_pdf_upload_bursts")
      .select("id")
      .eq("id", fixture.burst.id),
  );
  await assertRequesterSeesNoRows("cross_org_burst_item_hidden", () =>
    outsider.client
      .from("ai_pdf_upload_burst_items")
      .select("id")
      .eq("id", fixture.item.id),
  );
  await assertRequesterSeesNoRows("cross_org_job_hidden", () =>
    outsider.client
      .from("ai_provider_jobs")
      .select("id")
      .eq("id", fixture.item.ai_provider_job_id),
  );
  await assertRequesterSeesNoRows("cross_org_import_batch_hidden", () =>
    outsider.client
      .from("import_batches")
      .select("id")
      .eq("id", fixture.item.import_batch_id),
  );
  await assertRequesterSeesNoRows("cross_org_questions_hidden", () =>
    outsider.client.from("questions").select("id").in("id", evidence.questionIds),
  );
  await assertRequesterSeesNoRows("cross_org_review_items_hidden", () =>
    outsider.client
      .from("review_draft_items")
      .select("id")
      .in("id", evidence.reviewItemIds),
  );
  await assertRequesterSeesNoRows("cross_org_review_batches_hidden", () =>
    outsider.client
      .from("review_batches")
      .select("id")
      .in("id", evidence.reviewBatchIds),
  );

  const outsiderDownload = await outsider.client.storage
    .from(sourceBucket)
    .download(fixture.item.object_path);
  assert(!outsiderDownload.data, "source_privacy_failed");
  console.log("PASS unrelated organization could not read source or derived evidence");
}

async function verifyAnonymousSourcePrivacy({ config, objectPath }) {
  const anonymous = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const directDownload = await anonymous.storage.from(sourceBucket).download(objectPath);
  assert(!directDownload.data, "source_privacy_failed");
  console.log("PASS source object remained private to anonymous requesters");
}

async function verifyProductionReconciliationContracts() {
  const reconciliation = await importTranspiledTypescriptModule(
    "src/lib/ai-pdf-import/burst-status-reconciliation.ts",
  );
  const completed = { safeErrorCode: null, status: "completed" };
  const visible = reconciliation.reconcilePdfBurstDisplayState({
    durable: completed,
    localPhase: "failed",
    localRequestState: "cancellation_requested",
    localWarningCode: "finalize_transport_interrupted",
  });
  assert(
    visible.status === "completed" &&
      visible.localRequestState === null &&
      visible.localWarningCode === "finalize_transport_interrupted" &&
      visible.shouldPoll === false,
    "worker_evidence_failed",
  );
  for (const delayedStatus of ["processing", "failed", "cancelled"]) {
    const merged = reconciliation.mergePdfBurstDurableSnapshot(completed, {
      safeErrorCode: delayedStatus === "failed" ? "provider_network_error" : null,
      status: delayedStatus,
    });
    assert(
      merged.status === "completed" && merged.safeErrorCode === null,
      "worker_evidence_failed",
    );
  }

  const lineage = await importTranspiledTypescriptModule(
    "src/lib/ai-pdf-import/source-lineage.ts",
  );
  const extraction = () => ({
    questions: [{ page_refs: [] }],
    warnings: [],
  });
  const onePage = lineage.ensureSinglePageExtractionLineage({
    extraction: extraction(),
    suppliedPageCount: 1,
  });
  const multiPageInput = extraction();
  const multiPage = lineage.ensureSinglePageExtractionLineage({
    extraction: multiPageInput,
    suppliedPageCount: 2,
  });
  const unknownPageInput = extraction();
  const unknownPage = lineage.ensureSinglePageExtractionLineage({
    extraction: unknownPageInput,
    suppliedPageCount: 0,
  });
  assert(
    onePage.questions[0].page_refs.length === 1 &&
      onePage.questions[0].page_refs[0] === 1 &&
      multiPage === multiPageInput &&
      multiPage.questions[0].page_refs.length === 0 &&
      unknownPage === unknownPageInput &&
      unknownPage.questions[0].page_refs.length === 0,
    "worker_evidence_failed",
  );
  console.log("PASS completion authority and non-fabricated lineage contracts");
}

async function verifyTeacherVisibleCompletion({ bankId, evidence, origin, page, secrets }) {
  const importsUrl = `${origin}/teacher/banks/${bankId}/imports?mode=ai`;
  const assertCompletedSurface = async (activePage) => {
    const importText = await activePage.locator("body").innerText();
    assertSafeBrowserText(importText, secrets);
    if (!/Completed\s+1/i.test(importText)) {
      throw new HarnessError("worker_evidence_failed");
    }
  };

  await page.goto(importsUrl, { waitUntil: "networkidle" });
  await assertCompletedSurface(page);
  await page.reload({ waitUntil: "networkidle" });
  await assertCompletedSurface(page);

  const remountedPage = await page.context().newPage();
  try {
    await remountedPage.goto(importsUrl, { waitUntil: "networkidle" });
    await assertCompletedSurface(remountedPage);
  } finally {
    await remountedPage.close();
  }
  console.log("PASS Teacher UI refresh/remount retained durable completion");

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

async function cleanupFixture({ bankId, fixture, fixtures, service }) {
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
  if (fixtures?.organizationMemberIds.length) {
    await safeDelete(
      () =>
        service
          .from("organization_members")
          .delete()
          .in("id", fixtures.organizationMemberIds),
      failures,
      "organization_members",
    );
  }
  if (fixtures?.profileIds.length) {
    await safeDelete(
      () => service.from("profiles").delete().in("id", fixtures.profileIds),
      failures,
      "profiles",
    );
  }
  for (const userId of fixtures?.authUserIds ?? []) {
    await safeDelete(
      () => service.auth.admin.deleteUser(userId),
      failures,
      "auth_user",
    );
  }
  if (fixtures?.organizationIds.length) {
    await safeDelete(
      () => service.from("organizations").delete().in("id", fixtures.organizationIds),
      failures,
      "organizations",
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
    ["organization_members", "id", fixtures?.organizationMemberIds ?? []],
    ["profiles", "id", fixtures?.profileIds ?? []],
    ["organizations", "id", fixtures?.organizationIds ?? []],
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
  for (const userId of fixtures?.authUserIds ?? []) {
    const result = await service.auth.admin.getUserById(userId);
    if (!result.error && result.data.user) remaining.push("auth_user");
  }

  return { ok: failures.length === 0 && remaining.length === 0 };
}

async function main() {
  let browser = null;
  let config = null;
  let page = null;
  let server = null;
  let service = null;
  let fixtures = null;
  let teacher = null;
  let outsider = null;
  let bankId = null;
  let fixture = null;
  let failure = null;
  let cleanup = { ok: true };
  const internalToken = randomBytes(48).toString("base64url");
  const runId = randomBytes(8).toString("hex");

  try {
    config = requireProcessEnvironment();
    service = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("PHASE=hosted_readiness_preflight");
    await runReadinessPreflight({ service });

    console.log("PHASE=synthetic_actor_fixtures");
    fixtures = createFixtureState(service);
    const primaryOrganizationId = await createSyntheticOrganization(
      fixtures,
      runId,
      "primary",
    );
    const outsiderOrganizationId = await createSyntheticOrganization(
      fixtures,
      runId,
      "outsider",
    );
    const teacherActor = await createSyntheticTeacher({
      fixtures,
      label: "primary",
      organizationId: primaryOrganizationId,
      runId,
    });
    const outsiderActor = await createSyntheticTeacher({
      fixtures,
      label: "outsider",
      organizationId: outsiderOrganizationId,
      runId,
    });
    teacher = await signInTeacher(config, teacherActor);
    outsider = await signInTeacher(config, outsiderActor);
    console.log("PASS run-scoped synthetic Teacher and organization fixtures ready");

    bankId = await createSyntheticBank(teacher);

    console.log("PHASE=local_next_server");
    server = await startNextServer({ config, internalToken });
    browser = await chromium.launch({ executablePath: config.edgePath, headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    console.log("PHASE=browser_private_pdf_upload");
    fixture = await uploadThroughBrowser({
      bankId,
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
    await verifyAnonymousSourcePrivacy({
      config,
      objectPath: fixture.item.object_path,
    });

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

    await verifyCrossOrganizationIsolation({
      bankId,
      evidence,
      fixture,
      outsider,
    });
    await verifyProductionReconciliationContracts();

    const secrets = [
      config.anonKey,
      config.encryptionKey,
      config.serviceRoleKey,
      config.url,
      teacher.actor.email,
      teacher.actor.password,
      outsider.actor.email,
      outsider.actor.password,
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
    console.log("REVIEW_DRAFT_STATE=pending_review");
    console.log(`DUPLICATE_REVIEW_DRAFT_COUNT=${evidence.duplicateReviewDraftCount}`);
    console.log(`BANK_APPROVAL_COUNT=${evidence.approvalCount}`);
    console.log(`PUBLICATION_COUNT=${evidence.publicationCount}`);
    console.log(`ASSIGNMENT_COUNT=${evidence.assignmentCount}`);
    console.log(
      `DURABLE_STATES=job:${evidence.jobStatus},burst:${evidence.burstStatus},item:${evidence.itemStatus},batch:${evidence.batchStatus}`,
    );
    console.log(`PROVIDER_INFERENCE_ATTEMPTS=${evidence.providerCounters.inference}`);
    console.log(`PROVIDER_INFERENCE_REQUESTS=${evidence.providerCounters.inferenceRequests}`);
    console.log(`PROVIDER_UPLOAD_REQUESTS=${evidence.providerCounters.uploads}`);
    console.log(`PROVIDER_POLL_REQUESTS=${evidence.providerCounters.polls}`);
    console.log(`PROVIDER_CLEANUP_REQUESTS=${evidence.providerCounters.cleanup}`);
    console.log(`PROVIDER_NETWORK_REQUESTS=${evidence.providerCounters.network}`);
    console.log(`INPUT_TOKENS=${evidence.inputTokens}`);
    console.log(`OUTPUT_TOKENS=${evidence.outputTokens}`);
    console.log("THINKING_TOKENS=UNKNOWN");
    console.log(`TOTAL_TOKENS=${evidence.totalTokens}`);
    console.log(`ESTIMATED_PROVIDER_COST_MICROS=${evidence.estimatedCostMicros}`);
    console.log("CROSS_ORGANIZATION_VISIBILITY_COUNT=0");
    console.log("SECRET_OR_RAW_CONTENT_EMISSION_COUNT=0");
    console.log("PDF50_ONE_FILE_E2E=PASS");
  } catch (error) {
    failure = error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    const serverStopped = await stopOwnedTemporaryServer(server);
    console.log(`LOCAL_SERVER_CLEANUP=${serverStopped ? "PASS" : "FAIL"}`);
    if (!serverStopped && !failure) failure = new HarnessError("cleanup_failed");
    await teacher?.client?.auth?.signOut().catch(() => undefined);
    await outsider?.client?.auth?.signOut().catch(() => undefined);
    if (service) {
      cleanup = await cleanupFixture({ bankId, fixture, fixtures, service });
    }
    console.log(`EXACT_ID_CLEANUP=${cleanup.ok ? "PASS" : "FAIL"}`);
    if (!cleanup.ok && !failure) failure = new HarnessError("cleanup_failed");
    clearProcessEnvironment();
    const environmentCleared = [
      ...requiredEnvironment,
      ...unusedStandingTeacherEnvironment,
    ].every((name) => !process.env[name]);
    console.log(`PROCESS_ENVIRONMENT_CLEARED=${environmentCleared ? "PASS" : "FAIL"}`);
    if (!environmentCleared && !failure) failure = new HarnessError("cleanup_failed");
  }

  if (failure) {
    console.error(`PDF50_ONE_FILE_E2E=BLOCKED`);
    console.error(`FAILURE_CATEGORY=${safeFailureCategory(failure)}`);
    process.exitCode = 1;
  }
}

const isDirectInvocation =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  try {
    await main();
  } catch {
    clearProcessEnvironment();
    console.error("PDF50_ONE_FILE_E2E=BLOCKED");
    console.error("FAILURE_CATEGORY=unexpected_failure");
    process.exitCode = 1;
  }
}

export {
  HarnessError,
  assert,
  assertEvidence,
  assertRequesterSeesNoRows,
  assertSafeBrowserText,
  asRecord,
  buildSyntheticPdf,
  clearProcessEnvironment,
  countRows,
  createFixtureState,
  createSyntheticBank,
  createSyntheticOrganization,
  createSyntheticTeacher,
  knownProviderModel,
  minimalChildEnvironment,
  numeric,
  proofControl,
  proofControlEnvironment,
  readEvidenceWithRetry,
  requireData,
  requireProcessEnvironment,
  root,
  runReadinessPreflight,
  safeDelete,
  signInTeacher,
  signInThroughBrowser,
  sleep,
  sourceBucket,
  startNextServer,
  stopOwnedTemporaryServer,
  verifyAnonymousSourcePrivacy,
  verifyProductionReconciliationContracts,
};
