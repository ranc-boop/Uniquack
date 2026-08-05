import "server-only";

import {
  AIProviderError,
  type AIProviderErrorOperation,
} from "@/lib/ai-providers/errors";

export const aiProviderNetworkRequestKinds = [
  "file_upload_start",
  "file_upload_finalize",
  "file_status_poll",
  "inference",
  "file_cleanup",
] as const;

export type AIProviderNetworkRequestKind =
  (typeof aiProviderNetworkRequestKinds)[number];

export type AIProviderExecutionSummary = {
  maxInferenceAttempts: number;
  maxNetworkRequests: number;
  maxOutputTokens: number | null;
  providerCleanupFailures: number;
  providerCleanupRequests: number;
  providerInputBytesMax: number;
  providerInferenceAttempts: number;
  providerInferenceRequests: number;
  providerNetworkRequests: number;
  providerPollRequests: number;
  providerUploadRequests: number;
};

export type AIProviderExecutionObserver = {
  beforeInference: (
    operation?: AIProviderErrorOperation,
    inputBytes?: number,
  ) => void;
  maxOutputTokens: number | null;
  recordCleanupResult?: (succeeded: boolean) => void;
  recordNetworkRequest: (kind: AIProviderNetworkRequestKind) => void;
};

export type AIProviderExecutionBudget = AIProviderExecutionObserver & {
  snapshot: () => AIProviderExecutionSummary;
};

function boundedInferenceAttempts(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(8, Math.trunc(value)));
}

function boundedNetworkRequests(value: number | undefined) {
  if (value === undefined) return 512;
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(512, Math.trunc(value)));
}

function boundedOutputTokens(value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(65_536, Math.trunc(value)));
}

function boundedInputBytes(value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(16 * 1024 * 1024, Math.trunc(value)));
}

export function createAIProviderExecutionBudget({
  maxInferenceAttempts,
  maxInputBytes,
  maxNetworkRequests,
  maxOutputTokens,
}: {
  maxInferenceAttempts: number;
  maxInputBytes?: number | null;
  maxNetworkRequests?: number;
  maxOutputTokens?: number | null;
}): AIProviderExecutionBudget {
  const maximumInferenceAttempts = boundedInferenceAttempts(maxInferenceAttempts);
  const maximumInputBytes = boundedInputBytes(maxInputBytes);
  const maximumNetworkRequests = boundedNetworkRequests(maxNetworkRequests);
  const maximumOutputTokens = boundedOutputTokens(maxOutputTokens);
  let providerCleanupFailures = 0;
  let providerCleanupRequests = 0;
  let providerInputBytesMax = 0;
  let providerInferenceAttempts = 0;
  let providerInferenceRequests = 0;
  let providerNetworkRequests = 0;
  let providerPollRequests = 0;
  let providerUploadRequests = 0;

  return {
    beforeInference(operation = "unknown", inputBytes) {
      if (
        maximumInputBytes !== null &&
        (!Number.isSafeInteger(inputBytes) ||
          Number(inputBytes) < 1 ||
          Number(inputBytes) > maximumInputBytes)
      ) {
        throw new AIProviderError({
          attemptCount: providerInferenceAttempts,
          code: "provider_execution_budget_exhausted",
          maxAttempts: maximumInferenceAttempts,
          operation,
          retryable: false,
        });
      }
      if (providerInferenceAttempts >= maximumInferenceAttempts) {
        throw new AIProviderError({
          attemptCount: providerInferenceAttempts,
          code: "provider_execution_budget_exhausted",
          maxAttempts: maximumInferenceAttempts,
          operation,
          retryable: false,
        });
      }
      if (Number.isSafeInteger(inputBytes) && Number(inputBytes) > 0) {
        providerInputBytesMax = Math.max(
          providerInputBytesMax,
          Number(inputBytes),
        );
      }
      providerInferenceAttempts += 1;
    },
    maxOutputTokens: maximumOutputTokens,
    recordCleanupResult(succeeded) {
      if (!succeeded) providerCleanupFailures += 1;
    },
    recordNetworkRequest(kind) {
      if (providerNetworkRequests >= maximumNetworkRequests) {
        throw new AIProviderError({
          attemptCount: providerNetworkRequests,
          code: "provider_execution_budget_exhausted",
          maxAttempts: maximumNetworkRequests,
          operation: "unknown",
          retryable: false,
        });
      }
      providerNetworkRequests += 1;
      if (kind === "file_cleanup") providerCleanupRequests += 1;
      if (kind === "inference") providerInferenceRequests += 1;
      if (kind === "file_status_poll") providerPollRequests += 1;
      if (kind === "file_upload_start" || kind === "file_upload_finalize") {
        providerUploadRequests += 1;
      }
    },
    snapshot() {
      return {
        maxInferenceAttempts: maximumInferenceAttempts,
        maxNetworkRequests: maximumNetworkRequests,
        maxOutputTokens: maximumOutputTokens,
        providerCleanupFailures,
        providerCleanupRequests,
        providerInputBytesMax,
        providerInferenceAttempts,
        providerInferenceRequests,
        providerNetworkRequests,
        providerPollRequests,
        providerUploadRequests,
      };
    },
  };
}
