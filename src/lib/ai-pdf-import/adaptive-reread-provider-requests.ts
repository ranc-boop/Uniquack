import crypto from "node:crypto";

import type {
  AIAdaptiveRereadPlan,
  AIAdaptiveRereadRequest,
  AIAdaptiveRereadRequestKind,
} from "./adaptive-reread";

export type AIAdaptiveRereadProviderRequestPlanVersion =
  "adaptive_reread_provider_request_plan_v1";

export type AIAdaptiveRereadProviderRequestPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AIAdaptiveRereadProviderRequestKind =
  | "adaptive_cross_page_text_extraction"
  | "adaptive_answer_key_review"
  | "adaptive_asset_context_review"
  | "adaptive_low_text_confidence_review"
  | "adaptive_mixed_layout_review"
  | "adaptive_review_only";

export interface AIAdaptiveRereadProviderRequestPlan {
  generatedAt: string;
  mode: "shadow";
  requests: AIAdaptiveRereadProviderRequestDraft[];
  sourceKind: "pdf" | "single_image";
  stats: AIAdaptiveRereadProviderRequestPlanStats;
  status: AIAdaptiveRereadProviderRequestPlanStatus;
  version: AIAdaptiveRereadProviderRequestPlanVersion;
  warnings: string[];
}

export interface AIAdaptiveRereadProviderRequestDraft {
  batchIds: string[];
  budget: {
    estimatedChars: number;
    estimatedTokens?: number;
    hasImageInput: boolean;
    hasTextInput: boolean;
    packetCount: number;
    pageCount: number;
  };
  inputRefs: {
    assetRefs: string[];
    pageNumbers: number[];
  };
  kind: AIAdaptiveRereadProviderRequestKind;
  packetHashes: string[];
  packetIds: string[];
  pageWindow: {
    endPage: number;
    maxWindowPages: number;
    pageNumbers: number[];
    startPage: number;
  };
  priority: "low" | "medium" | "high";
  promptContract: {
    expectedSchemaVersion: "question_extract_v1";
    jsonOnly: true;
    noMarkdown: true;
    preservePacketHashes: true;
    preservePacketIds: true;
    systemInstruction: string;
    useOnlyProvidedAssets: true;
    useOnlyProvidedPages: true;
    userInstruction: string;
  };
  providerRequestIds: string[];
  providerRunIds: string[];
  recommendedMode: "text" | "vision" | "mixed" | "review_only";
  rereadRequestHash: string;
  rereadRequestId: string;
  requestHash: string;
  requestId: string;
  safety: {
    boundedPageWindow: true;
    noBase64: true;
    noFullPdfText: true;
    noImageBytes: true;
    realCall: false;
    shadowOnly: true;
  };
  warnings: string[];
}

export interface AIAdaptiveRereadProviderRequestPlanStats {
  estimatedTotalChars: number;
  estimatedTotalTokens?: number;
  hasImageInput: boolean;
  hasTextInput: boolean;
  highPriorityCount: number;
  lowPriorityCount: number;
  mediumPriorityCount: number;
  requestCount: number;
  reviewOnlyCount: number;
  totalPacketCount: number;
}

const MAX_PROVIDER_REQUEST_DRAFTS = 40;
const SUMMARY_WARNING_REQUEST_COUNT = 30;
const SYSTEM_INSTRUCTION_MAX_LENGTH = 1200;
const USER_INSTRUCTION_MAX_LENGTH = 2400;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function booleanValue(value: unknown) {
  return value === true;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueNumbers(values: number[]) {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value >= 1)),
  ).sort((left, right) => left - right);
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function estimatedTokens(chars: number) {
  return Math.ceil(chars / 4);
}

function boundedText(value: string, maxLength: number, marker: string) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n[${marker}]`;
}

function normalizeAdaptiveRereadPlan(value: unknown): AIAdaptiveRereadPlan | null {
  const plan = asRecord(value);
  const stats = asRecord(plan.stats);

  if (plan.version !== "adaptive_reread_plan_v1") {
    return null;
  }

  return {
    generatedAt: stringValue(plan.generatedAt) || new Date().toISOString(),
    mode: "planning_only",
    requests: asArray(plan.requests).map(normalizeAdaptiveRereadRequest),
    sourceKind: plan.sourceKind === "single_image" ? "single_image" : "pdf",
    stats: {
      estimatedTotalChars: numberValue(stats.estimatedTotalChars, 0),
      estimatedTotalTokens: numberValue(stats.estimatedTotalTokens, 0),
      highPriorityCount: numberValue(stats.highPriorityCount, 0),
      lowPriorityCount: numberValue(stats.lowPriorityCount, 0),
      mediumPriorityCount: numberValue(stats.mediumPriorityCount, 0),
      requestCount: numberValue(stats.requestCount, 0),
      skippedRiskCount: numberValue(stats.skippedRiskCount, 0),
      totalPacketCount: numberValue(stats.totalPacketCount, 0),
      totalPageWindowCount: numberValue(stats.totalPageWindowCount, 0),
    },
    status:
      plan.status === "failed" ||
      plan.status === "skipped" ||
      plan.status === "completed_with_warnings"
        ? plan.status
        : "completed",
    version: "adaptive_reread_plan_v1",
    warnings: asArray(plan.warnings).map(String),
  };
}

function normalizeAdaptiveRereadRequest(
  value: unknown,
): AIAdaptiveRereadRequest {
  const request = asRecord(value);
  const budget = asRecord(request.budget);
  const pageWindow = asRecord(request.pageWindow);
  const kind = stringValue(request.kind) as AIAdaptiveRereadRequestKind;

  return {
    assetRefs: asArray(request.assetRefs).map(String),
    batchIds: asArray(request.batchIds).map(String),
    budget: {
      estimatedChars: numberValue(budget.estimatedChars, 0),
      estimatedTokens: numberValue(budget.estimatedTokens, 0),
      hasImageInput: booleanValue(budget.hasImageInput),
      hasTextInput: booleanValue(budget.hasTextInput),
      packetCount: numberValue(budget.packetCount, 0),
      pageCount: numberValue(budget.pageCount, 0),
    },
    kind,
    packetHashes: asArray(request.packetHashes).map(String),
    packetIds: asArray(request.packetIds).map(String),
    pageWindow: {
      endPage: numberValue(pageWindow.endPage, 0),
      maxWindowPages: numberValue(pageWindow.maxWindowPages, 3),
      originalPageNumbers: uniqueNumbers(
        asArray(pageWindow.originalPageNumbers).map(Number),
      ),
      pageNumbers: uniqueNumbers(asArray(pageWindow.pageNumbers).map(Number)),
      startPage: numberValue(pageWindow.startPage, 0),
    },
    priority:
      request.priority === "high" || request.priority === "low"
        ? request.priority
        : "medium",
    providerRequestIds: asArray(request.providerRequestIds).map(String),
    providerRunIds: asArray(request.providerRunIds).map(String),
    reasons: asArray(request.reasons).map((reason) => {
      const item = asRecord(reason);

      return {
        code: stringValue(item.code) as AIAdaptiveRereadRequest["reasons"][number]["code"],
        confidence: numberValue(item.confidence, 0.7),
        message: stringValue(item.message),
        packetIds: asArray(item.packetIds).map(String),
        pageNumbers: uniqueNumbers(asArray(item.pageNumbers).map(Number)),
      };
    }),
    rereadRequestHash: stringValue(request.rereadRequestHash),
    rereadRequestId: stringValue(request.rereadRequestId),
    safety: {
      boundedPageWindow: true,
      noBase64: true,
      noFullPdfText: true,
      noImageBytes: true,
      planningOnly: true,
      realCall: false,
    },
    warnings: asArray(request.warnings).map(String),
  };
}

function providerKindForRereadKind(
  kind: AIAdaptiveRereadRequestKind,
): AIAdaptiveRereadProviderRequestKind {
  if (kind === "answer_key_context") {
    return "adaptive_answer_key_review";
  }

  if (kind === "asset_context") {
    return "adaptive_asset_context_review";
  }

  if (kind === "low_text_confidence_context") {
    return "adaptive_low_text_confidence_review";
  }

  if (kind === "mixed_layout_context") {
    return "adaptive_mixed_layout_review";
  }

  if (kind === "review_only") {
    return "adaptive_review_only";
  }

  return "adaptive_cross_page_text_extraction";
}

function recommendedModeForRereadRequest(
  request: AIAdaptiveRereadRequest,
): AIAdaptiveRereadProviderRequestDraft["recommendedMode"] {
  if (
    request.kind === "asset_context" ||
    request.kind === "mixed_layout_context"
  ) {
    return "mixed";
  }

  if (request.kind === "low_text_confidence_context") {
    return request.budget.hasImageInput ? "mixed" : "review_only";
  }

  if (request.kind === "review_only") {
    return "review_only";
  }

  return "text";
}

export function estimateAdaptiveRereadProviderRequestBudget(
  request: AIAdaptiveRereadRequest,
): AIAdaptiveRereadProviderRequestDraft["budget"] {
  const estimatedChars = Math.max(0, request.budget.estimatedChars);

  return {
    estimatedChars,
    estimatedTokens:
      request.budget.estimatedTokens && request.budget.estimatedTokens > 0
        ? request.budget.estimatedTokens
        : estimatedTokens(estimatedChars),
    hasImageInput: request.budget.hasImageInput || request.assetRefs.length > 0,
    hasTextInput: request.budget.hasTextInput,
    packetCount: request.packetIds.length,
    pageCount: request.pageWindow.pageNumbers.length,
  };
}

export function buildAdaptiveRereadPromptContract(
  request: AIAdaptiveRereadRequest,
): AIAdaptiveRereadProviderRequestDraft["promptContract"] {
  const reasonCodes = uniqueStrings(
    request.reasons.map((reason) => reason.code),
  );
  const systemInstruction = boundedText(
    [
      "You are preparing an adaptive cross-page reread for an AI PDF import.",
      "Return JSON only.",
      "Do not use markdown.",
      "Preserve packetId and packetHash exactly.",
      "Use only the bounded page window and asset references listed in this request.",
      "Focus only on boundary clarification, missing adjacent context, asset context, or low-confidence text recovery.",
      "Do not re-extract the whole PDF.",
      "Do not invent missing answers.",
      "Set review.reviewRequired true when evidence is incomplete or uncertain.",
      "Lower confidence when page or asset evidence is incomplete.",
    ].join(" "),
    SYSTEM_INSTRUCTION_MAX_LENGTH,
    "adaptive_reread_system_prompt_truncated_for_summary",
  );
  const userInstruction = boundedText(
    [
      `Adaptive reread request: ${request.rereadRequestId}`,
      `Request kind: ${request.kind}`,
      `Priority: ${request.priority}`,
      `Page window: ${request.pageWindow.startPage}-${request.pageWindow.endPage}`,
      `Page numbers: ${request.pageWindow.pageNumbers.join(", ") || "none"}`,
      `Packet IDs: ${request.packetIds.join(", ") || "none"}`,
      `Packet hashes: ${request.packetHashes.join(", ") || "none"}`,
      `Asset refs: ${request.assetRefs.join(", ") || "none"}`,
      `Reason codes: ${reasonCodes.join(", ") || "none"}`,
      "Expected output schema: question_extract_v1.",
      "Return one result only for packets that can be clarified by this bounded context.",
      "If the context is insufficient, return a partial result with reviewRequired true.",
    ].join("\n"),
    USER_INSTRUCTION_MAX_LENGTH,
    "adaptive_reread_user_prompt_truncated_for_summary",
  );

  return {
    expectedSchemaVersion: "question_extract_v1",
    jsonOnly: true,
    noMarkdown: true,
    preservePacketHashes: true,
    preservePacketIds: true,
    systemInstruction,
    useOnlyProvidedAssets: true,
    useOnlyProvidedPages: true,
    userInstruction,
  };
}

export function buildAdaptiveRereadProviderRequestDraft({
  index,
  rereadRequest,
}: {
  index: number;
  rereadRequest: AIAdaptiveRereadRequest;
}): AIAdaptiveRereadProviderRequestDraft | null {
  const pageNumbers = uniqueNumbers(rereadRequest.pageWindow.pageNumbers);

  if (!pageNumbers.length) {
    return null;
  }

  const kind = providerKindForRereadKind(rereadRequest.kind);
  const recommendedMode = recommendedModeForRereadRequest(rereadRequest);
  const budget = estimateAdaptiveRereadProviderRequestBudget(rereadRequest);
  const promptContract = buildAdaptiveRereadPromptContract(rereadRequest);
  const warnings = uniqueStrings([
    ...rereadRequest.warnings,
    "adaptive_reread_provider_request_shadow_only",
    "adaptive_reread_provider_request_no_real_call",
    ...(kind === "adaptive_review_only" || recommendedMode === "review_only"
      ? ["adaptive_reread_provider_request_review_only"]
      : []),
  ]);
  const requestHash = stableHash({
    kind,
    packetHashes: rereadRequest.packetHashes,
    packetIds: rereadRequest.packetIds,
    pageNumbers,
    rereadRequestHash: rereadRequest.rereadRequestHash,
    recommendedMode,
  });

  return {
    batchIds: uniqueStrings(rereadRequest.batchIds),
    budget,
    inputRefs: {
      assetRefs: uniqueStrings(rereadRequest.assetRefs),
      pageNumbers,
    },
    kind,
    packetHashes: uniqueStrings(rereadRequest.packetHashes),
    packetIds: uniqueStrings(rereadRequest.packetIds),
    pageWindow: {
      endPage: rereadRequest.pageWindow.endPage,
      maxWindowPages: rereadRequest.pageWindow.maxWindowPages,
      pageNumbers,
      startPage: rereadRequest.pageWindow.startPage,
    },
    priority: rereadRequest.priority,
    promptContract,
    providerRequestIds: uniqueStrings(rereadRequest.providerRequestIds),
    providerRunIds: uniqueStrings(rereadRequest.providerRunIds),
    recommendedMode,
    rereadRequestHash: rereadRequest.rereadRequestHash,
    rereadRequestId: rereadRequest.rereadRequestId,
    requestHash,
    requestId: `adaptive-provider-request-${index}-${requestHash.slice(0, 12)}`,
    safety: {
      boundedPageWindow: true,
      noBase64: true,
      noFullPdfText: true,
      noImageBytes: true,
      realCall: false,
      shadowOnly: true,
    },
    warnings,
  };
}

function planStats(
  requests: AIAdaptiveRereadProviderRequestDraft[],
): AIAdaptiveRereadProviderRequestPlanStats {
  const estimatedTotalChars = requests.reduce(
    (sum, request) => sum + request.budget.estimatedChars,
    0,
  );

  return {
    estimatedTotalChars,
    estimatedTotalTokens: estimatedTokens(estimatedTotalChars),
    hasImageInput: requests.some((request) => request.budget.hasImageInput),
    hasTextInput: requests.some((request) => request.budget.hasTextInput),
    highPriorityCount: requests.filter((request) => request.priority === "high")
      .length,
    lowPriorityCount: requests.filter((request) => request.priority === "low")
      .length,
    mediumPriorityCount: requests.filter((request) => request.priority === "medium")
      .length,
    requestCount: requests.length,
    reviewOnlyCount: requests.filter(
      (request) => request.recommendedMode === "review_only",
    ).length,
    totalPacketCount: new Set(requests.flatMap((request) => request.packetIds))
      .size,
  };
}

export function buildAIAdaptiveRereadProviderRequestPlanFromAdaptiveRereadPlan(
  adaptiveRereadPlan: AIAdaptiveRereadPlan | Record<string, unknown> | null | undefined,
): AIAdaptiveRereadProviderRequestPlan {
  const warnings = [
    "adaptive_reread_provider_request_shadow_only",
    "adaptive_reread_provider_request_no_real_call",
  ];
  const plan = normalizeAdaptiveRereadPlan(adaptiveRereadPlan);

  if (!plan) {
    warnings.push("adaptive_reread_provider_request_missing_reread_plan");

    return {
      generatedAt: new Date().toISOString(),
      mode: "shadow",
      requests: [],
      sourceKind: "pdf",
      stats: planStats([]),
      status: "skipped",
      version: "adaptive_reread_provider_request_plan_v1",
      warnings: uniqueStrings(warnings),
    };
  }

  let skippedCount = 0;
  const builtRequests = plan.requests
    .map((request, index) => {
      const draft = buildAdaptiveRereadProviderRequestDraft({
        index,
        rereadRequest: request,
      });

      if (!draft) {
        skippedCount += 1;
      }

      return draft;
    })
    .filter((request): request is AIAdaptiveRereadProviderRequestDraft =>
      Boolean(request),
    );
  let requests = builtRequests;

  if (requests.length > MAX_PROVIDER_REQUEST_DRAFTS) {
    skippedCount += requests.length - MAX_PROVIDER_REQUEST_DRAFTS;
    requests = requests.slice(0, MAX_PROVIDER_REQUEST_DRAFTS);
    warnings.push("adaptive_reread_provider_request_plan_limited");
  }

  if (requests.length > SUMMARY_WARNING_REQUEST_COUNT) {
    warnings.push("adaptive_reread_provider_request_summary_limited");
  }

  if (
    requests.some((request) => request.recommendedMode === "review_only") ||
    plan.status === "completed_with_warnings"
  ) {
    warnings.push("adaptive_reread_provider_request_review_only");
  }

  if (skippedCount > 0) {
    warnings.push("adaptive_reread_provider_request_unknown_kind");
  }

  const stats = planStats(requests);

  return {
    generatedAt: new Date().toISOString(),
    mode: "shadow",
    requests,
    sourceKind: plan.sourceKind,
    stats,
    status:
      plan.status === "failed"
        ? "failed"
        : requests.length === 0
          ? "skipped"
          : warnings.length > 2 || skippedCount > 0
            ? "completed_with_warnings"
            : "completed",
    version: "adaptive_reread_provider_request_plan_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function failedAIAdaptiveRereadProviderRequestPlan({
  generatedAt = new Date().toISOString(),
  sourceKind = "pdf",
  warnings,
}: {
  generatedAt?: string;
  sourceKind?: "pdf" | "single_image";
  warnings: string[];
}): AIAdaptiveRereadProviderRequestPlan {
  return {
    generatedAt,
    mode: "shadow",
    requests: [],
    sourceKind,
    stats: planStats([]),
    status: "failed",
    version: "adaptive_reread_provider_request_plan_v1",
    warnings,
  };
}

export function mergeAIAdaptiveRereadProviderRequestPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  adaptiveRereadProviderRequestPlan: AIAdaptiveRereadProviderRequestPlan,
) {
  return {
    ...existingAiPdfImport,
    adaptiveRereadProviderRequestPlan,
  };
}
