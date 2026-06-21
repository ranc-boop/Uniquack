import { createRequire } from "node:module";

import type {
  AITaxonomyQuestionRef,
  AITaxonomyQuestionTaggingPlan,
  AITaxonomyQuestionTaggingSuggestion,
} from "@/lib/ai-pdf-import/taxonomy-question-tagging";
import type { AITaxonomyTagCategory } from "@/lib/ai-pdf-import/taxonomy-tag-taxonomy";

const require = createRequire(import.meta.url);
const {
  getTaxonomyTagNode,
  normalizeTaxonomyTagBundle,
  resolveTaxonomyAlias,
  validateTaxonomyTagBundle,
} = require("../tags/taxonomy-tag-catalog.ts") as typeof import("@/lib/tags/taxonomy-tag-catalog");

export type AITaxonomyTagReviewActionPlanVersion =
  "taxonomy_tag_review_action_plan_v1";

export type AITaxonomyTagReviewActionPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

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
  targetFacet: AITaxonomyTagCategory | null;
  targetTagIds: string[];
}

export interface AITaxonomyTagReviewActionPlan {
  actionCount: number;
  actions: AITaxonomyTagReviewActionDraft[];
  generatedAt: string;
  mode: "planning_only";
  sourcePlanVersion?: string;
  status: AITaxonomyTagReviewActionPlanStatus;
  validation: {
    allActionsPendingReview: boolean;
    allActionsRequireHumanReview: boolean;
    noDbMutation: true;
    noOfficialTagWrite: true;
    noProviderCall: true;
    noReviewDraftWrite: true;
  };
  version: AITaxonomyTagReviewActionPlanVersion;
  warnings: string[];
}

const TAXONOMY_CATEGORIES = [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
] as const satisfies readonly AITaxonomyTagCategory[];

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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown) {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function numberValue(value: unknown, fallback = 0.1) {
  const numeric = Number(value);

  return Number.isFinite(numeric)
    ? Math.max(0, Math.min(1, Number(numeric.toFixed(2))))
    : fallback;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function questionKey(questionRef: AITaxonomyQuestionRef, index: number) {
  return questionRef.id ?? questionRef.questionCode ?? `question-${index + 1}`;
}

function actionId(parts: Array<number | string>) {
  return `taxonomy-review-${parts.join("-")}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function actionDraft({
  actionKind,
  confidence,
  evidence,
  index,
  questionRef,
  reason,
  sequence,
  targetFacet,
  targetTagIds = [],
  proposedTagIds = [],
}: {
  actionKind: AITaxonomyTagReviewActionKind;
  confidence: number;
  evidence: Record<string, unknown>;
  index: number;
  proposedTagIds?: string[];
  questionRef: AITaxonomyQuestionRef;
  reason: string;
  sequence: number;
  targetFacet: AITaxonomyTagCategory | null;
  targetTagIds?: string[];
}): AITaxonomyTagReviewActionDraft {
  return {
    actionId: actionId([questionKey(questionRef, index), actionKind, sequence]),
    actionKind,
    confidence,
    evidence,
    proposedTagIds: uniqueStrings(proposedTagIds),
    questionRef,
    reason,
    reviewRequired: true,
    safety: ACTION_SAFETY,
    status: "pending_review",
    targetFacet,
    targetTagIds: uniqueStrings(targetTagIds),
  };
}

function normalizedSuggestionBundle(
  suggestion: AITaxonomyQuestionTaggingSuggestion,
) {
  return normalizeTaxonomyTagBundle({
    difficulty: suggestion.difficultySuggestion,
    tags: suggestion.tags,
  });
}

function ambiguousAliases(suggestion: AITaxonomyQuestionTaggingSuggestion) {
  const warningAliases = suggestion.warnings
    .map((warning) => /^ambiguous_alias:(.+)$/.exec(warning)?.[1] ?? "")
    .filter(Boolean);
  const evidenceAliases = asRecord(suggestion.evidence).matchedAliases;

  return uniqueStrings([
    ...warningAliases,
    ...stringList(evidenceAliases).filter(
      (alias) => resolveTaxonomyAlias(alias).ambiguous,
    ),
  ]);
}

function missingFacetReasons(errors: string[]) {
  return TAXONOMY_CATEGORIES.filter((category) =>
    errors.includes(`too_few_${category}_tags`),
  );
}

function buildActionsForSuggestion(
  suggestion: AITaxonomyQuestionTaggingSuggestion,
  index: number,
) {
  const normalized = normalizedSuggestionBundle(suggestion);
  const validation = validateTaxonomyTagBundle(normalized);
  const warnings = uniqueStrings([
    ...suggestion.warnings,
    ...validation.warnings,
    ...validation.errors,
  ]);
  const confidence = numberValue(suggestion.confidence);
  const evidence = {
    ...asRecord(suggestion.evidence),
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
  };
  const actions: AITaxonomyTagReviewActionDraft[] = [];
  let sequence = 0;

  if (validation.valid && !warnings.some((warning) => warning.includes("ambiguous_alias:"))) {
    actions.push(
      actionDraft({
        actionKind: "approve_bundle",
        confidence,
        evidence,
        index,
        proposedTagIds: TAXONOMY_CATEGORIES.flatMap(
          (category) => normalized.tags[category],
        ),
        questionRef: suggestion.questionRef,
        reason: "Suggested taxonomy bundle passed catalog validation.",
        sequence: sequence++,
        targetFacet: null,
      }),
    );
  } else {
    actions.push(
      actionDraft({
        actionKind: "reject_bundle",
        confidence,
        evidence,
        index,
        questionRef: suggestion.questionRef,
        reason: "Suggested bundle needs review before it can be trusted.",
        sequence: sequence++,
        targetFacet: null,
        targetTagIds: TAXONOMY_CATEGORIES.flatMap(
          (category) => normalized.tags[category],
        ),
      }),
    );
    actions.push(
      actionDraft({
        actionKind: "edit_bundle",
        confidence,
        evidence,
        index,
        proposedTagIds: TAXONOMY_CATEGORIES.flatMap(
          (category) => normalized.tags[category],
        ),
        questionRef: suggestion.questionRef,
        reason: "Review and edit the taxonomy bundle before persistence.",
        sequence: sequence++,
        targetFacet: null,
      }),
    );
  }

  for (const category of TAXONOMY_CATEGORIES) {
    for (const tagId of normalized.tags[category]) {
      const node = getTaxonomyTagNode(tagId);
      if (!node || node.category !== category) {
        actions.push(
          actionDraft({
            actionKind: "reject_single_tag",
            confidence,
            evidence: { ...evidence, tagId },
            index,
            questionRef: suggestion.questionRef,
            reason: node
              ? `Tag belongs to ${node.category}, not ${category}.`
              : "Tag is not present in the taxonomy catalog.",
            sequence: sequence++,
            targetFacet: category,
            targetTagIds: [tagId],
          }),
        );
        actions.push(
          actionDraft({
            actionKind: "replace_tag",
            confidence,
            evidence: { ...evidence, tagId },
            index,
            questionRef: suggestion.questionRef,
            reason: "Replace invalid tag with a catalog-backed tag during review.",
            sequence: sequence++,
            targetFacet: category,
            targetTagIds: [tagId],
          }),
        );
        continue;
      }

      if (validation.valid) {
        actions.push(
          actionDraft({
            actionKind: "approve_single_tag",
            confidence,
            evidence: { ...evidence, tagId },
            index,
            proposedTagIds: [tagId],
            questionRef: suggestion.questionRef,
            reason: "Individual tag is valid for its facet.",
            sequence: sequence++,
            targetFacet: category,
          }),
        );
      }
    }
  }

  for (const alias of ambiguousAliases(suggestion)) {
    const resolution = resolveTaxonomyAlias(alias);
    actions.push(
      actionDraft({
        actionKind: "mark_ambiguous",
        confidence,
        evidence: {
          ...evidence,
          alias,
          candidateTagIds: resolution.tagIds,
        },
        index,
        proposedTagIds: resolution.tagIds,
        questionRef: suggestion.questionRef,
        reason: `Alias "${alias}" maps to multiple taxonomy tags.`,
        sequence: sequence++,
        targetFacet: null,
      }),
    );
    actions.push(
      actionDraft({
        actionKind: "merge_alias_candidate",
        confidence,
        evidence: {
          ...evidence,
          alias,
          candidateTagIds: resolution.tagIds,
          normalizedAlias: resolution.normalizedAlias,
        },
        index,
        proposedTagIds: resolution.tagIds,
        questionRef: suggestion.questionRef,
        reason: "Review whether alias candidates should be merged or separated.",
        sequence: sequence++,
        targetFacet: null,
      }),
    );
  }

  for (const category of missingFacetReasons(validation.errors)) {
    actions.push(
      actionDraft({
        actionKind: "request_manual_review",
        confidence,
        evidence: { ...evidence, missingFacet: category },
        index,
        questionRef: suggestion.questionRef,
        reason: `Missing required ${category} facet tags.`,
        sequence: sequence++,
        targetFacet: category,
      }),
    );
  }

  if (!actions.length) {
    actions.push(
      actionDraft({
        actionKind: "request_manual_review",
        confidence,
        evidence,
        index,
        questionRef: suggestion.questionRef,
        reason: "Suggestion could not be classified into a safe review action.",
        sequence: sequence++,
        targetFacet: null,
      }),
    );
  }

  return { actions, warnings };
}

function readTaggingPlan(
  summary: Record<string, unknown>,
): AITaxonomyQuestionTaggingPlan | null {
  const aiPdfImport = asRecord(summary.aiPdfImport ?? summary);
  const plan = asRecord(aiPdfImport.taxonomyQuestionTaggingPlan);

  return plan.version === "taxonomy_question_tagging_plan_v1"
    ? (plan as unknown as AITaxonomyQuestionTaggingPlan)
    : null;
}

export function buildTaxonomyTagReviewActionPlanFromSummary(
  summary: Record<string, unknown>,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): AITaxonomyTagReviewActionPlan {
  const taggingPlan = readTaggingPlan(summary);
  const suggestions = taggingPlan?.suggestions ?? [];
  const actionResults = suggestions.map(buildActionsForSuggestion);
  const actions = actionResults.flatMap((result) => result.actions);
  const warnings = uniqueStrings([
    "taxonomy_review_actions_planning_only",
    "taxonomy_review_actions_no_db_write",
    "taxonomy_review_actions_no_official_tag_write",
    "taxonomy_review_actions_no_review_draft_write",
    ...(taggingPlan ? [] : ["taxonomy_review_actions_no_tagging_plan"]),
    ...(suggestions.length ? [] : ["taxonomy_review_actions_no_suggestions"]),
    ...actionResults.flatMap((result) => result.warnings),
  ]);

  return {
    actionCount: actions.length,
    actions,
    generatedAt,
    mode: "planning_only",
    sourcePlanVersion: taggingPlan?.version,
    status: actions.length
      ? warnings.length > 4
        ? "completed_with_warnings"
        : "completed"
      : "skipped",
    validation: {
      allActionsPendingReview: actions.every(
        (action) => action.status === "pending_review",
      ),
      allActionsRequireHumanReview: actions.every(
        (action) => action.reviewRequired === true,
      ),
      noDbMutation: true,
      noOfficialTagWrite: true,
      noProviderCall: true,
      noReviewDraftWrite: true,
    },
    version: "taxonomy_tag_review_action_plan_v1",
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
    validation: {
      allActionsPendingReview: false,
      allActionsRequireHumanReview: false,
      noDbMutation: true,
      noOfficialTagWrite: true,
      noProviderCall: true,
      noReviewDraftWrite: true,
    },
    version: "taxonomy_tag_review_action_plan_v1",
    warnings: uniqueStrings([
      "taxonomy_review_actions_failed",
      ...warnings,
    ]),
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
