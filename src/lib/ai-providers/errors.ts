import "server-only";

export type AIProviderErrorCode =
  | "provider_busy"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_network_error"
  | "provider_invalid_response"
  | "provider_execution_budget_exhausted"
  | "provider_configuration_error"
  | "provider_permission_error"
  | "request_invalid"
  | "operation_cancelled"
  | "unknown_provider_error";

export type AIProviderErrorOperation =
  | "ai_pdf_extraction"
  | "blueprint_generation"
  | "practice_generation"
  | "provider_connection_test"
  | "unknown";

export type SafeAIProviderErrorState = {
  attemptCount?: number;
  internalErrorReference: string;
  maxAttempts?: number;
  nextAction: "automatic_retry" | "contact_administrator" | "retry_later" | "stop";
  retryable: boolean;
  safeErrorCode: AIProviderErrorCode;
  safeMessage: string;
};

export type AIProviderRetryHistoryItem = {
  attemptCount: number;
  delayMs: number;
  safeErrorCode: string;
};

type AIProviderErrorOptions = {
  attemptCount?: number;
  causeForServerLog?: unknown;
  code: AIProviderErrorCode;
  internalReference?: string;
  operation?: AIProviderErrorOperation;
  maxAttempts?: number;
  retryHistory?: AIProviderRetryHistoryItem[];
  retryAfterMs?: number;
  retryable: boolean;
  safeMessage?: string;
  statusCode?: number;
};

const SAFE_MESSAGE_BY_CODE: Record<AIProviderErrorCode, string> = {
  operation_cancelled: "This AI run was cancelled before it completed.",
  provider_busy:
    "The AI service is temporarily busy. Your work is safe, and the system is retrying.",
  provider_configuration_error:
    "The AI service is not currently available for this action. Contact an administrator.",
  provider_invalid_response:
    "The AI service returned an unusable response. Nothing was published or assigned, and you can retry later.",
  provider_execution_budget_exhausted:
    "This AI run reached its configured Provider request limit. Nothing was published or assigned.",
  provider_network_error:
    "The AI service could not be reached. Your work is safe, and the system is retrying.",
  provider_permission_error:
    "The AI service is not currently available for this action. Contact an administrator.",
  provider_rate_limited:
    "The AI service is temporarily busy. Your work is safe, and the system is retrying.",
  provider_timeout:
    "This is taking longer than usual. Your work is safe, and the system is retrying.",
  request_invalid:
    "This AI request could not be prepared. Review the source material and try again.",
  unknown_provider_error:
    "This run could not be completed. Nothing was published or assigned, and you can retry later.",
};

function boundedInt(value: unknown, maximum = 60_000) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(Math.trunc(parsed), maximum)
    : undefined;
}

function providerReference(code: AIProviderErrorCode) {
  return `provider-${code}-${Date.now().toString(36)}`;
}

function errorRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function errorText(value: unknown) {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function statusCodeFromError(value: unknown) {
  const record = errorRecord(value);
  const direct = boundedInt(record.status ?? record.statusCode, 599);

  if (direct !== undefined) {
    return direct;
  }

  const response = errorRecord(record.response);
  const fromResponse = boundedInt(response.status ?? response.statusCode, 599);

  if (fromResponse !== undefined) {
    return fromResponse;
  }

  const match = /\b(?:status|failed)\s*(?:with\s*)?\(?([1-5]\d{2})\)?\b/i.exec(
    errorText(value),
  );
  return match ? boundedInt(match[1], 599) : undefined;
}

function retryAfterMsFromError(value: unknown) {
  const record = errorRecord(value);
  const direct = boundedInt(record.retryAfterMs ?? record.retry_after_ms);

  if (direct !== undefined) {
    return direct;
  }

  const response = errorRecord(record.response);
  const headers = errorRecord(response.headers ?? record.headers);
  const retryAfter = headers["retry-after"] ?? headers["Retry-After"];

  if (typeof retryAfter === "number") {
    return boundedInt(retryAfter * 1000);
  }

  if (typeof retryAfter === "string") {
    const seconds = Number(retryAfter.trim());

    if (Number.isFinite(seconds) && seconds >= 0) {
      return boundedInt(seconds * 1000);
    }

    const date = Date.parse(retryAfter);

    if (Number.isFinite(date)) {
      return boundedInt(Math.max(0, date - Date.now()));
    }
  }

  const match = /retry\s+after\s+(\d+)\s*(?:s|sec|second)/i.exec(
    errorText(value),
  );

  return match ? boundedInt(Number(match[1]) * 1000) : undefined;
}

function codeFromStatus(statusCode: number | undefined): AIProviderErrorCode | null {
  if (statusCode === 400) return "request_invalid";
  if (statusCode === 401 || statusCode === 403) return "provider_permission_error";
  if (statusCode === 408 || statusCode === 504) return "provider_timeout";
  if (statusCode === 429) return "provider_rate_limited";
  if (statusCode === 500 || statusCode === 502 || statusCode === 503) {
    return "provider_busy";
  }

  return null;
}

function codeFromMessage(value: unknown): AIProviderErrorCode {
  const text = errorText(value);

  if (/\b(?:abort(?:ed)?|operation cancelled)\b/i.test(text)) {
    return "operation_cancelled";
  }
  if (/\b(?:timeout|timed out|deadline exceeded|ETIMEDOUT)\b/i.test(text)) {
    return "provider_timeout";
  }
  if (
    /\b(?:UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|service temporarily unavailable)\b/i.test(
      text,
    )
  ) {
    return "provider_busy";
  }
  if (/\b(?:rate[-\s]?limit(?:ed)?|too many requests)\b/i.test(text)) {
    return "provider_rate_limited";
  }
  if (
    /\b(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|network error|failed to fetch|fetch failed|socket hang up)\b/i.test(
      text,
    )
  ) {
    return "provider_network_error";
  }
  if (
    /\b(?:invalid json|non-json|malformed response|schema validation|response did not include|unusable response)\b/i.test(
      text,
    )
  ) {
    return "provider_invalid_response";
  }
  if (
    /\b(?:api key is missing|provider model is missing|provider configuration|not configured)\b/i.test(
      text,
    )
  ) {
    return "provider_configuration_error";
  }
  if (/\b(?:permission denied|unauthorized|forbidden)\b/i.test(text)) {
    return "provider_permission_error";
  }
  if (/\b(?:bad request|request invalid)\b/i.test(text)) {
    return "request_invalid";
  }

  return "unknown_provider_error";
}

function isRetryableCode(code: AIProviderErrorCode) {
  return [
    "provider_busy",
    "provider_rate_limited",
    "provider_timeout",
    "provider_network_error",
  ].includes(code);
}

export class AIProviderError extends Error {
  readonly attemptCount?: number;
  readonly causeForServerLog?: unknown;
  readonly code: AIProviderErrorCode;
  readonly internalReference: string;
  readonly operation: AIProviderErrorOperation;
  readonly maxAttempts?: number;
  readonly retryHistory?: AIProviderRetryHistoryItem[];
  readonly retryAfterMs?: number;
  readonly retryable: boolean;
  readonly safeMessage: string;
  readonly statusCode?: number;

  constructor(options: AIProviderErrorOptions) {
    super(options.safeMessage ?? SAFE_MESSAGE_BY_CODE[options.code]);
    this.name = "AIProviderError";
    this.attemptCount = options.attemptCount;
    this.causeForServerLog = options.causeForServerLog;
    this.code = options.code;
    this.internalReference = options.internalReference ?? providerReference(options.code);
    this.operation = options.operation ?? "unknown";
    this.maxAttempts = options.maxAttempts;
    this.retryHistory = options.retryHistory;
    this.retryAfterMs = options.retryAfterMs;
    this.retryable = options.retryable;
    this.safeMessage = options.safeMessage ?? SAFE_MESSAGE_BY_CODE[options.code];
    this.statusCode = options.statusCode;
  }
}

export function isAIProviderError(value: unknown): value is AIProviderError {
  return value instanceof AIProviderError;
}

export function classifyAIProviderError({
  error,
  operation = "unknown",
}: {
  error: unknown;
  operation?: AIProviderErrorOperation;
}) {
  if (isAIProviderError(error)) {
    return error;
  }

  const statusCode = statusCodeFromError(error);
  const code = codeFromStatus(statusCode) ?? codeFromMessage(error);

  return new AIProviderError({
    causeForServerLog: error,
    code,
    operation,
    retryAfterMs: retryAfterMsFromError(error),
    retryable: isRetryableCode(code),
    statusCode,
  });
}

export function safeAIProviderErrorState({
  attemptCount,
  error,
  maxAttempts,
}: {
  attemptCount?: number;
  error: unknown;
  maxAttempts?: number;
}): SafeAIProviderErrorState {
  const classified = classifyAIProviderError({ error });
  const resolvedAttemptCount = attemptCount ?? classified.attemptCount;
  const resolvedMaxAttempts = maxAttempts ?? classified.maxAttempts;
  const exhausted =
    Boolean(resolvedAttemptCount && resolvedMaxAttempts) &&
    resolvedAttemptCount! >= resolvedMaxAttempts!;

  return {
    attemptCount: resolvedAttemptCount,
    internalErrorReference: classified.internalReference,
    maxAttempts: resolvedMaxAttempts,
    nextAction: classified.retryable
      ? exhausted
        ? "retry_later"
        : "automatic_retry"
      : ["provider_configuration_error", "provider_permission_error"].includes(
            classified.code,
          )
        ? "contact_administrator"
        : "stop",
    retryable: classified.retryable,
    safeErrorCode: classified.code,
    safeMessage:
      classified.retryable && exhausted
        ? "This run could not be completed. Nothing was published or assigned, and you can retry later."
        : classified.safeMessage,
  };
}

export function redactAIProviderDiagnostic(value: unknown) {
  const raw = errorText(value);

  return raw
    .replace(/(?:Bearer|Authorization)\s*[:=]?\s*[A-Za-z0-9._~+\/-]{12,}/gi, "[authorization redacted]")
    .replace(/\b(?:AIza|sk-|gsk_|xai-|rk_live_)[A-Za-z0-9_-]{8,}\b/g, "[api key redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[jwt redacted]")
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s]+/gi, "[database URL redacted]")
    .replace(/https?:\/\/[^\s]+(?:[?&](?:token|signature|key|api[_-]?key|X-Amz-[^=]+)=[^\s&]+)/gi, "[credential URL redacted]")
    .replace(/data:[^\s,]+;base64,[A-Za-z0-9+/=]{16,}/gi, "[base64 redacted]")
    .replace(/\n?\s*at\s+[^\n]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

export function safeAIProviderMessage(error: unknown) {
  return classifyAIProviderError({ error }).safeMessage;
}
