import crypto from "node:crypto";

import type {
  AICoverageRecoveryRunItem,
  AICoverageRecoveryRunPlan,
  AICoverageRecoverySkippedRunItem,
} from "./coverage-recovery-runner";

type AICoverageRecoveryMergePlanVersion =
  "coverage_recovery_merge_plan_v1";

type AICoverageRecoveryMergePlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

type AICoverageRecoveryMergeItemKind =
  | "future_recovered_question_suggestion"
  | "future_asset_link_suggestion"
  | "future_answer_key_suggestion"
  | "duplicate_risk_review"
  | "manual_review_only"
  | "no_recovered_content_available";

type AICoverageRecoveryMergeItemStatus =
  | "planned"
  | "blocked_until_recovery_result"
  | "manual_review_required"
  | "skipped";

export interface AICoverageRecoveryMergePlan {
  duplicateGuards: AICoverageRecoveryDuplicateGuard[];
  generatedAt: string;
  mergeItems: AICoverageRecoveryMergeItem[];
  mergePolicy: AICoverageRecoveryMergePolicy;
  mode: "planning_only";
  sourceKind: "pdf" | "single_image";
  sourceRecoveryRunPlanPresent: boolean;
  stats: AICoverageRecoveryMergePlanStats;
  status: AICoverageRecoveryMergePlanStatus;
  version: AICoverageRecoveryMergePlanVersion;
  warnings: string[];
}

interface AICoverageRecoveryMergeItem {
  batchIds: string[];
  evidence: AICoverageRecoveryMergeEvidence[];
  kind: AICoverageRecoveryMergeItemKind;
  mergeItemHash: string;
  mergeItemId: string;
  packetIds: string[];
  pageNumbers: number[];
  plannedSuggestion: AICoverageRecoveryPlannedSuggestion;
  review: AICoverageRecoveryMergeReview;
  safety: AICoverageRecoveryMergeSafety;
  sourceRequestId: string | null;
  sourceRunItemId: string | null;
  sourceTaskId: string | null;
  status: AICoverageRecoveryMergeItemStatus;
  warnings: string[];
}

interface AICoverageRecoveryPlannedSuggestion {
  contentAvailableNow: false;
  expectedFutureFields: string[];
  futureRecoveredContentRequired: true;
  mergeMode:
    | "append_as_review_suggestion"
    | "attach_to_existing_question_as_suggestion"
    | "manual_review_only";
  recoveredContentPlaceholder: null;
  suggestionKind:
    | "recovered_question"
    | "asset_link"
    | "answer_key_link"
    | "duplicate_check"
    | "manual_review";
  targetPages: number[];
}

interface AICoverageRecoveryMergeSafety {
  attachAsSuggestionOnly: true;
  deleteExistingDraft: false;
  mutateExistingQuestion: false;
  noFakeRecoveredContent: true;
  officialMerge: false;
  overwriteExistingDraft: false;
  planningOnly: true;
  preserveExistingDrafts: true;
  requireHumanReview: true;
  reviewDraftWrite: false;
}

interface AICoverageRecoveryMergeReview {
  approved: false;
  executed: false;
  reason:
    | "future_recovered_content_requires_review"
    | "possible_duplicate"
    | "missing_recovery_result"
    | "manual_review_only"
    | "coverage_gap";
  required: true;
  reviewerRole: "admin" | "teacher" | "curriculum_reviewer";
}

interface AICoverageRecoveryMergeEvidence {
  batchIds: string[];
  kind:
    | "coverage_audit_risk"
    | "coverage_recovery_task"
    | "coverage_recovery_request"
    | "coverage_recovery_run_item"
    | "page_gap"
    | "packet_gap"
    | "duplicate_guard";
  message: string;
  packetIds: string[];
  pageNumbers: number[];
  sourceIds: string[];
}

interface AICoverageRecoveryDuplicateGuard {
  currentResult: "not_run_planning_only";
  guardId: string;
  pageNumbers: number[];
  packetIds: string[];
  requiredBeforeExecution: true;
  rule:
    | "same_page_existing_draft_check"
    | "same_packet_existing_draft_check"
    | "same_question_code_check"
    | "text_similarity_future_check"
    | "asset_overlap_future_check";
  sourceMergeItemId: string;
  warning: string;
}

interface AICoverageRecoveryMergePolicy {
  completionSentinelRequired: true;
  dbMutationAllowedNow: false;
  duplicateHandling: "block_or_review_on_duplicate_risk";
  existingDraftsHandling: "preserve_all_existing_drafts";
  humanReviewRequired: true;
  notes: string[];
  officialMergeAllowed: false;
  policyVersion: "coverage_recovery_merge_policy_v1";
  recoveredQuestionsDefaultMode: "append_as_review_suggestion";
  reviewDraftWriteAllowedNow: false;
  sourcePageRefsRequired: true;
}

interface AICoverageRecoveryMergePlanStats {
  blockedUntilRecoveryResultCount: number;
  duplicateGuardCount: number;
  futureSuggestionCount: number;
  highRiskPageCount: number;
  manualReviewOnlyCount: number;
  mergeItemCount: number;
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

function runPlanFromSummary(value: unknown) {
  return asRecord(
    aiPdfImportFromSummary(value).coverageRecoveryRunPlan,
  ) as Partial<AICoverageRecoveryRunPlan>;
}

function runItemsFromPlan(
  plan: Partial<AICoverageRecoveryRunPlan>,
): AICoverageRecoveryRunItem[] {
  return asArray(plan.runItems) as AICoverageRecoveryRunItem[];
}

function skippedItemsFromPlan(
  plan: Partial<AICoverageRecoveryRunPlan>,
): AICoverageRecoverySkippedRunItem[] {
  return asArray(plan.skippedItems) as AICoverageRecoverySkippedRunItem[];
}

function safety(): AICoverageRecoveryMergeSafety {
  return {
    attachAsSuggestionOnly: true,
    deleteExistingDraft: false,
    mutateExistingQuestion: false,
    noFakeRecoveredContent: true,
    officialMerge: false,
    overwriteExistingDraft: false,
    planningOnly: true,
    preserveExistingDrafts: true,
    requireHumanReview: true,
    reviewDraftWrite: false,
  };
}

function review(
  reason: AICoverageRecoveryMergeReview["reason"],
): AICoverageRecoveryMergeReview {
  return {
    approved: false,
    executed: false,
    reason,
    required: true,
    reviewerRole: "admin",
  };
}

function evidence({
  batchIds = [],
  kind,
  message,
  packetIds = [],
  pageNumbers = [],
  sourceIds = [],
}: {
  batchIds?: string[];
  kind: AICoverageRecoveryMergeEvidence["kind"];
  message: string;
  packetIds?: string[];
  pageNumbers?: number[];
  sourceIds?: string[];
}): AICoverageRecoveryMergeEvidence {
  return {
    batchIds: uniqueStrings(batchIds),
    kind,
    message,
    packetIds: uniqueStrings(packetIds),
    pageNumbers: uniqueNumbers(pageNumbers),
    sourceIds: uniqueStrings(sourceIds),
  };
}

function plannedSuggestion({
  mergeMode = "append_as_review_suggestion",
  suggestionKind = "recovered_question",
  targetPages,
}: {
  mergeMode?: AICoverageRecoveryPlannedSuggestion["mergeMode"];
  suggestionKind?: AICoverageRecoveryPlannedSuggestion["suggestionKind"];
  targetPages: number[];
}): AICoverageRecoveryPlannedSuggestion {
  const expectedFutureFields =
    suggestionKind === "recovered_question"
      ? [
          "question_number",
          "title",
          "content_html",
          "content_source",
          "solution_html",
          "solution_source",
          "source_page_refs",
          "confidence",
          "warnings",
          "completion_sentinel",
        ]
      : ["source_page_refs", "confidence", "warnings", "completion_sentinel"];

  return {
    contentAvailableNow: false,
    expectedFutureFields,
    futureRecoveredContentRequired: true,
    mergeMode,
    recoveredContentPlaceholder: null,
    suggestionKind,
    targetPages: uniqueNumbers(targetPages),
  };
}

function buildCoverageRecoveryMergeItemFromRunItem(
  runItem: AICoverageRecoveryRunItem,
): AICoverageRecoveryMergeItem {
  const pageNumbers = uniqueNumbers(runItem.pageNumbers);
  const mergeItemHash = stableHash({
    pageNumbers,
    requestKind: runItem.requestKind,
    runItemHash: runItem.runItemHash,
    runItemId: runItem.runItemId,
    sourceRequestId: runItem.sourceRequestId,
  });
  const status: AICoverageRecoveryMergeItemStatus =
    runItem.status === "dry_run_ready"
      ? "blocked_until_recovery_result"
      : "manual_review_required";
  const kind: AICoverageRecoveryMergeItemKind =
    runItem.status === "dry_run_ready"
      ? "future_recovered_question_suggestion"
      : "manual_review_only";
  const mergeItemId = `coverage-merge-${mergeItemHash.slice(0, 12)}`;

  return {
    batchIds: uniqueStrings(runItem.batchIds),
    evidence: [
      evidence({
        batchIds: runItem.batchIds,
        kind: "coverage_recovery_run_item",
        message: `Merge policy placeholder for recovery run item ${runItem.runItemId}.`,
        packetIds: runItem.packetIds,
        pageNumbers,
        sourceIds: [
          runItem.runItemId,
          runItem.sourceRequestId,
          runItem.sourceTaskId,
        ],
      }),
      evidence({
        kind: "page_gap",
        message: "Future recovered content must cite these source pages.",
        pageNumbers,
        sourceIds: [runItem.runItemId],
      }),
    ],
    kind,
    mergeItemHash,
    mergeItemId,
    packetIds: uniqueStrings(runItem.packetIds),
    pageNumbers,
    plannedSuggestion: plannedSuggestion({ targetPages: pageNumbers }),
    review: review(
      status === "blocked_until_recovery_result"
        ? "missing_recovery_result"
        : "manual_review_only",
    ),
    safety: safety(),
    sourceRequestId: runItem.sourceRequestId,
    sourceRunItemId: runItem.runItemId,
    sourceTaskId: runItem.sourceTaskId,
    status,
    warnings: uniqueStrings([
      "coverage_recovery_merge_planning_only",
      "coverage_recovery_merge_no_recovered_content",
      "coverage_recovery_merge_human_review_required",
      "coverage_recovery_merge_duplicate_guard_required",
    ]),
  };
}

function buildManualReviewItemFromSkippedRunItem(
  skippedItem: AICoverageRecoverySkippedRunItem,
): AICoverageRecoveryMergeItem {
  const mergeItemHash = stableHash({
    reason: skippedItem.reason,
    sourceRequestId: skippedItem.sourceRequestId,
    sourceTaskId: skippedItem.sourceTaskId,
  });
  const mergeItemId = `coverage-merge-${mergeItemHash.slice(0, 12)}`;

  return {
    batchIds: [],
    evidence: [
      evidence({
        kind: "coverage_recovery_run_item",
        message: skippedItem.message,
        sourceIds: [
          skippedItem.sourceRequestId ?? "",
          skippedItem.sourceTaskId ?? "",
        ],
      }),
    ],
    kind: "manual_review_only",
    mergeItemHash,
    mergeItemId,
    packetIds: [],
    pageNumbers: [],
    plannedSuggestion: plannedSuggestion({
      mergeMode: "manual_review_only",
      suggestionKind: "manual_review",
      targetPages: [],
    }),
    review: review("manual_review_only"),
    safety: safety(),
    sourceRequestId: skippedItem.sourceRequestId,
    sourceRunItemId: null,
    sourceTaskId: skippedItem.sourceTaskId,
    status: "manual_review_required",
    warnings: uniqueStrings([
      "coverage_recovery_merge_planning_only",
      "coverage_recovery_merge_manual_review_only",
    ]),
  };
}

function buildNoRecoveredContentItem(): AICoverageRecoveryMergeItem {
  const mergeItemHash = stableHash({
    kind: "no_recovered_content_available",
  });
  const mergeItemId = `coverage-merge-${mergeItemHash.slice(0, 12)}`;

  return {
    batchIds: [],
    evidence: [
      evidence({
        kind: "coverage_recovery_run_item",
        message: "No recovered content exists in this planning-only foundation.",
      }),
    ],
    kind: "no_recovered_content_available",
    mergeItemHash,
    mergeItemId,
    packetIds: [],
    pageNumbers: [],
    plannedSuggestion: plannedSuggestion({
      mergeMode: "manual_review_only",
      suggestionKind: "manual_review",
      targetPages: [],
    }),
    review: review("missing_recovery_result"),
    safety: safety(),
    sourceRequestId: null,
    sourceRunItemId: null,
    sourceTaskId: null,
    status: "skipped",
    warnings: uniqueStrings([
      "coverage_recovery_merge_planning_only",
      "coverage_recovery_merge_no_recovered_content",
    ]),
  };
}

function buildCoverageRecoveryMergeItems(
  runPlan: Partial<AICoverageRecoveryRunPlan>,
): AICoverageRecoveryMergeItem[] {
  const items = [
    ...runItemsFromPlan(runPlan).map(buildCoverageRecoveryMergeItemFromRunItem),
    ...skippedItemsFromPlan(runPlan).map(buildManualReviewItemFromSkippedRunItem),
  ];

  if (!items.length && runPlan.version === "coverage_recovery_run_plan_v1") {
    items.push(buildNoRecoveredContentItem());
  }

  return items;
}

function buildCoverageRecoveryDuplicateGuards(
  mergeItems: AICoverageRecoveryMergeItem[],
): AICoverageRecoveryDuplicateGuard[] {
  const rules: AICoverageRecoveryDuplicateGuard["rule"][] = [
    "same_page_existing_draft_check",
    "same_packet_existing_draft_check",
    "same_question_code_check",
    "text_similarity_future_check",
    "asset_overlap_future_check",
  ];
  const guards: AICoverageRecoveryDuplicateGuard[] = [];

  for (const item of mergeItems) {
    if (item.kind !== "future_recovered_question_suggestion") {
      continue;
    }

    for (const rule of rules) {
      const guardId = stableId("coverage-guard", {
        mergeItemId: item.mergeItemId,
        rule,
      });

      guards.push({
        currentResult: "not_run_planning_only",
        guardId,
        pageNumbers: item.pageNumbers,
        packetIds: item.packetIds,
        requiredBeforeExecution: true,
        rule,
        sourceMergeItemId: item.mergeItemId,
        warning: `Duplicate guard ${rule} must run before future recovery execution.`,
      });
    }
  }

  return guards;
}

function buildCoverageRecoveryMergePolicy(): AICoverageRecoveryMergePolicy {
  return {
    completionSentinelRequired: true,
    dbMutationAllowedNow: false,
    duplicateHandling: "block_or_review_on_duplicate_risk",
    existingDraftsHandling: "preserve_all_existing_drafts",
    humanReviewRequired: true,
    notes: [
      "Coverage recovery merge is planning-only in this PR.",
      "Future recovered content must be attached as a review suggestion.",
      "Existing drafts must be preserved and duplicate guards must pass before any execution PR.",
    ],
    officialMergeAllowed: false,
    policyVersion: "coverage_recovery_merge_policy_v1",
    recoveredQuestionsDefaultMode: "append_as_review_suggestion",
    reviewDraftWriteAllowedNow: false,
    sourcePageRefsRequired: true,
  };
}

function planWarnings({
  duplicateGuards,
  mergeItems,
  runPlanPresent,
}: {
  duplicateGuards: AICoverageRecoveryDuplicateGuard[];
  mergeItems: AICoverageRecoveryMergeItem[];
  runPlanPresent: boolean;
}) {
  const warnings = [
    "coverage_recovery_merge_planning_only",
    "coverage_recovery_merge_no_recovered_content",
    "coverage_recovery_merge_no_fake_content",
    "coverage_recovery_merge_no_review_draft_write",
    "coverage_recovery_merge_no_official_merge",
    "coverage_recovery_merge_no_db_mutation",
    "coverage_recovery_merge_human_review_required",
    "coverage_recovery_merge_summary_limited",
  ];

  if (!runPlanPresent) {
    warnings.push("coverage_recovery_merge_missing_run_plan");
  }

  if (duplicateGuards.length > 0) {
    warnings.push("coverage_recovery_merge_duplicate_guard_required");
  }

  if (mergeItems.some((item) => item.kind === "manual_review_only")) {
    warnings.push("coverage_recovery_merge_manual_review_only");
  }

  return uniqueStrings(warnings);
}

function buildStats({
  duplicateGuards,
  mergeItems,
  warnings,
}: {
  duplicateGuards: AICoverageRecoveryDuplicateGuard[];
  mergeItems: AICoverageRecoveryMergeItem[];
  warnings: string[];
}): AICoverageRecoveryMergePlanStats {
  const futureItems = mergeItems.filter(
    (item) => item.kind === "future_recovered_question_suggestion",
  );

  return {
    blockedUntilRecoveryResultCount: mergeItems.filter(
      (item) => item.status === "blocked_until_recovery_result",
    ).length,
    duplicateGuardCount: duplicateGuards.length,
    futureSuggestionCount: futureItems.length,
    highRiskPageCount: new Set(futureItems.flatMap((item) => item.pageNumbers))
      .size,
    manualReviewOnlyCount: mergeItems.filter(
      (item) => item.kind === "manual_review_only",
    ).length,
    mergeItemCount: mergeItems.length,
    warningCount:
      warnings.length +
      mergeItems.reduce((sum, item) => sum + item.warnings.length, 0),
  };
}

export function buildAICoverageRecoveryMergePlanFromSummary(
  summaryInput: unknown,
  generatedAt = new Date().toISOString(),
): AICoverageRecoveryMergePlan {
  const runPlan = runPlanFromSummary(summaryInput);
  const runPlanPresent = runPlan.version === "coverage_recovery_run_plan_v1";

  if (!runPlanPresent) {
    const mergeItems: AICoverageRecoveryMergeItem[] = [];
    const duplicateGuards: AICoverageRecoveryDuplicateGuard[] = [];
    const warnings = planWarnings({
      duplicateGuards,
      mergeItems,
      runPlanPresent,
    });

    return {
      duplicateGuards,
      generatedAt,
      mergeItems,
      mergePolicy: buildCoverageRecoveryMergePolicy(),
      mode: "planning_only",
      sourceKind: "pdf",
      sourceRecoveryRunPlanPresent: false,
      stats: buildStats({ duplicateGuards, mergeItems, warnings }),
      status: "skipped",
      version: "coverage_recovery_merge_plan_v1",
      warnings,
    };
  }

  const mergeItems = buildCoverageRecoveryMergeItems(runPlan);
  const duplicateGuards = buildCoverageRecoveryDuplicateGuards(mergeItems);
  const warnings = planWarnings({
    duplicateGuards,
    mergeItems,
    runPlanPresent,
  });

  return {
    duplicateGuards,
    generatedAt,
    mergeItems,
    mergePolicy: buildCoverageRecoveryMergePolicy(),
    mode: "planning_only",
    sourceKind: runPlan.sourceKind === "single_image" ? "single_image" : "pdf",
    sourceRecoveryRunPlanPresent: true,
    stats: buildStats({ duplicateGuards, mergeItems, warnings }),
    status:
      warnings.length > 8 || mergeItems.some((item) => item.kind !== "future_recovered_question_suggestion")
        ? "completed_with_warnings"
        : "completed",
    version: "coverage_recovery_merge_plan_v1",
    warnings,
  };
}

export function failedAICoverageRecoveryMergePlan({
  generatedAt = new Date().toISOString(),
  warnings,
}: {
  generatedAt?: string;
  warnings: string[];
}): AICoverageRecoveryMergePlan {
  const duplicateGuards: AICoverageRecoveryDuplicateGuard[] = [];
  const mergeItems: AICoverageRecoveryMergeItem[] = [];
  const finalWarnings = uniqueStrings([
    "coverage_recovery_merge_planning_only",
    "coverage_recovery_merge_no_recovered_content",
    "coverage_recovery_merge_no_fake_content",
    ...warnings,
  ]);

  return {
    duplicateGuards,
    generatedAt,
    mergeItems,
    mergePolicy: buildCoverageRecoveryMergePolicy(),
    mode: "planning_only",
    sourceKind: "pdf",
    sourceRecoveryRunPlanPresent: false,
    stats: buildStats({
      duplicateGuards,
      mergeItems,
      warnings: finalWarnings,
    }),
    status: "failed",
    version: "coverage_recovery_merge_plan_v1",
    warnings: finalWarnings,
  };
}

export function mergeAICoverageRecoveryMergePlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  coverageRecoveryMergePlan: AICoverageRecoveryMergePlan,
) {
  return {
    ...existingAiPdfImport,
    coverageRecoveryMergePlan,
  };
}
