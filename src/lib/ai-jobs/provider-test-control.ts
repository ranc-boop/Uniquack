import "server-only";

import proofControlSource from "./pdf50-provider-proof-control.json";
import scaleProofControlSource from "./pdf50-scale-provider-proof-control.json";

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
  maxInputBytesPerAttempt: number | null;
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

function readProofControl({
  expected,
  source,
}: {
  expected: Readonly<PDF50ProviderProofControl>;
  source: PDF50ProviderProofControl;
}): Readonly<PDF50ProviderProofControl> {
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
    maxInputBytesPerAttempt:
      source.maxInputBytesPerAttempt == null
        ? null
        : positiveInteger(
            source.maxInputBytesPerAttempt,
            "maxInputBytesPerAttempt",
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

  if (Object.keys(expected).some((key) => {
    const typedKey = key as keyof PDF50ProviderProofControl;
    return control[typedKey] !== expected[typedKey];
  })) {
    throw new Error("trusted_provider_test_contract_rejected:safety_boundary");
  }
  return control;
}

const oneFileExpectedControl = Object.freeze({
  schema: "edustruct.pdf50-provider-proof-control.v1",
  mode: "BOUNDED_ONE_JOB_REAL_PROVIDER",
  model: "gemini-2.5-flash-lite",
  claimedJobs: 1,
  workerRouteInvocations: 1,
  providerInferenceAttempts: 1,
  providerMaxOutputTokens: 4_096,
  providerMaxNetworkRequests: 68,
  approvedBudgetUsd: 1,
  maxInputBytesPerAttempt: null,
  maxInputTokensPerAttempt: 1_048_576,
  maxBillableOutputTokensPerAttempt: 65_536,
  inputMicrosPerMillion: 100_000,
  outputMicrosPerMillion: 400_000,
});

const scaleExpectedControl = Object.freeze({
  schema: "edustruct.pdf50-scale-provider-proof-control.v1",
  mode: "BOUNDED_SCALE_REAL_PROVIDER",
  model: "gemini-2.5-flash-lite",
  claimedJobs: 1,
  workerRouteInvocations: 1,
  providerInferenceAttempts: 3,
  providerMaxOutputTokens: 4_096,
  providerMaxNetworkRequests: 68,
  approvedBudgetUsd: 2,
  maxInputBytesPerAttempt: 200_000,
  maxInputTokensPerAttempt: 50_000,
  maxBillableOutputTokensPerAttempt: 4_096,
  inputMicrosPerMillion: 100_000,
  outputMicrosPerMillion: 400_000,
});

export const PDF50_PROVIDER_PROOF_CONTROL = readProofControl({
  expected: oneFileExpectedControl,
  source: proofControlSource as PDF50ProviderProofControl,
});
export const PDF50_SCALE_PROVIDER_PROOF_CONTROL = readProofControl({
  expected: scaleExpectedControl,
  source: scaleProofControlSource as PDF50ProviderProofControl,
});
export const PDF50_PROVIDER_TEST_MODE = PDF50_PROVIDER_PROOF_CONTROL.mode;
export const PDF50_SCALE_PROVIDER_TEST_MODE =
  PDF50_SCALE_PROVIDER_PROOF_CONTROL.mode;
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

function maximumCostMicros(control: Readonly<PDF50ProviderProofControl>) {
  return control.providerInferenceAttempts *
    (costForTokens(
      control.maxInputTokensPerAttempt,
      control.inputMicrosPerMillion,
    ) +
      costForTokens(
        control.maxBillableOutputTokensPerAttempt,
        control.outputMicrosPerMillion,
      ));
}

export const PDF50_PROVIDER_TEST_MAX_COST_MICROS = maximumCostMicros(
  PDF50_PROVIDER_PROOF_CONTROL,
);
export const PDF50_SCALE_PROVIDER_TEST_MAX_COST_MICROS = maximumCostMicros(
  PDF50_SCALE_PROVIDER_PROOF_CONTROL,
);

export type TrustedAIProviderTestLimits = {
  maxClaimedJobs: number;
  maxInferenceAttempts: number;
  maxInputBytes: number | null;
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
  const control =
    mode === PDF50_PROVIDER_TEST_MODE
      ? PDF50_PROVIDER_PROOF_CONTROL
      : mode === PDF50_SCALE_PROVIDER_TEST_MODE
        ? PDF50_SCALE_PROVIDER_PROOF_CONTROL
        : null;
  if (!control) {
    throw new Error("trusted_provider_test_mode_rejected");
  }

  requireExactEnvironmentValue(
    "AI_JOBS_LOCAL_MAX_INVOCATIONS",
    String(control.workerRouteInvocations),
  );
  requireExactEnvironmentValue(
    "PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS",
    String(control.providerInferenceAttempts),
  );
  if (control.maxInputBytesPerAttempt === null) {
    if (process.env.PDF50_PROVIDER_TEST_MAX_INPUT_BYTES !== undefined) {
      throw new Error("trusted_provider_test_control_rejected");
    }
  } else {
    requireExactEnvironmentValue(
      "PDF50_PROVIDER_TEST_MAX_INPUT_BYTES",
      String(control.maxInputBytesPerAttempt),
    );
  }
  requireExactEnvironmentValue(
    "PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS",
    String(control.providerMaxNetworkRequests),
  );
  requireExactEnvironmentValue(
    "PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS",
    String(control.providerMaxOutputTokens),
  );
  requireExactEnvironmentValue(
    "PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD",
    String(control.approvedBudgetUsd),
  );

  const providerBudgetMicros = control.approvedBudgetUsd * 1_000_000;
  const maxEstimatedCostMicros = maximumCostMicros(control);
  if (maxEstimatedCostMicros > providerBudgetMicros) {
    throw new Error("trusted_provider_test_cost_budget_rejected");
  }

  return {
    maxClaimedJobs: control.claimedJobs,
    maxInferenceAttempts: control.providerInferenceAttempts,
    maxInputBytes: control.maxInputBytesPerAttempt,
    maxEstimatedCostMicros,
    maxNetworkRequests: control.providerMaxNetworkRequests,
    maxOutputTokens: control.providerMaxOutputTokens,
    providerBudgetMicros,
  };
}
