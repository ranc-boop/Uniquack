#!/usr/bin/env node

// Synthetic-only Gemini PDF50 scale qualification. The harness reuses the
// one-file proof's credential, browser, actor, and cleanup boundaries while
// targeting every worker invocation to one exact run-scoped job.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

import {
  HarnessError,
  assert,
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
} from "./pdf50-end-to-end-live-e2e.mjs";
import {
  estimatePDF50ScaleStageCostMicros,
  loadPDF50ScaleQualificationControl,
  parsePriorConservativeMicros,
} from "./lib/pdf50-scale-qualification-control.mjs";
import {
  loadPDF50ScaleProviderProofControl,
  pdf50ScaleProviderProofEnvironment,
} from "./lib/pdf50-scale-provider-proof-control.mjs";

const workerRoutePath = "/api/internal/ai-jobs/run";
const providerInterruption = "after_provider_checkpoint";
const retryableScaleProviderCodes = new Set([
  "provider_busy",
  "provider_network_error",
  "provider_rate_limited",
  "provider_timeout",
]);
const scaleProviderControl = await loadPDF50ScaleProviderProofControl();
const scaleProviderEnvironment =
  pdf50ScaleProviderProofEnvironment(scaleProviderControl);
const scaleEnvironmentNames = [
  "PDF50_SCALE_E2E_CONFIRM_CLEANUP",
  "PDF50_SCALE_E2E_ENVIRONMENT",
  "PDF50_SCALE_PRIOR_CONSERVATIVE_MICROS",
  "PDF50_SCALE_STAGE",
];
const safeFailureCategories = new Set([
  "browser_scale_state_failed",
  "cleanup_failed",
  "cross_organization_isolation_failed",
  "exact_worker_target_failed",
  "hosted_readiness_failed",
  "provider_budget_exceeded",
  "provider_cost_telemetry_incomplete",
  "scale_admission_failed",
  "scale_batch_evidence_failed",
  "scale_control_rejected",
  "scale_provider_execution_failed",
  "scale_recovery_failed",
  "scale_worker_failed",
  "stale_fence_proof_failed",
  "unexpected_failure",
]);

function safeFailureCategory(error) {
  const value = String(error?.category ?? "unexpected_failure");
  return safeFailureCategories.has(value) ? value : "unexpected_failure";
}

function scaleAssert(condition, category) {
  if (!condition) throw new HarnessError(category);
}

function sum(values) {
  return values.reduce((total, value) => total + (numeric(value) ?? 0), 0);
}

function providerCounters(job) {
  const result = asRecord(job?.safe_result);
  return {
    cleanup: numeric(result.providerCleanupRequests) ?? 0,
    cleanupFailures: numeric(result.providerCleanupFailures) ?? 0,
    inputBytesMax: numeric(result.providerInputBytesMax) ?? 0,
    inference: numeric(result.providerInferenceAttempts) ?? 0,
    inferenceRequests: numeric(result.providerInferenceRequests) ?? 0,
    network: numeric(result.providerNetworkRequests) ?? 0,
    polls: numeric(result.providerPollRequests) ?? 0,
    uploads: numeric(result.providerUploadRequests) ?? 0,
  };
}

function addCounters(target, value) {
  for (const key of Object.keys(target)) {
    if (key === "inputBytesMax") {
      target[key] = Math.max(target[key], value[key] ?? 0);
    } else {
      target[key] += value[key] ?? 0;
    }
  }
}

function requireScaleEnvironment(control) {
  const config = requireProcessEnvironment();
  for (const name of scaleEnvironmentNames) {
    console.log(`${name}=${process.env[name]?.trim() ? "PRESENT" : "MISSING"}`);
  }
  if (scaleEnvironmentNames.some((name) => !process.env[name]?.trim())) {
    throw new HarnessError("scale_control_rejected");
  }
  if (
    process.env.PDF50_SCALE_E2E_ENVIRONMENT !== control.environment ||
    process.env.PDF50_SCALE_E2E_CONFIRM_CLEANUP !==
      control.cleanupConfirmation
  ) {
    throw new HarnessError("scale_control_rejected");
  }
  const stage = process.env.PDF50_SCALE_STAGE;
  if (!Object.hasOwn(control.stages, stage)) {
    throw new HarnessError("scale_control_rejected");
  }
  let priorConservativeMicros;
  try {
    priorConservativeMicros = parsePriorConservativeMicros(
      process.env.PDF50_SCALE_PRIOR_CONSERVATIVE_MICROS,
    );
  } catch {
    throw new HarnessError("scale_control_rejected");
  }
  const stageConservativeMicros = estimatePDF50ScaleStageCostMicros({
    control,
    inputMicrosPerMillion: scaleProviderControl.inputMicrosPerMillion,
    outputMicrosPerMillion: scaleProviderControl.outputMicrosPerMillion,
    outputTokensPerAttempt: scaleProviderControl.providerMaxOutputTokens,
    stage,
  });
  const approvedBudgetMicros = control.approvedBudgetUsd * 1_000_000;
  if (
    priorConservativeMicros + stageConservativeMicros >
    approvedBudgetMicros
  ) {
    throw new HarnessError("provider_budget_exceeded");
  }
  return {
    ...config,
    approvedBudgetMicros,
    priorConservativeMicros,
    stage,
    stageConservativeMicros,
    stageControl: control.stages[stage],
  };
}

function clearScaleEnvironment() {
  clearProcessEnvironment();
  for (const name of scaleEnvironmentNames) delete process.env[name];
}

async function waitForCondition(operation, category, attempts = 240) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const value = await operation();
    if (value) return value;
    await sleep(Math.min(1000, 100 + attempt * 10));
  }
  throw new HarnessError(category);
}

async function loadBurst({ burstId, service }) {
  const burst = requireData(
    await service
      .from("ai_pdf_upload_bursts")
      .select(
        "id, target_bank_id, created_by, status, item_count, reserved_count, admission_ready_count, queued_count, processing_count, completed_count, failed_count, cancelled_count, completed_at",
      )
      .eq("id", burstId)
      .maybeSingle(),
    "scale_batch_evidence_failed",
  );
  const items =
    requireData(
      await service
        .from("ai_pdf_upload_burst_items")
        .select(
          "id, burst_id, item_index, client_item_key, original_filename, import_batch_id, source_asset_id, ai_provider_job_id, object_path, status, page_count, safe_error_code, completed_at, cancelled_at",
        )
        .eq("burst_id", burstId)
        .order("item_index"),
      "scale_batch_evidence_failed",
    ) ?? [];
  return { burst, items };
}

async function waitForUploadedBurst({ bankId, fileCount, service, teacherId }) {
  return waitForCondition(
    async () => {
      const result = await service
        .from("ai_pdf_upload_bursts")
        .select("id, item_count")
        .eq("target_bank_id", bankId)
        .eq("created_by", teacherId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error || result.data?.item_count !== fileCount) return null;
      const snapshot = await loadBurst({ burstId: result.data.id, service });
      if (
        snapshot.items.length !== fileCount ||
        snapshot.items.some(
          (item) =>
            !item.import_batch_id ||
            !item.source_asset_id ||
            !item.object_path ||
            item.page_count !== 1 ||
            !["admission_ready", "queued"].includes(item.status),
        )
      ) {
        return null;
      }
      return snapshot;
    },
    "scale_admission_failed",
    360,
  );
}

function syntheticFiles(fileCount, stage) {
  return Array.from({ length: fileCount }, (_, index) => {
    const pdf = buildSyntheticPdf({ variant: Number(stage) * 100 + index + 1 });
    scaleAssert(pdf.byteLength <= 4096, "scale_control_rejected");
    return {
      buffer: pdf,
      mimeType: "application/pdf",
      name: `synthetic-scale-${stage}-${String(index + 1).padStart(2, "0")}.pdf`,
    };
  });
}

async function waitForUploadButtonIdle(page) {
  await waitForCondition(
    async () =>
      page
        .getByRole("button", { name: "Reserve and upload" })
        .isEnabled()
        .catch(() => false),
    "scale_admission_failed",
    360,
  );
}

async function uploadBurstThroughBrowser({
  bankId,
  fileCount,
  origin,
  page,
  service,
  stage,
  teacher,
}) {
  const importPath = `/teacher/banks/${bankId}/imports?mode=ai`;
  await signInThroughBrowser(page, origin, teacher.actor, importPath);
  if (!page.url().includes(`/teacher/banks/${bankId}/imports`)) {
    await page.goto(`${origin}${importPath}`, { waitUntil: "networkidle" });
  }
  const input = page.locator('input[type="file"][accept*="pdf"]');
  scaleAssert(await input.isEnabled().catch(() => false), "scale_admission_failed");

  if (fileCount === 50) {
    const beforeCount = await countRows(
      service
        .from("ai_pdf_upload_bursts")
        .select("id", { count: "exact", head: true })
        .eq("target_bank_id", bankId),
      "scale_admission_failed",
    );
    await input.setInputFiles(syntheticFiles(51, "51-gate"));
    const body = await page.locator("body").innerText();
    scaleAssert(
      body.includes("Choose no more than 50 PDFs at once."),
      "scale_admission_failed",
    );
    const afterCount = await countRows(
      service
        .from("ai_pdf_upload_bursts")
        .select("id", { count: "exact", head: true })
        .eq("target_bank_id", bankId),
      "scale_admission_failed",
    );
    scaleAssert(beforeCount === 0 && afterCount === 0, "scale_admission_failed");
    console.log("PASS 51st-file browser admission gate created no durable row");
  }

  const files = syntheticFiles(fileCount, stage);
  await input.setInputFiles(files);
  await page.getByRole("button", { name: "Reserve and upload" }).click();
  const snapshot = await waitForUploadedBurst({
    bankId,
    fileCount,
    service,
    teacherId: teacher.user.id,
  });
  await waitForUploadButtonIdle(page);
  return { ...snapshot, files };
}

async function loadJob({ jobId, service }) {
  return requireData(
    await service
      .from("ai_provider_jobs")
      .select(
        "id, job_kind, status, target_bank_id, resource_id, lease_owner, lease_generation, execution_fence_token, checkpoint_stage, checkpoint_version, checkpointed_at, persisted_output_lineage, safe_result, safe_error_code, safe_message, retryable, execution_attempt_count, max_execution_attempts, provider_attempt_count, available_at, completed_at, cancelled_at",
      )
      .eq("id", jobId)
      .maybeSingle(),
    "scale_worker_failed",
  );
}

async function captureProcessingFence({ child, jobId, service }) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (child.exitCode !== null) return null;
    const job = await loadJob({ jobId, service });
    if (
      ["leased", "processing"].includes(job?.status) &&
      job.lease_owner &&
      job.execution_fence_token
    ) {
      return {
        executionFenceToken: job.execution_fence_token,
        leaseOwner: job.lease_owner,
      };
    }
    await sleep(25);
  }
  return null;
}

function safeWorkerClassification(output) {
  const supported = [
    "authentication_rejected",
    "bounded_worker_failure",
    "bounded_worker_failure_limit_reached",
    "local_server_unavailable",
    "no_claimable_jobs",
    "redirect_rejected",
    "worker_accepted",
  ];
  return supported.find((value) => output.includes(`status=${value}`)) ?? "unknown";
}

function safeWorkerValue(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value)
    ? value
    : "unknown";
}

async function reportSafeWorkerFailure({ jobId, outcome, output, service }) {
  const job = await loadJob({ jobId, service }).catch(() => null);
  console.log(
    `SAFE_LOCAL_WORKER_FAILURE=outcome:${outcome},runner:${safeWorkerClassification(
      output,
    )},job:${safeWorkerValue(job?.status)},checkpoint:${safeWorkerValue(
      job?.checkpoint_stage,
    )},safeError:${safeWorkerValue(job?.safe_error_code)},executionAttempts:${
      numeric(job?.execution_attempt_count) ?? 0
    },providerAttempts:${numeric(job?.provider_attempt_count) ?? 0}`,
  );
}

function reportSafeJobState({ job, label }) {
  const counters = providerCounters(job);
  console.log(
    `SAFE_JOB_STATE=label:${label},status:${safeWorkerValue(
      job?.status,
    )},checkpoint:${safeWorkerValue(
      job?.checkpoint_stage,
    )},safeError:${safeWorkerValue(job?.safe_error_code)},executionAttempts:${
      numeric(job?.execution_attempt_count) ?? 0
    },providerAttempts:${numeric(job?.provider_attempt_count) ?? 0},inference:${
      counters.inference
    },inferenceRequests:${counters.inferenceRequests},inputBytesMax:${
      counters.inputBytesMax
    },uploads:${
      counters.uploads
    },polls:${counters.polls},cleanup:${counters.cleanup},cleanupFailures:${
      counters.cleanupFailures
    },network:${counters.network}`,
  );
}

async function runExactWorker({
  captureFence = false,
  internalToken,
  interruption = false,
  jobId,
  origin,
  service,
}) {
  const before = await waitForExactJobAvailable({ jobId, service });
  scaleAssert(
    before?.job_kind === "ai_pdf_extract" &&
      ["queued", "retry_wait"].includes(before.status),
    "exact_worker_target_failed",
  );
  const workerPath = resolve(root, "scripts", "local-ai-jobs-worker.mjs");
  let output = "";
  const environment = {
    ...minimalChildEnvironment(),
    AI_JOBS_INTERNAL_TOKEN: internalToken,
    AI_JOBS_LOCAL_MAX_INVOCATIONS:
      scaleProviderEnvironment.AI_JOBS_LOCAL_MAX_INVOCATIONS,
    AI_JOBS_LOCAL_ROUTE_URL: `${origin}${workerRoutePath}`,
    AI_JOBS_LOCAL_TARGET_JOB_ID: jobId,
  };
  if (interruption) {
    environment.AI_JOBS_LOCAL_PROVIDER_TEST_INTERRUPTION = providerInterruption;
  }
  const child = spawn(process.execPath, [workerPath], {
    cwd: root,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const capture = (chunk) => {
    if (output.length < 16_384) output += chunk.toString("utf8");
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const fencePromise = captureFence
    ? captureProcessingFence({ child, jobId, service })
    : Promise.resolve(null);
  const outcome = await Promise.race([
    new Promise((resolveExit) =>
      child.once("exit", (code) => resolveExit({ code })),
    ),
    sleep(300_000).then(() => ({ timeout: true })),
  ]);
  const fence = await fencePromise;
  if (outcome.timeout) {
    child.kill("SIGKILL");
    await reportSafeWorkerFailure({
      jobId,
      outcome: "harness_timeout",
      output,
      service,
    });
    throw new HarnessError("scale_worker_failed");
  }
  if (outcome.code !== 0) {
    await reportSafeWorkerFailure({
      jobId,
      outcome: "nonzero_exit",
      output,
      service,
    });
    throw new HarnessError("scale_worker_failed");
  }
  if (
    !output.includes("status=worker_accepted") ||
    !output.includes("claimed=1")
  ) {
    await reportSafeWorkerFailure({
      jobId,
      outcome: "unclaimed_exit",
      output,
      service,
    });
    throw new HarnessError("exact_worker_target_failed");
  }
  scaleAssert(!output.includes(internalToken), "scale_worker_failed");
  return { fence, output };
}

async function waitForJobStatus({ expected, jobId, service }) {
  let lastJob = null;
  for (let attempt = 1; attempt <= 360; attempt += 1) {
    lastJob = await loadJob({ jobId, service });
    if (expected.includes(lastJob?.status)) return lastJob;
    if (
      ["cancelled", "failed", "retry_wait"].includes(lastJob?.status) &&
      !expected.includes(lastJob.status)
    ) {
      reportSafeJobState({ job: lastJob, label: "unexpected_terminal" });
      throw new HarnessError("scale_provider_execution_failed");
    }
    await sleep(250);
  }
  reportSafeJobState({ job: lastJob, label: "status_wait_timeout" });
  throw new HarnessError("scale_worker_failed");
}

async function waitForBurstItemStatus({ expected, itemId, service }) {
  return waitForCondition(
    async () => {
      const result = await service
        .from("ai_pdf_upload_burst_items")
        .select("id, status")
        .eq("id", itemId)
        .maybeSingle();
      if (result.error) return null;
      return expected.includes(result.data?.status) ? result.data : null;
    },
    "scale_batch_evidence_failed",
    60,
  );
}

async function waitForTerminalBurst({ burstId, expectedFiles, service }) {
  let lastSnapshot = null;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    lastSnapshot = await loadBurst({ burstId, service });
    const aggregateTerminalCount = sum([
      lastSnapshot.burst.completed_count,
      lastSnapshot.burst.failed_count,
      lastSnapshot.burst.cancelled_count,
    ]);
    const itemTerminalCount = lastSnapshot.items.filter((item) =>
      ["completed", "failed", "cancelled"].includes(item.status),
    ).length;
    if (
      aggregateTerminalCount === expectedFiles &&
      itemTerminalCount === expectedFiles
    ) {
      return lastSnapshot;
    }
    await sleep(250);
  }
  const safeStatusCounts = {
    admissionReady: sum([lastSnapshot?.burst?.admission_ready_count]),
    cancelled: sum([lastSnapshot?.burst?.cancelled_count]),
    completed: sum([lastSnapshot?.burst?.completed_count]),
    failed: sum([lastSnapshot?.burst?.failed_count]),
    processing: sum([lastSnapshot?.burst?.processing_count]),
    queued: sum([lastSnapshot?.burst?.queued_count]),
    reserved: sum([lastSnapshot?.burst?.reserved_count]),
  };
  console.log(
    `SAFE_TERMINAL_AGGREGATE=${Object.entries(safeStatusCounts)
      .map(([key, value]) => `${key}:${value}`)
      .join(",")}`,
  );
  console.log(
    `SAFE_TERMINAL_ITEM_COUNT=${
      lastSnapshot?.items.filter((item) =>
        ["completed", "failed", "cancelled"].includes(item.status),
      ).length ?? 0
    }`,
  );
  throw new HarnessError("scale_batch_evidence_failed");
}

async function waitForExactJobAvailable({ jobId, service }) {
  return waitForCondition(
    async () => {
      const job = await loadJob({ jobId, service });
      const availableAt = Date.parse(job?.available_at ?? "");
      return (
        ["queued", "retry_wait"].includes(job?.status) &&
        Number.isFinite(availableAt) &&
        availableAt <= Date.now()
      )
        ? job
        : null;
    },
    "scale_recovery_failed",
    360,
  );
}

function assertScaleWorkerBudget({
  counters,
  maxProviderAttempts,
  remainingJobsAfterCurrent,
}) {
  scaleAssert(
    counters.inference +
      scaleProviderControl.providerInferenceAttempts +
      remainingJobsAfterCurrent <=
      maxProviderAttempts,
    "provider_budget_exceeded",
  );
}

function validateProviderCounters({ counters, requireInference }) {
  scaleAssert(
    Object.values(counters).every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) &&
      counters.inference <= scaleProviderControl.providerInferenceAttempts &&
      counters.inferenceRequests === counters.inference &&
      counters.network <= scaleProviderControl.providerMaxNetworkRequests &&
      counters.inputBytesMax <=
        scaleProviderControl.maxInputBytesPerAttempt &&
      counters.cleanupFailures === 0 &&
      (!requireInference ||
        (counters.inference >= 1 && counters.inputBytesMax >= 1)),
    "scale_provider_execution_failed",
  );
}

function assertExactWorkerJobCanRun(job) {
  const executionAttempts = numeric(job?.execution_attempt_count);
  const maxExecutionAttempts = numeric(job?.max_execution_attempts);
  scaleAssert(
    job?.job_kind === "ai_pdf_extract" &&
      ["queued", "retry_wait"].includes(job.status) &&
      Number.isSafeInteger(executionAttempts) &&
      Number.isSafeInteger(maxExecutionAttempts) &&
      executionAttempts >= 0 &&
      maxExecutionAttempts >= 1 &&
      executionAttempts < maxExecutionAttempts,
    "scale_provider_execution_failed",
  );
}

async function runExactWorkerToTerminal({
  counters,
  internalToken,
  jobId,
  maxProviderAttempts,
  onRetryWaitReplay,
  onRouteInvocation,
  origin,
  remainingJobsAfterCurrent,
  service,
}) {
  let routeInvocations = 0;
  let retryWaitReplays = 0;

  while (true) {
    const before = await loadJob({ jobId, service });
    assertExactWorkerJobCanRun(before);
    if (before.status === "retry_wait") {
      await waitForExactJobAvailable({ jobId, service });
    }
    assertScaleWorkerBudget({
      counters,
      maxProviderAttempts,
      remainingJobsAfterCurrent,
    });

    await runExactWorker({ internalToken, jobId, origin, service });
    routeInvocations += 1;
    onRouteInvocation();
    const outcomeJob = await waitForJobStatus({
      expected: ["completed", "retry_wait", "failed"],
      jobId,
      service,
    });
    const executionCounters = providerCounters(outcomeJob);
    validateProviderCounters({
      counters: executionCounters,
      requireInference: outcomeJob.status !== "failed",
    });
    addCounters(counters, executionCounters);
    scaleAssert(
      counters.inference <= maxProviderAttempts,
      "provider_budget_exceeded",
    );

    if (outcomeJob.status === "completed") {
      scaleAssert(
        executionCounters.cleanup >= 1,
        "scale_provider_execution_failed",
      );
      return { completedJob: outcomeJob, retryWaitReplays, routeInvocations };
    }
    if (outcomeJob.status === "failed") {
      reportSafeJobState({ job: outcomeJob, label: "failed_terminal" });
      throw new HarnessError("scale_provider_execution_failed");
    }

    const completedExecutionAttempts = numeric(
      outcomeJob.execution_attempt_count,
    );
    const allowedExecutionAttempts = numeric(outcomeJob.max_execution_attempts);
    scaleAssert(
      outcomeJob.retryable === true &&
        retryableScaleProviderCodes.has(outcomeJob.safe_error_code) &&
        Number.isSafeInteger(completedExecutionAttempts) &&
        Number.isSafeInteger(allowedExecutionAttempts) &&
        completedExecutionAttempts < allowedExecutionAttempts,
      "scale_provider_execution_failed",
    );
    retryWaitReplays += 1;
    onRetryWaitReplay();
    console.log(
      "PASS retryable Provider wait remained durable and exact-job scoped",
    );
  }
}

async function proveStaleFenceRejected({ fence, jobId, service }) {
  scaleAssert(fence?.leaseOwner && fence?.executionFenceToken, "stale_fence_proof_failed");
  const result = await service.rpc("checkpoint_ai_provider_job_stage", {
    p_execution_fence_token: fence.executionFenceToken,
    p_job_id: jobId,
    p_lease_owner: fence.leaseOwner,
    p_safe_metadata: { qualification: "stale_fence_rejection" },
    p_stage: "normalized",
  });
  scaleAssert(
    !result.error && result.data === "STALE_FENCE_REJECTED",
    "stale_fence_proof_failed",
  );
  console.log("PASS stale worker fence could not advance checkpoint state");
}

async function controlledReadAfterWriteProof({ jobId, service }) {
  let delayed = true;
  const job = await readEvidenceWithRetry({
    label: "controlled_read_after_write_delay",
    operation: async () => {
      if (delayed) {
        delayed = false;
        return { data: null, error: { code: "CONTROLLED_TRANSIENT" } };
      }
      return service
        .from("ai_provider_jobs")
        .select("id, status")
        .eq("id", jobId)
        .maybeSingle();
    },
  });
  scaleAssert(job?.status === "completed", "scale_recovery_failed");
}

async function releaseWaitingItems({ burstId, service, limit }) {
  const result = await service.rpc("release_ai_pdf_burst_admission_jobs", {
    p_burst_id: burstId,
    p_limit: limit,
  });
  if (result.error) throw new HarnessError("scale_worker_failed");
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return {
    released: numeric(row?.released_count) ?? 0,
    waiting: numeric(row?.waiting_count) ?? 0,
  };
}

async function cancelRemainingThroughBrowser({ burstId, page, service }) {
  const button = page.getByRole("button", { name: "Cancel unstarted" });
  scaleAssert(await button.isEnabled().catch(() => false), "scale_recovery_failed");
  await button.click();
  return waitForCondition(
    async () => {
      const snapshot = await loadBurst({ burstId, service });
      return snapshot.burst?.cancelled_count === 1 ? snapshot : null;
    },
    "scale_recovery_failed",
    240,
  );
}

async function drainBurst({
  burstId,
  control,
  internalToken,
  origin,
  page,
  service,
  stage,
}) {
  const counters = {
    cleanup: 0,
    cleanupFailures: 0,
    inputBytesMax: 0,
    inference: 0,
    inferenceRequests: 0,
    network: 0,
    polls: 0,
    uploads: 0,
  };
  const processedJobIds = [];
  let claims = 0;
  let interruptionComplete = false;
  let maxAdmissionWaiting = 0;
  let maxQueueDepth = 0;
  let providerRetryWaitReplays = 0;
  let readDelayComplete = false;
  const startedAt = Date.now();

  while (processedJobIds.length < control.stages[stage].completed) {
    try {
    let snapshot = await loadBurst({ burstId, service });
    maxAdmissionWaiting = Math.max(
      maxAdmissionWaiting,
      snapshot.burst.admission_ready_count,
    );
    maxQueueDepth = Math.max(
      maxQueueDepth,
      snapshot.burst.queued_count + snapshot.burst.processing_count,
    );
    let queued = snapshot.items.filter(
      (item) => item.status === "queued" && item.ai_provider_job_id,
    );
    if (!queued.length) {
      const released = await releaseWaitingItems({
        burstId,
        limit: control.releaseLimit,
        service,
      });
      scaleAssert(released.released > 0, "scale_worker_failed");
      snapshot = await waitForCondition(
        async () => {
          const refreshed = await loadBurst({ burstId, service });
          return refreshed.items.some(
            (item) => item.status === "queued" && item.ai_provider_job_id,
          )
            ? refreshed
            : null;
        },
        "scale_worker_failed",
      );
      queued = snapshot.items.filter(
        (item) => item.status === "queued" && item.ai_provider_job_id,
      );
    }
    maxAdmissionWaiting = Math.max(
      maxAdmissionWaiting,
      snapshot.burst.admission_ready_count,
    );
    maxQueueDepth = Math.max(
      maxQueueDepth,
      snapshot.burst.queued_count + snapshot.burst.processing_count,
    );
    scaleAssert(
      maxQueueDepth <= control.maxExpectedQueueDepth,
      "scale_worker_failed",
    );

    const item = queued.sort((left, right) => left.item_index - right.item_index)[0];
    const jobId = item.ai_provider_job_id;
    const useInterruption =
      stage === "10" &&
      control.stages[stage].checkpointInterruption &&
      !interruptionComplete &&
      processedJobIds.length === 1;

    if (useInterruption) {
      const remainingJobsAfterCurrent =
        control.stages[stage].completed - processedJobIds.length - 1;
      let checkpointFence = null;
      let interruptedJobProviderAttempts = 0;

      while (!checkpointFence) {
        const before = await loadJob({ jobId, service });
        assertExactWorkerJobCanRun(before);
        if (before.status === "retry_wait") {
          await waitForExactJobAvailable({ jobId, service });
        }
        assertScaleWorkerBudget({
          counters,
          maxProviderAttempts: control.stages[stage].maxProviderAttempts,
          remainingJobsAfterCurrent,
        });
        const attempt = await runExactWorker({
          captureFence: true,
          internalToken,
          interruption: true,
          jobId,
          origin,
          service,
        });
        claims += 1;
        const retryJob = await waitForJobStatus({
          expected: ["retry_wait", "failed", "completed"],
          jobId,
          service,
        });
        reportSafeJobState({ job: retryJob, label: "checkpoint_attempt" });
        const attemptCounters = providerCounters(retryJob);
        validateProviderCounters({
          counters: attemptCounters,
          requireInference: retryJob.status !== "failed",
        });
        addCounters(counters, attemptCounters);
        interruptedJobProviderAttempts += attemptCounters.inference;
        scaleAssert(
          counters.inference <= control.stages[stage].maxProviderAttempts,
          "provider_budget_exceeded",
        );

        if (
          retryJob.status === "retry_wait" &&
          retryJob.checkpoint_stage === "provider_result_checkpointed"
        ) {
          scaleAssert(
            retryJob.safe_error_code === "provider_network_error" &&
              attemptCounters.cleanup >= 1 &&
              attempt.fence,
            "scale_recovery_failed",
          );
          checkpointFence = attempt.fence;
          break;
        }
        if (retryJob.status !== "retry_wait") {
          throw new HarnessError("scale_recovery_failed");
        }
        const executionAttempts = numeric(retryJob.execution_attempt_count);
        const maxExecutionAttempts = numeric(retryJob.max_execution_attempts);
        scaleAssert(
          retryJob.retryable === true &&
            retryableScaleProviderCodes.has(retryJob.safe_error_code) &&
            Number.isSafeInteger(executionAttempts) &&
            Number.isSafeInteger(maxExecutionAttempts) &&
            executionAttempts < maxExecutionAttempts,
          "scale_recovery_failed",
        );
        providerRetryWaitReplays += 1;
        console.log(
          "PASS transient Provider wait preceded the controlled checkpoint and remained exact-job scoped",
        );
      }

      await proveStaleFenceRejected({ fence: checkpointFence, jobId, service });
      await waitForExactJobAvailable({ jobId, service });
      assertScaleWorkerBudget({
        counters,
        maxProviderAttempts: control.stages[stage].maxProviderAttempts,
        remainingJobsAfterCurrent,
      });
      await runExactWorker({
        internalToken,
        jobId,
        origin,
        service,
      });
      claims += 1;
      const completedJob = await waitForJobStatus({
        expected: ["completed", "failed", "retry_wait"],
        jobId,
        service,
      });
      const replayCounters = providerCounters(completedJob);
      validateProviderCounters({
        counters: replayCounters,
        requireInference: false,
      });
      addCounters(counters, replayCounters);
      if (completedJob.status !== "completed") {
        reportSafeJobState({ job: completedJob, label: "checkpoint_replay" });
        throw new HarnessError("scale_recovery_failed");
      }
      await waitForBurstItemStatus({
        expected: ["completed"],
        itemId: item.id,
        service,
      });
      scaleAssert(
        replayCounters.inference === 0 &&
          replayCounters.inferenceRequests === 0 &&
          replayCounters.inputBytesMax === 0 &&
          completedJob.execution_attempt_count >= 2 &&
          completedJob.provider_attempt_count === interruptedJobProviderAttempts,
        "scale_recovery_failed",
      );
      interruptionComplete = true;
      console.log("PASS protected Provider checkpoint replay used zero duplicate inference");
    } else {
      await runExactWorkerToTerminal({
        counters,
        internalToken,
        jobId,
        maxProviderAttempts: control.stages[stage].maxProviderAttempts,
        onRetryWaitReplay: () => {
          providerRetryWaitReplays += 1;
        },
        onRouteInvocation: () => {
          claims += 1;
        },
        origin,
        remainingJobsAfterCurrent:
          control.stages[stage].completed - processedJobIds.length - 1,
        service,
      });
      await waitForBurstItemStatus({
        expected: ["completed"],
        itemId: item.id,
        service,
      });
    }

    processedJobIds.push(jobId);
    console.log(`WORKER_ITEMS_COMPLETED=${processedJobIds.length}`);
    if (stage === "10" && !readDelayComplete) {
      await controlledReadAfterWriteProof({ jobId, service });
      readDelayComplete = true;
    }
    } catch (error) {
      console.log(`PARTIAL_WORKER_ROUTE_INVOCATIONS=${claims}`);
      console.log(`PARTIAL_COMPLETED_ITEMS=${processedJobIds.length}`);
      console.log(`PARTIAL_PROVIDER_INFERENCE_ATTEMPTS=${counters.inference}`);
      console.log(
        `PARTIAL_PROVIDER_INFERENCE_REQUESTS=${counters.inferenceRequests}`,
      );
      console.log(`PARTIAL_PROVIDER_INPUT_BYTES_MAX=${counters.inputBytesMax}`);
      console.log(`PARTIAL_PROVIDER_UPLOAD_REQUESTS=${counters.uploads}`);
      console.log(`PARTIAL_PROVIDER_POLL_REQUESTS=${counters.polls}`);
      console.log(`PARTIAL_PROVIDER_CLEANUP_REQUESTS=${counters.cleanup}`);
      console.log(`PARTIAL_PROVIDER_NETWORK_REQUESTS=${counters.network}`);
      throw error;
    }
  }

  if (stage === "10") {
    const beforeCancellation = await loadBurst({ burstId, service });
    scaleAssert(
      beforeCancellation.items.filter((item) => item.status === "completed")
        .length === control.stages[stage].completed &&
        beforeCancellation.items.filter((item) =>
          ["admission_ready", "queued"].includes(item.status),
        ).length === 1,
      "scale_recovery_failed",
    );
    await cancelRemainingThroughBrowser({ burstId, page, service });
  }

  const terminal = await waitForTerminalBurst({
    burstId,
    expectedFiles: control.stages[stage].files,
    service,
  });
  return {
    claims,
    counters,
    drainElapsedMs: Date.now() - startedAt,
    interruptionComplete,
    maxAdmissionWaiting,
    maxQueueDepth,
    processedJobIds,
    providerRetryWaitReplays,
    terminal,
  };
}

async function loadAggregateEvidence({ bankId, drain, service, stageControl }) {
  const terminal = drain.terminal;
  const completedItems = terminal.items.filter((item) => item.status === "completed");
  const cancelledItems = terminal.items.filter((item) => item.status === "cancelled");
  scaleAssert(
    completedItems.length === stageControl.completed &&
      cancelledItems.length === stageControl.cancelled &&
      terminal.items.every((item) => ["completed", "cancelled"].includes(item.status)),
    "scale_batch_evidence_failed",
  );
  const expectedBurstStatus = stageControl.cancelled ? "partial" : "completed";
  scaleAssert(
    terminal.burst.status === expectedBurstStatus &&
      terminal.burst.item_count === stageControl.files &&
      terminal.burst.completed_count === stageControl.completed &&
      terminal.burst.cancelled_count === stageControl.cancelled &&
      terminal.burst.failed_count === 0 &&
      terminal.burst.queued_count === 0 &&
      terminal.burst.processing_count === 0 &&
      terminal.burst.admission_ready_count === 0,
    "scale_batch_evidence_failed",
  );

  const completedBatchIds = completedItems.map((item) => item.import_batch_id);
  const allBatchIds = terminal.items.map((item) => item.import_batch_id);
  const jobIds = terminal.items.map((item) => item.ai_provider_job_id).filter(Boolean);
  scaleAssert(
    new Set(jobIds).size === jobIds.length &&
      jobIds.length === stageControl.completed,
    "scale_batch_evidence_failed",
  );
  const jobs =
    requireData(
      await service
        .from("ai_provider_jobs")
        .select(
          "id, status, job_kind, target_bank_id, resource_id, checkpoint_stage, persisted_output_lineage, execution_attempt_count, provider_attempt_count, safe_result",
        )
        .in("id", jobIds),
      "scale_batch_evidence_failed",
    ) ?? [];
  scaleAssert(
    jobs.length === stageControl.completed &&
      jobs.every(
        (job) =>
          job.status === "completed" &&
          job.job_kind === "ai_pdf_extract" &&
          job.target_bank_id === bankId &&
          job.checkpoint_stage === "completed" &&
          job.persisted_output_lineage,
      ),
    "scale_batch_evidence_failed",
  );
  scaleAssert(
    sum(jobs.map((job) => job.provider_attempt_count)) ===
      drain.counters.inference,
    "scale_batch_evidence_failed",
  );

  const batches =
    requireData(
      await service
        .from("import_batches")
        .select("id, status, source_type, target_bank_id, summary")
        .in("id", allBatchIds),
      "scale_batch_evidence_failed",
    ) ?? [];
  const completedBatchSet = new Set(completedBatchIds);
  const completedBatchSources = new Set(
    completedBatchIds.map((batchId) => `ai_pdf_import:${batchId}`),
  );
  scaleAssert(
    batches.length === stageControl.files &&
      batches
        .filter((batch) => completedBatchSet.has(batch.id))
        .every(
          (batch) =>
            batch.status === "imported" &&
            batch.source_type === "ai_pdf" &&
            batch.target_bank_id === bankId,
        ),
    "scale_batch_evidence_failed",
  );

  const importItems =
    requireData(
      await service
        .from("import_batch_items")
        .select(
          "id, batch_id, status, created_question_id, normalized_question_json, persistence_lineage_key",
        )
        .in("batch_id", completedBatchIds),
      "scale_batch_evidence_failed",
    ) ?? [];
  const importedItems = importItems.filter(
    (item) => item.status === "imported" && item.created_question_id,
  );
  const importedByBatch = new Map();
  for (const item of importedItems) {
    importedByBatch.set(item.batch_id, (importedByBatch.get(item.batch_id) ?? 0) + 1);
  }
  scaleAssert(
    importedItems.length === stageControl.completed &&
      completedBatchIds.every((batchId) => importedByBatch.get(batchId) === 1) &&
      new Set(importedItems.map((item) => item.persistence_lineage_key)).size ===
        importedItems.length &&
      importedItems.every((item) => {
        const metadata = asRecord(asRecord(item.normalized_question_json).ai_metadata);
        return (
          item.persistence_lineage_key &&
          Array.isArray(metadata.page_refs) &&
          metadata.page_refs.length === 1 &&
          metadata.page_refs[0] === 1
        );
      }),
    "scale_batch_evidence_failed",
  );

  const questionIds = importedItems.map((item) => item.created_question_id);
  const questions =
    requireData(
      await service
        .from("questions")
        .select(
          "id, question_code, title, owner_bank_id, status, visibility, published_at, source, source_kind, source_review_item_id, deleted_at",
        )
        .in("id", questionIds),
      "scale_batch_evidence_failed",
    ) ?? [];
  scaleAssert(
    questions.length === stageControl.completed &&
      new Set(questions.map((question) => question.question_code)).size ===
        questions.length &&
      questions.every(
        (question) =>
          question.owner_bank_id === bankId &&
          question.status === "draft" &&
          question.visibility === "private" &&
          question.published_at === null &&
          completedBatchSources.has(question.source) &&
          question.source_kind === "ai_import" &&
          question.source_review_item_id &&
          question.deleted_at === null,
      ),
    "scale_batch_evidence_failed",
  );

  const reviewItems =
    requireData(
      await service
        .from("review_draft_items")
        .select("id, review_batch_id, target_bank_id, created_question_id, status")
        .in("created_question_id", questionIds),
      "scale_batch_evidence_failed",
    ) ?? [];
  scaleAssert(
    reviewItems.length === stageControl.completed &&
      new Set(reviewItems.map((item) => item.created_question_id)).size ===
        reviewItems.length &&
      reviewItems.every(
        (item) => item.target_bank_id === bankId && item.status === "pending_review",
      ),
    "scale_batch_evidence_failed",
  );
  const reviewByQuestion = new Map(
    reviewItems.map((item) => [item.created_question_id, item.id]),
  );
  scaleAssert(
    questions.every(
      (question) =>
        reviewByQuestion.get(question.id) === question.source_review_item_id,
    ),
    "scale_batch_evidence_failed",
  );

  const reviewBatchIds = [...new Set(reviewItems.map((item) => item.review_batch_id))];
  const reviewBatches =
    requireData(
      await service
        .from("review_batches")
        .select("id, source_record_id, target_bank_id, status")
        .in("id", reviewBatchIds),
      "scale_batch_evidence_failed",
    ) ?? [];
  scaleAssert(
    reviewBatches.length === stageControl.completed &&
      reviewBatches.every(
        (batch) =>
          completedBatchSet.has(batch.source_record_id) &&
          batch.target_bank_id === bankId &&
          batch.status === "pending_review",
      ),
    "scale_batch_evidence_failed",
  );

  const taxonomy =
    requireData(
      await service
        .from("question_taxonomy_assignments")
        .select("question_id, review_status")
        .in("question_id", questionIds),
      "scale_batch_evidence_failed",
    ) ?? [];
  scaleAssert(
    taxonomy.every((row) => row.review_status === "pending_review"),
    "scale_batch_evidence_failed",
  );
  const bankQuestionCount = await countRows(
    service
      .from("bank_questions")
      .select("id", { count: "exact", head: true })
      .in("question_id", questionIds),
    "scale_batch_evidence_failed",
  );
  const assignmentCount = await countRows(
    service
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .in("source_record_id", allBatchIds),
    "scale_batch_evidence_failed",
  );
  scaleAssert(
    bankQuestionCount === 0 && assignmentCount === 0,
    "scale_batch_evidence_failed",
  );

  const telemetry =
    requireData(
      await service
        .from("ai_operation_telemetry")
        .select(
          "queue_job_id, final_status, provider, model, actual_input_tokens, actual_output_tokens, actual_total_tokens, estimated_total_cost_micros, provider_call_count, provider_retry_attempts",
        )
        .in("queue_job_id", jobIds),
      "scale_batch_evidence_failed",
    ) ?? [];
  const completedTelemetry = telemetry.filter((row) => row.final_status === "completed");
  scaleAssert(
    new Set(completedTelemetry.map((row) => row.queue_job_id)).size ===
      stageControl.completed &&
      completedTelemetry.every(
        (row) =>
          String(row.provider).toLowerCase() === "gemini_native" &&
          String(row.model).toLowerCase() === knownProviderModel,
      ),
    "scale_batch_evidence_failed",
  );
  const usageRows = telemetry.filter(
    (row) =>
      numeric(row.actual_input_tokens) !== null &&
      numeric(row.actual_output_tokens) !== null &&
      numeric(row.actual_total_tokens) !== null &&
      numeric(row.estimated_total_cost_micros) !== null,
  );
  const usageUnknown = usageRows.length !== stageControl.completed;

  return {
    actualCostMicros: sum(usageRows.map((row) => row.estimated_total_cost_micros)),
    assignmentCount,
    batchIds: allBatchIds,
    bankQuestionCount,
    duplicateCount:
      questions.length - new Set(questions.map((question) => question.question_code)).size,
    inputTokens: sum(usageRows.map((row) => row.actual_input_tokens)),
    jobIds,
    outputTokens: sum(usageRows.map((row) => row.actual_output_tokens)),
    questionIds,
    questions,
    reviewBatchIds,
    reviewItemIds: reviewItems.map((item) => item.id),
    telemetry,
    totalTokens: sum(usageRows.map((row) => row.actual_total_tokens)),
    usageUnknown,
  };
}

async function verifyCrossOrganizationIsolation({
  bankId,
  evidence,
  outsider,
  snapshot,
}) {
  await assertRequesterSeesNoRows("scale_cross_org_bank_hidden", () =>
    outsider.client.from("question_banks").select("id").eq("id", bankId),
  );
  await assertRequesterSeesNoRows("scale_cross_org_burst_hidden", () =>
    outsider.client
      .from("ai_pdf_upload_bursts")
      .select("id")
      .eq("id", snapshot.burst.id),
  );
  await assertRequesterSeesNoRows("scale_cross_org_items_hidden", () =>
    outsider.client
      .from("ai_pdf_upload_burst_items")
      .select("id")
      .in("id", snapshot.items.map((item) => item.id)),
  );
  await assertRequesterSeesNoRows("scale_cross_org_jobs_hidden", () =>
    outsider.client
      .from("ai_provider_jobs")
      .select("id")
      .in("id", evidence.jobIds),
  );
  await assertRequesterSeesNoRows("scale_cross_org_batches_hidden", () =>
    outsider.client
      .from("import_batches")
      .select("id")
      .in("id", evidence.batchIds),
  );
  await assertRequesterSeesNoRows("scale_cross_org_questions_hidden", () =>
    outsider.client.from("questions").select("id").in("id", evidence.questionIds),
  );
  await assertRequesterSeesNoRows("scale_cross_org_review_hidden", () =>
    outsider.client
      .from("review_draft_items")
      .select("id")
      .in("id", evidence.reviewItemIds),
  );
  const sourceSamples = [snapshot.items[0], snapshot.items.at(-1)].filter(Boolean);
  for (const item of sourceSamples) {
    const download = await outsider.client.storage
      .from(sourceBucket)
      .download(item.object_path);
    scaleAssert(!download.data, "cross_organization_isolation_failed");
  }
  console.log("PASS unrelated organization saw zero source or derived evidence");
}

async function verifyTeacherUI({
  bankId,
  evidence,
  expected,
  files,
  origin,
  page,
  secrets,
}) {
  const importsUrl = `${origin}/teacher/banks/${bankId}/imports?mode=ai`;
  const expectedSummary =
    `Reserved 0 / Waiting 0 / Queued 0 / Processing 0 / ` +
    `Completed ${expected.completed} / Failed 0 / Cancelled ${expected.cancelled}`;
  const verifySurface = async (activePage, label) => {
    console.log(`BROWSER_CHECK=${label}`);
    const text = await activePage.locator("body").innerText();
    assertSafeBrowserText(text, secrets);
    const summary = activePage.getByText(expectedSummary, { exact: true });
    await summary.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {
      throw new HarnessError("browser_scale_state_failed");
    });
    const burstCard = summary.locator("..");
    scaleAssert(
      (await burstCard
        .getByText(`${expected.files} PDFs`, { exact: true })
        .count()) === 1,
      "browser_scale_state_failed",
    );
    const details = burstCard.locator("details");
    scaleAssert((await details.count()) === 1, "browser_scale_state_failed");
    await details.evaluate((element) => {
      element.open = true;
    });
    const detailText = await details.innerText();
    scaleAssert(
      files.every((file) => detailText.includes(file.name)),
      "browser_scale_state_failed",
    );
    console.log(`BROWSER_CHECK_RESULT=${label}:PASS`);
  };

  await page.goto(importsUrl, { waitUntil: "networkidle" });
  await verifySurface(page, "imports_initial");
  await page.reload({ waitUntil: "networkidle" });
  await verifySurface(page, "imports_reload");
  const remounted = await page.context().newPage();
  try {
    await remounted.goto(importsUrl, { waitUntil: "networkidle" });
    await verifySurface(remounted, "imports_remount");
  } finally {
    await remounted.close();
  }
  console.log("BROWSER_CHECK=review_pending_drafts");
  await page.goto(`${origin}/teacher/banks/${bankId}/review`, {
    waitUntil: "networkidle",
  });
  const reviewText = await page.locator("body").innerText();
  assertSafeBrowserText(reviewText, secrets);
  scaleAssert(
    evidence.questions.length === expected.completed &&
      reviewText.includes(evidence.questions[0].title),
    "browser_scale_state_failed",
  );
  console.log("BROWSER_CHECK_RESULT=review_pending_drafts:PASS");
  console.log("PASS Teacher UI, reload, and fresh remount retained durable state");
}

async function cleanupScaleFixture({ bankId, fixtures, service, snapshot }) {
  const failures = [];
  const items = snapshot?.items ?? [];
  const burstId = snapshot?.burst?.id ?? null;
  const batchIds = items.map((item) => item.import_batch_id).filter(Boolean);
  const jobIds = items.map((item) => item.ai_provider_job_id).filter(Boolean);
  const objectPaths = items.map((item) => item.object_path).filter(Boolean);
  let questionIds = [];
  let reviewBatchIds = [];

  if (batchIds.length) {
    const imported = await service
      .from("import_batch_items")
      .select("created_question_id")
      .in("batch_id", batchIds);
    if (imported.error) failures.push("collect_questions");
    else {
      questionIds = (imported.data ?? [])
        .map((item) => item.created_question_id)
        .filter(Boolean);
    }
    const reviews = await service
      .from("review_batches")
      .select("id")
      .in("source_record_id", batchIds);
    if (reviews.error) failures.push("collect_review_batches");
    else reviewBatchIds = (reviews.data ?? []).map((row) => row.id);
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
      () =>
        service
          .from("ai_pdf_upload_burst_items")
          .delete()
          .eq("burst_id", burstId),
      failures,
      "burst_items",
    );
    await safeDelete(
      () => service.from("ai_pdf_upload_bursts").delete().eq("id", burstId),
      failures,
      "burst",
    );
  }
  if (jobIds.length) {
    await safeDelete(
      () =>
        service
          .from("ai_operation_telemetry")
          .delete()
          .in("queue_job_id", jobIds),
      failures,
      "telemetry",
    );
    await safeDelete(
      () => service.from("ai_provider_jobs").delete().in("id", jobIds),
      failures,
      "jobs",
    );
  }
  if (batchIds.length) {
    await safeDelete(
      () =>
        service
          .from("ai_provider_operation_logs")
          .delete()
          .in("related_record_id", batchIds),
      failures,
      "operation_logs",
    );
    await safeDelete(
      () => service.from("import_batches").delete().in("id", batchIds),
      failures,
      "import_batches",
    );
  }
  if (objectPaths.length) {
    await safeDelete(
      () => service.storage.from(sourceBucket).remove(objectPaths),
      failures,
      "storage_objects",
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
      "bank",
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

  let residueCount = 0;
  for (const [table, column, values] of [
    ["question_banks", "id", bankId ? [bankId] : []],
    ["ai_pdf_upload_bursts", "id", burstId ? [burstId] : []],
    ["ai_provider_jobs", "id", jobIds],
    ["import_batches", "id", batchIds],
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
    if (result.error) failures.push(`verify_${table}`);
    residueCount += numeric(result.count) ?? values.length;
  }
  for (const objectPath of objectPaths) {
    const slash = objectPath.lastIndexOf("/");
    const directory = objectPath.slice(0, slash);
    const filename = objectPath.slice(slash + 1);
    const listed = await service.storage
      .from(sourceBucket)
      .list(directory, { search: filename });
    if (listed.error) failures.push("verify_storage");
    else if ((listed.data ?? []).some((item) => item.name === filename)) {
      residueCount += 1;
    }
  }
  for (const userId of fixtures?.authUserIds ?? []) {
    const result = await service.auth.admin.getUserById(userId);
    if (!result.error && result.data.user) residueCount += 1;
  }
  return { ok: failures.length === 0 && residueCount === 0, residueCount };
}

async function main() {
  const control = await loadPDF50ScaleQualificationControl();
  let bankId = null;
  let browser = null;
  let cleanup = { ok: true, residueCount: 0 };
  let config = null;
  let evidence = null;
  let failure = null;
  let fixtures = null;
  let outsider = null;
  let page = null;
  let providerWorkStarted = false;
  let server = null;
  let service = null;
  let snapshot = null;
  let teacher = null;
  let drain = null;
  const internalToken = randomBytes(48).toString("base64url");
  const runId = randomBytes(8).toString("hex");

  try {
    config = requireScaleEnvironment(control);
    console.log(`PDF50_SCALE_STAGE=${config.stage}`);
    console.log(`FILES_PLANNED=${config.stageControl.files}`);
    console.log(
      `STAGE_CONSERVATIVE_COST_CEILING_MICROS=${config.stageConservativeMicros}`,
    );
    console.log(
      `CUMULATIVE_CONSERVATIVE_CEILING_BEFORE_RUN_MICROS=${config.priorConservativeMicros}`,
    );
    service = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("PHASE=hosted_readiness_preflight");
    await runReadinessPreflight({ service });
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
    const primaryActor = await createSyntheticTeacher({
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
    teacher = await signInTeacher(config, primaryActor);
    outsider = await signInTeacher(config, outsiderActor);
    bankId = await createSyntheticBank(teacher);
    console.log("PASS exact-run synthetic organizations, Teachers, and private Bank ready");

    server = await startNextServer({
      config,
      internalToken,
      providerTestEnvironment: scaleProviderEnvironment,
    });
    browser = await chromium.launch({
      executablePath: config.edgePath,
      headless: true,
    });
    const context = await browser.newContext();
    page = await context.newPage();

    console.log("PHASE=browser_burst_admission");
    snapshot = await uploadBurstThroughBrowser({
      bankId,
      fileCount: config.stageControl.files,
      origin: server.origin,
      page,
      service,
      stage: config.stage,
      teacher,
    });
    scaleAssert(
      snapshot.burst.item_count === config.stageControl.files &&
        snapshot.items.length === config.stageControl.files,
      "scale_admission_failed",
    );
    await verifyAnonymousSourcePrivacy({
      config,
      objectPath: snapshot.items[0].object_path,
    });
    await verifyAnonymousSourcePrivacy({
      config,
      objectPath: snapshot.items.at(-1).object_path,
    });
    console.log("PASS exact file-count burst admitted to private Storage and durable items");

    console.log("PHASE=bounded_exact_job_drain");
    providerWorkStarted = true;
    drain = await drainBurst({
      burstId: snapshot.burst.id,
      control,
      internalToken,
      origin: server.origin,
      page,
      service,
      stage: config.stage,
    });
    scaleAssert(
      drain.counters.inference >= config.stageControl.providerJobs &&
        drain.counters.inference <=
          config.stageControl.maxProviderAttempts &&
        drain.counters.inferenceRequests === drain.counters.inference &&
        drain.counters.cleanupFailures === 0,
      "scale_provider_execution_failed",
    );

    console.log("PHASE=aggregate_evidence");
    evidence = await loadAggregateEvidence({
      bankId,
      drain,
      service,
      stageControl: config.stageControl,
    });
    await verifyCrossOrganizationIsolation({
      bankId,
      evidence,
      outsider,
      snapshot: drain.terminal,
    });
    await verifyProductionReconciliationContracts();
    const secrets = [
      config.anonKey,
      config.encryptionKey,
      config.serviceRoleKey,
      config.url,
      internalToken,
      teacher.actor.email,
      teacher.actor.password,
      outsider.actor.email,
      outsider.actor.password,
    ];
    await verifyTeacherUI({
      bankId,
      evidence,
      expected: config.stageControl,
      files: snapshot.files,
      origin: server.origin,
      page,
      secrets,
    });

    console.log(`ADMITTED_ITEMS=${config.stageControl.files}`);
    console.log(`DURABLE_JOBS=${evidence.jobIds.length}`);
    console.log(`WORKER_ROUTE_INVOCATIONS=${drain.claims}`);
    console.log(`CLAIMED_JOBS=${drain.claims}`);
    console.log(`MAX_QUEUED_OR_PROCESSING_DEPTH=${drain.maxQueueDepth}`);
    console.log(`MAX_ADMISSION_WAITING_DEPTH=${drain.maxAdmissionWaiting}`);
    console.log(`COMPLETED_ITEMS=${config.stageControl.completed}`);
    console.log("FAILED_ITEMS=0");
    console.log(`CANCELLED_ITEMS=${config.stageControl.cancelled}`);
    console.log(`DRAIN_ELAPSED_MS=${drain.drainElapsedMs}`);
    console.log(`PROVIDER_INFERENCE_ATTEMPTS=${drain.counters.inference}`);
    console.log(`PROVIDER_INFERENCE_REQUESTS=${drain.counters.inferenceRequests}`);
    console.log(`PROVIDER_INPUT_BYTES_MAX=${drain.counters.inputBytesMax}`);
    console.log(`PROVIDER_UPLOAD_REQUESTS=${drain.counters.uploads}`);
    console.log(`PROVIDER_POLL_REQUESTS=${drain.counters.polls}`);
    console.log(`PROVIDER_CLEANUP_REQUESTS=${drain.counters.cleanup}`);
    console.log(`PROVIDER_NETWORK_REQUESTS=${drain.counters.network}`);
    console.log(`PROVIDER_RETRY_WAIT_REPLAYS=${drain.providerRetryWaitReplays}`);
    console.log(`INPUT_TOKENS=${evidence.inputTokens}`);
    console.log(`OUTPUT_TOKENS=${evidence.outputTokens}`);
    console.log("THINKING_TOKENS=UNKNOWN");
    console.log(`TOTAL_TOKENS=${evidence.totalTokens}`);
    console.log(
      `ACTUAL_ESTIMATED_COST_MICROS=${
        evidence.usageUnknown ? "UNKNOWN" : evidence.actualCostMicros
      }`,
    );
    console.log(`REVIEW_DRAFT_COUNT=${evidence.questions.length}`);
    console.log("REVIEW_DRAFT_STATE=pending_review");
    console.log(`DUPLICATE_COUNT=${evidence.duplicateCount}`);
    console.log(`BANK_APPROVAL_COUNT=${evidence.bankQuestionCount}`);
    console.log("PUBLICATION_COUNT=0");
    console.log(`ASSIGNMENT_COUNT=${evidence.assignmentCount}`);
    console.log("CROSS_ORGANIZATION_VISIBILITY_COUNT=0");
    console.log(
      `DURABLE_BATCH_STATE=${config.stageControl.cancelled ? "partial" : "completed"}`,
    );
    console.log("UI_RELOAD_REMOUNT=PASS");
    console.log(
      `CHECKPOINT_INTERRUPTION_REPLAY=${
        config.stage === "10" && drain.interruptionComplete ? "PASS" : "NOT_RUN"
      }`,
    );
    console.log(`PDF50_SCALE_${config.stage}=PASS`);
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
      let cleanupSnapshot = drain?.terminal ?? snapshot;
      if (cleanupSnapshot?.burst?.id) {
        cleanupSnapshot = await loadBurst({
          burstId: cleanupSnapshot.burst.id,
          service,
        }).catch(() => cleanupSnapshot);
      }
      cleanup = await cleanupScaleFixture({
        bankId,
        fixtures,
        service,
        snapshot: cleanupSnapshot,
      });
    }
    console.log(`EXACT_ID_CLEANUP=${cleanup.ok ? "PASS" : "FAIL"}`);
    console.log(`SYNTHETIC_RESIDUE_COUNT=${cleanup.residueCount}`);
    if (!cleanup.ok && !failure) failure = new HarnessError("cleanup_failed");
    const prior = config?.priorConservativeMicros ?? 0;
    const stageCost = config?.stageConservativeMicros ?? 0;
    const consumedStageCost = providerWorkStarted ? stageCost : 0;
    const cumulative = prior + consumedStageCost;
    const budget = config?.approvedBudgetMicros ?? control.approvedBudgetUsd * 1_000_000;
    console.log(
      `RUN_CONSERVATIVE_CEILING_CONSUMED_MICROS=${consumedStageCost}`,
    );
    console.log(`CUMULATIVE_CONSERVATIVE_CEILING_MICROS=${cumulative}`);
    console.log(`REMAINING_AUTHORIZED_BUDGET_MICROS=${Math.max(0, budget - cumulative)}`);
    clearScaleEnvironment();
    const environmentCleared = scaleEnvironmentNames.every(
      (name) => !process.env[name],
    );
    console.log(`PROCESS_ENVIRONMENT_CLEARED=${environmentCleared ? "PASS" : "FAIL"}`);
    if (!environmentCleared && !failure) failure = new HarnessError("cleanup_failed");
  }

  if (failure) {
    console.error(`PDF50_SCALE_${config?.stage ?? "UNKNOWN"}=BLOCKED`);
    console.error(`FAILURE_CATEGORY=${safeFailureCategory(failure)}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch {
  clearScaleEnvironment();
  console.error("PDF50_SCALE_UNKNOWN=BLOCKED");
  console.error("FAILURE_CATEGORY=unexpected_failure");
  process.exitCode = 1;
}
