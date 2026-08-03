import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
]) {
  assert(harness.includes(`"${name}"`), `missing process-only variable ${name}`);
}

for (const literal of [
  "DISPOSABLE_PDF50_PROVIDER_E2E",
  "DELETE_PDF50_PROVIDER_E2E_FIXTURES",
  "BOUNDED_ONE_JOB_REAL_PROVIDER",
  'AI_JOBS_LOCAL_MAX_INVOCATIONS: "1"',
  'PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS: "4"',
  'PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS: "136"',
  'PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS: "8192"',
  'PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD: "5"',
]) {
  assert(harness.includes(literal), `missing trusted one-job control ${literal}`);
}

assert(
  harness.includes('providerStrategy(profile) === "gemini_native_pdf"') &&
    harness.includes('knownProviderModel = "gemini-2.5-flash-lite"') &&
    harness.includes("providerCostUpperBoundMicros > providerBudgetMicros") &&
    harness.includes("maxProviderInputTokensPerAttempt = 1_048_576"),
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
    harness.includes("uploadThroughBrowser({ bankId, config, origin, page, service, teacher })"),
  "browser proof must use an explicit trusted local origin",
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
    harness.includes("classifyPDF50ProviderCounterContract") &&
    counterContract.includes('return "provider_cleanup_failed"') &&
    counterContract.includes("counters.uploads > counters.inference * 2") &&
    counterContract.includes("counters.cleanup > counters.inference") &&
    harness.includes("EXACT_ID_CLEANUP") &&
    harness.includes("PROCESS_ENVIRONMENT_CLEARED"),
  "real proof must perform exact cleanup and clear process values",
);
assert(
  harness.includes("safeProviderErrorCodes") &&
    harness.includes("PROVIDER_SAFE_ERROR_CODE=") &&
    harness.includes('"provider_invalid_response"') &&
    harness.includes("throw new HarnessError(safeErrorCode)"),
  "real proof must expose only an allowlisted Provider failure code for diagnosis",
);
assert(
  harness.includes('"Question 1"') &&
    harness.includes('"What is 2 + 3?"') &&
    harness.includes('"Explanation: 2 + 3 = 5."') &&
    harness.includes('"24 TL"'),
  "real proof PDF must render one legible multi-line synthetic question",
);
assert(
  !/console\.(?:log|error)\([^\n]*(?:serviceRoleKey|teacherPassword|encryptionKey|internalToken|projectRef)/.test(
    harness,
  ),
  "live proof must not print credential or project identity values",
);

console.log("PASS PDF50 real E2E safety contract");
