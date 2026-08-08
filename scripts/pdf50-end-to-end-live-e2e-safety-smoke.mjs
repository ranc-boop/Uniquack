import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadPDF50ProviderProofControl,
  pdf50ProviderProofEnvironment,
} from "./lib/pdf50-provider-proof-control.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const harness = readFileSync(
  resolve(root, "scripts", "pdf50-end-to-end-live-e2e.mjs"),
  "utf8",
);
const counterContract = readFileSync(
  resolve(root, "scripts", "lib", "pdf50-provider-counter-contract.mjs"),
  "utf8",
);
const launcher = readFileSync(
  resolve(root, "scripts", "run-pdf50-end-to-end-live-e2e.ps1"),
  "utf8",
);
const proofControl = await loadPDF50ProviderProofControl();
const proofEnvironment = pdf50ProviderProofEnvironment(proofControl);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const source of [harness, launcher]) {
  assert(!source.includes("dotenv"), "live proof must not load environment files");
  assert(!source.includes(".env.local"), "live proof must not read .env.local");
}

assert(
  launcher.includes('FAILURE_CATEGORY=$FailureCategory') &&
    launcher.includes('"credential_vault_missing"') &&
    launcher.includes('"credential_vault_invalid"') &&
    launcher.includes('Read-Host "Press Enter to close"'),
  "launcher failures must remain sanitized and leave the visible console open",
);

for (const name of [
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
]) {
  assert(harness.includes(`"${name}"`), `missing process-only variable ${name}`);
}
assert(
  harness.includes("unusedStandingTeacherEnvironment") &&
    harness.includes('for (const name of unusedStandingTeacherEnvironment) delete process.env[name]') &&
    !harness.includes("config.teacherUsername") &&
    !harness.includes("config.teacherPassword"),
  "real proof must scrub and never use standing Teacher credentials",
);

for (const literal of [
  "DISPOSABLE_PDF50_PROVIDER_E2E",
  "DELETE_PDF50_PROVIDER_E2E_FIXTURES",
  "loadPDF50ProviderProofControl",
  "pdf50ProviderProofEnvironment",
]) {
  assert(harness.includes(literal), `missing trusted one-job control ${literal}`);
}

for (const [name, expected] of Object.entries(proofEnvironment)) {
  assert(expected.length > 0, `canonical proof control ${name} must be nonempty`);
  assert(harness.includes(`"${name}"`), `harness must validate ${name}`);
}

assert(
  launcher.includes("pdf50-provider-proof-control-report.mjs") &&
    launcher.includes("$ProofControl.workerRouteInvocations") &&
    launcher.includes("$ProofControl.providerInferenceAttempts") &&
    launcher.includes("$ProofControl.providerMaxNetworkRequests") &&
    launcher.includes("$ProofControl.providerMaxOutputTokens") &&
    launcher.includes("$ProofControl.approvedBudgetUsd"),
  "launcher must derive every proof limit from the validated canonical contract",
);

assert(
  harness.includes('providerStrategy(profile) === "gemini_native_pdf"') &&
    harness.includes("knownProviderModel = proofControl.model") &&
    harness.includes('profile.organization_id === null') &&
    harness.includes("providerCostUpperBoundMicros > providerBudgetMicros") &&
    proofControl.model === "gemini-2.5-flash-lite",
  "real proof must fail closed to the known-cost Gemini Native route",
);
assert(
  harness.includes('in("status", ["leased", "processing"])') &&
    harness.includes("active_worker_queue_refused") &&
    !harness.includes("nonempty_worker_queue_refused"),
  "real proof must refuse active workers without blocking unrelated queued work",
);
assert(
  harness.includes("AI_JOBS_LOCAL_TARGET_JOB_ID: jobId") &&
    harness.includes("jobId: fixture.item.ai_provider_job_id") &&
    harness.includes("runLocalWorkerOnce({") &&
    harness.includes("WORKER_ROUTE_FAILURE=") &&
    harness.includes('output.includes("status=worker_accepted")'),
  "real proof must bind its one-shot worker to the exact browser-created job",
);
assert(
  harness.includes("await waitForChildExit(child, 270_000)") &&
    !harness.includes("sleep(270_000).then"),
  "a completed one-shot worker must cancel its timeout timer",
);
assert(
  harness.includes("read_ai_provider_job_provider_result_checkpoint") &&
    harness.includes("execution_fence_token") &&
    harness.includes('checkpoint_stage === "completed"'),
  "real proof must gate and verify 0051 fencing/checkpoints",
);
assert(
  harness.includes("chromium.launch") &&
    harness.includes("Reserve and upload") &&
    harness.includes("local-ai-jobs-worker.mjs") &&
    harness.includes("browser_review_draft_missing"),
  "real proof must traverse browser upload, worker CLI, and Teacher review",
);
assert(
  !harness.includes("._options") &&
    harness.includes("async function uploadThroughBrowser({") &&
    harness.includes("origin,") &&
    harness.includes("signInThroughBrowser(page, origin, teacher.actor, importPath)") &&
    harness.includes("origin: server.origin") &&
    harness.includes('fileName = "pdf50-provider-proof.pdf"') &&
    harness.includes("pdf = buildSyntheticPdf()"),
  "browser proof must use an explicit trusted local origin",
);
assert(
  harness.includes("createSyntheticOrganization") &&
    harness.includes("createSyntheticTeacher") &&
    harness.includes("auth.admin.createUser") &&
    harness.includes("auth.admin.deleteUser") &&
    harness.includes('role: "teacher"') &&
    harness.includes('status: "active"') &&
    harness.includes("organization_members") &&
    harness.includes("staleOrganizations !== 0"),
  "every real run must use fresh exact-ID Teacher and organization fixtures",
);
assert(
  harness.includes('question.status === "draft"') &&
    harness.includes('question.visibility === "private"') &&
    harness.includes("bankQuestionCount === 0 && assignmentCount === 0") &&
    harness.includes("verifyFailedEvidence") &&
    harness.includes(
      "PASS failed Provider execution remained private, bank-scoped, and unassigned",
    ),
  "real proof must preserve review, publication, and Assignment gates",
);
assert(
    harness.includes("cleanupFixture") &&
    harness.includes("collect_question_assets") &&
    harness.includes("question_asset_storage") &&
    harness.includes("questionAssets.map((asset) => asset.id)") &&
    harness.includes("classifyPDF50ProviderCounterContract") &&
    counterContract.includes('return "provider_cleanup_failed"') &&
    counterContract.includes("counters.uploads > counters.inference * 2") &&
    counterContract.includes("counters.cleanup > counters.inference") &&
    harness.includes("EXACT_ID_CLEANUP") &&
    harness.includes("PROCESS_ENVIRONMENT_CLEARED") &&
    harness.includes('remaining.push("auth_user")') &&
    harness.includes('["organizations", "id", fixtures?.organizationIds ?? []]'),
  "real proof must perform exact cleanup and clear process values",
);
assert(
  harness.includes("verifyCrossOrganizationIsolation") &&
    harness.includes("cross_org_bank_hidden") &&
    harness.includes("cross_org_review_items_hidden") &&
    harness.includes("cross_org_review_batches_hidden") &&
    harness.includes("outsiderDownload") &&
    harness.includes("verifyAnonymousSourcePrivacy") &&
    harness.includes("CROSS_ORGANIZATION_VISIBILITY_COUNT=0"),
  "real proof must establish anonymous source privacy and cross-organization denial",
);
assert(
  harness.includes("burst_item_completed") &&
    harness.includes("burst_completed") &&
    harness.includes("exactly_one_bank_scoped_job") &&
    harness.includes("DURABLE_STATES=job:") &&
    harness.includes("batch_status_imported"),
  "real proof must read the job, burst, item, and batch terminal contracts",
);
assert(
  harness.includes("page.reload") &&
    harness.includes("page.context().newPage()") &&
    harness.includes("Teacher UI refresh/remount retained durable completion") &&
    harness.includes("verifyProductionReconciliationContracts") &&
    harness.includes("mergePdfBurstDurableSnapshot") &&
    harness.includes("ensureSinglePageExtractionLineage") &&
    harness.includes("canonical_page_1_lineage"),
  "real proof must cover refresh/remount, terminal authority, and non-fabricated lineage",
);
assert(
  harness.includes("DUPLICATE_REVIEW_DRAFT_COUNT=") &&
    harness.includes("BANK_APPROVAL_COUNT=") &&
    harness.includes("PUBLICATION_COUNT=") &&
    harness.includes("ASSIGNMENT_COUNT=") &&
    harness.includes("INPUT_TOKENS=") &&
    harness.includes("OUTPUT_TOKENS=") &&
    harness.includes("THINKING_TOKENS=UNKNOWN") &&
    harness.includes("SECRET_OR_RAW_CONTENT_EMISSION_COUNT=0"),
  "real proof must emit bounded completion, usage, and no-side-effect counters",
);
assert(
  harness.includes("safeProviderErrorCodes") &&
    harness.includes("PROVIDER_SAFE_ERROR_CODE=") &&
    harness.includes('"provider_invalid_response"') &&
    harness.includes("throw new HarnessError(safeErrorCode)"),
  "real proof must expose only an allowlisted Provider failure code for diagnosis",
);
assert(
  harness.includes("safeWorkerCheckpointStages") &&
    harness.includes("WORKER_FAILURE_CHECKPOINT_STAGE=") &&
    harness.includes("safeWorkerCheckpointStage(job.checkpoint_stage)"),
  "failed worker diagnostics must expose only an allowlisted checkpoint stage",
);
assert(
  harness.includes("safeImportFailurePhases") &&
    harness.includes('"provider_retry_exhausted"') &&
    harness.includes("IMPORT_FAILURE_PHASE=") &&
    harness.includes("FAILED_EXECUTION_DRAFT_COUNT=") &&
    harness.includes("safeImportFailurePhase(importPhase)"),
  "failed worker diagnostics must expose only an allowlisted import phase and bounded draft count",
);
assert(
  harness.includes("safeFinalSummaryFields") &&
    harness.includes("FINALIZATION_SUMMARY_FIELD_BYTES=") &&
    !harness.includes("JSON.stringify(batch.summary)"),
  "failed finalization diagnostics may report only allowlisted summary field sizes",
);
assert(
  harness.includes("stopOwnedTemporaryServer") &&
    harness.includes("terminateWindowsProcessTree") &&
    harness.includes('spawn("taskkill", ["/PID", String(childPid), "/T", "/F"]') &&
    harness.includes("waitForPortClosed") &&
    harness.includes("LOCAL_SERVER_CLEANUP=") &&
    !harness.includes("Get-Process") &&
    !harness.includes("Stop-Process"),
  "the live proof must stop only its recorded local server tree and verify its port closes",
);
assert(
  harness.includes('"Question 1"') &&
    harness.includes('"What is 2 + 3?"') &&
    harness.includes('"Explanation: 2 + 3 = 5."') &&
    harness.includes('"24 TL"'),
  "real proof PDF must render one legible multi-line synthetic question",
);
assert(
  !/console\.(?:log|error)\([^\n]*(?:serviceRoleKey|password|encryptionKey|internalToken|projectRef|\.email)/.test(
    harness,
  ),
  "live proof must not print credential or project identity values",
);

console.log("PASS PDF50 real E2E safety contract");
