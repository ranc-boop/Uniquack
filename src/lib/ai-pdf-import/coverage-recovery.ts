import crypto from "node:crypto";

import type {
  AICoverageRecoveryWindow,
  AIExtractionCoverageAuditPlan,
  AIExtractionCoverageRisk,
} from "./extraction-coverage-audit";

export type AICoverageRecoveryPlanVersion = "coverage_recovery_plan_v1";

export type AICoverageRecoveryPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AICoverageRecoveryTaskKind =
  | "terminal_page_recovery"
  | "uncovered_question_like_page_recovery"
  | "failed_chunk_recovery"
  | "low_packet_coverage_review"
  | "manual_review_only";

export type AICoverageRecoveryRequestKind =
  | "coverage_terminal_page_extraction"
  | "coverage_uncovered_page_extraction"
  | "coverage_failed_chunk_retry"
  | "coverage_low_packet_review"
  | "coverage_manual_review_only";

export interface AICoverageRecoveryPlan {
  generatedAt: string;
  mode: "planning_only";
  recoveryTasks: AICoverageRecoveryTask[];
  requestDrafts: AICoverageRecoveryRequestDraft[];
  skippedWindows: AICoverageRecoverySkippedWindow[];
  sourceAuditPlanPresent: boolean;
  sourceKind: "pdf" | "single_image";
  stats: AICoverageRecoveryPlanStats;
  status: AICoverageRecoveryPlanStatus;
  version: AICoverageRecoveryPlanVersion;
  warnings: string[];
}

export interface AICoverageRecoveryTask {
  batchIds: string[];
  evidence: AICoverageRecoveryEvidence[];
  execution: {
    officialMergePlanned: false;
    providerCallExecuted: false;
    providerCallPlanned: true;
    reviewDraftWriteExecuted: false;
    reviewDraftWritePlanned: false;
  };
  kind: AICoverageRecoveryTaskKind;
  packetIds: string[];
  pageEnd: number | null;
  pageNumbers: number[];
  pageStart: number | null;
  priority: "low" | "medium" | "high";
  recommendedStrategy:
    | "page_images_recovery"
    | "adaptive_reread_recovery"
    | "text_window_recovery"
    | "manual_review";
  reviewRequired: true;
  sourceRiskIds: string[];
  sourceWindowIds: string[];
  taskHash: string;
  taskId: string;
  warnings: string[];
}

export interface AICoverageRecoveryRequestDraft {
  batchIds: string[];
  packetIds: string[];
  pageNumbers: number[];
  promptContract: {
    boundedPagesOnly: true;
    doNotReextractCoveredPages: true;
    mode: "schema_recovery_request";
    preserveExistingDrafts: true;
    recoverMissingQuestionsOnly: true;
    requireCompletionSentinel: true;
    requireSourcePageRefs: true;
  };
  providerRouting: {
    preferredStrategy:
      | "page_images"
      | "gemini_native_page_window"
      | "text_window"
      | "manual_review";
    realCall: false;
    shadowOnly: true;
  };
  requestHash: string;
  requestId: string;
  requestKind: AICoverageRecoveryRequestKind;
  safety: {
    noDbMutation: true;
    noOfficialTaxonomyWrite: true;
    noProviderCall: true;
    noRawResponseStorage: true;
    noReviewDraftWrite: true;
  };
  sourceTaskId: string;
  warnings: string[];
}

export interface AICoverageRecoverySkippedWindow {
  message: string;
  reason:
    | "missing_page_numbers"
    | "manual_review_only"
    | "unsupported_source_kind"
    | "already_covered"
    | "unknown";
  windowId: string;
}

export interface AICoverageRecoveryEvidence {
  batchIds: string[];
  kind:
    | "coverage_audit_risk"
    | "coverage_recovery_window"
    | "terminal_page_gap"
    | "failed_chunk_ref"
    | "packet_gap_ref"
    | "batch_gap_ref";
  message: string;
  packetIds: string[];
  pageNumbers: number[];
  sourceIds: string[];
}

export interface AICoverageRecoveryPlanStats {
  failedChunkRecoveryCount: number;
  highPriorityCount: number;
  manualReviewOnlyCount: number;
  recoveryTaskCount: number;
  requestDraftCount: number;
  skippedWindowCount: number;
  terminalPageRecoveryCount: number;
  uncoveredPageRecoveryCount: number;
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

function auditPlanFromSummary(value: unknown) {
  return asRecord(
    aiPdfImportFromSummary(value).extractionCoverageAuditPlan,
  ) as Partial<AIExtractionCoverageAuditPlan>;
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
  kind: AICoverageRecoveryEvidence["kind"];
  message: string;
  packetIds?: string[];
  pageNumbers?: number[];
  sourceIds?: string[];
}): AICoverageRecoveryEvidence {
  return {
    batchIds: uniqueStrings(batchIds),
    kind,
    message,
    packetIds: uniqueStrings(packetIds),
    pageNumbers: uniqueNumbers(pageNumbers),
    sourceIds: uniqueStrings(sourceIds),
  };
}

function kindForWindow(
  window: AICoverageRecoveryWindow,
): AICoverageRecoveryTaskKind {
  if (window.reason === "terminal_uncovered_pages") {
    return "terminal_page_recovery";
  }

  if (window.reason === "failed_chunk_pages") {
    return "failed_chunk_recovery";
  }

  if (window.reason === "low_packet_coverage") {
    return "low_packet_coverage_review";
  }

  return "uncovered_question_like_page_recovery";
}

function priorityForTask({
  kind,
  sourceRisks,
}: {
  kind: AICoverageRecoveryTaskKind;
  sourceRisks: AIExtractionCoverageRisk[];
}) {
  if (
    kind === "terminal_page_recovery" ||
    sourceRisks.some((risk) => risk.severity === "high")
  ) {
    return "high" as const;
  }

  if (
    kind === "uncovered_question_like_page_recovery" ||
    kind === "failed_chunk_recovery" ||
    sourceRisks.some((risk) => risk.severity === "medium")
  ) {
    return "medium" as const;
  }

  return "low" as const;
}

function taskWarnings({
  kind,
  recommendedStrategy,
}: {
  kind: AICoverageRecoveryTaskKind;
  recommendedStrategy: AICoverageRecoveryTask["recommendedStrategy"];
}) {
  const warnings = ["coverage_recovery_planning_only"];

  if (kind === "terminal_page_recovery") {
    warnings.push("coverage_recovery_terminal_pages_planned");
  }

  if (recommendedStrategy === "manual_review") {
    warnings.push("coverage_recovery_manual_review_only");
  }

  return warnings;
}

function matchingRisks({
  auditPlan,
  pageNumbers,
  reason,
}: {
  auditPlan: Partial<AIExtractionCoverageAuditPlan>;
  pageNumbers: number[];
  reason: AICoverageRecoveryWindow["reason"];
}) {
  const risks = asArray(auditPlan.risks) as AIExtractionCoverageRisk[];
  const pageSet = new Set(pageNumbers);
  const reasonKinds =
    reason === "terminal_uncovered_pages"
      ? ["terminal_pages_missing_from_extraction", "full_pdf_silent_partial_risk"]
      : reason === "failed_chunk_pages"
        ? ["chunk_partial_failure"]
        : reason === "low_packet_coverage"
          ? ["packet_coverage_low", "batch_coverage_low"]
          : ["question_like_page_uncovered", "full_pdf_silent_partial_risk"];

  return risks.filter((risk) => {
    if (!reasonKinds.includes(risk.kind)) {
      return false;
    }

    if (!pageNumbers.length) {
      return true;
    }

    return risk.pageNumbers.some((page) => pageSet.has(page));
  });
}

export function buildCoverageRecoveryTaskFromWindow({
  auditPlan,
  window,
}: {
  auditPlan: Partial<AIExtractionCoverageAuditPlan>;
  window: AICoverageRecoveryWindow;
}): AICoverageRecoveryTask | null {
  const pageNumbers = uniqueNumbers(window.pageNumbers);

  if (!pageNumbers.length) {
    return null;
  }

  const kind = kindForWindow(window);
  const sourceRisks = matchingRisks({
    auditPlan,
    pageNumbers,
    reason: window.reason,
  });
  const recommendedStrategy =
    kind === "terminal_page_recovery"
      ? "page_images_recovery"
      : kind === "failed_chunk_recovery"
        ? "adaptive_reread_recovery"
        : window.recommendedStrategy;
  const priority = priorityForTask({ kind, sourceRisks });
  const sourceRiskIds = uniqueStrings(sourceRisks.map((risk) => risk.riskId));
  const sourceWindowIds = uniqueStrings([window.windowId]);
  const pageStart = pageNumbers[0] ?? null;
  const pageEnd = pageNumbers[pageNumbers.length - 1] ?? null;
  const taskId = stableId("coverage-task", {
    kind,
    pageNumbers,
    sourceRiskIds,
    sourceWindowIds,
  });

  return {
    batchIds: uniqueStrings(sourceRisks.flatMap((risk) => risk.batchIds)),
    evidence: [
      evidence({
        kind:
          kind === "terminal_page_recovery"
            ? "terminal_page_gap"
            : kind === "failed_chunk_recovery"
              ? "failed_chunk_ref"
              : kind === "low_packet_coverage_review"
                ? "packet_gap_ref"
                : "coverage_recovery_window",
        message: `Recovery planning window ${window.windowId}.`,
        packetIds: window.packetIds,
        pageNumbers,
        sourceIds: [window.windowId, ...sourceRiskIds],
      }),
      ...sourceRisks.map((risk) =>
        evidence({
          batchIds: risk.batchIds,
          kind: "coverage_audit_risk",
          message: risk.message,
          packetIds: risk.packetIds,
          pageNumbers: risk.pageNumbers,
          sourceIds: [risk.riskId],
        }),
      ),
    ],
    execution: {
      officialMergePlanned: false,
      providerCallExecuted: false,
      providerCallPlanned: true,
      reviewDraftWriteExecuted: false,
      reviewDraftWritePlanned: false,
    },
    kind,
    packetIds: uniqueStrings(window.packetIds),
    pageEnd,
    pageNumbers,
    pageStart,
    priority,
    recommendedStrategy,
    reviewRequired: true,
    sourceRiskIds,
    sourceWindowIds,
    taskHash: stableHash({
      kind,
      pageNumbers,
      sourceRiskIds,
      sourceWindowIds,
    }),
    taskId,
    warnings: taskWarnings({ kind, recommendedStrategy }),
  };
}

function manualTaskFromRisk(
  risk: AIExtractionCoverageRisk,
): AICoverageRecoveryTask {
  const pageNumbers = uniqueNumbers(risk.pageNumbers);
  const taskId = stableId("coverage-task", {
    kind: "manual_review_only",
    riskId: risk.riskId,
  });

  return {
    batchIds: uniqueStrings(risk.batchIds),
    evidence: [
      evidence({
        batchIds: risk.batchIds,
        kind: risk.kind === "batch_coverage_low" ? "batch_gap_ref" : "packet_gap_ref",
        message: risk.message,
        packetIds: risk.packetIds,
        pageNumbers,
        sourceIds: [risk.riskId],
      }),
    ],
    execution: {
      officialMergePlanned: false,
      providerCallExecuted: false,
      providerCallPlanned: true,
      reviewDraftWriteExecuted: false,
      reviewDraftWritePlanned: false,
    },
    kind: "manual_review_only",
    packetIds: uniqueStrings(risk.packetIds),
    pageEnd: pageNumbers[pageNumbers.length - 1] ?? null,
    pageNumbers,
    pageStart: pageNumbers[0] ?? null,
    priority: risk.severity === "high" ? "medium" : "low",
    recommendedStrategy: "manual_review",
    reviewRequired: true,
    sourceRiskIds: [risk.riskId],
    sourceWindowIds: [],
    taskHash: stableHash({ riskId: risk.riskId, type: "manual_review_only" }),
    taskId,
    warnings: ["coverage_recovery_planning_only", "coverage_recovery_manual_review_only"],
  };
}

function taskFromUncoveredQuestionLikeRisk(
  risk: AIExtractionCoverageRisk,
): AICoverageRecoveryTask | null {
  const pageNumbers = uniqueNumbers(risk.pageNumbers);

  if (!pageNumbers.length) {
    return null;
  }

  const taskId = stableId("coverage-task", {
    kind: "uncovered_question_like_page_recovery",
    riskId: risk.riskId,
  });

  return {
    batchIds: uniqueStrings(risk.batchIds),
    evidence: [
      evidence({
        batchIds: risk.batchIds,
        kind: "coverage_audit_risk",
        message: risk.message,
        packetIds: risk.packetIds,
        pageNumbers,
        sourceIds: [risk.riskId],
      }),
    ],
    execution: {
      officialMergePlanned: false,
      providerCallExecuted: false,
      providerCallPlanned: true,
      reviewDraftWriteExecuted: false,
      reviewDraftWritePlanned: false,
    },
    kind: "uncovered_question_like_page_recovery",
    packetIds: uniqueStrings(risk.packetIds),
    pageEnd: pageNumbers[pageNumbers.length - 1] ?? null,
    pageNumbers,
    pageStart: pageNumbers[0] ?? null,
    priority: risk.severity === "high" ? "high" : "medium",
    recommendedStrategy: "page_images_recovery",
    reviewRequired: true,
    sourceRiskIds: [risk.riskId],
    sourceWindowIds: [],
    taskHash: stableHash({
      kind: "uncovered_question_like_page_recovery",
      riskId: risk.riskId,
    }),
    taskId,
    warnings: [
      "coverage_recovery_planning_only",
      "coverage_recovery_uncovered_question_like_pages_planned",
    ],
  };
}

export function buildCoverageRecoveryTasks(
  auditPlan: Partial<AIExtractionCoverageAuditPlan>,
): {
  skippedWindows: AICoverageRecoverySkippedWindow[];
  tasks: AICoverageRecoveryTask[];
} {
  const skippedWindows: AICoverageRecoverySkippedWindow[] = [];
  const tasks: AICoverageRecoveryTask[] = [];

  for (const window of asArray(auditPlan.recommendedRecoveryWindows) as AICoverageRecoveryWindow[]) {
    if (auditPlan.sourceKind === "single_image") {
      skippedWindows.push({
        message: "Single-image coverage recovery is manual-review only in this foundation.",
        reason: "unsupported_source_kind",
        windowId: window.windowId,
      });
      continue;
    }

    if (window.recommendedStrategy === "manual_review") {
      skippedWindows.push({
        message: "Window is marked manual-review only; no request draft created.",
        reason: "manual_review_only",
        windowId: window.windowId,
      });
    }

    const task = buildCoverageRecoveryTaskFromWindow({ auditPlan, window });

    if (!task) {
      skippedWindows.push({
        message: "Recovery window has no page numbers.",
        reason: "missing_page_numbers",
        windowId: window.windowId,
      });
      continue;
    }

    tasks.push(task);
  }

  const taskRiskIds = new Set(tasks.flatMap((task) => task.sourceRiskIds));
  const manualRiskKinds = new Set(["packet_coverage_low", "batch_coverage_low"]);
  for (const risk of asArray(auditPlan.risks) as AIExtractionCoverageRisk[]) {
    if (
      risk.kind === "question_like_page_uncovered" &&
      !taskRiskIds.has(risk.riskId)
    ) {
      const task = taskFromUncoveredQuestionLikeRisk(risk);

      if (task) {
        tasks.push(task);
        taskRiskIds.add(risk.riskId);
      }

      continue;
    }

    if (!manualRiskKinds.has(risk.kind) || taskRiskIds.has(risk.riskId)) {
      continue;
    }

    tasks.push(manualTaskFromRisk(risk));
  }

  const uniqueTasks = new Map<string, AICoverageRecoveryTask>();

  for (const task of tasks) {
    uniqueTasks.set(task.taskHash, task);
  }

  return {
    skippedWindows,
    tasks: Array.from(uniqueTasks.values()),
  };
}

function requestKindForTask(
  task: AICoverageRecoveryTask,
): AICoverageRecoveryRequestKind {
  if (task.kind === "terminal_page_recovery") {
    return "coverage_terminal_page_extraction";
  }

  if (task.kind === "failed_chunk_recovery") {
    return "coverage_failed_chunk_retry";
  }

  if (task.kind === "low_packet_coverage_review") {
    return "coverage_low_packet_review";
  }

  if (task.kind === "manual_review_only") {
    return "coverage_manual_review_only";
  }

  return "coverage_uncovered_page_extraction";
}

function preferredStrategyForTask(
  task: AICoverageRecoveryTask,
): AICoverageRecoveryRequestDraft["providerRouting"]["preferredStrategy"] {
  if (task.recommendedStrategy === "page_images_recovery") {
    return "page_images";
  }

  if (task.recommendedStrategy === "adaptive_reread_recovery") {
    return "gemini_native_page_window";
  }

  if (task.recommendedStrategy === "text_window_recovery") {
    return "text_window";
  }

  return "manual_review";
}

export function buildCoverageRecoveryRequestDraft(
  task: AICoverageRecoveryTask,
): AICoverageRecoveryRequestDraft | null {
  if (task.recommendedStrategy === "manual_review" || !task.pageNumbers.length) {
    return null;
  }

  const requestKind = requestKindForTask(task);
  const preferredStrategy = preferredStrategyForTask(task);
  const requestHash = stableHash({
    pageNumbers: task.pageNumbers,
    preferredStrategy,
    requestKind,
    sourceTaskId: task.taskId,
  });

  return {
    batchIds: task.batchIds,
    packetIds: task.packetIds,
    pageNumbers: task.pageNumbers,
    promptContract: {
      boundedPagesOnly: true,
      doNotReextractCoveredPages: true,
      mode: "schema_recovery_request",
      preserveExistingDrafts: true,
      recoverMissingQuestionsOnly: true,
      requireCompletionSentinel: true,
      requireSourcePageRefs: true,
    },
    providerRouting: {
      preferredStrategy,
      realCall: false,
      shadowOnly: true,
    },
    requestHash,
    requestId: `coverage-request-${requestHash.slice(0, 12)}`,
    requestKind,
    safety: {
      noDbMutation: true,
      noOfficialTaxonomyWrite: true,
      noProviderCall: true,
      noRawResponseStorage: true,
      noReviewDraftWrite: true,
    },
    sourceTaskId: task.taskId,
    warnings: ["coverage_recovery_no_provider_call", "coverage_recovery_no_execution"],
  };
}

export function buildCoverageRecoveryRequestDrafts(
  tasks: AICoverageRecoveryTask[],
) {
  return tasks
    .map(buildCoverageRecoveryRequestDraft)
    .filter((draft): draft is AICoverageRecoveryRequestDraft => Boolean(draft));
}

function planWarnings({
  auditPlanPresent,
  requestDrafts,
  tasks,
}: {
  auditPlanPresent: boolean;
  requestDrafts: AICoverageRecoveryRequestDraft[];
  tasks: AICoverageRecoveryTask[];
}) {
  const warnings = [
    "coverage_recovery_planning_only",
    "coverage_recovery_no_provider_call",
    "coverage_recovery_no_execution",
    "coverage_recovery_no_review_draft_write",
    "coverage_recovery_no_db_mutation",
    "coverage_recovery_summary_limited",
  ];

  if (!auditPlanPresent) {
    warnings.push("coverage_recovery_missing_coverage_audit_plan");
  }

  if (tasks.some((task) => task.kind === "terminal_page_recovery")) {
    warnings.push("coverage_recovery_terminal_pages_planned");
  }

  if (tasks.some((task) => task.recommendedStrategy === "manual_review")) {
    warnings.push("coverage_recovery_manual_review_only");
  }

  if (!requestDrafts.length && tasks.length) {
    warnings.push("coverage_recovery_manual_review_only");
  }

  return uniqueStrings(warnings);
}

function buildStats({
  requestDrafts,
  skippedWindows,
  tasks,
}: {
  requestDrafts: AICoverageRecoveryRequestDraft[];
  skippedWindows: AICoverageRecoverySkippedWindow[];
  tasks: AICoverageRecoveryTask[];
}): AICoverageRecoveryPlanStats {
  return {
    failedChunkRecoveryCount: tasks.filter(
      (task) => task.kind === "failed_chunk_recovery",
    ).length,
    highPriorityCount: tasks.filter((task) => task.priority === "high").length,
    manualReviewOnlyCount: tasks.filter(
      (task) => task.kind === "manual_review_only",
    ).length,
    recoveryTaskCount: tasks.length,
    requestDraftCount: requestDrafts.length,
    skippedWindowCount: skippedWindows.length,
    terminalPageRecoveryCount: tasks.filter(
      (task) => task.kind === "terminal_page_recovery",
    ).length,
    uncoveredPageRecoveryCount: tasks.filter(
      (task) => task.kind === "uncovered_question_like_page_recovery",
    ).length,
  };
}

export function buildAICoverageRecoveryPlanFromSummary(
  summaryInput: unknown,
  generatedAt = new Date().toISOString(),
): AICoverageRecoveryPlan {
  const auditPlan = auditPlanFromSummary(summaryInput);
  const auditPlanPresent =
    auditPlan.version === "extraction_coverage_audit_plan_v1";

  if (!auditPlanPresent) {
    const tasks: AICoverageRecoveryTask[] = [];
    const requestDrafts: AICoverageRecoveryRequestDraft[] = [];
    const skippedWindows: AICoverageRecoverySkippedWindow[] = [];
    const warnings = planWarnings({
      auditPlanPresent,
      requestDrafts,
      tasks,
    });

    return {
      generatedAt,
      mode: "planning_only",
      recoveryTasks: tasks,
      requestDrafts,
      skippedWindows,
      sourceAuditPlanPresent: false,
      sourceKind: "pdf",
      stats: buildStats({ requestDrafts, skippedWindows, tasks }),
      status: "skipped",
      version: "coverage_recovery_plan_v1",
      warnings,
    };
  }

  const { skippedWindows, tasks } = buildCoverageRecoveryTasks(auditPlan);
  const requestDrafts = buildCoverageRecoveryRequestDrafts(tasks);
  const warnings = planWarnings({
    auditPlanPresent,
    requestDrafts,
    tasks,
  });

  return {
    generatedAt,
    mode: "planning_only",
    recoveryTasks: tasks,
    requestDrafts,
    skippedWindows,
    sourceAuditPlanPresent: true,
    sourceKind: auditPlan.sourceKind === "single_image" ? "single_image" : "pdf",
    stats: buildStats({ requestDrafts, skippedWindows, tasks }),
    status:
      warnings.length > 6 || skippedWindows.length > 0
        ? "completed_with_warnings"
        : "completed",
    version: "coverage_recovery_plan_v1",
    warnings,
  };
}

export function failedAICoverageRecoveryPlan({
  generatedAt = new Date().toISOString(),
  warnings,
}: {
  generatedAt?: string;
  warnings: string[];
}): AICoverageRecoveryPlan {
  const tasks: AICoverageRecoveryTask[] = [];
  const requestDrafts: AICoverageRecoveryRequestDraft[] = [];
  const skippedWindows: AICoverageRecoverySkippedWindow[] = [];

  return {
    generatedAt,
    mode: "planning_only",
    recoveryTasks: tasks,
    requestDrafts,
    skippedWindows,
    sourceAuditPlanPresent: false,
    sourceKind: "pdf",
    stats: buildStats({ requestDrafts, skippedWindows, tasks }),
    status: "failed",
    version: "coverage_recovery_plan_v1",
    warnings: uniqueStrings([
      "coverage_recovery_planning_only",
      "coverage_recovery_no_provider_call",
      "coverage_recovery_no_execution",
      ...warnings,
    ]),
  };
}

export function mergeAICoverageRecoveryPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  coverageRecoveryPlan: AICoverageRecoveryPlan,
) {
  return {
    ...existingAiPdfImport,
    coverageRecoveryPlan,
  };
}
