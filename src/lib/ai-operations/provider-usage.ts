import "server-only";

export const AI_PROVIDER_USAGE_ACCOUNTING_VERSION = 1 as const;

export const AI_PROVIDER_USAGE_SOURCES = {
  estimated: "ESTIMATED_USAGE",
  localContextBytes: "LOCAL_CONTEXT_BYTES",
  providerCountTokens: "PROVIDER_COUNT_TOKENS",
  providerReported: "PROVIDER_REPORTED_USAGE",
  unknown: "UNKNOWN_USAGE",
} as const;

export type AIProviderUsageSource =
  (typeof AI_PROVIDER_USAGE_SOURCES)[keyof typeof AI_PROVIDER_USAGE_SOURCES];

export type AIProviderPromptTokenDetail = {
  modality: string;
  tokenCount: number;
};

export type AIProviderUsage = {
  cachedInputTokens: number | null;
  candidateOutputTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  promptTokensDetails: AIProviderPromptTokenDetail[];
  thoughtTokens: number | null;
  toolUseInputTokens: number | null;
  totalTokens: number | null;
};

export type AIProviderUsageAccounting = {
  estimatedUsage: {
    source: typeof AI_PROVIDER_USAGE_SOURCES.estimated;
    usage: AIProviderUsage;
  } | null;
  localContextBytes: {
    serializedRequestBytes: number;
    source: typeof AI_PROVIDER_USAGE_SOURCES.localContextBytes;
    sourceInputBytes: number;
  } | null;
  providerCountTokens: {
    cachedInputTokens: number | null;
    inputTokens: number | null;
    promptTokensDetails: AIProviderPromptTokenDetail[];
    source: typeof AI_PROVIDER_USAGE_SOURCES.providerCountTokens;
  } | null;
  providerReportedUsage: {
    source: typeof AI_PROVIDER_USAGE_SOURCES.providerReported;
    usage: AIProviderUsage;
  } | null;
  schemaVersion: typeof AI_PROVIDER_USAGE_ACCOUNTING_VERSION;
  unknownUsage: {
    fields: Array<
      | "candidateOutputTokens"
      | "countTokensInputTokens"
      | "providerReportedInputTokens"
      | "thoughtTokens"
      | "toolUseInputTokens"
      | "totalTokens"
    >;
    source: typeof AI_PROVIDER_USAGE_SOURCES.unknown;
  };
};

const MAX_PROMPT_TOKEN_DETAILS = 16;
const SAFE_MODALITY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const usageAccountingByError = new WeakMap<object, AIProviderUsageAccounting>();

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}

function firstSafeCount(...values: unknown[]) {
  for (const value of values) {
    const count = safeCount(value);
    if (count !== null) return count;
  }
  return null;
}

export function normalizeAIProviderPromptTokenDetails(
  value: unknown,
): AIProviderPromptTokenDetail[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, MAX_PROMPT_TOKEN_DETAILS)
    .map((entry) => {
      const record = asRecord(entry);
      const modality =
        typeof record.modality === "string"
          ? record.modality.trim().toUpperCase()
          : "";
      const tokenCount = firstSafeCount(
        record.tokenCount,
        record.token_count,
      );
      return SAFE_MODALITY_PATTERN.test(modality) && tokenCount !== null
        ? { modality, tokenCount }
        : null;
    })
    .filter((entry): entry is AIProviderPromptTokenDetail => entry !== null);
}

export function normalizeAIProviderUsage(value: unknown): AIProviderUsage | null {
  const usage = asRecord(value);
  const inputTokens = firstSafeCount(
    usage.inputTokens,
    usage.promptTokenCount,
    usage.prompt_token_count,
    usage.input_tokens,
    usage.prompt_tokens,
  );
  const cachedInputTokens = firstSafeCount(
    usage.cachedInputTokens,
    usage.cachedContentTokenCount,
    usage.cached_content_token_count,
    usage.cached_tokens,
  );
  const candidateOutputTokens = firstSafeCount(
    usage.candidateOutputTokens,
    usage.candidatesTokenCount,
    usage.candidates_token_count,
    usage.completion_tokens,
  );
  const thoughtTokens = firstSafeCount(
    usage.thoughtTokens,
    usage.thoughtsTokenCount,
    usage.thoughts_token_count,
    usage.reasoning_tokens,
  );
  const explicitOutputTokens = firstSafeCount(
    usage.outputTokens,
    usage.output_tokens,
  );
  const outputTokens = explicitOutputTokens ??
    (candidateOutputTokens !== null || thoughtTokens !== null
      ? (candidateOutputTokens ?? 0) + (thoughtTokens ?? 0)
      : null);
  const toolUseInputTokens = firstSafeCount(
    usage.toolUseInputTokens,
    usage.toolUsePromptTokenCount,
    usage.tool_use_prompt_token_count,
  );
  const totalTokens = firstSafeCount(
    usage.totalTokens,
    usage.totalTokenCount,
    usage.total_token_count,
    usage.total_tokens,
  );
  const promptTokensDetails = normalizeAIProviderPromptTokenDetails(
    usage.promptTokensDetails ?? usage.prompt_tokens_details,
  );

  if (
    inputTokens === null &&
    cachedInputTokens === null &&
    candidateOutputTokens === null &&
    outputTokens === null &&
    thoughtTokens === null &&
    toolUseInputTokens === null &&
    totalTokens === null &&
    promptTokensDetails.length === 0
  ) {
    return null;
  }

  return {
    cachedInputTokens,
    candidateOutputTokens,
    inputTokens,
    outputTokens,
    promptTokensDetails,
    thoughtTokens,
    toolUseInputTokens,
    totalTokens,
  };
}

function normalizeCountTokens(value: unknown) {
  const record = asRecord(value);
  const inputTokens = firstSafeCount(record.inputTokens, record.totalTokens);
  const cachedInputTokens = firstSafeCount(record.cachedInputTokens);
  const promptTokensDetails = normalizeAIProviderPromptTokenDetails(
    record.promptTokensDetails,
  );

  return inputTokens !== null ||
    cachedInputTokens !== null ||
    promptTokensDetails.length
    ? { cachedInputTokens, inputTokens, promptTokensDetails }
    : null;
}

function normalizeLocalContextBytes(value: unknown) {
  const record = asRecord(value);
  const serializedRequestBytes = safeCount(record.serializedRequestBytes);
  const sourceInputBytes = safeCount(record.sourceInputBytes);
  return serializedRequestBytes !== null && sourceInputBytes !== null
    ? { serializedRequestBytes, sourceInputBytes }
    : null;
}

export function buildAIProviderUsageAccounting({
  countTokens,
  estimatedUsage,
  localContextBytes,
  providerReportedUsage,
}: {
  countTokens?: unknown;
  estimatedUsage?: unknown;
  localContextBytes?: unknown;
  providerReportedUsage?: unknown;
}): AIProviderUsageAccounting {
  const normalizedProviderUsage = normalizeAIProviderUsage(
    providerReportedUsage,
  );
  const normalizedCountTokens = normalizeCountTokens(countTokens);
  const normalizedLocalBytes = normalizeLocalContextBytes(localContextBytes);
  const normalizedEstimatedUsage = normalizeAIProviderUsage(estimatedUsage);
  const unknownFields: AIProviderUsageAccounting["unknownUsage"]["fields"] = [];

  if (normalizedProviderUsage?.inputTokens == null) {
    unknownFields.push("providerReportedInputTokens");
  }
  if (normalizedCountTokens?.inputTokens == null) {
    unknownFields.push("countTokensInputTokens");
  }
  if (normalizedProviderUsage?.candidateOutputTokens == null) {
    unknownFields.push("candidateOutputTokens");
  }
  if (normalizedProviderUsage?.thoughtTokens == null) {
    unknownFields.push("thoughtTokens");
  }
  if (normalizedProviderUsage?.toolUseInputTokens == null) {
    unknownFields.push("toolUseInputTokens");
  }
  if (normalizedProviderUsage?.totalTokens == null) {
    unknownFields.push("totalTokens");
  }

  return {
    estimatedUsage: normalizedEstimatedUsage
      ? {
          source: AI_PROVIDER_USAGE_SOURCES.estimated,
          usage: normalizedEstimatedUsage,
        }
      : null,
    localContextBytes: normalizedLocalBytes
      ? {
          ...normalizedLocalBytes,
          source: AI_PROVIDER_USAGE_SOURCES.localContextBytes,
        }
      : null,
    providerCountTokens: normalizedCountTokens
      ? {
          ...normalizedCountTokens,
          source: AI_PROVIDER_USAGE_SOURCES.providerCountTokens,
        }
      : null,
    providerReportedUsage: normalizedProviderUsage
      ? {
          source: AI_PROVIDER_USAGE_SOURCES.providerReported,
          usage: normalizedProviderUsage,
        }
      : null,
    schemaVersion: AI_PROVIDER_USAGE_ACCOUNTING_VERSION,
    unknownUsage: {
      fields: unknownFields,
      source: AI_PROVIDER_USAGE_SOURCES.unknown,
    },
  };
}

export function normalizeAIProviderUsageAccounting(
  value: unknown,
): AIProviderUsageAccounting | null {
  const record = asRecord(value);
  if (record.schemaVersion !== AI_PROVIDER_USAGE_ACCOUNTING_VERSION) return null;

  const providerReported = asRecord(record.providerReportedUsage);
  const providerCountTokens = asRecord(record.providerCountTokens);
  const localContextBytes = asRecord(record.localContextBytes);
  const estimatedUsage = asRecord(record.estimatedUsage);
  const normalized = buildAIProviderUsageAccounting({
    countTokens:
      providerCountTokens.source === AI_PROVIDER_USAGE_SOURCES.providerCountTokens
        ? providerCountTokens
        : null,
    estimatedUsage:
      estimatedUsage.source === AI_PROVIDER_USAGE_SOURCES.estimated
        ? estimatedUsage.usage
        : null,
    localContextBytes:
      localContextBytes.source === AI_PROVIDER_USAGE_SOURCES.localContextBytes
        ? localContextBytes
        : null,
    providerReportedUsage:
      providerReported.source === AI_PROVIDER_USAGE_SOURCES.providerReported
        ? providerReported.usage
        : null,
  });
  const unknown = asRecord(record.unknownUsage);
  const expectedUnknownFields = normalized.unknownUsage.fields;

  if (
    unknown.source !== AI_PROVIDER_USAGE_SOURCES.unknown ||
    !Array.isArray(unknown.fields) ||
    JSON.stringify(unknown.fields) !== JSON.stringify(expectedUnknownFields)
  ) {
    return null;
  }

  return normalized;
}

export function attachAIProviderUsageAccounting(
  error: unknown,
  accounting: AIProviderUsageAccounting,
) {
  if (error && (typeof error === "object" || typeof error === "function")) {
    usageAccountingByError.set(error, accounting);
  }
  return error;
}

export function readAIProviderUsageAccountingFromError(
  error: unknown,
): AIProviderUsageAccounting | null {
  return error && (typeof error === "object" || typeof error === "function")
    ? usageAccountingByError.get(error) ?? null
    : null;
}
