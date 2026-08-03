import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `${name} must exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  const nextExport = source.indexOf("\nexport ", start + 1);
  const candidates = [nextFunction, nextExport].filter((index) => index >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

const [
  budget,
  gemini,
  chat,
  debugLogs,
  service,
  worker,
  workerRoute,
  providerTestControl,
  burstUpload,
] = await Promise.all([
  read("src/lib/ai-providers/execution-budget.ts"),
  read("src/lib/ai-providers/gemini-native.ts"),
  read("src/lib/ai-providers/chat.ts"),
  read("src/lib/ai-providers/llm-debug-logs.ts"),
  read("src/lib/ai-pdf-import/service.ts"),
  read("src/lib/ai-jobs/worker.ts"),
  read("src/app/api/internal/ai-jobs/run/route.ts"),
  read("src/lib/ai-jobs/provider-test-control.ts"),
  read("src/components/teacher/teacher-pdf-burst-upload.tsx"),
]);

assert(
  budget.includes("createAIProviderExecutionBudget") &&
    budget.includes("beforeInference") &&
    budget.includes("recordNetworkRequest") &&
    budget.includes("recordCleanupResult") &&
    budget.includes("maxNetworkRequests") &&
    budget.includes("maxOutputTokens") &&
    budget.includes("provider_execution_budget_exhausted"),
  "PDF50 needs one shared per-job inference budget and transport-request ledger",
);

assert(
  providerTestControl.includes('maxNetworkRequests: 136') &&
    providerTestControl.includes(
      'requireExactEnvironmentValue("PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS", "136")',
    ),
  "trusted proof must reserve the four complete Gemini upload/poll/inference/cleanup lifecycles",
);

for (const operation of [
  "file_upload_start",
  "file_upload_finalize",
  "file_status_poll",
  "inference",
  "file_cleanup",
]) {
  assert(
    budget.includes(`\"${operation}\"`) && gemini.includes(`\"${operation}\"`),
    `Gemini lifecycle must record ${operation}`,
  );
}

assert(
  chat.includes("beforeInference") &&
    chat.includes('recordNetworkRequest("inference")') &&
    chat.includes("max_tokens") &&
    chat.includes("onProviderUsage?.(response.usage)"),
  "OpenAI-compatible extraction must count attempted inference and normalized usage",
);

assert(
  chat.includes('originalPrompt ? "Original extraction instructions:"') &&
    chat.includes("originalPrompt: prompt") &&
    chat.includes("zero importable questions") &&
    !chat.includes("Response preview:") &&
    !chat.includes("Provider response:") &&
    !chat.includes("could not reach ${profile.base_url}") &&
    !chat.includes("Provider replied:"),
  "Provider repair must retain original extraction instructions without exposing raw output or configured URLs",
);

assert(
  !gemini.includes("Provider replied:") &&
    gemini.includes('message: "Gemini Native connection test passed."') &&
    !gemini.includes("responseJsonSchema") &&
    !gemini.includes("responseFormat") &&
    gemini.includes('responseMimeType: "application/json"'),
  "Gemini PDF extraction must retain JSON mode while connection tests avoid echoing model output",
);

assert(
  debugLogs.includes("stringFingerprint") &&
    debugLogs.includes('type: "string"') &&
    !debugLogs.includes("safeFilePart(context.batchId)") &&
    !debugLogs.includes("error instanceof Error ? error.message"),
  "optional Provider diagnostics must retain structure without raw prompts, output, filenames, or identifiers",
);

const singlePass = functionBody(service, "processAIPdfSinglePass");
assert(
  singlePass.includes("providerRetryMaxAttempts") &&
    singlePass.includes("policy:"),
  "single-pass PDF extraction must honor the worker-provided retry ceiling",
);

assert(
  worker.includes("createAIProviderExecutionBudget") &&
    worker.includes("providerTestLimits") &&
  worker.includes("providerInferenceAttempts") &&
    worker.includes("providerInferenceRequests") &&
    worker.includes("providerNetworkRequests") &&
    worker.includes("claimTrustedProviderTestJob") &&
    worker.includes("trusted_provider_test_target_required") &&
    worker.includes("if (!providerTestLimits)"),
  "durable worker completion must persist safe per-job execution counters",
);

assert(
    workerRoute.includes("readTrustedAIProviderTestLimits") &&
    workerRoute.includes("limit: providerTestLimits ? 1 : 2") &&
    workerRoute.includes("PDF50_PROVIDER_TEST_JOB_HEADER") &&
    workerRoute.includes("parseTrustedAIProviderTestJobId") &&
    workerRoute.includes("safeWorkerFailureReasons") &&
    workerRoute.includes("targetJobId"),
  "trusted proof mode must claim one exact job without reducing the normal two-job limit",
);

assert(
  providerTestControl.includes('PDF50_PROVIDER_TEST_MODE = "BOUNDED_ONE_JOB_REAL_PROVIDER"') &&
    providerTestControl.includes("PDF50_PROVIDER_TEST_MAX_COST_MICROS") &&
    providerTestControl.includes("TRUSTED_PROVIDER_MAX_INPUT_TOKENS_PER_ATTEMPT = 1_048_576") &&
    providerTestControl.includes("TRUSTED_PROVIDER_TOTAL_BUDGET_MICROS = 5_000_000") &&
    providerTestControl.includes(
      "PDF50_PROVIDER_TEST_MAX_COST_MICROS > TRUSTED_PROVIDER_TOTAL_BUDGET_MICROS",
    ) &&
    providerTestControl.includes('"PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS"') &&
    providerTestControl.includes('"PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS"') &&
    providerTestControl.includes('"PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS"') &&
    providerTestControl.includes('"PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD"'),
  "real Provider proof limits must come only from exact server-owned process controls",
);

assert(
  burstUpload.includes("AIJobStatusPoller") &&
    burstUpload.includes("serverItemsByClientKey") &&
    burstUpload.includes("displayedSelected") &&
    burstUpload.includes("statusProgress"),
  "PDF50 upload status must poll and reconcile local rows with durable server state",
);

console.log("PASS PDF50 Provider lifecycle budget and truthful status smoke");
