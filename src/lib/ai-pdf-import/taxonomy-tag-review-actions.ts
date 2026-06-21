import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";
import type {
  AITaxonomyQuestionRef,
  AITaxonomyQuestionTaggingPlan,
  AITaxonomyQuestionTaggingSuggestion,
} from "@/lib/ai-pdf-import/taxonomy-question-tagging";

export type AITaxonomyTagReviewActionKind =
  | "approve_bundle"
  | "reject_bundle"
  | "edit_bundle"
  | "approve_single_tag"
  | "reject_single_tag"
  | "replace_tag"
  | "mark_ambiguous"
  | "merge_alias_candidate"
  | "request_manual_review";

export interface AITaxonomyTagReviewActionSafety {
  noDbMutation: true;
  noOfficialTagWrite: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  planningOnly: true;
}

export interface AITaxonomyTagReviewActionDraft {
  actionId: string;
  actionKind: AITaxonomyTagReviewActionKind;
  confidence: number;
  evidence: Record<string, unknown>;
  proposedTagIds: string[];
  questionRef: AITaxonomyQuestionRef;
  reason: string;
  reviewRequired: true;
  safety: AITaxonomyTagReviewActionSafety;
  status: "pending_review";
  targetFacet: string | null;
  targetTagIds: string[];
}

export interface AITaxonomyTagReviewActionPlan {
  actionCount: number;
  actions: AITaxonomyTagReviewActionDraft[];
  generatedAt: string;
  mode: "planning_only";
  sourcePlanVersion?: string;
  status: "completed" | "completed_with_warnings" | "skipped" | "failed";
  version: "taxonomy_tag_review_action_plan_v2";
  warnings: string[];
}

const ACTION_SAFETY: AITaxonomyTagReviewActionSafety = {
  noDbMutation: true,
  noOfficialTagWrite: true,
  noProviderCall: true,
  noReviewDraftWrite: true,
  planningOnly: true,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function readTaggingPlan(
  summary: Record<string, unknown>,
): AITaxonomyQuestionTaggingPlan | null {
  const aiPdfImport = asRecord(summary.aiPdfImport ?? summary);
  const plan = asRecord(aiPdfImport.taxonomyQuestionTaggingPlan);
  return plan.version === "taxonomy_question_tagging_plan_v2"
    ? (plan as unknown as AITaxonomyQuestionTaggingPlan)
    : null;
}

function actionId(questionRef: AITaxonomyQuestionRef, sequence: number) {
  return `taxonomy-review-${
    questionRef.id ?? questionRef.questionCode ?? "question"
  }-${sequence}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function actionDraft({
  actionKind,
  proposedTagIds,
  questionRef,
  reason,
  sequence,
  suggestion,
  targetFacet = null,
  targetTagIds = [],
}: {
  actionKind: AITaxonomyTagReviewActionKind;
  proposedTagIds?: string[];
  questionRef: AITaxonomyQuestionRef;
  reason: string;
  sequence: number;
  suggestion: AITaxonomyQuestionTaggingSuggestion;
  targetFacet?: string | null;
  targetTagIds?: string[];
}): AITaxonomyTagReviewActionDraft {
  return {
    actionId: actionId(questionRef, sequence),
    actionKind,
    confidence: suggestion.confidence,
    evidence: {
      ...suggestion.evidence,
      validationErrors: suggestion.validation.errors,
      validationWarnings: suggestion.validation.warnings,
    },
    proposedTagIds: uniqueStrings(proposedTagIds ?? []),
    questionRef,
    reason,
    reviewRequired: true,
    safety: ACTION_SAFETY,
    status: "pending_review",
    targetFacet,
    targetTagIds: uniqueStrings(targetTagIds),
  };
}

function actionsForSuggestion(
  suggestion: AITaxonomyQuestionTaggingSuggestion,
  catalog: TaxonomyCatalogView,
) {
  const nodesById = new Map(catalog.nodes.map((node) => [node.tag_id, node]));
  const proposedTagIds = uniqueStrings(Object.values(suggestion.tags).flat());
  const validTagIds = proposedTagIds.filter((tagId) => {
    const node = nodesById.get(tagId);
    return node?.facet_key && suggestion.tags[node.facet_key]?.includes(tagId);
  });
  const invalidTagIds = proposedTagIds.filter(
    (tagId) => !validTagIds.includes(tagId),
  );
  const actions: AITaxonomyTagReviewActionDraft[] = [];
  let sequence = 0;

  actions.push(
    actionDraft({
      actionKind:
        suggestion.validation.valid && !invalidTagIds.length
          ? "approve_bundle"
          : "edit_bundle",
      proposedTagIds: validTagIds,
      questionRef: suggestion.questionRef,
      reason:
        suggestion.validation.valid && !invalidTagIds.length
          ? "Suggested tags exist in the current database taxonomy."
          : "Suggested tags require manual correction against the database taxonomy.",
      sequence: sequence++,
      suggestion,
    }),
  );

  for (const tagId of validTagIds) {
    const facetKey = nodesById.get(tagId)?.facet_key ?? null;
    actions.push(
      actionDraft({
        actionKind: "approve_single_tag",
        proposedTagIds: [tagId],
        questionRef: suggestion.questionRef,
        reason: "Tag exists in the current database taxonomy and matches its facet.",
        sequence: sequence++,
        suggestion,
        targetFacet: facetKey,
      }),
    );
  }

  for (const tagId of invalidTagIds) {
    actions.push(
      actionDraft({
        actionKind: "replace_tag",
        questionRef: suggestion.questionRef,
        reason: "Tag is absent from the current database taxonomy or assigned to the wrong facet.",
        sequence: sequence++,
        suggestion,
        targetTagIds: [tagId],
      }),
    );
  }

  return actions;
}

export function buildTaxonomyTagReviewActionPlanFromSummary(
  summary: Record<string, unknown>,
  catalog: TaxonomyCatalogView,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): AITaxonomyTagReviewActionPlan {
  const taggingPlan = readTaggingPlan(summary);
  const suggestions = taggingPlan?.suggestions ?? [];
  const actions = suggestions.flatMap((suggestion) =>
    actionsForSuggestion(suggestion, catalog),
  );
  const warnings = uniqueStrings([
    ...(taggingPlan ? [] : ["taxonomy_review_actions_no_tagging_plan"]),
    ...(catalog.nodes.length ? [] : ["taxonomy_database_catalog_empty"]),
  ]);

  return {
    actionCount: actions.length,
    actions,
    generatedAt,
    mode: "planning_only",
    sourcePlanVersion: taggingPlan?.version,
    status: actions.length
      ? warnings.length
        ? "completed_with_warnings"
        : "completed"
      : "skipped",
    version: "taxonomy_tag_review_action_plan_v2",
    warnings,
  };
}

export function failedTaxonomyTagReviewActionPlan({
  generatedAt = new Date().toISOString(),
  warnings = [],
}: {
  generatedAt?: string;
  warnings?: string[];
} = {}): AITaxonomyTagReviewActionPlan {
  return {
    actionCount: 0,
    actions: [],
    generatedAt,
    mode: "planning_only",
    status: "failed",
    version: "taxonomy_tag_review_action_plan_v2",
    warnings: uniqueStrings(["taxonomy_review_actions_failed", ...warnings]),
  };
}

export function mergeTaxonomyTagReviewActionPlanIntoSummary(
  aiPdfImport: Record<string, unknown> | null | undefined,
  taxonomyTagReviewActionPlan: AITaxonomyTagReviewActionPlan,
) {
  return {
    ...(aiPdfImport ?? {}),
    taxonomyTagReviewActionPlan,
  };
}
