import crypto from "node:crypto";

import type { AICoverageRecoveryPlan, AICoverageRecoveryRequestDraft } from "./coverage-recovery";
import type { QuestionBoundaryGuardPlan } from "./question-boundary-guard";

type AICoverageRecoveryExecutionPlanVersion =
  "coverage_recovery_executor_v1";

type AICoverageRecoveryExecutionStatus =
  | "eligible"
  | "blocked"
  | "not_needed";

type AICoverageRecoveryExecutionBlocker =
  | "original_import_not_complete"
  | "missing_coverage_audit"
  | "no_concrete_recovery_windows"
  | "source_not_ready"
  | "bank_not_active"
  | "teacher_permission_missing"
  | "stale_or_invalid_plan"
  | "recovery_window_too_broad";

export type AICoverageRecoveryCandidateClassification =
  | "new_candidate"
  | "likely_duplicate"
  | "possible_fragment_completion"
  | "visible_number_conflict"
  | "answer_alignment_risk"
  | "visual_association_risk"
  | "insufficient_evidence";

type AICoverageRecoveryExecutionWindow = {
  pageNumbers: number[];
  requestId: string;
  requestKind: string;
  windowId: string;
};

export type AICoverageRecoveryExecutionPlan = {
  blockers: AICoverageRecoveryExecutionBlocker[];
  pageCount: number;
  planHash: string | null;
  sourcePlanVersion: string | null;
  status: AICoverageRecoveryExecutionStatus;
  version: AICoverageRecoveryExecutionPlanVersion;
  windows: AICoverageRecoveryExecutionWindow[];
  warnings: string[];
};

type ExecutionInput = {
  actorCanManageBank: boolean;
  bankActive: boolean;
  originalBatchStatus: string | null | undefined;
  sourcePageCount: number;
  sourceReady: boolean;
  summary: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniquePages(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((page) => Number(page))
        .filter((page) => Number.isInteger(page) && page >= 1)
        .map((page) => Math.trunc(page)),
    ),
  ).sort((left, right) => left - right);
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function recoveryPlanFromSummary(summary: unknown) {
  const root = asRecord(summary);
  const aiPdfImport = asRecord(root.aiPdfImport);
  return asRecord(aiPdfImport.coverageRecoveryPlan) as Partial<AICoverageRecoveryPlan>;
}

function concreteWindows(plan: Partial<AICoverageRecoveryPlan>) {
  const requests = Array.isArray(plan.requestDrafts)
    ? (plan.requestDrafts as AICoverageRecoveryRequestDraft[])
    : [];

  return requests
    .filter(
      (request) =>
        request?.promptContract?.boundedPagesOnly === true &&
        request?.promptContract?.recoverMissingQuestionsOnly === true &&
        request?.promptContract?.requireSourcePageRefs === true &&
        request?.providerRouting?.preferredStrategy !== "manual_review",
    )
    .map((request) => ({
      pageNumbers: uniquePages(request.pageNumbers),
      requestId: String(request.requestId ?? "").trim(),
      requestKind: String(request.requestKind ?? "").trim(),
      windowId: String(request.sourceTaskId ?? request.requestId ?? "").trim(),
    }))
    .filter((window) => window.pageNumbers.length && window.requestId && window.windowId);
}

/**
 * Builds only a safe execution reference plan. It deliberately does not contain
 * PDF bytes, provider routing details, prompts, or any generated content.
 */
export function buildAICoverageRecoveryExecutionPlan(
  input: ExecutionInput,
): AICoverageRecoveryExecutionPlan {
  const plan = recoveryPlanFromSummary(input.summary);
  const windows = concreteWindows(plan);
  const blockers: AICoverageRecoveryExecutionBlocker[] = [];
  const originalStatus = String(input.originalBatchStatus ?? "");
  const plannedPages = uniquePages(windows.flatMap((window) => window.pageNumbers));
  const sourcePageCount = Math.max(0, Math.trunc(input.sourcePageCount));

  if (!['imported', 'failed'].includes(originalStatus)) {
    blockers.push("original_import_not_complete");
  }
  if (!plan.version || plan.sourceAuditPlanPresent !== true) {
    blockers.push("missing_coverage_audit");
  }
  if (!windows.length) {
    blockers.push("no_concrete_recovery_windows");
  }
  if (!input.sourceReady) blockers.push("source_not_ready");
  if (!input.bankActive) blockers.push("bank_not_active");
  if (!input.actorCanManageBank) blockers.push("teacher_permission_missing");
  if (
    plan.mode !== "planning_only" ||
    !plan.version ||
    !windows.every((window) => window.pageNumbers.every((page) => page <= sourcePageCount))
  ) {
    blockers.push("stale_or_invalid_plan");
  }
  // Recovery is for gaps, not a disguised full-document retry. Reserve 25%
  // headroom for window context while keeping the reread strongly bounded.
  if (
    !sourcePageCount ||
    plannedPages.length / Math.max(1, sourcePageCount) > 0.75
  ) {
    blockers.push("recovery_window_too_broad");
  }

  const dedupedBlockers = Array.from(new Set(blockers));
  const status: AICoverageRecoveryExecutionStatus = dedupedBlockers.length
    ? "blocked"
    : windows.length
      ? "eligible"
      : "not_needed";
  const planHash =
    status === "eligible"
      ? stableHash({
          sourcePlanVersion: plan.version,
          windows: windows.map((window) => ({
            pageNumbers: window.pageNumbers,
            requestId: window.requestId,
            requestKind: window.requestKind,
            windowId: window.windowId,
          })),
        })
      : null;

  return {
    blockers: dedupedBlockers,
    pageCount: sourcePageCount,
    planHash,
    sourcePlanVersion: typeof plan.version === "string" ? plan.version : null,
    status,
    version: "coverage_recovery_executor_v1",
    windows,
    warnings: dedupedBlockers.map((blocker) => `coverage_recovery_${blocker}`),
  };
}

function findingKindsForCandidate(
  candidateId: string,
  guardPlan: Pick<
    QuestionBoundaryGuardPlan,
    "associationRisks" | "boundaryGroups" | "duplicateGroups"
  >,
) {
  return [
    ...(guardPlan.duplicateGroups ?? []),
    ...(guardPlan.boundaryGroups ?? []),
    ...(guardPlan.associationRisks ?? []),
  ]
    .filter((finding) => finding.questionIds.includes(candidateId))
    .map((finding) => finding.issueKind);
}

/** Maps guard findings to the only recovery outcomes persisted by the executor. */
export function classifyAICoverageRecoveryCandidate({
  candidateId,
  guardPlan,
  hasSufficientEvidence = true,
}: {
  candidateId: string;
  guardPlan: Pick<
    QuestionBoundaryGuardPlan,
    "associationRisks" | "boundaryGroups" | "duplicateGroups"
  >;
  hasSufficientEvidence?: boolean;
}): AICoverageRecoveryCandidateClassification {
  if (!hasSufficientEvidence) return "insufficient_evidence";
  const kinds = findingKindsForCandidate(candidateId, guardPlan);
  if (kinds.includes("recovery_duplicate") || kinds.includes("likely_duplicate")) {
    return "likely_duplicate";
  }
  if (kinds.includes("question_number_conflict")) return "visible_number_conflict";
  if (
    kinds.includes("cross_page_fragment") ||
    kinds.includes("choices_only_fragment") ||
    kinds.includes("solution_only_fragment") ||
    kinds.includes("packet_chunk_boundary_split")
  ) {
    return "possible_fragment_completion";
  }
  if (kinds.includes("answer_alignment")) return "answer_alignment_risk";
  if (kinds.includes("visual_association")) return "visual_association_risk";
  return "new_candidate";
}

export function recoveryCandidateNeedsManualReview(
  classification: AICoverageRecoveryCandidateClassification,
) {
  return classification !== "new_candidate";
}
