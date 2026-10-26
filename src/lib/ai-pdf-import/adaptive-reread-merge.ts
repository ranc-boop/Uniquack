import crypto from "node:crypto";

type AIAdaptiveRereadMergePlanVersion =
  "adaptive_reread_merge_plan_v1";

type AIAdaptiveRereadMergePlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

type AIAdaptiveRereadMergeAction =
  | "suggest_fill_missing_field"
  | "suggest_replace_low_confidence_field"
  | "suggest_attach_asset_ref"
  | "suggest_extend_source_pages"
  | "suggest_boundary_merge"
  | "flag_conflict"
  | "flag_review_required"
  | "skip";

type AIAdaptiveRereadMergeField =
  | "stem"
  | "options"
  | "answer"
  | "explanation"
  | "assetRefs"
  | "sourcePages"
  | "tags"
  | "confidence"
  | "reviewRequired"
  | "unknown";

type AIAdaptiveRereadMergeReasonCode =
  | "missing_field"
  | "low_confidence_field"
  | "boundary_reread_available"
  | "source_page_extension_available"
  | "asset_context_available"
  | "answer_key_context_available"
  | "conflicting_candidate"
  | "review_only"
  | "dry_run_only"
  | "unsupported_merge_case";

export interface AIAdaptiveRereadMergePlan {
  generatedAt: string;
  mergeItems: AIAdaptiveRereadMergeItem[];
  mode: "planning_only";
  sourceKind: "pdf" | "single_image";
  stats: AIAdaptiveRereadMergePlanStats;
  status: AIAdaptiveRereadMergePlanStatus;
  version: AIAdaptiveRereadMergePlanVersion;
  warnings: string[];
}

interface AIAdaptiveRereadMergeItem {
  action: AIAdaptiveRereadMergeAction;
  confidence: number;
  field: AIAdaptiveRereadMergeField;
  mergeItemHash: string;
  mergeItemId: string;
  mergePolicy: {
    attachAsSuggestionOnly: true;
    officialMerge: false;
    overwriteExistingField: false;
    preserveOriginalValue: true;
    requireHumanReview: true;
    reviewDraftWrite: false;
  };
  packetHash: string;
  packetId: string;
  priority: "low" | "medium" | "high";
  reason: AIAdaptiveRereadMergeReason;
  rereadRequestHash?: string | null;
  rereadRequestId?: string | null;
  requestHash?: string | null;
  requestId?: string | null;
  runId?: string | null;
  source: {
    assetRefs: string[];
    originalPageNumbers: number[];
    rereadPageNumbers: number[];
  };
  warnings: string[];
}

interface AIAdaptiveRereadMergeReason {
  code: AIAdaptiveRereadMergeReasonCode;
  evidenceRefs: {
    packetIds: string[];
    pageNumbers: number[];
    rereadRequestIds: string[];
    requestIds: string[];
    runIds: string[];
  };
  message: string;
}

interface AIAdaptiveRereadMergePlanStats {
  conflictCount: number;
  highPriorityCount: number;
  lowPriorityCount: number;
  mediumPriorityCount: number;
  mergeItemCount: number;
  packetCount: number;
  reviewRequiredCount: number;
  skippedCount: number;
}

type AdaptiveRereadRequestMeta = {
  assetRefs: string[];
  kind: string;
  packetHashes: string[];
  packetIds: string[];
  pageWindow: {
    originalPageNumbers: number[];
    pageNumbers: number[];
  };
  priority: "low" | "medium" | "high";
  rereadRequestHash: string;
  rereadRequestId: string;
  warnings: string[];
};

type AdaptiveProviderRequestMeta = {
  assetRefs: string[];
  kind: string;
  packetHashes: string[];
  packetIds: string[];
  pageNumbers: number[];
  priority: "low" | "medium" | "high";
  rereadRequestHash: string;
  rereadRequestId: string;
  requestHash: string;
  requestId: string;
  warnings: string[];
};

type AdaptiveRunMeta = {
  assetRefs: string[];
  dryRunOnly: boolean;
  kind: string;
  packetHashes: string[];
  packetIds: string[];
  pageNumbers: number[];
  priority: "low" | "medium" | "high";
  rereadRequestHash: string;
  rereadRequestId: string;
  requestHash: string;
  requestId: string;
  runId: string;
  status: string;
  warnings: string[];
};

type MergeItemInput = {
  action: AIAdaptiveRereadMergeAction;
  assetRefs?: string[];
  confidence?: number;
  field: AIAdaptiveRereadMergeField;
  originalPageNumbers?: number[];
  packetHash: string;
  packetId: string;
  priority: "low" | "medium" | "high";
  reasonCode: AIAdaptiveRereadMergeReasonCode;
  reasonMessage: string;
  rereadPageNumbers?: number[];
  rereadRequestHash?: string | null;
  rereadRequestId?: string | null;
  requestHash?: string | null;
  requestId?: string | null;
  runId?: string | null;
  warnings?: string[];
};

const MERGE_POLICY = {
  attachAsSuggestionOnly: true,
  officialMerge: false,
  overwriteExistingField: false,
  preserveOriginalValue: true,
  requireHumanReview: true,
  reviewDraftWrite: false,
} as const;

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

function sourceKindFromSummary(aiPdfImport: Record<string, unknown>) {
  const candidates = [
    asRecord(aiPdfImport.adaptiveRereadRunPlan).sourceKind,
    asRecord(aiPdfImport.adaptiveRereadProviderRequestPlan).sourceKind,
    asRecord(aiPdfImport.adaptiveRereadPlan).sourceKind,
    asRecord(aiPdfImport.preanalysis).sourceKind,
    asRecord(aiPdfImport.packetPlan).sourceKind,
  ];

  return candidates.includes("single_image") ? "single_image" : "pdf";
}

function priorityValue(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "low" ? value : "medium";
}

function normalizeRereadRequests(
  aiPdfImport: Record<string, unknown>,
): AdaptiveRereadRequestMeta[] {
  return asArray(asRecord(aiPdfImport.adaptiveRereadPlan).requests)
    .map((item) => {
      const request = asRecord(item);
      const pageWindow = asRecord(request.pageWindow);

      return {
        assetRefs: asArray(request.assetRefs).map(String),
        kind: stringValue(request.kind),
        packetHashes: asArray(request.packetHashes).map(String),
        packetIds: asArray(request.packetIds).map(String),
        pageWindow: {
          originalPageNumbers: uniqueNumbers(
            asArray(pageWindow.originalPageNumbers).map(Number),
          ),
          pageNumbers: uniqueNumbers(asArray(pageWindow.pageNumbers).map(Number)),
        },
        priority: priorityValue(request.priority),
        rereadRequestHash: stringValue(request.rereadRequestHash),
        rereadRequestId: stringValue(request.rereadRequestId),
        warnings: asArray(request.warnings).map(String),
      };
    })
    .filter((request) => request.rereadRequestId || request.rereadRequestHash);
}

function normalizeProviderRequests(
  aiPdfImport: Record<string, unknown>,
): AdaptiveProviderRequestMeta[] {
  return asArray(asRecord(aiPdfImport.adaptiveRereadProviderRequestPlan).requests)
    .map((item) => {
      const request = asRecord(item);
      const inputRefs = asRecord(request.inputRefs);
      const pageWindow = asRecord(request.pageWindow);

      return {
        assetRefs: asArray(inputRefs.assetRefs).map(String),
        kind: stringValue(request.kind),
        packetHashes: asArray(request.packetHashes).map(String),
        packetIds: asArray(request.packetIds).map(String),
        pageNumbers: uniqueNumbers(
          asArray(pageWindow.pageNumbers || inputRefs.pageNumbers).map(Number),
        ),
        priority: priorityValue(request.priority),
        rereadRequestHash: stringValue(request.rereadRequestHash),
        rereadRequestId: stringValue(request.rereadRequestId),
        requestHash: stringValue(request.requestHash),
        requestId: stringValue(request.requestId),
        warnings: asArray(request.warnings).map(String),
      };
    })
    .filter((request) => request.requestId || request.requestHash);
}

function normalizeRunPlan(aiPdfImport: Record<string, unknown>) {
  const plan = asRecord(aiPdfImport.adaptiveRereadRunPlan);

  if (plan.version !== "adaptive_reread_run_plan_v1") {
    return null;
  }

  return {
    requestRuns: asArray(plan.requestRuns).map((item) => {
      const run = asRecord(item);
      const pageWindow = asRecord(run.pageWindow);
      const provider = asRecord(run.provider);

      return {
        assetRefs: asArray(run.assetRefs).map(String),
        dryRunOnly: plan.mode === "dry_run" || Boolean(run.dryRunResult),
        kind: stringValue(run.kind),
        packetHashes: asArray(run.packetHashes).map(String),
        packetIds: asArray(run.packetIds).map(String),
        pageNumbers: uniqueNumbers(asArray(pageWindow.pageNumbers).map(Number)),
        priority: priorityValue(run.priority),
        rereadRequestHash: stringValue(run.rereadRequestHash),
        rereadRequestId: stringValue(run.rereadRequestId),
        requestHash: stringValue(run.requestHash),
        requestId: stringValue(run.requestId),
        runId: stringValue(run.runId),
        status: stringValue(run.status),
        warnings: uniqueStrings([
          ...asArray(run.warnings).map(String),
          ...(provider.realCall === false
            ? ["adaptive_reread_merge_dry_run_only"]
            : []),
        ]),
      };
    }),
    sourceKind: plan.sourceKind === "single_image" ? "single_image" : "pdf",
    status: stringValue(plan.status),
    warnings: asArray(plan.warnings).map(String),
  };
}

function byRereadRequestId<T extends { rereadRequestHash: string; rereadRequestId: string }>(
  rows: T[],
) {
  const map = new Map<string, T>();

  for (const row of rows) {
    if (row.rereadRequestId) {
      map.set(`id:${row.rereadRequestId}`, row);
    }

    if (row.rereadRequestHash) {
      map.set(`hash:${row.rereadRequestHash}`, row);
    }
  }

  return map;
}

function lookupByReread<T extends { rereadRequestHash: string; rereadRequestId: string }>(
  map: Map<string, T>,
  rereadRequestId: string,
  rereadRequestHash: string,
) {
  return (
    (rereadRequestId ? map.get(`id:${rereadRequestId}`) : undefined) ??
    (rereadRequestHash ? map.get(`hash:${rereadRequestHash}`) : undefined) ??
    null
  );
}

function itemShapeForRun(run: AdaptiveRunMeta): {
  action: AIAdaptiveRereadMergeAction;
  field: AIAdaptiveRereadMergeField;
  reasonCode: AIAdaptiveRereadMergeReasonCode;
  reasonMessage: string;
} {
  if (run.status === "skipped") {
    return {
      action: "skip",
      field: "unknown",
      reasonCode:
        run.kind === "adaptive_review_only"
          ? "review_only"
          : "unsupported_merge_case",
      reasonMessage: `Adaptive reread run ${run.runId || run.requestId} is ${run.status || "skipped"} and remains review-only.`,
    };
  }

  if (run.kind === "adaptive_cross_page_text_extraction") {
    return {
      action: "suggest_extend_source_pages",
      field: "sourcePages",
      reasonCode: "source_page_extension_available",
      reasonMessage: "Bounded reread covers adjacent pages that may extend source page references.",
    };
  }

  if (run.kind === "adaptive_answer_key_review") {
    return {
      action: "flag_review_required",
      field: "answer",
      reasonCode: "answer_key_context_available",
      reasonMessage: "Answer-key context is available for human answer review.",
    };
  }

  if (run.kind === "adaptive_asset_context_review") {
    return {
      action: run.assetRefs.length > 0 ? "suggest_attach_asset_ref" : "flag_review_required",
      field: "assetRefs",
      reasonCode: "asset_context_available",
      reasonMessage: "Asset context is available as a suggestion only.",
    };
  }

  if (run.kind === "adaptive_low_text_confidence_review") {
    return {
      action: "flag_review_required",
      field: "confidence",
      reasonCode: "low_confidence_field",
      reasonMessage: "Low text confidence needs reviewer attention before any future merge.",
    };
  }

  if (run.kind === "adaptive_mixed_layout_review") {
    return {
      action: "flag_review_required",
      field: "reviewRequired",
      reasonCode: "review_only",
      reasonMessage: "Mixed layout reread is review-only until a future execution layer exists.",
    };
  }

  return {
    action: "skip",
    field: "unknown",
    reasonCode: "unsupported_merge_case",
    reasonMessage: `Adaptive reread request kind ${run.kind || "unknown"} is not mergeable in planning-only mode.`,
  };
}

function buildAdaptiveRereadMergeItem(
  input: MergeItemInput,
): AIAdaptiveRereadMergeItem {
  const mergeItemHash = stableHash({
    action: input.action,
    field: input.field,
    packetHash: input.packetHash,
    packetId: input.packetId,
    reasonCode: input.reasonCode,
    rereadRequestHash: input.rereadRequestHash ?? null,
    requestHash: input.requestHash ?? null,
    runId: input.runId ?? null,
  });

  return {
    action: input.action,
    confidence: Math.max(0, Math.min(1, input.confidence ?? 0.2)),
    field: input.field,
    mergeItemHash,
    mergeItemId: `adaptive-reread-merge-${mergeItemHash.slice(0, 12)}`,
    mergePolicy: MERGE_POLICY,
    packetHash: input.packetHash,
    packetId: input.packetId,
    priority: input.priority,
    reason: {
      code: input.reasonCode,
      evidenceRefs: {
        packetIds: uniqueStrings([input.packetId]),
        pageNumbers: uniqueNumbers([
          ...(input.originalPageNumbers ?? []),
          ...(input.rereadPageNumbers ?? []),
        ]),
        rereadRequestIds: uniqueStrings(
          input.rereadRequestId ? [input.rereadRequestId] : [],
        ),
        requestIds: uniqueStrings(input.requestId ? [input.requestId] : []),
        runIds: uniqueStrings(input.runId ? [input.runId] : []),
      },
      message: input.reasonMessage,
    },
    rereadRequestHash: input.rereadRequestHash ?? null,
    rereadRequestId: input.rereadRequestId ?? null,
    requestHash: input.requestHash ?? null,
    requestId: input.requestId ?? null,
    runId: input.runId ?? null,
    source: {
      assetRefs: uniqueStrings(input.assetRefs ?? []),
      originalPageNumbers: uniqueNumbers(input.originalPageNumbers ?? []),
      rereadPageNumbers: uniqueNumbers(input.rereadPageNumbers ?? []),
    },
    warnings: uniqueStrings([
      "adaptive_reread_merge_planning_only",
      "adaptive_reread_merge_no_official_merge",
      "adaptive_reread_merge_no_review_draft_write",
      "adaptive_reread_merge_review_required",
      ...(input.warnings ?? []),
    ]),
  };
}

function buildAdaptiveRereadMergeItems(
  aiPdfImport: Record<string, unknown>,
): AIAdaptiveRereadMergeItem[] {
  const runPlan = normalizeRunPlan(aiPdfImport);

  if (!runPlan) {
    return [];
  }

  const rereadRequestMap = byRereadRequestId(normalizeRereadRequests(aiPdfImport));
  const providerRequestMap = byRereadRequestId(
    normalizeProviderRequests(aiPdfImport),
  );
  const items: AIAdaptiveRereadMergeItem[] = [];

  for (const run of runPlan.requestRuns) {
    const rereadRequest = lookupByReread(
      rereadRequestMap,
      run.rereadRequestId,
      run.rereadRequestHash,
    );
    const providerRequest = lookupByReread(
      providerRequestMap,
      run.rereadRequestId,
      run.rereadRequestHash,
    );
    const shape = itemShapeForRun(run);
    const packetIds = run.packetIds.length
      ? run.packetIds
      : rereadRequest?.packetIds ?? providerRequest?.packetIds ?? [];
    const packetHashes = run.packetHashes.length
      ? run.packetHashes
      : rereadRequest?.packetHashes ?? providerRequest?.packetHashes ?? [];
    const originalPageNumbers = rereadRequest?.pageWindow.originalPageNumbers ?? [];
    const rereadPageNumbers = uniqueNumbers([
      ...run.pageNumbers,
      ...(providerRequest?.pageNumbers ?? []),
      ...(rereadRequest?.pageWindow.pageNumbers ?? []),
    ]);
    const assetRefs = uniqueStrings([
      ...run.assetRefs,
      ...(providerRequest?.assetRefs ?? []),
      ...(rereadRequest?.assetRefs ?? []),
    ]);
    const warnings = uniqueStrings([
      ...run.warnings,
      ...(providerRequest?.warnings ?? []),
      ...(rereadRequest?.warnings ?? []),
      ...(run.dryRunOnly ? ["adaptive_reread_merge_dry_run_only"] : []),
      ...(shape.action === "skip"
        ? ["adaptive_reread_merge_unknown_case_skipped"]
        : []),
    ]);

    for (const [index, packetId] of packetIds.entries()) {
      const packetHash = packetHashes[index] ?? "";

      if (!packetId || !packetHash) {
        items.push(
          buildAdaptiveRereadMergeItem({
            action: "skip",
            assetRefs,
            field: "unknown",
            originalPageNumbers,
            packetHash: packetHash || "missing-packet-hash",
            packetId: packetId || "missing-packet-id",
            priority: run.priority,
            reasonCode: "unsupported_merge_case",
            reasonMessage:
              "Adaptive reread merge item skipped because packet identity metadata is incomplete.",
            rereadPageNumbers,
            rereadRequestHash: run.rereadRequestHash,
            rereadRequestId: run.rereadRequestId,
            requestHash: run.requestHash,
            requestId: run.requestId,
            runId: run.runId,
            warnings: [...warnings, "adaptive_reread_merge_unknown_case_skipped"],
          }),
        );
        continue;
      }

      items.push(
        buildAdaptiveRereadMergeItem({
          action: shape.action,
          assetRefs,
          field: shape.field,
          originalPageNumbers,
          packetHash,
          packetId,
          priority: run.priority,
          reasonCode: shape.reasonCode,
          reasonMessage: shape.reasonMessage,
          rereadPageNumbers,
          rereadRequestHash: run.rereadRequestHash,
          rereadRequestId: run.rereadRequestId,
          requestHash: run.requestHash,
          requestId: run.requestId,
          runId: run.runId,
          warnings,
        }),
      );
    }
  }

  return items;
}

function planStats(
  mergeItems: AIAdaptiveRereadMergeItem[],
): AIAdaptiveRereadMergePlanStats {
  return {
    conflictCount: mergeItems.filter((item) => item.action === "flag_conflict")
      .length,
    highPriorityCount: mergeItems.filter((item) => item.priority === "high")
      .length,
    lowPriorityCount: mergeItems.filter((item) => item.priority === "low").length,
    mediumPriorityCount: mergeItems.filter((item) => item.priority === "medium")
      .length,
    mergeItemCount: mergeItems.length,
    packetCount: new Set(mergeItems.map((item) => item.packetId)).size,
    reviewRequiredCount: mergeItems.filter(
      (item) => item.mergePolicy.requireHumanReview,
    ).length,
    skippedCount: mergeItems.filter((item) => item.action === "skip").length,
  };
}

export function buildAIAdaptiveRereadMergePlanFromSummary(
  aiPdfImport: Record<string, unknown>,
): AIAdaptiveRereadMergePlan {
  const warnings = [
    "adaptive_reread_merge_planning_only",
    "adaptive_reread_merge_no_official_merge",
    "adaptive_reread_merge_no_review_draft_write",
    "adaptive_reread_merge_dry_run_only",
    "adaptive_reread_merge_review_required",
  ];
  const runPlan = normalizeRunPlan(aiPdfImport);

  if (!runPlan) {
    warnings.push("adaptive_reread_merge_missing_run_plan");

    return {
      generatedAt: new Date().toISOString(),
      mergeItems: [],
      mode: "planning_only",
      sourceKind: sourceKindFromSummary(aiPdfImport),
      stats: planStats([]),
      status: "skipped",
      version: "adaptive_reread_merge_plan_v1",
      warnings: uniqueStrings(warnings),
    };
  }

  const mergeItems = buildAdaptiveRereadMergeItems(aiPdfImport);

  warnings.push(...runPlan.warnings);

  if (mergeItems.length > 80) {
    warnings.push("adaptive_reread_merge_summary_limited");
  }

  if (mergeItems.some((item) => item.action === "skip")) {
    warnings.push("adaptive_reread_merge_unknown_case_skipped");
  }

  const stats = planStats(mergeItems);

  return {
    generatedAt: new Date().toISOString(),
    mergeItems,
    mode: "planning_only",
    sourceKind: runPlan.sourceKind === "single_image" ? "single_image" : "pdf",
    stats,
    status:
      runPlan.status === "failed"
        ? "failed"
        : mergeItems.length === 0
          ? "skipped"
          : warnings.length > 5 || stats.skippedCount > 0
            ? "completed_with_warnings"
            : "completed",
    version: "adaptive_reread_merge_plan_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function failedAIAdaptiveRereadMergePlan({
  generatedAt = new Date().toISOString(),
  sourceKind = "pdf",
  warnings,
}: {
  generatedAt?: string;
  sourceKind?: "pdf" | "single_image";
  warnings: string[];
}): AIAdaptiveRereadMergePlan {
  return {
    generatedAt,
    mergeItems: [],
    mode: "planning_only",
    sourceKind,
    stats: planStats([]),
    status: "failed",
    version: "adaptive_reread_merge_plan_v1",
    warnings,
  };
}

export function mergeAIAdaptiveRereadMergePlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  adaptiveRereadMergePlan: AIAdaptiveRereadMergePlan,
) {
  return {
    ...existingAiPdfImport,
    adaptiveRereadMergePlan,
  };
}
