import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const contractPath = resolve(
  root,
  "src",
  "lib",
  "ai-jobs",
  "pdf50-scale-provider-proof-control.json",
);

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`invalid_pdf50_scale_provider_control:${name}`);
  }
  return value;
}

export function estimatePDF50ScaleProviderAttemptCostMicros(control) {
  const inputCost = Math.ceil(
    (control.maxInputTokensPerAttempt * control.inputMicrosPerMillion) /
      1_000_000,
  );
  const outputCost = Math.ceil(
    (control.maxBillableOutputTokensPerAttempt *
      control.outputMicrosPerMillion) /
      1_000_000,
  );
  return inputCost + outputCost;
}

export async function loadPDF50ScaleProviderProofControl() {
  const parsed = JSON.parse(await readFile(contractPath, "utf8"));
  const control = Object.freeze({
    schema: String(parsed.schema ?? ""),
    mode: String(parsed.mode ?? ""),
    model: String(parsed.model ?? ""),
    claimedJobs: positiveInteger(parsed.claimedJobs, "claimedJobs"),
    workerRouteInvocations: positiveInteger(
      parsed.workerRouteInvocations,
      "workerRouteInvocations",
    ),
    providerInferenceAttempts: positiveInteger(
      parsed.providerInferenceAttempts,
      "providerInferenceAttempts",
    ),
    providerMaxOutputTokens: positiveInteger(
      parsed.providerMaxOutputTokens,
      "providerMaxOutputTokens",
    ),
    providerMaxNetworkRequests: positiveInteger(
      parsed.providerMaxNetworkRequests,
      "providerMaxNetworkRequests",
    ),
    approvedBudgetUsd: positiveInteger(
      parsed.approvedBudgetUsd,
      "approvedBudgetUsd",
    ),
    maxInputBytesPerAttempt: positiveInteger(
      parsed.maxInputBytesPerAttempt,
      "maxInputBytesPerAttempt",
    ),
    maxInputTokensPerAttempt: positiveInteger(
      parsed.maxInputTokensPerAttempt,
      "maxInputTokensPerAttempt",
    ),
    maxBillableOutputTokensPerAttempt: positiveInteger(
      parsed.maxBillableOutputTokensPerAttempt,
      "maxBillableOutputTokensPerAttempt",
    ),
    inputMicrosPerMillion: positiveInteger(
      parsed.inputMicrosPerMillion,
      "inputMicrosPerMillion",
    ),
    outputMicrosPerMillion: positiveInteger(
      parsed.outputMicrosPerMillion,
      "outputMicrosPerMillion",
    ),
  });

  if (
    control.schema !== "edustruct.pdf50-scale-provider-proof-control.v1" ||
    control.mode !== "BOUNDED_SCALE_REAL_PROVIDER" ||
    control.model !== "gemini-2.5-flash-lite" ||
    control.claimedJobs !== 1 ||
    control.workerRouteInvocations !== 1 ||
    control.providerInferenceAttempts !== 3 ||
    control.providerMaxOutputTokens !== 4_096 ||
    control.providerMaxNetworkRequests !== 68 ||
    control.approvedBudgetUsd !== 2 ||
    control.maxInputBytesPerAttempt !== 200_000 ||
    control.maxInputTokensPerAttempt !== 50_000 ||
    control.maxBillableOutputTokensPerAttempt !== 4_096
  ) {
    throw new Error("invalid_pdf50_scale_provider_control:safety_boundary");
  }

  if (
    control.maxInputBytesPerAttempt !==
    control.maxInputTokensPerAttempt * 4
  ) {
    throw new Error("invalid_pdf50_scale_provider_control:input_unit_boundary");
  }

  const maximumJobCostMicros =
    control.providerInferenceAttempts *
    estimatePDF50ScaleProviderAttemptCostMicros(control);
  if (maximumJobCostMicros > control.approvedBudgetUsd * 1_000_000) {
    throw new Error("invalid_pdf50_scale_provider_control:cost_boundary");
  }
  return control;
}

export function pdf50ScaleProviderProofEnvironment(control) {
  return Object.freeze({
    AI_JOBS_LOCAL_MAX_INVOCATIONS: String(control.workerRouteInvocations),
    PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS: String(
      control.providerInferenceAttempts,
    ),
    PDF50_PROVIDER_TEST_MAX_INPUT_BYTES: String(
      control.maxInputBytesPerAttempt,
    ),
    PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS: String(
      control.providerMaxNetworkRequests,
    ),
    PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS: String(
      control.providerMaxOutputTokens,
    ),
    PDF50_PROVIDER_TEST_MODE: control.mode,
    PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD: String(control.approvedBudgetUsd),
  });
}
