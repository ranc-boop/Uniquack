import "server-only";

import type {
  AIQuestionBlueprintDraft,
  AIQuestionBlueprintDraftPlan,
} from "@/lib/ai-pdf-import/question-blueprint-analyzer";

export type QuestionBlueprintReviewActionPlanVersion =
  "question_blueprint_review_plan_v1";

export type QuestionBlueprintReviewActionKind =
  | "approve_blueprint"
  | "reject_blueprint"
  | "edit_blueprint"
  | "merge_similar_blueprint"
  | "mark_needs_more_evidence";

export interface QuestionBlueprintReviewActionPlan {
  actions: QuestionBlueprintReviewAction[];
  generatedAt: string;
  mode: "planning_only";
  sourceDraftPlanRef: string | null;
  stats: QuestionBlueprintReviewActionStats;
  status: "planned" | "skipped";
  version: QuestionBlueprintReviewActionPlanVersion;
  warnings: string[];
}

export interface QuestionBlueprintReviewAction {
  actionId: string;
  actionKind: QuestionBlueprintReviewActionKind;
  blueprintDraftId: string;
  evidence: {
    assetRefs: string[];
    boundedSnippets: string[];
  };
  reason: string;
  reviewRequired: true;
  safety: {
    noDbWrite: true;
    noGeneratedQuestion: true;
    noProviderCall: true;
    noReviewDraftWrite: true;
    planningOnly: true;
  };
  status: "pending_review";
  warnings: string[];
}

export interface QuestionBlueprintReviewActionStats {
  approveReadyActionCount: number;
  generatedQuestionCount: 0;
  libraryWriteCount: 0;
  pendingReviewActionCount: number;
  rawStorageCount: 0;
  reviewDraftWriteCount: 0;
  reviewableBlueprintDraftCount: number;
  warningCount: number;
}

export const QUESTION_BLUEPRINT_REVIEW_PLAN_PATH =
  "summary.aiPdfImport.questionBlueprintReviewPlan";

export const QUESTION_BLUEPRINT_REVIEW_BASE_WARNINGS = [
  "question_blueprint_review_planning_only",
  "question_blueprint_review_pending_human_review",
  "question_blueprint_review_no_generated_questions",
  "question_blueprint_review_no_review_draft_write",
  "question_blueprint_review_no_db_write",
  "question_blueprint_review_no_provider_call",
] as const;

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function boundedText(value: string, maxLength = 240) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function hashStableJson(value: unknown) {
  const input = JSON.stringify(value);
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function draftPlanRef(plan: AIQuestionBlueprintDraftPlan | null | undefined) {
  if (!plan) {
    return null;
  }

  return [
    plan.version,
    plan.generatedAt,
    plan.stats.blueprintDraftCount,
    plan.stats.normalizedPacketCount,
  ].join(":");
}

function hasUsefulEvidence(draft: AIQuestionBlueprintDraft) {
  return (
    draft.evidence.boundedSnippets.some((snippet) => snippet.trim().length > 0) ||
    draft.evidence.assetRefs.some((assetRef) => assetRef.trim().length > 0)
  );
}

function actionKindForDraft(
  draft: AIQuestionBlueprintDraft,
  duplicatePatternCount: number,
): QuestionBlueprintReviewActionKind {
  if (!hasUsefulEvidence(draft)) {
    return "mark_needs_more_evidence";
  }

  if (duplicatePatternCount > 1) {
    return "merge_similar_blueprint";
  }

  if (draft.warnings.length > 0 || draft.confidence < 0.55) {
    return "edit_blueprint";
  }

  if (draft.confidence >= 0.7) {
    return "approve_blueprint";
  }

  return "edit_blueprint";
}

function reasonForAction(
  actionKind: QuestionBlueprintReviewActionKind,
  draft: AIQuestionBlueprintDraft,
) {
  if (actionKind === "approve_blueprint") {
    return "Blueprint draft has bounded evidence, reusable constraints, and sufficient confidence for human approval review.";
  }

  if (actionKind === "merge_similar_blueprint") {
    return "Blueprint draft appears similar to another draft and should be reviewed for merge before library use.";
  }

  if (actionKind === "mark_needs_more_evidence") {
    return "Blueprint draft needs more bounded evidence before it can become a reusable library entry.";
  }

  if (actionKind === "reject_blueprint") {
    return "Blueprint draft is not suitable for reuse.";
  }

  return draft.warnings.length
    ? `Blueprint draft needs edits before approval: ${draft.warnings
        .map((warning) => boundedText(warning, 120))
        .join("; ")}`
    : "Blueprint draft needs human edits before approval.";
}

function buildReviewAction({
  actionKind,
  draft,
}: {
  actionKind: QuestionBlueprintReviewActionKind;
  draft: AIQuestionBlueprintDraft;
}): QuestionBlueprintReviewAction {
  return {
    actionId: `qbr-${draft.draftId}-${hashStableJson([
      draft.draftId,
      actionKind,
      draft.questionPattern,
    ]).slice(0, 8)}`,
    actionKind,
    blueprintDraftId: draft.draftId,
    evidence: {
      assetRefs: draft.evidence.assetRefs.slice(0, 12),
      boundedSnippets: draft.evidence.boundedSnippets
        .map((snippet) => boundedText(snippet, 280))
        .filter(Boolean)
        .slice(0, 8),
    },
    reason: reasonForAction(actionKind, draft),
    reviewRequired: true,
    safety: {
      noDbWrite: true,
      noGeneratedQuestion: true,
      noProviderCall: true,
      noReviewDraftWrite: true,
      planningOnly: true,
    },
    status: "pending_review",
    warnings: draft.warnings.slice(0, 12),
  };
}

function statsFor(actions: QuestionBlueprintReviewAction[]) {
  return {
    approveReadyActionCount: actions.filter(
      (action) => action.actionKind === "approve_blueprint",
    ).length,
    generatedQuestionCount: 0,
    libraryWriteCount: 0,
    pendingReviewActionCount: actions.filter(
      (action) => action.status === "pending_review",
    ).length,
    rawStorageCount: 0,
    reviewDraftWriteCount: 0,
    reviewableBlueprintDraftCount: actions.length,
    warningCount: actions.reduce(
      (total, action) => total + action.warnings.length,
      0,
    ),
  } satisfies QuestionBlueprintReviewActionStats;
}

export function buildQuestionBlueprintReviewActionPlan({
  draftPlan,
  generatedAt = new Date().toISOString(),
}: {
  draftPlan?: AIQuestionBlueprintDraftPlan | null;
  generatedAt?: string;
}): QuestionBlueprintReviewActionPlan {
  if (!draftPlan || draftPlan.blueprintDrafts.length === 0) {
    const warnings = uniqueStrings([
      ...QUESTION_BLUEPRINT_REVIEW_BASE_WARNINGS,
      "question_blueprint_review_no_blueprint_drafts",
    ]);

    return {
      actions: [],
      generatedAt,
      mode: "planning_only",
      sourceDraftPlanRef: draftPlanRef(draftPlan),
      stats: statsFor([]),
      status: "skipped",
      version: "question_blueprint_review_plan_v1",
      warnings,
    };
  }

  const patternCounts = new Map<string, number>();

  for (const draft of draftPlan.blueprintDrafts) {
    const key = draft.questionPattern.trim().toLowerCase();
    patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
  }

  const actions = draftPlan.blueprintDrafts.map((draft) =>
    buildReviewAction({
      actionKind: actionKindForDraft(
        draft,
        patternCounts.get(draft.questionPattern.trim().toLowerCase()) ?? 0,
      ),
      draft,
    }),
  );
  const warnings = uniqueStrings([
    ...QUESTION_BLUEPRINT_REVIEW_BASE_WARNINGS,
    ...draftPlan.warnings,
  ]);

  return {
    actions,
    generatedAt,
    mode: "planning_only",
    sourceDraftPlanRef: draftPlanRef(draftPlan),
    stats: {
      ...statsFor(actions),
      warningCount:
        statsFor(actions).warningCount + warnings.length,
    },
    status: "planned",
    version: "question_blueprint_review_plan_v1",
    warnings,
  };
}

export function validateQuestionBlueprintReviewActionPlan(
  plan: QuestionBlueprintReviewActionPlan,
) {
  const errors: string[] = [];

  if (plan.mode !== "planning_only") {
    errors.push("question_blueprint_review_plan_must_be_planning_only");
  }

  for (const action of plan.actions) {
    if (action.status !== "pending_review") {
      errors.push(`review action ${action.actionId} is not pending_review`);
    }

    if (!action.reviewRequired) {
      errors.push(`review action ${action.actionId} must require human review`);
    }

    if (
      !action.safety.noDbWrite ||
      !action.safety.noGeneratedQuestion ||
      !action.safety.noProviderCall ||
      !action.safety.noReviewDraftWrite ||
      !action.safety.planningOnly
    ) {
      errors.push(`review action ${action.actionId} has unsafe flags`);
    }
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}

export function mergeQuestionBlueprintReviewPlanIntoSummary(
  aiPdfImport: Record<string, unknown>,
  questionBlueprintReviewPlan: QuestionBlueprintReviewActionPlan,
) {
  return {
    ...aiPdfImport,
    questionBlueprintReviewPlan,
  };
}

export function summarizeQuestionBlueprintReviewActionPlan(
  plan: QuestionBlueprintReviewActionPlan | null | undefined,
) {
  if (!plan) {
    return {
      approveReadyActionCount: 0,
      pendingReviewActionCount: 0,
      status: "missing",
      warningCount: 0,
    };
  }

  return {
    approveReadyActionCount: plan.stats.approveReadyActionCount,
    pendingReviewActionCount: plan.stats.pendingReviewActionCount,
    status: plan.status,
    warningCount: plan.stats.warningCount,
  };
}
