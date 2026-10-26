import "server-only";

import { classifyAIProviderError } from "@/lib/ai-providers/errors";

type PracticeProviderErrorCode =
  | "practice_generation_failed"
  | "provider_invalid_response"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_unavailable";

export type SafePracticeProviderFailure = {
  code: PracticeProviderErrorCode;
  correlationId: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
};

const SAFE_MESSAGE_BY_CODE: Record<PracticeProviderErrorCode, string> = {
  practice_generation_failed:
    "Practice guidance could not be generated. Your saved work is still available; please try again.",
  provider_invalid_response:
    "Practice guidance returned an invalid response. Your saved work is still available; please try again.",
  provider_rate_limited:
    "Practice guidance is temporarily busy. Your saved work is still available; please retry in a few minutes.",
  provider_timeout:
    "Practice guidance took too long. Your saved work is still available; please try again.",
  provider_unavailable:
    "Practice guidance is temporarily unavailable. Your saved work is still available; please retry in a few minutes.",
};

function practiceCodeFromProviderCode(code: string): PracticeProviderErrorCode {
  if (code === "provider_timeout") return "provider_timeout";
  if (code === "provider_rate_limited") return "provider_rate_limited";
  if (code === "provider_invalid_response") return "provider_invalid_response";
  if (["provider_busy", "provider_network_error"].includes(code)) {
    return "provider_unavailable";
  }

  return "practice_generation_failed";
}

export function safePracticeProviderFailure(error: unknown): SafePracticeProviderFailure {
  const classified = classifyAIProviderError({
    error,
    operation: "practice_generation",
  });
  const code = practiceCodeFromProviderCode(classified.code);

  return {
    code,
    correlationId: classified.internalReference,
    message: SAFE_MESSAGE_BY_CODE[code],
    retryable: classified.retryable,
    statusCode: classified.statusCode,
  };
}

export function logPracticeProviderFailure({
  error,
  operation,
}: {
  error: unknown;
  operation: string;
}) {
  const failure = safePracticeProviderFailure(error);

  // Keep operational diagnostics structured and safe; upstream bodies and prompts
  // remain out of browser responses, traces, and local full-call logs.
  console.warn("Practice provider call failed", {
    correlationId: failure.correlationId,
    errorCode: failure.code,
    operation,
    statusCode: failure.statusCode ?? null,
  });

  return failure;
}
