import "server-only";

export type AIProviderUsage = {
  cachedInputTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

type AIModelCostCatalogEntry = {
  batchInputMicrosPerMillion: number | null;
  batchOutputMicrosPerMillion: number | null;
  cachedInputMicrosPerMillion: number | null;
  effectiveDate: string;
  inputMicrosPerMillion: number;
  model: string;
  outputMicrosPerMillion: number;
  provider: string;
  reference: string;
};

export const AI_MODEL_COST_CATALOG_V1 = {
  entries: [
    {
      batchInputMicrosPerMillion: 50_000,
      batchOutputMicrosPerMillion: 200_000,
      cachedInputMicrosPerMillion: 10_000,
      effectiveDate: "2026-07-11",
      inputMicrosPerMillion: 100_000,
      model: "gemini-2.5-flash-lite",
      outputMicrosPerMillion: 400_000,
      provider: "gemini_native",
      reference: "https://ai.google.dev/gemini-api/docs/pricing",
    },
  ] satisfies AIModelCostCatalogEntry[],
  version: "ai_model_cost_catalog_v1",
} as const;

export type AIEstimatedCost = {
  cachedInputCostMicros: number | null;
  inputCostMicros: number | null;
  outputCostMicros: number | null;
  totalCostMicros: number | null;
};

function safeCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function costForTokens(tokens: number, microsPerMillion: number) {
  return Math.round((tokens * microsPerMillion) / 1_000_000);
}

export function normalizeProviderUsage(value: unknown): AIProviderUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const usage = value as Record<string, unknown>;
  const inputTokens = safeCount(
    usage.promptTokenCount ?? usage.prompt_token_count ?? usage.input_tokens,
  );
  const cachedInputTokens = safeCount(
    usage.cachedContentTokenCount ?? usage.cached_content_token_count ?? usage.cached_tokens,
  );
  const outputTokens = safeCount(
    usage.candidatesTokenCount ?? usage.candidates_token_count ?? usage.completion_tokens ?? usage.output_tokens,
  );
  const totalTokens = safeCount(
    usage.totalTokenCount ?? usage.total_tokens,
  );

  if (
    inputTokens === null &&
    cachedInputTokens === null &&
    outputTokens === null &&
    totalTokens === null
  ) {
    return null;
  }

  return { cachedInputTokens, inputTokens, outputTokens, totalTokens };
}

export function getAIModelCostCatalogEntry({
  model,
  provider,
}: {
  model: string | null | undefined;
  provider: string | null | undefined;
}) {
  const normalizedModel = model?.trim().toLowerCase();
  const normalizedProvider = provider?.trim().toLowerCase();
  if (!normalizedModel || !normalizedProvider) return null;

  return (
    AI_MODEL_COST_CATALOG_V1.entries.find(
      (entry) =>
        entry.model === normalizedModel && entry.provider === normalizedProvider,
    ) ?? null
  );
}

export function estimateAIProviderCost({
  model,
  provider,
  usage,
}: {
  model: string | null | undefined;
  provider: string | null | undefined;
  usage: AIProviderUsage | null;
}): AIEstimatedCost {
  const entry = getAIModelCostCatalogEntry({ model, provider });
  if (!entry || !usage) {
    return {
      cachedInputCostMicros: null,
      inputCostMicros: null,
      outputCostMicros: null,
      totalCostMicros: null,
    };
  }

  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const inputTokens = Math.max(0, (usage.inputTokens ?? 0) - cachedInputTokens);
  const outputTokens = usage.outputTokens ?? 0;
  const inputCostMicros = costForTokens(inputTokens, entry.inputMicrosPerMillion);
  const cachedInputCostMicros = entry.cachedInputMicrosPerMillion === null
    ? null
    : costForTokens(cachedInputTokens, entry.cachedInputMicrosPerMillion);
  const outputCostMicros = costForTokens(outputTokens, entry.outputMicrosPerMillion);

  return {
    cachedInputCostMicros,
    inputCostMicros,
    outputCostMicros,
    totalCostMicros:
      inputCostMicros + (cachedInputCostMicros ?? 0) + outputCostMicros,
  };
}

export function sumAIProviderUsage(samples: Array<AIProviderUsage | null>): AIProviderUsage | null {
  const present = samples.filter((sample): sample is AIProviderUsage => Boolean(sample));
  if (!present.length) return null;
  const sum = (key: keyof AIProviderUsage) => {
    const values = present.map((sample) => sample[key]).filter((value): value is number => value !== null);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  return {
    cachedInputTokens: sum("cachedInputTokens"),
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    totalTokens: sum("totalTokens"),
  };
}
