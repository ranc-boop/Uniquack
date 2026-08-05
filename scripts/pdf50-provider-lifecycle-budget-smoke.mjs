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
  structuredOutput,
  chat,
  debugLogs,
  service,
  worker,
  workerRoute,
  providerTestControl,
  burstUpload,
  burstStatusReconciliation,
] = await Promise.all([
  read("src/lib/ai-providers/execution-budget.ts"),
  read("src/lib/ai-providers/gemini-native.ts"),
  read("src/lib/ai-providers/gemini-structured-output.ts"),
  read("src/lib/ai-providers/chat.ts"),
  read("src/lib/ai-providers/llm-debug-logs.ts"),
  read("src/lib/ai-pdf-import/service.ts"),
  read("src/lib/ai-jobs/worker.ts"),
  read("src/app/api/internal/ai-jobs/run/route.ts"),
  read("src/lib/ai-jobs/provider-test-control.ts"),
  read("src/components/teacher/teacher-pdf-burst-upload.tsx"),
  read("src/lib/ai-pdf-import/burst-status-reconciliation.ts"),
]);

const providerExtractionSchema = JSON.parse(
  await read("src/lib/ai-providers/gemini-ai-pdf-extraction.schema.json"),
);
const applicationExtractionSchema = await read("src/lib/ai-pdf-import/schema.ts");
const providerProofControl = JSON.parse(
  await read("src/lib/ai-jobs/pdf50-provider-proof-control.json"),
);

assert(
  budget.includes("createAIProviderExecutionBudget") &&
    budget.includes("beforeInference") &&
    budget.includes("providerInputBytesMax") &&
    budget.includes("recordNetworkRequest") &&
    budget.includes("recordCleanupResult") &&
    budget.includes("maxNetworkRequests") &&
    budget.includes("maxInputBytes") &&
    budget.includes("maxOutputTokens") &&
    budget.includes("provider_execution_budget_exhausted"),
  "PDF50 needs one shared per-job inference budget and transport-request ledger",
);

assert(
  providerTestControl.includes("pdf50-provider-proof-control.json") &&
    providerTestControl.includes("providerMaxNetworkRequests") &&
    providerProofControl.providerMaxNetworkRequests > 0,
  "trusted proof network budget must come from the canonical proof-control contract",
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
  chat.includes("function semanticAttemptReason") &&
    chat.includes("reserveAIPdfSourceRecovery") &&
    chat.includes("reserveAIPdfStructuralRepair") &&
    chat.includes('lastError.kind === "zero_importable"') &&
    chat.includes("buildGeminiRepairPrompt") &&
    chat.includes("generateWithGeminiNativeText") &&
    chat.includes("sourceIncluded") &&
    chat.includes('semanticReason !== "STRUCTURAL_REPAIR_SOURCE_FREE"') &&
    chat.includes("zero importable questions") &&
    !chat.includes("Response preview:") &&
    !chat.includes("Provider response:") &&
    !chat.includes("could not reach ${profile.base_url}") &&
    !chat.includes("Provider replied:"),
  "Provider repair must retain source context only for zero-importable recovery, use text-only structural repair, and never expose raw output or configured URLs",
);

assert(
  !gemini.includes("Provider replied:") &&
    gemini.includes('message: "Gemini Native connection test passed."') &&
    gemini.includes("buildGeminiGenerationConfig") &&
    gemini.includes('outputContract = { mode: "text" }') &&
    structuredOutput.includes('mode: "json"') &&
    structuredOutput.includes("responseJsonSchema") &&
    structuredOutput.includes("responseFormat") &&
    chat.includes("GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT") &&
    chat.includes("normalizeAIPdfExtractionResponse"),
  "Gemini must separate text, JSON, and schema output while retaining semantic extraction validation",
);

assert(
  providerExtractionSchema.properties.questions.maxItems === undefined &&
    providerExtractionSchema.properties.questions.description.includes(
      "required text fields must not be blank",
    ) &&
    providerExtractionSchema.properties.questions.items.properties.title.description.includes(
      "Non-empty",
    ) &&
    providerExtractionSchema.properties.questions.items.properties.content_html.description.includes(
      "Non-empty",
    ) &&
    applicationExtractionSchema.includes(
      "questions: z.array(aiPdfQuestionSchema).min(1).max(200)",
    ),
  "Provider schema must omit the rejected maxItems hint while application validation retains the 200-question cap",
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
    singlePass.includes("callAIPdfExtractionProvider") &&
    chat.includes("async function runAIPdfProviderTransport") &&
    chat.includes("policy: providerRetryMaxAttempts"),
  "single-pass PDF extraction must honor the worker-provided retry ceiling",
);

assert(
  worker.includes("createAIProviderExecutionBudget") &&
    worker.includes("providerTestLimits") &&
  worker.includes("providerInferenceAttempts") &&
    worker.includes("providerInputBytesMax") &&
    worker.includes("providerInferenceRequests") &&
    worker.includes("providerNetworkRequests") &&
    worker.includes("claimTrustedProviderTestJob") &&
    worker.includes("trusted_provider_test_target_required") &&
    worker.includes("if (!providerTestLimits)"),
  "durable worker completion must persist safe per-job execution counters",
);

assert(
    workerRoute.includes("readTrustedAIProviderTestLimits") &&
    workerRoute.includes("limit: providerTestLimits?.maxClaimedJobs ?? 2") &&
    workerRoute.includes("PDF50_PROVIDER_TEST_JOB_HEADER") &&
    workerRoute.includes("parseTrustedAIProviderTestJobId") &&
    workerRoute.includes("safeWorkerFailureReasons") &&
    workerRoute.includes("targetJobId"),
  "trusted proof mode must claim one exact job without reducing the normal two-job limit",
);

assert(
  providerTestControl.includes("PDF50_PROVIDER_PROOF_CONTROL") &&
    providerTestControl.includes("PDF50_PROVIDER_TEST_MAX_COST_MICROS") &&
    providerTestControl.includes("maxInputTokensPerAttempt") &&
    providerTestControl.includes("maxInputBytesPerAttempt") &&
    providerTestControl.includes('"PDF50_PROVIDER_TEST_MAX_INPUT_BYTES"') &&
    providerTestControl.includes("maxBillableOutputTokensPerAttempt") &&
    providerTestControl.includes("approvedBudgetUsd") &&
    providerTestControl.includes('"PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS"') &&
    providerTestControl.includes('"PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS"') &&
    providerTestControl.includes('"PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS"') &&
    providerTestControl.includes('"PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD"'),
  "real Provider proof limits must come only from exact server-owned process controls",
);

assert(
  gemini.includes("thoughtsTokenCount") &&
    gemini.includes("candidateOutputTokens") &&
    gemini.includes("(candidateOutputTokens ?? 0) + (thoughtTokens ?? 0)"),
  "Gemini usage accounting must include billable thinking tokens",
);

assert(
  burstUpload.includes("AIJobStatusPoller") &&
    burstUpload.includes("serverItemsByClientKey") &&
    burstUpload.includes("displayedSelected") &&
    burstUpload.includes("reconcilePdfBurstDisplayState") &&
    burstUpload.includes("localWarningCode") &&
    !burstUpload.includes("statusProgress") &&
    burstStatusReconciliation.includes("mergePdfBurstDurableSnapshot") &&
    burstStatusReconciliation.includes("durableTerminalStatuses"),
  "PDF50 upload status must separate local transport state from authoritative durable state",
);

console.log("PASS PDF50 Provider lifecycle budget and truthful status smoke");
