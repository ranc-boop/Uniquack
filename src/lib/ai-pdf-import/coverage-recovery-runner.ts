import crypto from "node:crypto";

import type {
  AICoverageRecoveryPlan,
  AICoverageRecoveryRequestDraft,
  AICoverageRecoveryRequestKind,
} from "./coverage-recovery";

type AICoverageRecoveryRunPlanVersion =
  "coverage_recovery_run_plan_v1";

type AICoverageRecoveryRunPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

type AICoverageRecoveryRunItemStatus =
  | "dry_run_ready"
  | "dry_run_skipped"
  | "dry_run_blocked";

type AICoverageRecoveryRunSkipReason =
  | "manual_review_only"
  | "missing_request_draft"
  | "missing_page_numbers"
  | "invalid_prompt_contract"
  | "real_call_not_allowed"
  | "unsupported_request_kind"
  | "unknown";

export interface AICoverageRecoveryRunPlan {
  generatedAt: string;
  mode: "dry_run_only";
  runItems: AICoverageRecoveryRunItem[];
  skippedItems: AICoverageRecoverySkippedRunItem[];
  sourceKind: "pdf" | "single_image";
  sourceRecoveryPlanPresent: boolean;
  stats: AICoverageRecoveryRunPlanStats;
  status: AICoverageRecoveryRunPlanStatus;
  version: AICoverageRecoveryRunPlanVersion;
  warnings: string[];
}

export interface AICoverageRecoveryRunItem {
  batchIds: string[];
  dryRunResult: AICoverageRecoveryDryRunResult;
  packetIds: string[];
  pageNumbers: number[];
  requestKind: AICoverageRecoveryRequestKind;
  runItemHash: string;
  runItemId: string;
  safety: {
    dbMutationExecuted: false;
    dryRunOnly: true;
    fakeRecoveredContentGenerated: false;
    officialMergeExecuted: false;
    providerCallExecuted: false;
    rawResponseStored: false;
    realProviderCall: false;
    reviewDraftWriteExecuted: false;
  };
  sourceRequestHash: string;
  sourceRequestId: string;
  sourceTaskId: string;
  status: AICoverageRecoveryRunItemStatus;
  validation: AICoverageRecoveryRunValidation;
  warnings: string[];
}

interface AICoverageRecoveryRunValidation {
  blocksCoveredPageReextraction: boolean;
  errors: string[];
  hasBoundedPages: boolean;
  hasCompletionSentinelRequirement: boolean;
  hasSourcePageRefsRequirement: boolean;
  noDbMutationTrue: boolean;
  noProviderCallTrue: boolean;
  noReviewDraftWriteTrue: boolean;
  preservesExistingDrafts: boolean;
  realCallFalse: boolean;
  shadowOnlyTrue: boolean;
  valid: boolean;
  warnings: string[];
}

interface AICoverageRecoveryDryRunResult {
  boundedPageEnd: number | null;
  boundedPageStart: number | null;
  expectedOutputContract: {
    completionSentinelRequired: true;
    humanReviewRequired: true;
    partialRecoveryAllowed: true;
    recoveredQuestionsAllowed: true;
    sourcePageRefsRequired: true;
  };
  futureProviderStrategy:
    | "page_images"
    | "gemini_native_page_window"
    | "text_window"
    | "manual_review"
    | "unknown";
  message: string;
  simulatedContent: null;
  wouldRunInFuture: boolean;
}

export interface AICoverageRecoverySkippedRunItem {
  message: string;
  reason: AICoverageRecoveryRunSkipReason;
  sourceRequestId: string | null;
  sourceTaskId: string | null;
}

interface AICoverageRecoveryRunPlanStats {
  dryRunBlockedCount: number;
  dryRunReadyCount: number;
  dryRunSkippedCount: number;
  failedChunkRunCount: number;
  manualReviewOnlyCount: number;
  requestDraftCount: number;
  runItemCount: number;
  terminalPageRunCount: number;
  uncoveredPageRunCount: number;
  warningCount: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
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

function stableId(prefix: string, value: unknown) {
  return `${prefix}-${stableHash(value).slice(0, 12)}`;
}

function aiPdfImportFromSummary(value: unknown) {
  const record = asRecord(value);
  const aiPdfImport = asRecord(record.aiPdfImport);

  return Object.keys(aiPdfImport).length ? aiPdfImport : record;
}

function recoveryPlanFromSummary(value: unknown) {
  return asRecord(
    aiPdfImportFromSummary(value).coverageRecoveryPlan,
  ) as Partial<AICoverageRecoveryPlan>;
}

function requestDraftsFromPlan(
  plan: Partial<AICoverageRecoveryPlan>,
): AICoverageRecoveryRequestDraft[] {
  return asArray(plan.requestDrafts) as AICoverageRecoveryRequestDraft[];
}

function requestWarningForReason(reason: AICoverageRecoveryRunSkipReason) {
  if (reason === "manual_review_only") {
    return "coverage_recovery_run_manual_review_only";
  }

  if (reason === "missing_page_numbers") {
    return "coverage_recovery_run_missing_page_numbers";
  }

  if (reason === "invalid_prompt_contract") {
    return "coverage_recovery_run_request_blocked";
  }

  if (reason === "real_call_not_allowed") {
    return "coverage_recovery_run_real_call_blocked";
  }

  if (reason === "unsupported_request_kind") {
    return "coverage_recovery_run_unsupported_request_kind";
  }

  return "coverage_recovery_run_request_skipped";
}

function skipReasonFromValidation(
  validation: AICoverageRecoveryRunValidation,
): AICoverageRecoveryRunSkipReason {
  if (!validation.hasBoundedPages) {
    return "missing_page_numbers";
  }

  if (!validation.realCallFalse || !validation.shadowOnlyTrue) {
    return "real_call_not_allowed";
  }

  if (!validation.valid) {
    return "invalid_prompt_contract";
  }

  return "unknown";
}

function supportedRequestKind(kind: string): kind is AICoverageRecoveryRequestKind {
  return [
    "coverage_terminal_page_extraction",
    "coverage_uncovered_page_extraction",
    "coverage_failed_chunk_retry",
    "coverage_low_packet_review",
    "coverage_manual_review_only",
  ].includes(kind);
}

function pageBounds(pageNumbers: number[]) {
  const unique = uniqueNumbers(pageNumbers);

  return {
    pageEnd: unique[unique.length - 1] ?? null,
    pageNumbers: unique,
    pageStart: unique[0] ?? null,
  };
}

function validateCoverageRecoveryRequestDraft(
  request: Partial<AICoverageRecoveryRequestDraft>,
): AICoverageRecoveryRunValidation {
  const promptContract = asRecord(request.promptContract);
  const providerRouting = asRecord(request.providerRouting);
  const safety = asRecord(request.safety);
  const pageNumbers = uniqueNumbers(asArray(request.pageNumbers) as number[]);
  const validation = {
    blocksCoveredPageReextraction:
      promptContract.doNotReextractCoveredPages === true,
    errors: [] as string[],
    hasBoundedPages: pageNumbers.length > 0,
    hasCompletionSentinelRequirement:
      promptContract.requireCompletionSentinel === true,
    hasSourcePageRefsRequirement: promptContract.requireSourcePageRefs === true,
    noDbMutationTrue: safety.noDbMutation === true,
    noProviderCallTrue: safety.noProviderCall === true,
    noReviewDraftWriteTrue: safety.noReviewDraftWrite === true,
    preservesExistingDrafts: promptContract.preserveExistingDrafts === true,
    realCallFalse: providerRouting.realCall === false,
    shadowOnlyTrue: providerRouting.shadowOnly === true,
    valid: false,
    warnings: [] as string[],
  };

  if (!validation.hasBoundedPages) {
    validation.errors.push("Recovery request is missing bounded page numbers.");
  }

  if (!validation.realCallFalse) {
    validation.errors.push("Recovery request is not marked realCall=false.");
  }

  if (!validation.shadowOnlyTrue) {
    validation.errors.push("Recovery request is not marked shadowOnly=true.");
  }

  if (!validation.noProviderCallTrue) {
    validation.errors.push("Recovery request does not block provider calls.");
  }

  if (!validation.noReviewDraftWriteTrue) {
    validation.errors.push("Recovery request does not block Review Draft writes.");
  }

  if (!validation.noDbMutationTrue) {
    validation.errors.push("Recovery request does not block DB mutation.");
  }

  if (!validation.hasSourcePageRefsRequirement) {
    validation.errors.push("Recovery request does not require source page refs.");
  }

  if (!validation.hasCompletionSentinelRequirement) {
    validation.errors.push("Recovery request does not require a completion sentinel.");
  }

  if (!validation.preservesExistingDrafts) {
    validation.errors.push("Recovery request does not preserve existing drafts.");
  }

  if (!validation.blocksCoveredPageReextraction) {
    validation.errors.push("Recovery request may re-extract covered pages.");
  }

  validation.valid = validation.errors.length === 0;

  if (!validation.valid) {
    validation.warnings.push("coverage_recovery_run_request_blocked");
  }

  return validation;
}

function buildCoverageRecoveryDryRunResult({
  request,
  validation,
}: {
  request: Partial<AICoverageRecoveryRequestDraft>;
  validation: AICoverageRecoveryRunValidation;
}): AICoverageRecoveryDryRunResult {
  const { pageEnd, pageStart } = pageBounds(
    asArray(request.pageNumbers) as number[],
  );
  const providerRouting = asRecord(request.providerRouting);
  const preferredStrategy =
    typeof providerRouting.preferredStrategy === "string"
      ? providerRouting.preferredStrategy
      : "unknown";
  const futureProviderStrategy = [
    "page_images",
    "gemini_native_page_window",
    "text_window",
    "manual_review",
  ].includes(preferredStrategy)
    ? (preferredStrategy as AICoverageRecoveryDryRunResult["futureProviderStrategy"])
    : "unknown";

  return {
    boundedPageEnd: pageEnd,
    boundedPageStart: pageStart,
    expectedOutputContract: {
      completionSentinelRequired: true,
      humanReviewRequired: true,
      partialRecoveryAllowed: true,
      recoveredQuestionsAllowed: true,
      sourcePageRefsRequired: true,
    },
    futureProviderStrategy,
    message: validation.valid
      ? "Dry run passed. Future recovery may run only after an explicit execution PR."
      : "Dry run blocked. Fix request contract before future recovery execution.",
    simulatedContent: null,
    wouldRunInFuture: validation.valid && futureProviderStrategy !== "manual_review",
  };
}

function buildCoverageRecoveryRunItem(
  request: Partial<AICoverageRecoveryRequestDraft>,
): {
  item: AICoverageRecoveryRunItem | null;
  skippedItem: AICoverageRecoverySkippedRunItem | null;
} {
  const sourceRequestId =
    typeof request.requestId === "string" ? request.requestId : null;
  const sourceTaskId =
    typeof request.sourceTaskId === "string" ? request.sourceTaskId : null;

  if (!sourceRequestId) {
    return {
      item: null,
      skippedItem: {
        message: "Recovery request draft is missing a request id.",
        reason: "missing_request_draft",
        sourceRequestId,
        sourceTaskId,
      },
    };
  }

  if (!sourceTaskId) {
    return {
      item: null,
      skippedItem: {
        message: "Recovery request draft is missing a source task id.",
        reason: "missing_request_draft",
        sourceRequestId,
        sourceTaskId,
      },
    };
  }

  const requestKind =
    typeof request.requestKind === "string" ? request.requestKind : "";

  if (!supportedRequestKind(requestKind)) {
    return {
      item: null,
      skippedItem: {
        message: "Recovery request draft has an unsupported request kind.",
        reason: "unsupported_request_kind",
        sourceRequestId,
        sourceTaskId,
      },
    };
  }

  if (requestKind === "coverage_manual_review_only") {
    return {
      item: null,
      skippedItem: {
        message: "Manual review recovery requests are not executable in dry-run.",
        reason: "manual_review_only",
        sourceRequestId,
        sourceTaskId,
      },
    };
  }

  const validation = validateCoverageRecoveryRequestDraft(request);
  const dryRunResult = buildCoverageRecoveryDryRunResult({ request, validation });
  const { pageNumbers } = pageBounds(asArray(request.pageNumbers) as number[]);
  const status: AICoverageRecoveryRunItemStatus = validation.valid
    ? "dry_run_ready"
    : "dry_run_blocked";
  const runItemHash = stableHash({
    requestHash: request.requestHash,
    requestId: sourceRequestId,
    requestKind,
    sourceTaskId,
    status,
  });
  const skippedReason = validation.valid ? null : skipReasonFromValidation(validation);
  const warnings = uniqueStrings([
    "coverage_recovery_run_dry_run_only",
    "coverage_recovery_run_no_provider_call",
    "coverage_recovery_run_no_execution",
    "coverage_recovery_run_no_review_draft_write",
    "coverage_recovery_run_no_db_mutation",
    ...validation.warnings,
    ...(skippedReason ? [requestWarningForReason(skippedReason)] : []),
  ]);

  return {
    item: {
      batchIds: uniqueStrings(asArray(request.batchIds) as string[]),
      dryRunResult,
      packetIds: uniqueStrings(asArray(request.packetIds) as string[]),
      pageNumbers,
      requestKind,
      runItemHash,
      runItemId: stableId("coverage-run", {
        requestHash: request.requestHash,
        requestId: sourceRequestId,
        sourceTaskId,
      }),
      safety: {
        dbMutationExecuted: false,
        dryRunOnly: true,
        fakeRecoveredContentGenerated: false,
        officialMergeExecuted: false,
        providerCallExecuted: false,
        rawResponseStored: false,
        realProviderCall: false,
        reviewDraftWriteExecuted: false,
      },
      sourceRequestHash:
        typeof request.requestHash === "string" ? request.requestHash : "",
      sourceRequestId,
      sourceTaskId,
      status,
      validation,
      warnings,
    },
    skippedItem: validation.valid
      ? null
      : {
          message: validation.errors[0] ?? "Recovery request dry-run blocked.",
          reason: skippedReason ?? "unknown",
          sourceRequestId,
          sourceTaskId,
        },
  };
}

function planWarnings({
  planPresent,
  runItems,
  skippedItems,
}: {
  planPresent: boolean;
  runItems: AICoverageRecoveryRunItem[];
  skippedItems: AICoverageRecoverySkippedRunItem[];
}) {
  const warnings = [
    "coverage_recovery_run_dry_run_only",
    "coverage_recovery_run_no_provider_call",
    "coverage_recovery_run_no_execution",
    "coverage_recovery_run_no_review_draft_write",
    "coverage_recovery_run_no_db_mutation",
    "coverage_recovery_run_summary_limited",
  ];

  if (!planPresent) {
    warnings.push("coverage_recovery_run_missing_recovery_plan");
  }

  if (runItems.some((item) => item.status === "dry_run_blocked")) {
    warnings.push("coverage_recovery_run_request_blocked");
  }

  if (skippedItems.some((item) => item.reason === "manual_review_only")) {
    warnings.push("coverage_recovery_run_manual_review_only");
  }

  return uniqueStrings(warnings);
}

function buildStats({
  requestDrafts,
  runItems,
  skippedItems,
  warnings,
}: {
  requestDrafts: AICoverageRecoveryRequestDraft[];
  runItems: AICoverageRecoveryRunItem[];
  skippedItems: AICoverageRecoverySkippedRunItem[];
  warnings: string[];
}): AICoverageRecoveryRunPlanStats {
  return {
    dryRunBlockedCount: runItems.filter(
      (item) => item.status === "dry_run_blocked",
    ).length,
    dryRunReadyCount: runItems.filter((item) => item.status === "dry_run_ready")
      .length,
    dryRunSkippedCount: skippedItems.length,
    failedChunkRunCount: runItems.filter(
      (item) => item.requestKind === "coverage_failed_chunk_retry",
    ).length,
    manualReviewOnlyCount: skippedItems.filter(
      (item) => item.reason === "manual_review_only",
    ).length,
    requestDraftCount: requestDrafts.length,
    runItemCount: runItems.length,
    terminalPageRunCount: runItems.filter(
      (item) => item.requestKind === "coverage_terminal_page_extraction",
    ).length,
    uncoveredPageRunCount: runItems.filter(
      (item) => item.requestKind === "coverage_uncovered_page_extraction",
    ).length,
    warningCount: warnings.length + runItems.reduce((sum, item) => sum + item.warnings.length, 0),
  };
}

export function buildAICoverageRecoveryRunPlanFromSummary(
  summaryInput: unknown,
  generatedAt = new Date().toISOString(),
): AICoverageRecoveryRunPlan {
  const recoveryPlan = recoveryPlanFromSummary(summaryInput);
  const planPresent = recoveryPlan.version === "coverage_recovery_plan_v1";

  if (!planPresent) {
    const requestDrafts: AICoverageRecoveryRequestDraft[] = [];
    const runItems: AICoverageRecoveryRunItem[] = [];
    const skippedItems: AICoverageRecoverySkippedRunItem[] = [
      {
        message: "Coverage recovery plan is missing; dry-run skipped.",
        reason: "missing_request_draft",
        sourceRequestId: null,
        sourceTaskId: null,
      },
    ];
    const warnings = planWarnings({ planPresent, runItems, skippedItems });

    return {
      generatedAt,
      mode: "dry_run_only",
      runItems,
      skippedItems,
      sourceKind: "pdf",
      sourceRecoveryPlanPresent: false,
      stats: buildStats({ requestDrafts, runItems, skippedItems, warnings }),
      status: "skipped",
      version: "coverage_recovery_run_plan_v1",
      warnings,
    };
  }

  const requestDrafts = requestDraftsFromPlan(recoveryPlan);
  const runItems: AICoverageRecoveryRunItem[] = [];
  const skippedItems: AICoverageRecoverySkippedRunItem[] = [];

  for (const request of requestDrafts) {
    const { item, skippedItem } = buildCoverageRecoveryRunItem(request);

    if (item) {
      runItems.push(item);
    }

    if (skippedItem) {
      skippedItems.push(skippedItem);
    }
  }

  const warnings = planWarnings({ planPresent, runItems, skippedItems });
  const blockedCount = runItems.filter(
    (item) => item.status === "dry_run_blocked",
  ).length;

  return {
    generatedAt,
    mode: "dry_run_only",
    runItems,
    skippedItems,
    sourceKind: recoveryPlan.sourceKind === "single_image" ? "single_image" : "pdf",
    sourceRecoveryPlanPresent: true,
    stats: buildStats({ requestDrafts, runItems, skippedItems, warnings }),
    status:
      blockedCount > 0
        ? "completed_with_warnings"
        : skippedItems.length > 0 || warnings.length > 6
          ? "completed_with_warnings"
          : "completed",
    version: "coverage_recovery_run_plan_v1",
    warnings,
  };
}

export function failedAICoverageRecoveryRunPlan({
  generatedAt = new Date().toISOString(),
  warnings,
}: {
  generatedAt?: string;
  warnings: string[];
}): AICoverageRecoveryRunPlan {
  const requestDrafts: AICoverageRecoveryRequestDraft[] = [];
  const runItems: AICoverageRecoveryRunItem[] = [];
  const skippedItems: AICoverageRecoverySkippedRunItem[] = [];
  const finalWarnings = uniqueStrings([
    "coverage_recovery_run_dry_run_only",
    "coverage_recovery_run_no_provider_call",
    "coverage_recovery_run_no_execution",
    ...warnings,
  ]);

  return {
    generatedAt,
    mode: "dry_run_only",
    runItems,
    skippedItems,
    sourceKind: "pdf",
    sourceRecoveryPlanPresent: false,
    stats: buildStats({
      requestDrafts,
      runItems,
      skippedItems,
      warnings: finalWarnings,
    }),
    status: "failed",
    version: "coverage_recovery_run_plan_v1",
    warnings: finalWarnings,
  };
}

export function mergeAICoverageRecoveryRunPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  coverageRecoveryRunPlan: AICoverageRecoveryRunPlan,
) {
  return {
    ...existingAiPdfImport,
    coverageRecoveryRunPlan,
  };
}
