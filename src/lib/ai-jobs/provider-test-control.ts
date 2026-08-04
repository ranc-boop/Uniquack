import "server-only";

export const PDF50_PROVIDER_TEST_MODE = "BOUNDED_ONE_JOB_REAL_PROVIDER";
export const PDF50_PROVIDER_TEST_JOB_HEADER = "x-pdf50-provider-test-job-id";

const TRUSTED_PROVIDER_MAX_INFERENCE_ATTEMPTS = 1;
const TRUSTED_PROVIDER_MAX_INPUT_TOKENS_PER_ATTEMPT = 1_048_576;
const TRUSTED_PROVIDER_MAX_BILLABLE_OUTPUT_TOKENS_PER_ATTEMPT = 65_536;
const TRUSTED_PROVIDER_MAX_OUTPUT_TOKENS = 4_096;
const TRUSTED_PROVIDER_INPUT_MICROS_PER_MILLION = 100_000;
const TRUSTED_PROVIDER_OUTPUT_MICROS_PER_MILLION = 400_000;
const TRUSTED_PROVIDER_TOTAL_BUDGET_MICROS = 1_000_000;

function costForTokens(tokens: number, microsPerMillion: number) {
  return Math.ceil((tokens * microsPerMillion) / 1_000_000);
}

export const PDF50_PROVIDER_TEST_MAX_COST_MICROS =
  TRUSTED_PROVIDER_MAX_INFERENCE_ATTEMPTS *
  (costForTokens(
    TRUSTED_PROVIDER_MAX_INPUT_TOKENS_PER_ATTEMPT,
    TRUSTED_PROVIDER_INPUT_MICROS_PER_MILLION,
  ) +
    costForTokens(
      TRUSTED_PROVIDER_MAX_BILLABLE_OUTPUT_TOKENS_PER_ATTEMPT,
      TRUSTED_PROVIDER_OUTPUT_MICROS_PER_MILLION,
    ));

export type TrustedAIProviderTestLimits = {
  maxInferenceAttempts: 1;
  maxEstimatedCostMicros: number;
  maxNetworkRequests: 68;
  maxOutputTokens: 4_096;
  providerBudgetMicros: 1_000_000;
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

export function readTrustedAIProviderTestLimits(): TrustedAIProviderTestLimits | null {
  const mode = process.env.PDF50_PROVIDER_TEST_MODE;
  if (mode === undefined) return null;
  if (mode !== PDF50_PROVIDER_TEST_MODE) {
    throw new Error("trusted_provider_test_mode_rejected");
  }

  requireExactEnvironmentValue("AI_JOBS_LOCAL_MAX_INVOCATIONS", "1");
  requireExactEnvironmentValue(
    "PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS",
    "1",
  );
  requireExactEnvironmentValue("PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS", "68");
  requireExactEnvironmentValue("PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS", "4096");
  requireExactEnvironmentValue("PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD", "1");

  if (PDF50_PROVIDER_TEST_MAX_COST_MICROS > TRUSTED_PROVIDER_TOTAL_BUDGET_MICROS) {
    throw new Error("trusted_provider_test_cost_budget_rejected");
  }

  return {
    maxInferenceAttempts: 1,
    maxEstimatedCostMicros: PDF50_PROVIDER_TEST_MAX_COST_MICROS,
    maxNetworkRequests: 68,
    maxOutputTokens: 4_096,
    providerBudgetMicros: TRUSTED_PROVIDER_TOTAL_BUDGET_MICROS,
  };
}
