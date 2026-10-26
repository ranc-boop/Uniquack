import "server-only";

import type {
  AIQuestionBlueprintDraft,
  AIQuestionBlueprintDraftPlan,
} from "@/lib/ai-pdf-import/question-blueprint-analyzer";
import type {
  QuestionBlueprintReviewAction,
  QuestionBlueprintReviewActionPlan,
} from "@/lib/blueprints/question-blueprint-review";

export type QuestionBlueprintOwnerScope =
  | "system"
  | "school"
  | "teacher"
  | "private";

type QuestionBlueprintLibraryEntryStatus =
  | "draft"
  | "approved"
  | "deprecated";

type QuestionBlueprintLibraryPersistencePlanVersion =
  "question_blueprint_library_persistence_plan_v1";

export interface QuestionBlueprintLibraryEntry {
  answerSpecPattern: AIQuestionBlueprintDraft["answerSpecPattern"];
  blueprintId: string;
  createdAt: string;
  difficultyProfile: AIQuestionBlueprintDraft["difficultyProfile"];
  distractorPattern: string[];
  generationConstraints: string[];
  originalityConstraints: string[];
  ownerScope: QuestionBlueprintOwnerScope;
  questionPattern: string;
  requiredElements: string[];
  sourceExampleRefs: {
    assetRefs: string[];
    blueprintDraftId: string;
    boundedSnippets: string[];
    reviewActionId: string;
    sourcePacketIds: string[];
  };
  status: QuestionBlueprintLibraryEntryStatus;
  taxonomyTargets: AIQuestionBlueprintDraft["taxonomyTargets"];
  updatedAt: string;
  version: number;
}

export interface QuestionBlueprintLibraryPersistencePlan {
  entries: QuestionBlueprintLibraryEntry[];
  generatedAt: string;
  mode: "planning_only";
  sourceReviewPlanRef: string | null;
  stats: QuestionBlueprintLibraryPersistenceStats;
  status: "planned" | "skipped";
  version: QuestionBlueprintLibraryPersistencePlanVersion;
  warnings: string[];
}

interface QuestionBlueprintLibraryPersistenceStats {
  generatedQuestionCount: 0;
  libraryEntryCount: number;
  libraryWriteCount: 0;
  pendingApprovalEntryCount: number;
  rawStorageCount: 0;
  reviewDraftWriteCount: 0;
  warningCount: number;
}

export const QUESTION_BLUEPRINT_LIBRARY_PERSISTENCE_PLAN_PATH =
  "summary.aiPdfImport.questionBlueprintLibraryPersistencePlan";

const QUESTION_BLUEPRINT_LIBRARY_BASE_WARNINGS = [
  "question_blueprint_library_persistence_planning_only",
  "question_blueprint_library_no_db_write",
  "question_blueprint_library_no_generated_questions",
  "question_blueprint_library_no_review_draft_write",
  "question_blueprint_library_pending_human_approval",
] as const;

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function boundedText(value: string, maxLength = 280) {
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

function reviewPlanRef(plan: QuestionBlueprintReviewActionPlan | null | undefined) {
  if (!plan) {
    return null;
  }

  return [
    plan.version,
    plan.generatedAt,
    plan.stats.pendingReviewActionCount,
    plan.stats.approveReadyActionCount,
  ].join(":");
}

function draftsById(draftPlan: AIQuestionBlueprintDraftPlan | null | undefined) {
  return new Map(
    (draftPlan?.blueprintDrafts ?? []).map((draft) => [draft.draftId, draft]),
  );
}

function buildLibraryEntry({
  action,
  draft,
  generatedAt,
  ownerScope,
}: {
  action: QuestionBlueprintReviewAction;
  draft: AIQuestionBlueprintDraft;
  generatedAt: string;
  ownerScope: QuestionBlueprintOwnerScope;
}): QuestionBlueprintLibraryEntry {
  return {
    answerSpecPattern: draft.answerSpecPattern,
    blueprintId: `qbl-${draft.draftId}-${hashStableJson([
      draft.questionPattern,
      draft.taxonomyTargets,
      action.actionId,
    ]).slice(0, 8)}`,
    createdAt: generatedAt,
    difficultyProfile: draft.difficultyProfile,
    distractorPattern: draft.distractorPattern.slice(0, 12),
    generationConstraints: draft.generationConstraints.slice(0, 16),
    originalityConstraints: draft.originalityConstraints.slice(0, 12),
    ownerScope,
    questionPattern: boundedText(draft.questionPattern, 500),
    requiredElements: draft.requiredElements.slice(0, 16),
    sourceExampleRefs: {
      assetRefs: draft.evidence.assetRefs.slice(0, 12),
      blueprintDraftId: draft.draftId,
      boundedSnippets: draft.evidence.boundedSnippets
        .map((snippet) => boundedText(snippet))
        .filter(Boolean)
        .slice(0, 8),
      reviewActionId: action.actionId,
      sourcePacketIds: draft.sourcePacketIds.slice(0, 12),
    },
    status: "draft",
    taxonomyTargets: draft.taxonomyTargets,
    updatedAt: generatedAt,
    version: 1,
  };
}

function statsFor(
  entries: QuestionBlueprintLibraryEntry[],
  warnings: string[],
): QuestionBlueprintLibraryPersistenceStats {
  return {
    generatedQuestionCount: 0,
    libraryEntryCount: entries.length,
    libraryWriteCount: 0,
    pendingApprovalEntryCount: entries.filter((entry) => entry.status === "draft")
      .length,
    rawStorageCount: 0,
    reviewDraftWriteCount: 0,
    warningCount: warnings.length,
  };
}

export function buildQuestionBlueprintLibraryPersistencePlan({
  draftPlan,
  generatedAt = new Date().toISOString(),
  ownerScope = "system",
  reviewPlan,
}: {
  draftPlan?: AIQuestionBlueprintDraftPlan | null;
  generatedAt?: string;
  ownerScope?: QuestionBlueprintOwnerScope;
  reviewPlan?: QuestionBlueprintReviewActionPlan | null;
}): QuestionBlueprintLibraryPersistencePlan {
  if (!draftPlan || !reviewPlan || reviewPlan.actions.length === 0) {
    const warnings = uniqueStrings([
      ...QUESTION_BLUEPRINT_LIBRARY_BASE_WARNINGS,
      "question_blueprint_library_no_review_actions",
    ]);

    return {
      entries: [],
      generatedAt,
      mode: "planning_only",
      sourceReviewPlanRef: reviewPlanRef(reviewPlan),
      stats: statsFor([], warnings),
      status: "skipped",
      version: "question_blueprint_library_persistence_plan_v1",
      warnings,
    };
  }

  const draftLookup = draftsById(draftPlan);
  const warnings: string[] = [...QUESTION_BLUEPRINT_LIBRARY_BASE_WARNINGS];
  const entries = reviewPlan.actions
    .filter((action) => action.actionKind === "approve_blueprint")
    .map((action) => {
      const draft = draftLookup.get(action.blueprintDraftId);

      if (!draft) {
        warnings.push(
          `question_blueprint_library_missing_draft:${action.blueprintDraftId}`,
        );
        return null;
      }

      return buildLibraryEntry({
        action,
        draft,
        generatedAt,
        ownerScope,
      });
    })
    .filter((entry): entry is QuestionBlueprintLibraryEntry => Boolean(entry));
  const finalWarnings = uniqueStrings([
    ...warnings,
    ...(entries.length ? [] : ["question_blueprint_library_no_approve_ready_actions"]),
  ]);

  return {
    entries,
    generatedAt,
    mode: "planning_only",
    sourceReviewPlanRef: reviewPlanRef(reviewPlan),
    stats: statsFor(entries, finalWarnings),
    status: entries.length ? "planned" : "skipped",
    version: "question_blueprint_library_persistence_plan_v1",
    warnings: finalWarnings,
  };
}

export function validateQuestionBlueprintLibraryPersistencePlan(
  plan: QuestionBlueprintLibraryPersistencePlan,
) {
  const errors: string[] = [];

  if (plan.mode !== "planning_only") {
    errors.push("question_blueprint_library_plan_must_be_planning_only");
  }

  if (plan.stats.libraryWriteCount !== 0) {
    errors.push("question_blueprint_library_plan_must_not_write_library_rows");
  }

  if (plan.stats.generatedQuestionCount !== 0) {
    errors.push("question_blueprint_library_plan_must_not_generate_questions");
  }

  if (plan.stats.reviewDraftWriteCount !== 0) {
    errors.push("question_blueprint_library_plan_must_not_write_review_drafts");
  }

  for (const entry of plan.entries) {
    if (entry.status !== "draft") {
      errors.push(`library entry ${entry.blueprintId} must remain draft`);
    }

    if (!entry.sourceExampleRefs.blueprintDraftId) {
      errors.push(`library entry ${entry.blueprintId} is missing source draft ref`);
    }
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}

export function mergeQuestionBlueprintLibraryPersistencePlanIntoSummary(
  aiPdfImport: Record<string, unknown>,
  questionBlueprintLibraryPersistencePlan: QuestionBlueprintLibraryPersistencePlan,
) {
  return {
    ...aiPdfImport,
    questionBlueprintLibraryPersistencePlan,
  };
}

export function summarizeQuestionBlueprintLibraryPersistencePlan(
  plan: QuestionBlueprintLibraryPersistencePlan | null | undefined,
) {
  if (!plan) {
    return {
      libraryEntryCount: 0,
      pendingApprovalEntryCount: 0,
      status: "missing",
      warningCount: 0,
    };
  }

  return {
    libraryEntryCount: plan.stats.libraryEntryCount,
    pendingApprovalEntryCount: plan.stats.pendingApprovalEntryCount,
    status: plan.status,
    warningCount: plan.stats.warningCount,
  };
}
