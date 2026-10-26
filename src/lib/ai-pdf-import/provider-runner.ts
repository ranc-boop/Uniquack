import crypto from "node:crypto";

import type {
  AIProviderRequestDraft,
  AIProviderRequestKind,
  AIProviderRequestPlan,
} from "./provider-requests";

type AIProviderRunPlanVersion = "provider_run_plan_v1";

export type AIProviderRunMode = "shadow" | "dry_run";

type AIProviderRunStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

type AIProviderRequestRunStatus =
  | "ready"
  | "simulated"
  | "skipped"
  | "failed";

export interface AIProviderRunPlan {
  generatedAt: string;
  mode: AIProviderRunMode;
  requestRuns: AIProviderRequestRun[];
  sourceKind: AIProviderRequestPlan["sourceKind"];
  stats: AIProviderRunStats;
  status: AIProviderRunStatus;
  version: AIProviderRunPlanVersion;
  warnings: string[];
}

interface AIProviderRequestRun {
  batchHash: string;
  batchId: string;
  dryRunResult?: AIProviderDryRunResult;
  inputBudget: {
    estimatedChars: number;
    estimatedTokens?: number;
    hasImageInput: boolean;
    hasTextInput: boolean;
    packetCount: number;
  };
  kind: string;
  outputContract: {
    expectedSchemaVersion: "question_extract_v1";
    jsonOnly: true;
    preservePacketHashes: true;
    preservePacketIds: true;
  };
  packetHashes: string[];
  packetIds: string[];
  provider: {
    plannedModel?: string | null;
    plannedProvider: "gemini" | "openai" | "unknown";
    realCall: false;
  };
  requestHash: string;
  requestId: string;
  runId: string;
  status: AIProviderRequestRunStatus;
  warnings: string[];
}

interface AIProviderDryRunResult {
  packetIds: string[];
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

interface AIProviderRunStats {
  estimatedTotalChars: number;
  estimatedTotalTokens?: number;
  failedRequestCount: number;
  hasImageInput: boolean;
  hasTextInput: boolean;
  requestCount: number;
  simulatedRequestCount: number;
  skippedRequestCount: number;
  totalPacketCount: number;
}

const SUPPORTED_REQUEST_KINDS = new Set<AIProviderRequestKind>([
  "schema_text_extraction",
  "schema_mixed_extraction",
  "schema_vision_extraction",
  "schema_boundary_review",
  "schema_single_image_extraction",
]);
const RUN_PLAN_WARNING_REQUEST_COUNT = 80;
const RUN_PLAN_WARNING_CHAR_BUDGET = 140000;

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function estimatedTokens(chars: number) {
  return Math.ceil(chars / 4);
}

function plannedProviderForRequest(
  request: AIProviderRequestDraft,
): AIProviderRequestRun["provider"]["plannedProvider"] {
  if (
    request.kind === "schema_vision_extraction" ||
    request.kind === "schema_single_image_extraction"
  ) {
    return "gemini";
  }

  if (request.kind === "schema_text_extraction") {
    return "openai";
  }

  return "unknown";
}

function simulateProviderRequestDryRun(
  request: AIProviderRequestDraft,
): AIProviderDryRunResult {
  const validation = validateDryRunProviderOutput({
    packetHashes: request.packetHashes,
    packetIds: request.packetIds,
    results: request.packetIds.map((packetId, index) => ({
      confidence: 0.2,
      packetHash: request.packetHashes[index],
      packetId,
      question: {
        answer: null,
        assets: [],
        explanation: null,
        format: "unknown",
        options: [],
        questionNumber: null,
        source: { pageNumbers: request.inputRefs.pageNumbers },
        stem: "Dry run placeholder for pipeline validation only.",
      },
      review: {
        reasonCodes: ["provider_run_shadow_mode_only", "missing_answer"],
        reviewRequired: true,
      },
      status: "partial",
      version: "question_extract_v1",
      warnings: ["provider_run_real_call_disabled"],
    })),
  });

  return {
    packetIds: request.packetIds,
    requestHash: request.requestHash,
    requestId: request.requestId,
    resultCount: request.packetIds.length,
    schemaVersion: "question_extract_v1",
    simulatedAt: new Date().toISOString(),
    validation,
  };
}

function validateDryRunProviderOutput({
  packetHashes,
  packetIds,
  results,
}: {
  packetHashes: string[];
  packetIds: string[];
  results: Array<Record<string, unknown>>;
}): AIProviderDryRunResult["validation"] {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (results.length !== packetIds.length) {
    errors.push("dry_run_result_count_mismatch");
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

    const question =
      result.question &&
      typeof result.question === "object" &&
      !Array.isArray(result.question)
        ? (result.question as Record<string, unknown>)
        : {};

    if (question.answer !== null) {
      errors.push(`result_${index}_dry_run_answer_must_be_null`);
    }

    if (question.explanation !== null) {
      errors.push(`result_${index}_dry_run_explanation_must_be_null`);
    }

    const review =
      result.review &&
      typeof result.review === "object" &&
      !Array.isArray(result.review)
        ? (result.review as Record<string, unknown>)
        : {};

    if (review.reviewRequired !== true) {
      warnings.push(`result_${index}_review_required_expected`);
    }
  }

  return {
    errors,
    valid: errors.length === 0,
    warnings,
  };
}

function buildProviderRequestRun({
  mode,
  request,
}: {
  mode: AIProviderRunMode;
  request: AIProviderRequestDraft;
}): AIProviderRequestRun {
  const warnings = ["provider_run_shadow_mode_only", "provider_run_real_call_disabled"];
  const isSupported = SUPPORTED_REQUEST_KINDS.has(
    request.kind as AIProviderRequestKind,
  );
  const runSeed = {
    mode,
    requestHash: request.requestHash,
    requestId: request.requestId,
  };
  const runId = `provider-run-${stableHash(runSeed).slice(0, 12)}`;

  if (!isSupported) {
    return {
      batchHash: request.batchHash,
      batchId: request.batchId,
      inputBudget: request.budget,
      kind: String(request.kind),
      outputContract: {
        expectedSchemaVersion: "question_extract_v1",
        jsonOnly: true,
        preservePacketHashes: true,
        preservePacketIds: true,
      },
      packetHashes: request.packetHashes,
      packetIds: request.packetIds,
      provider: {
        plannedProvider: "unknown",
        realCall: false,
      },
      requestHash: request.requestHash,
      requestId: request.requestId,
      runId,
      status: "skipped",
      warnings: [...warnings, "provider_run_request_skipped_unknown_kind"],
    };
  }

  const dryRunResult =
    mode === "dry_run" ? simulateProviderRequestDryRun(request) : undefined;
  const validationWarnings = dryRunResult?.validation.warnings ?? [];
  const validationErrors = dryRunResult?.validation.errors ?? [];

  return {
    batchHash: request.batchHash,
    batchId: request.batchId,
    dryRunResult,
    inputBudget: request.budget,
    kind: request.kind,
    outputContract: {
      expectedSchemaVersion: "question_extract_v1",
      jsonOnly: true,
      preservePacketHashes: true,
      preservePacketIds: true,
    },
    packetHashes: request.packetHashes,
    packetIds: request.packetIds,
    provider: {
      plannedProvider: plannedProviderForRequest(request),
      realCall: false,
    },
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
      ...validationWarnings.map(
        (warning) => `provider_run_validation_warning:${warning}`,
      ),
      ...validationErrors.map((error) => `provider_run_validation_error:${error}`),
    ]),
  };
}

function runStats(requestRuns: AIProviderRequestRun[]): AIProviderRunStats {
  const estimatedTotalChars = requestRuns.reduce(
    (sum, run) => sum + run.inputBudget.estimatedChars,
    0,
  );

  return {
    estimatedTotalChars,
    estimatedTotalTokens: estimatedTokens(estimatedTotalChars),
    failedRequestCount: requestRuns.filter((run) => run.status === "failed").length,
    hasImageInput: requestRuns.some((run) => run.inputBudget.hasImageInput),
    hasTextInput: requestRuns.some((run) => run.inputBudget.hasTextInput),
    requestCount: requestRuns.length,
    simulatedRequestCount: requestRuns.filter((run) => run.status === "simulated")
      .length,
    skippedRequestCount: requestRuns.filter((run) => run.status === "skipped")
      .length,
    totalPacketCount: requestRuns.reduce(
      (sum, run) => sum + run.packetIds.length,
      0,
    ),
  };
}

function runPlanStatus(stats: AIProviderRunStats): AIProviderRunStatus {
  if (stats.requestCount === 0) {
    return "skipped";
  }

  if (stats.failedRequestCount > 0) {
    return "failed";
  }

  if (stats.skippedRequestCount > 0) {
    return "completed_with_warnings";
  }

  return "completed";
}

export function buildAIProviderRunPlanFromProviderRequestPlan({
  mode = "dry_run",
  providerRequestPlan,
}: {
  mode?: AIProviderRunMode;
  providerRequestPlan: AIProviderRequestPlan;
}): AIProviderRunPlan {
  const warnings = [
    ...providerRequestPlan.warnings,
    "provider_run_shadow_mode_only",
    "provider_run_real_call_disabled",
  ];

  if (providerRequestPlan.status !== "completed") {
    return failedAIProviderRunPlan({
      generatedAt: new Date().toISOString(),
      mode,
      sourceKind: providerRequestPlan.sourceKind,
      warnings: [
        ...warnings,
        "Provider run plan skipped because provider request plan did not complete.",
      ],
    });
  }

  const requestRuns = providerRequestPlan.requests.map((request) =>
    buildProviderRequestRun({ mode, request }),
  );
  const stats = runStats(requestRuns);

  if (
    stats.requestCount > RUN_PLAN_WARNING_REQUEST_COUNT ||
    stats.estimatedTotalChars > RUN_PLAN_WARNING_CHAR_BUDGET
  ) {
    warnings.push("provider_run_summary_limited");
  }

  return {
    generatedAt: new Date().toISOString(),
    mode,
    requestRuns,
    sourceKind: providerRequestPlan.sourceKind,
    stats,
    status: runPlanStatus(stats),
    version: "provider_run_plan_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function failedAIProviderRunPlan({
  generatedAt = new Date().toISOString(),
  mode = "dry_run",
  sourceKind,
  warnings,
}: {
  generatedAt?: string;
  mode?: AIProviderRunMode;
  sourceKind: AIProviderRequestPlan["sourceKind"];
  warnings: string[];
}): AIProviderRunPlan {
  return {
    generatedAt,
    mode,
    requestRuns: [],
    sourceKind,
    stats: {
      estimatedTotalChars: 0,
      estimatedTotalTokens: 0,
      failedRequestCount: 0,
      hasImageInput: false,
      hasTextInput: false,
      requestCount: 0,
      simulatedRequestCount: 0,
      skippedRequestCount: 0,
      totalPacketCount: 0,
    },
    status: "failed",
    version: "provider_run_plan_v1",
    warnings,
  };
}

export function mergeAIProviderRunPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  providerRunPlan: AIProviderRunPlan,
) {
  return {
    ...existingAiPdfImport,
    providerRunPlan,
  };
}
