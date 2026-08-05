import "server-only";

import proofControlSource from "./pdf50-provider-proof-control.json";

type PDF50ProviderProofControl = {
  schema: string;
  mode: string;
  model: string;
  claimedJobs: number;
  workerRouteInvocations: number;
  providerInferenceAttempts: number;
  providerMaxOutputTokens: number;
  providerMaxNetworkRequests: number;
  approvedBudgetUsd: number;
  maxInputTokensPerAttempt: number;
  maxBillableOutputTokensPerAttempt: number;
  inputMicrosPerMillion: number;
  outputMicrosPerMillion: number;
};

function positiveInteger(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`trusted_provider_test_contract_rejected:${name}`);
  }
  return Number(value);
}

function readProofControl(): Readonly<PDF50ProviderProofControl> {
  const source = proofControlSource as PDF50ProviderProofControl;
  const control = Object.freeze({
    schema: source.schema,
    mode: source.mode,
    model: source.model,
    claimedJobs: positiveInteger(source.claimedJobs, "claimedJobs"),
    workerRouteInvocations: positiveInteger(
      source.workerRouteInvocations,
      "workerRouteInvocations",
    ),
    providerInferenceAttempts: positiveInteger(
      source.providerInferenceAttempts,
      "providerInferenceAttempts",
    ),
    providerMaxOutputTokens: positiveInteger(
      source.providerMaxOutputTokens,
      "providerMaxOutputTokens",
    ),
    providerMaxNetworkRequests: positiveInteger(
      source.providerMaxNetworkRequests,
      "providerMaxNetworkRequests",
    ),
    approvedBudgetUsd: positiveInteger(
      source.approvedBudgetUsd,
      "approvedBudgetUsd",
    ),
    maxInputTokensPerAttempt: positiveInteger(
      source.maxInputTokensPerAttempt,
      "maxInputTokensPerAttempt",
    ),
    maxBillableOutputTokensPerAttempt: positiveInteger(
      source.maxBillableOutputTokensPerAttempt,
      "maxBillableOutputTokensPerAttempt",
    ),
    inputMicrosPerMillion: positiveInteger(
      source.inputMicrosPerMillion,
      "inputMicrosPerMillion",
    ),
    outputMicrosPerMillion: positiveInteger(
      source.outputMicrosPerMillion,
      "outputMicrosPerMillion",
    ),
  });

  if (
    control.schema !== "edustruct.pdf50-provider-proof-control.v1" ||
    control.mode !== "BOUNDED_ONE_JOB_REAL_PROVIDER" ||
    control.model !== "gemini-2.5-flash-lite" ||
    control.claimedJobs !== 1 ||
    control.workerRouteInvocations !== 1 ||
    control.providerInferenceAttempts !== 1 ||
    control.providerMaxOutputTokens > 8_192 ||
    control.providerMaxNetworkRequests > 256 ||
    control.approvedBudgetUsd > 5
  ) {
    throw new Error("trusted_provider_test_contract_rejected:safety_boundary");
  }
  return control;
}

export const PDF50_PROVIDER_PROOF_CONTROL = readProofControl();
export const PDF50_PROVIDER_TEST_MODE = PDF50_PROVIDER_PROOF_CONTROL.mode;
export const PDF50_PROVIDER_TEST_JOB_HEADER = "x-pdf50-provider-test-job-id";
export const PDF50_PROVIDER_TEST_INTERRUPTION_HEADER =
  "x-pdf50-provider-test-interruption";
export const PDF50_PROVIDER_TEST_INTERRUPTION_AFTER_CHECKPOINT =
  "after_provider_checkpoint";

export type TrustedAIProviderTestInterruption =
  typeof PDF50_PROVIDER_TEST_INTERRUPTION_AFTER_CHECKPOINT;

function costForTokens(tokens: number, microsPerMillion: number) {
  return Math.ceil((tokens * microsPerMillion) / 1_000_000);
}

export const PDF50_PROVIDER_TEST_MAX_COST_MICROS =
  PDF50_PROVIDER_PROOF_CONTROL.providerInferenceAttempts *
  (costForTokens(
    PDF50_PROVIDER_PROOF_CONTROL.maxInputTokensPerAttempt,
    PDF50_PROVIDER_PROOF_CONTROL.inputMicrosPerMillion,
  ) +
    costForTokens(
      PDF50_PROVIDER_PROOF_CONTROL.maxBillableOutputTokensPerAttempt,
      PDF50_PROVIDER_PROOF_CONTROL.outputMicrosPerMillion,
    ));

export type TrustedAIProviderTestLimits = {
  maxClaimedJobs: number;
  maxInferenceAttempts: number;
  maxEstimatedCostMicros: number;
  maxNetworkRequests: number;
  maxOutputTokens: number;
  providerBudgetMicros: number;
};

function requireExactEnvironmentValue(name: string, expected: string) {
  if (process.env[name] !== expected) {
    throw new Error("trusted_provider_test_control_rejected");
  }
}

export function parseTrustedAIProviderTestJobId(value: string | null) {
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  ) {
    throw new Error("trusted_provider_test_job_id_rejected");
  }
  return value;
}

export function parseTrustedAIProviderTestInterruption(
  value: string | null,
): TrustedAIProviderTestInterruption | null {
  if (value === null) return null;
  if (value !== PDF50_PROVIDER_TEST_INTERRUPTION_AFTER_CHECKPOINT) {
    throw new Error("trusted_provider_test_interruption_rejected");
  }
  return value;
}

export function readTrustedAIProviderTestLimits(): TrustedAIProviderTestLimits | null {
  const mode = process.env.PDF50_PROVIDER_TEST_MODE;
  if (mode === undefined) return null;
  if (mode !== PDF50_PROVIDER_TEST_MODE) {
    throw new Error("trusted_provider_test_mode_rejected");
  }

  requireExactEnvironmentValue(
    "AI_JOBS_LOCAL_MAX_INVOCATIONS",
    String(PDF50_PROVIDER_PROOF_CONTROL.workerRouteInvocations),
  );
  requireExactEnvironmentValue(
    "PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS",
    String(PDF50_PROVIDER_PROOF_CONTROL.providerInferenceAttempts),
  );
  requireExactEnvironmentValue(
    "PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS",
    String(PDF50_PROVIDER_PROOF_CONTROL.providerMaxNetworkRequests),
  );
  requireExactEnvironmentValue(
    "PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS",
    String(PDF50_PROVIDER_PROOF_CONTROL.providerMaxOutputTokens),
  );
  requireExactEnvironmentValue(
    "PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD",
    String(PDF50_PROVIDER_PROOF_CONTROL.approvedBudgetUsd),
  );

  const providerBudgetMicros =
    PDF50_PROVIDER_PROOF_CONTROL.approvedBudgetUsd * 1_000_000;
  if (PDF50_PROVIDER_TEST_MAX_COST_MICROS > providerBudgetMicros) {
    throw new Error("trusted_provider_test_cost_budget_rejected");
  }

  return {
    maxClaimedJobs: PDF50_PROVIDER_PROOF_CONTROL.claimedJobs,
    maxInferenceAttempts:
      PDF50_PROVIDER_PROOF_CONTROL.providerInferenceAttempts,
    maxEstimatedCostMicros: PDF50_PROVIDER_TEST_MAX_COST_MICROS,
    maxNetworkRequests:
      PDF50_PROVIDER_PROOF_CONTROL.providerMaxNetworkRequests,
    maxOutputTokens: PDF50_PROVIDER_PROOF_CONTROL.providerMaxOutputTokens,
    providerBudgetMicros,
  };
}
