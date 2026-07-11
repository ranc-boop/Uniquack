import "server-only";

import {
  AIProviderError,
  classifyAIProviderError,
  safeAIProviderErrorState,
  type AIProviderErrorOperation,
  type AIProviderRetryHistoryItem,
  type SafeAIProviderErrorState,
} from "@/lib/ai-providers/errors";

export type AIProviderRetryPolicy = {
  baseDelayMs: number;
  maxAttempts: number;
  maxDelayMs: number;
  maxRetryAfterMs: number;
};

export type AIProviderRetryEvent = {
  attemptCount: number;
  delayMs: number;
  error: SafeAIProviderErrorState;
  maxAttempts: number;
};

export type AIProviderRetryResult<T> = {
  attemptCount: number;
  retryHistory: AIProviderRetryHistoryItem[];
  value: T;
};

export const DEFAULT_AI_PROVIDER_RETRY_POLICY: AIProviderRetryPolicy = {
  baseDelayMs: 1_000,
  maxAttempts: 4,
  maxDelayMs: 12_000,
  maxRetryAfterMs: 12_000,
};

function normalizedPolicy(policy?: Partial<AIProviderRetryPolicy>) {
  return {
    ...DEFAULT_AI_PROVIDER_RETRY_POLICY,
    ...policy,
    maxAttempts: Math.max(1, Math.min(8, Math.trunc(policy?.maxAttempts ?? DEFAULT_AI_PROVIDER_RETRY_POLICY.maxAttempts))),
  };
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function retryDelayMs({
  attemptCount,
  error,
  policy,
  random,
}: {
  attemptCount: number;
  error: AIProviderError;
  policy: AIProviderRetryPolicy;
  random: () => number;
}) {
  const exponentialCap = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * 2 ** Math.max(0, attemptCount - 1),
  );
  const jitter = Math.floor(Math.max(0, Math.min(1, random())) * exponentialCap);

  if (error.retryAfterMs === undefined) {
    return jitter;
  }

  return Math.min(
    policy.maxRetryAfterMs,
    policy.maxDelayMs,
    Math.max(0, error.retryAfterMs),
  );
}

export async function runWithAIProviderRetry<T>({
  onRetry,
  operation,
  policy: suppliedPolicy,
  random = Math.random,
  run,
  signal,
  sleep = defaultSleep,
}: {
  onRetry?: (event: AIProviderRetryEvent) => Promise<void> | void;
  operation: AIProviderErrorOperation;
  policy?: Partial<AIProviderRetryPolicy>;
  random?: () => number;
  run: (context: { attemptCount: number; signal?: AbortSignal }) => Promise<T>;
  signal?: AbortSignal;
  sleep?: (delayMs: number) => Promise<void>;
}): Promise<AIProviderRetryResult<T>> {
  const policy = normalizedPolicy(suppliedPolicy);
  const retryHistory: AIProviderRetryHistoryItem[] = [];

  for (let attemptCount = 1; attemptCount <= policy.maxAttempts; attemptCount += 1) {
    if (signal?.aborted) {
      throw new AIProviderError({
        causeForServerLog: signal.reason,
        code: "operation_cancelled",
        operation,
        retryable: false,
      });
    }

    try {
      const value = await run({ attemptCount, signal });

      return { attemptCount, retryHistory, value };
    } catch (error) {
      const classified = classifyAIProviderError({ error, operation });
      const canRetry = classified.retryable && attemptCount < policy.maxAttempts;

      if (!canRetry) {
        throw new AIProviderError({
          attemptCount,
          causeForServerLog: classified.causeForServerLog ?? error,
          code: classified.code,
          internalReference: classified.internalReference,
          operation,
          maxAttempts: policy.maxAttempts,
          retryHistory,
          retryAfterMs: classified.retryAfterMs,
          retryable: classified.retryable,
          safeMessage: classified.safeMessage,
          statusCode: classified.statusCode,
        });
      }

      const delayMs = retryDelayMs({
        attemptCount,
        error: classified,
        policy,
        random,
      });
      const safeError = safeAIProviderErrorState({
        attemptCount,
        error: classified,
        maxAttempts: policy.maxAttempts,
      });

      retryHistory.push({
        attemptCount,
        delayMs,
        safeErrorCode: safeError.safeErrorCode,
      });

      try {
        await onRetry?.({
          attemptCount,
          delayMs,
          error: safeError,
          maxAttempts: policy.maxAttempts,
        });
      } catch {
        // Retry-status persistence must not prevent a safe provider retry.
      }

      if (signal?.aborted) {
        throw new AIProviderError({
          causeForServerLog: signal.reason,
          code: "operation_cancelled",
          operation,
          retryable: false,
        });
      }

      await sleep(delayMs);
    }
  }

  throw new AIProviderError({
    code: "unknown_provider_error",
    operation,
    retryable: false,
  });
}
