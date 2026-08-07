import "server-only";

import {
  normalizeAIProviderUsage,
  type AIProviderUsage,
} from "@/lib/ai-operations/provider-usage";

export type { AIProviderUsage } from "@/lib/ai-operations/provider-usage";

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

function costForTokens(tokens: number, microsPerMillion: number) {
  return Math.round((tokens * microsPerMillion) / 1_000_000);
}

export function normalizeProviderUsage(value: unknown): AIProviderUsage | null {
  return normalizeAIProviderUsage(value);
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

  const cachedInputTokens = usage.cachedInputTokens;
  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;
  const hasDistinctCachedInputPrice = entry.cachedInputMicrosPerMillion !== null;
  const uncachedInputTokens =
    inputTokens === null ||
      (hasDistinctCachedInputPrice && cachedInputTokens === null)
      ? null
      : Math.max(0, inputTokens - (cachedInputTokens ?? 0));
  const inputCostMicros = uncachedInputTokens === null
    ? null
    : costForTokens(uncachedInputTokens, entry.inputMicrosPerMillion);
  const cachedInputCostMicros =
    cachedInputTokens === null || entry.cachedInputMicrosPerMillion === null
      ? null
      : costForTokens(cachedInputTokens, entry.cachedInputMicrosPerMillion);
  const outputCostMicros = outputTokens === null
    ? null
    : costForTokens(outputTokens, entry.outputMicrosPerMillion);
  const inputTotalCostMicros = inputCostMicros === null
    ? null
    : hasDistinctCachedInputPrice
      ? cachedInputCostMicros === null
        ? null
        : inputCostMicros + cachedInputCostMicros
      : inputCostMicros;

  return {
    cachedInputCostMicros,
    inputCostMicros,
    outputCostMicros,
    totalCostMicros:
      inputTotalCostMicros === null || outputCostMicros === null
        ? null
        : inputTotalCostMicros + outputCostMicros,
  };
}

export function sumAIProviderUsage(samples: Array<AIProviderUsage | null>): AIProviderUsage | null {
  if (!samples.length) return null;
  const present = samples.filter((sample): sample is AIProviderUsage => Boolean(sample));
  if (!present.length) return null;
  const sum = (key: keyof AIProviderUsage) => {
    const values = samples.map((sample) => sample?.[key] ?? null);
    return values.every((value): value is number => typeof value === "number")
      ? values.reduce((total, value) => total + value, 0)
      : null;
  };
  return {
    cachedInputTokens: sum("cachedInputTokens"),
    candidateOutputTokens: sum("candidateOutputTokens"),
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    promptTokensDetails: [],
    thoughtTokens: sum("thoughtTokens"),
    toolUseInputTokens: sum("toolUseInputTokens"),
    totalTokens: sum("totalTokens"),
  };
}
