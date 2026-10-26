import crypto from "node:crypto";

import type {
  AIAdaptiveRereadProviderRequestDraft,
  AIAdaptiveRereadProviderRequestKind,
  AIAdaptiveRereadProviderRequestPlan,
} from "./adaptive-reread-provider-requests";

type AIAdaptiveRereadRunPlanVersion = "adaptive_reread_run_plan_v1";

type AIAdaptiveRereadRunPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AIAdaptiveRereadRunMode = "shadow" | "dry_run";

type AIAdaptiveRereadRequestRunStatus =
  | "ready"
  | "simulated"
  | "skipped"
  | "failed";

export interface AIAdaptiveRereadRunPlan {
  generatedAt: string;
  mode: AIAdaptiveRereadRunMode;
  requestRuns: AIAdaptiveRereadRequestRun[];
  sourceKind: "pdf" | "single_image";
  stats: AIAdaptiveRereadRunPlanStats;
  status: AIAdaptiveRereadRunPlanStatus;
  version: AIAdaptiveRereadRunPlanVersion;
  warnings: string[];
}

interface AIAdaptiveRereadRequestRun {
  assetRefs: string[];
  dryRunResult?: AIAdaptiveRereadDryRunResult;
  inputBudget: {
    estimatedChars: number;
    estimatedTokens?: number;
    hasImageInput: boolean;
    hasTextInput: boolean;
    packetCount: number;
    pageCount: number;
  };
  kind: string;
  outputContract: {
    adaptiveRereadOnly: true;
    expectedSchemaVersion: "question_extract_v1";
    jsonOnly: true;
    preservePacketHashes: true;
    preservePacketIds: true;
  };
  packetHashes: string[];
  packetIds: string[];
  pageWindow: {
    endPage: number;
    maxWindowPages: number;
    pageNumbers: number[];
    startPage: number;
  };
  priority: "low" | "medium" | "high";
  provider: {
    plannedModel?: string | null;
    plannedProvider: "gemini" | "openai" | "unknown";
    realCall: false;
  };
  rereadRequestHash: string;
  rereadRequestId: string;
  requestHash: string;
  requestId: string;
  runId: string;
  status: AIAdaptiveRereadRequestRunStatus;
  warnings: string[];
}

interface AIAdaptiveRereadDryRunResult {
  mergeIntent: {
    adaptiveRereadOnly: true;
    officialMerge: false;
    reviewDraftWrite: false;
  };
  packetIds: string[];
  rereadRequestHash: string;
  rereadRequestId: string;
  requestHash: string;
  requestId: string;
  resultCount: number;
  schemaVersion: "question_extract_v1";
  simulatedAt: string;
  validation: {
    errors: string[];
    valid: boolean;
    warnings: string[];
  };
}

interface AIAdaptiveRereadRunPlanStats {
  estimatedTotalChars: number;
  estimatedTotalTokens?: number;
  failedRequestRunCount: number;
  hasImageInput: boolean;
  hasTextInput: boolean;
  highPriorityCount: number;
  lowPriorityCount: number;
  mediumPriorityCount: number;
  requestRunCount: number;
  simulatedRequestRunCount: number;
  skippedRequestRunCount: number;
  totalPacketCount: number;
}

const RUN_PLAN_WARNING_REQUEST_COUNT = 80;
const RUN_PLAN_WARNING_CHAR_BUDGET = 140000;

const SIMULATED_REQUEST_KINDS = new Set<AIAdaptiveRereadProviderRequestKind>([
  "adaptive_cross_page_text_extraction",
  "adaptive_answer_key_review",
  "adaptive_asset_context_review",
  "adaptive_low_text_confidence_review",
  "adaptive_mixed_layout_review",
]);

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

function normalizeProviderRequestPlan(
  value: unknown,
): AIAdaptiveRereadProviderRequestPlan | null {
  const plan = asRecord(value);
  const stats = asRecord(plan.stats);

  if (plan.version !== "adaptive_reread_provider_request_plan_v1") {
    return null;
  }

  return {
    generatedAt: stringValue(plan.generatedAt) || new Date().toISOString(),
    mode: "shadow",
    requests: asArray(plan.requests).map(normalizeProviderRequestDraft),
    sourceKind: plan.sourceKind === "single_image" ? "single_image" : "pdf",
    stats: {
      estimatedTotalChars: numberValue(stats.estimatedTotalChars, 0),
      estimatedTotalTokens: numberValue(stats.estimatedTotalTokens, 0),
      hasImageInput: booleanValue(stats.hasImageInput),
      hasTextInput: booleanValue(stats.hasTextInput),
      highPriorityCount: numberValue(stats.highPriorityCount, 0),
      lowPriorityCount: numberValue(stats.lowPriorityCount, 0),
      mediumPriorityCount: numberValue(stats.mediumPriorityCount, 0),
      requestCount: numberValue(stats.requestCount, 0),
      reviewOnlyCount: numberValue(stats.reviewOnlyCount, 0),
      totalPacketCount: numberValue(stats.totalPacketCount, 0),
    },
    status:
      plan.status === "failed" ||
      plan.status === "skipped" ||
      plan.status === "completed_with_warnings"
        ? plan.status
        : "completed",
    version: "adaptive_reread_provider_request_plan_v1",
    warnings: asArray(plan.warnings).map(String),
  };
}

function normalizeProviderRequestDraft(
  value: unknown,
): AIAdaptiveRereadProviderRequestDraft {
  const request = asRecord(value);
  const budget = asRecord(request.budget);
  const inputRefs = asRecord(request.inputRefs);
  const pageWindow = asRecord(request.pageWindow);
  const priority = stringValue(request.priority);

  return {
    batchIds: asArray(request.batchIds).map(String),
    budget: {
      estimatedChars: numberValue(budget.estimatedChars, 0),
      estimatedTokens: numberValue(budget.estimatedTokens, 0),
      hasImageInput: booleanValue(budget.hasImageInput),
      hasTextInput: booleanValue(budget.hasTextInput),
      packetCount: numberValue(budget.packetCount, 0),
      pageCount: numberValue(budget.pageCount, 0),
    },
    inputRefs: {
      assetRefs: asArray(inputRefs.assetRefs).map(String),
      pageNumbers: uniqueNumbers(asArray(inputRefs.pageNumbers).map(Number)),
    },
    kind: stringValue(request.kind) as AIAdaptiveRereadProviderRequestKind,
    packetHashes: asArray(request.packetHashes).map(String),
    packetIds: asArray(request.packetIds).map(String),
    pageWindow: {
      endPage: numberValue(pageWindow.endPage, 0),
      maxWindowPages: numberValue(pageWindow.maxWindowPages, 3),
      pageNumbers: uniqueNumbers(asArray(pageWindow.pageNumbers).map(Number)),
      startPage: numberValue(pageWindow.startPage, 0),
    },
    priority:
      priority === "high" || priority === "low" || priority === "medium"
        ? priority
        : "medium",
    promptContract: asRecord(
      request.promptContract,
    ) as AIAdaptiveRereadProviderRequestDraft["promptContract"],
    providerRequestIds: asArray(request.providerRequestIds).map(String),
    providerRunIds: asArray(request.providerRunIds).map(String),
    recommendedMode:
      request.recommendedMode === "vision" ||
      request.recommendedMode === "mixed" ||
      request.recommendedMode === "review_only"
        ? request.recommendedMode
        : "text",
    rereadRequestHash: stringValue(request.rereadRequestHash),
    rereadRequestId: stringValue(request.rereadRequestId),
    requestHash: stringValue(request.requestHash),
    requestId: stringValue(request.requestId),
    safety: {
      boundedPageWindow: true,
      noBase64: true,
      noFullPdfText: true,
      noImageBytes: true,
      realCall: false,
      shadowOnly: true,
    },
    warnings: asArray(request.warnings).map(String),
  };
}

function plannedProviderForRequest(
  request: AIAdaptiveRereadProviderRequestDraft,
): AIAdaptiveRereadRequestRun["provider"]["plannedProvider"] {
  if (
    request.kind === "adaptive_asset_context_review" ||
    request.kind === "adaptive_mixed_layout_review" ||
    request.budget.hasImageInput
  ) {
    return "gemini";
  }

  if (
    request.kind === "adaptive_cross_page_text_extraction" ||
    request.kind === "adaptive_answer_key_review"
  ) {
    return "openai";
  }

  return "unknown";
}

function supportsSimulation(request: AIAdaptiveRereadProviderRequestDraft) {
  if (request.kind === "adaptive_review_only") {
    return false;
  }

  return SIMULATED_REQUEST_KINDS.has(request.kind);
}

function requestWarningsForSimulation(request: AIAdaptiveRereadProviderRequestDraft) {
  const warnings: string[] = [];

  if (request.kind === "adaptive_low_text_confidence_review") {
    warnings.push("adaptive_reread_run_low_text_confidence");
  }

  if (request.kind === "adaptive_mixed_layout_review") {
    warnings.push("adaptive_reread_run_validation_warning:mixed_layout_review_only");
  }

  if (
    request.kind === "adaptive_asset_context_review" &&
    !request.budget.hasImageInput &&
    request.inputRefs.assetRefs.length === 0
  ) {
    warnings.push("adaptive_reread_run_vision_input_unavailable");
  }

  return warnings;
}

function validateAdaptiveRereadDryRunOutput({
  packetHashes,
  packetIds,
  rereadRequestHash,
  rereadRequestId,
  requestHash,
  requestId,
  results,
}: {
  packetHashes: string[];
  packetIds: string[];
  rereadRequestHash: string;
  rereadRequestId: string;
  requestHash: string;
  requestId: string;
  results: Array<Record<string, unknown>>;
}): AIAdaptiveRereadDryRunResult["validation"] {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (results.length !== packetIds.length) {
    errors.push("adaptive_reread_dry_run_result_count_mismatch");
  }

  for (const [index, packetId] of packetIds.entries()) {
    const result = results[index] ?? {};

    if (result.version !== "question_extract_v1") {
      errors.push(`result_${index}_schema_version_mismatch`);
    }

    if (result.packetId !== packetId) {
      errors.push(`result_${index}_packet_id_mismatch`);
    }

    if (result.packetHash !== packetHashes[index]) {
      errors.push(`result_${index}_packet_hash_mismatch`);
    }

    if (result.requestId !== requestId) {
      errors.push(`result_${index}_request_id_mismatch`);
    }

    if (result.requestHash !== requestHash) {
      errors.push(`result_${index}_request_hash_mismatch`);
    }

    if (result.rereadRequestId !== rereadRequestId) {
      errors.push(`result_${index}_reread_request_id_mismatch`);
    }

    if (result.rereadRequestHash !== rereadRequestHash) {
      errors.push(`result_${index}_reread_request_hash_mismatch`);
    }

    const question = asRecord(result.question);

    if (question.answer !== null) {
      errors.push(`result_${index}_dry_run_answer_must_be_null`);
    }

    if (question.explanation !== null) {
      errors.push(`result_${index}_dry_run_explanation_must_be_null`);
    }

    const stem = stringValue(question.stem);
    if (stem && !stem.includes("Dry run placeholder")) {
      warnings.push(`result_${index}_dry_run_stem_should_not_claim_recovery`);
    }

    const review = asRecord(result.review);

    if (review.reviewRequired !== true) {
      warnings.push(`result_${index}_review_required_expected`);
    }

    const mergeIntent = asRecord(result.mergeIntent);

    if (
      mergeIntent.officialMerge !== false ||
      mergeIntent.reviewDraftWrite !== false ||
      mergeIntent.adaptiveRereadOnly !== true
    ) {
      errors.push(`result_${index}_merge_intent_must_stay_shadow_only`);
    }
  }

  return {
    errors,
    valid: errors.length === 0,
    warnings,
  };
}

function simulateAdaptiveRereadDryRun(
  request: AIAdaptiveRereadProviderRequestDraft,
): AIAdaptiveRereadDryRunResult {
  const results = request.packetIds.map((packetId, index) => ({
    confidence: 0.15,
    mergeIntent: {
      adaptiveRereadOnly: true,
      officialMerge: false,
      reviewDraftWrite: false,
    },
    packetHash: request.packetHashes[index],
    packetId,
    question: {
      answer: null,
      assets: [],
      explanation: null,
      format: "unknown",
      options: [],
      questionNumber: null,
      source: { pageNumbers: request.pageWindow.pageNumbers },
      stem: "Dry run placeholder for adaptive reread pipeline validation only.",
    },
    rereadRequestHash: request.rereadRequestHash,
    rereadRequestId: request.rereadRequestId,
    requestHash: request.requestHash,
    requestId: request.requestId,
    review: {
      reasonCodes: ["adaptive_reread_shadow_mode_only", "missing_answer"],
      reviewRequired: true,
    },
    status: "partial",
    version: "question_extract_v1",
    warnings: ["adaptive_reread_run_no_real_call"],
  }));
  const validation = validateAdaptiveRereadDryRunOutput({
    packetHashes: request.packetHashes,
    packetIds: request.packetIds,
    rereadRequestHash: request.rereadRequestHash,
    rereadRequestId: request.rereadRequestId,
    requestHash: request.requestHash,
    requestId: request.requestId,
    results,
  });

  return {
    mergeIntent: {
      adaptiveRereadOnly: true,
      officialMerge: false,
      reviewDraftWrite: false,
    },
    packetIds: request.packetIds,
    rereadRequestHash: request.rereadRequestHash,
    rereadRequestId: request.rereadRequestId,
    requestHash: request.requestHash,
    requestId: request.requestId,
    resultCount: results.length,
    schemaVersion: "question_extract_v1",
    simulatedAt: new Date().toISOString(),
    validation,
  };
}

function buildAdaptiveRereadRequestRun({
  mode,
  request,
}: {
  mode: AIAdaptiveRereadRunMode;
  request: AIAdaptiveRereadProviderRequestDraft;
}): AIAdaptiveRereadRequestRun {
  const warnings = [
    ...request.warnings,
    "adaptive_reread_run_shadow_only",
    "adaptive_reread_run_no_real_call",
  ];
  const runSeed = {
    mode,
    requestHash: request.requestHash,
    requestId: request.requestId,
    rereadRequestHash: request.rereadRequestHash,
    rereadRequestId: request.rereadRequestId,
  };
  const runId = `adaptive-reread-run-${stableHash(runSeed).slice(0, 12)}`;

  if (request.kind === "adaptive_review_only") {
    return {
      assetRefs: request.inputRefs.assetRefs,
      inputBudget: request.budget,
      kind: request.kind,
      outputContract: {
        adaptiveRereadOnly: true,
        expectedSchemaVersion: "question_extract_v1",
        jsonOnly: true,
        preservePacketHashes: true,
        preservePacketIds: true,
      },
      packetHashes: request.packetHashes,
      packetIds: request.packetIds,
      pageWindow: request.pageWindow,
      priority: request.priority,
      provider: {
        plannedProvider: "unknown",
        realCall: false,
      },
      rereadRequestHash: request.rereadRequestHash,
      rereadRequestId: request.rereadRequestId,
      requestHash: request.requestHash,
      requestId: request.requestId,
      runId,
      status: "skipped",
      warnings: uniqueStrings([
        ...warnings,
        "adaptive_reread_run_review_only_skipped",
      ]),
    };
  }

  if (!supportsSimulation(request)) {
    return {
      assetRefs: request.inputRefs.assetRefs,
      inputBudget: request.budget,
      kind: request.kind,
      outputContract: {
        adaptiveRereadOnly: true,
        expectedSchemaVersion: "question_extract_v1",
        jsonOnly: true,
        preservePacketHashes: true,
        preservePacketIds: true,
      },
      packetHashes: request.packetHashes,
      packetIds: request.packetIds,
      pageWindow: request.pageWindow,
      priority: request.priority,
      provider: {
        plannedProvider: "unknown",
        realCall: false,
      },
      rereadRequestHash: request.rereadRequestHash,
      rereadRequestId: request.rereadRequestId,
      requestHash: request.requestHash,
      requestId: request.requestId,
      runId,
      status: "skipped",
      warnings: uniqueStrings([
        ...warnings,
        "adaptive_reread_run_unknown_request_kind",
      ]),
    };
  }

  const dryRunResult =
    mode === "dry_run" ? simulateAdaptiveRereadDryRun(request) : undefined;
  const validationWarnings = dryRunResult?.validation.warnings ?? [];
  const validationErrors = dryRunResult?.validation.errors ?? [];

  return {
    assetRefs: request.inputRefs.assetRefs,
    dryRunResult,
    inputBudget: request.budget,
    kind: request.kind,
    outputContract: {
      adaptiveRereadOnly: true,
      expectedSchemaVersion: "question_extract_v1",
      jsonOnly: true,
      preservePacketHashes: true,
      preservePacketIds: true,
    },
    packetHashes: request.packetHashes,
    packetIds: request.packetIds,
    pageWindow: request.pageWindow,
    priority: request.priority,
    provider: {
      plannedProvider: plannedProviderForRequest(request),
      realCall: false,
    },
    rereadRequestHash: request.rereadRequestHash,
    rereadRequestId: request.rereadRequestId,
    requestHash: request.requestHash,
    requestId: request.requestId,
    runId,
    status:
      validationErrors.length > 0
        ? "failed"
        : mode === "dry_run"
          ? "simulated"
          : "ready",
    warnings: uniqueStrings([
      ...warnings,
      ...requestWarningsForSimulation(request),
      ...validationWarnings.map(
        (warning) => `adaptive_reread_run_validation_warning:${warning}`,
      ),
      ...validationErrors.map(
        (error) => `adaptive_reread_run_validation_error:${error}`,
      ),
    ]),
  };
}

function runStats(
  requestRuns: AIAdaptiveRereadRequestRun[],
): AIAdaptiveRereadRunPlanStats {
  const estimatedTotalChars = requestRuns.reduce(
    (sum, run) => sum + run.inputBudget.estimatedChars,
    0,
  );

  return {
    estimatedTotalChars,
    estimatedTotalTokens: estimatedTokens(estimatedTotalChars),
    failedRequestRunCount: requestRuns.filter((run) => run.status === "failed")
      .length,
    hasImageInput: requestRuns.some((run) => run.inputBudget.hasImageInput),
    hasTextInput: requestRuns.some((run) => run.inputBudget.hasTextInput),
    highPriorityCount: requestRuns.filter((run) => run.priority === "high")
      .length,
    lowPriorityCount: requestRuns.filter((run) => run.priority === "low").length,
    mediumPriorityCount: requestRuns.filter((run) => run.priority === "medium")
      .length,
    requestRunCount: requestRuns.length,
    simulatedRequestRunCount: requestRuns.filter(
      (run) => run.status === "simulated",
    ).length,
    skippedRequestRunCount: requestRuns.filter((run) => run.status === "skipped")
      .length,
    totalPacketCount: new Set(requestRuns.flatMap((run) => run.packetIds)).size,
  };
}

function runPlanStatus(
  stats: AIAdaptiveRereadRunPlanStats,
): AIAdaptiveRereadRunPlanStatus {
  if (stats.requestRunCount === 0) {
    return "skipped";
  }

  if (stats.failedRequestRunCount > 0) {
    return "failed";
  }

  if (stats.skippedRequestRunCount > 0) {
    return "completed_with_warnings";
  }

  return "completed";
}

export function buildAIAdaptiveRereadRunPlanFromProviderRequestPlan({
  mode = "dry_run",
  providerRequestPlan,
}: {
  mode?: AIAdaptiveRereadRunMode;
  providerRequestPlan:
    | AIAdaptiveRereadProviderRequestPlan
    | Record<string, unknown>
    | null
    | undefined;
}): AIAdaptiveRereadRunPlan {
  const requestPlan = normalizeProviderRequestPlan(providerRequestPlan);
  const warnings = [
    "adaptive_reread_run_shadow_only",
    "adaptive_reread_run_no_real_call",
  ];

  if (!requestPlan) {
    warnings.push("adaptive_reread_run_missing_provider_request_plan");

    return {
      generatedAt: new Date().toISOString(),
      mode,
      requestRuns: [],
      sourceKind: "pdf",
      stats: runStats([]),
      status: "skipped",
      version: "adaptive_reread_run_plan_v1",
      warnings: uniqueStrings(warnings),
    };
  }

  warnings.push(...requestPlan.warnings);

  if (
    requestPlan.status === "failed" ||
    (requestPlan.status === "skipped" && requestPlan.requests.length === 0)
  ) {
    return failedAIAdaptiveRereadRunPlan({
      generatedAt: new Date().toISOString(),
      mode,
      sourceKind: requestPlan.sourceKind,
      warnings: uniqueStrings([
        ...warnings,
        "Adaptive reread run skipped because provider request plan did not complete.",
      ]),
    });
  }

  const requestRuns = requestPlan.requests.map((request) =>
    buildAdaptiveRereadRequestRun({ mode, request }),
  );
  const stats = runStats(requestRuns);

  if (
    stats.requestRunCount > RUN_PLAN_WARNING_REQUEST_COUNT ||
    stats.estimatedTotalChars > RUN_PLAN_WARNING_CHAR_BUDGET
  ) {
    warnings.push("adaptive_reread_run_summary_limited");
  }

  return {
    generatedAt: new Date().toISOString(),
    mode,
    requestRuns,
    sourceKind: requestPlan.sourceKind,
    stats,
    status:
      requestPlan.status === "completed_with_warnings" &&
      runPlanStatus(stats) === "completed"
        ? "completed_with_warnings"
        : runPlanStatus(stats),
    version: "adaptive_reread_run_plan_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function failedAIAdaptiveRereadRunPlan({
  generatedAt = new Date().toISOString(),
  mode = "dry_run",
  sourceKind = "pdf",
  warnings,
}: {
  generatedAt?: string;
  mode?: AIAdaptiveRereadRunMode;
  sourceKind?: "pdf" | "single_image";
  warnings: string[];
}): AIAdaptiveRereadRunPlan {
  return {
    generatedAt,
    mode,
    requestRuns: [],
    sourceKind,
    stats: runStats([]),
    status: "failed",
    version: "adaptive_reread_run_plan_v1",
    warnings,
  };
}

export function mergeAIAdaptiveRereadRunPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  adaptiveRereadRunPlan: AIAdaptiveRereadRunPlan,
) {
  return {
    ...existingAiPdfImport,
    adaptiveRereadRunPlan,
  };
}
