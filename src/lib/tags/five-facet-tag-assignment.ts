import { createRequire } from "node:module";

import type {
  AIFiveFacetTagReviewActionDraft,
  AIFiveFacetTagReviewActionPlan,
} from "@/lib/ai-pdf-import/five-facet-tag-review-actions";
import type { AIFiveFacetTagCategory } from "@/lib/ai-pdf-import/five-facet-tag-taxonomy";
import type {
  FiveFacetQuestionTagAssignmentInput,
  FiveFacetQuestionTagAssignmentRow,
} from "@/lib/tags/five-facet-tag-persistence";

const require = createRequire(import.meta.url);
const {
  getCurriculumConceptMappings,
  getFiveFacetTagNode,
  listFiveFacetTagCategories,
} = require("./five-facet-tag-catalog.ts") as typeof import("@/lib/tags/five-facet-tag-catalog");
const {
  validateFiveFacetQuestionTagAssignment,
} = require("./five-facet-tag-persistence.ts") as typeof import("@/lib/tags/five-facet-tag-persistence");

type AssignmentSource =
  | "ai_suggestion"
  | "batch_import"
  | "manual"
  | "review_action";

export type FiveFacetTagSearchCategoryFilter = Partial<
  Record<AIFiveFacetTagCategory, string[]>
>;

export interface FiveFacetQuestionTagSearchFilterInput {
  difficulty?: {
    max?: number;
    min?: number;
  };
  exclude?: FiveFacetTagSearchCategoryFilter;
  include?: FiveFacetTagSearchCategoryFilter;
  requireReviewed?: boolean;
}

export interface FiveFacetQuestionTagSearchPlan {
  errors: string[];
  filter: {
    difficulty?: {
      max?: number;
      min?: number;
    };
    exclude: Record<AIFiveFacetTagCategory, string[]>;
    include: Record<AIFiveFacetTagCategory, string[]>;
    requireReviewed: boolean;
  };
  generatedAt: string;
  mode: "planning_only";
  noDbMutation: true;
  noExtractionBehaviorChange: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  searchContract: {
    assignmentTable: "five_facet_question_tag_assignments";
    curriculumConceptExpansion: Array<{
      conceptTagIds: string[];
      curriculumTagId: string;
      hierarchyMutation: false;
    }>;
    difficultyIsNumericOnly: true;
    errorPatternIsNotQuestionTaxonomy: true;
    reviewStatusFilter: "approved" | "any_review_status";
  };
  valid: boolean;
  version: "five_facet_question_tag_search_plan_v1";
  warnings: string[];
}

export interface FiveFacetAssignmentSummary {
  approvedCount: number;
  byCategory: Record<AIFiveFacetTagCategory, number>;
  pendingReviewCount: number;
  questionCount: number;
  rejectedCount: number;
  rowCount: number;
}

type ReviewActionLike = AIFiveFacetTagReviewActionDraft & {
  reviewStatus?: unknown;
  review_status?: unknown;
};

const FIVE_FACET_CATEGORIES = listFiveFacetTagCategories();

function emptyCategoryMap(): Record<AIFiveFacetTagCategory, string[]> {
  return FIVE_FACET_CATEGORIES.reduce(
    (accumulator, category) => ({
      ...accumulator,
      [category]: [],
    }),
    {} as Record<AIFiveFacetTagCategory, string[]>,
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isFiveFacetCategory(
  category: string,
): category is AIFiveFacetTagCategory {
  return FIVE_FACET_CATEGORIES.includes(category as AIFiveFacetTagCategory);
}

function isUuidLike(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function actionReviewStatus(action: ReviewActionLike) {
  if (typeof action.reviewStatus === "string") {
    return action.reviewStatus;
  }

  if (typeof action.review_status === "string") {
    return action.review_status;
  }

  return action.status;
}

function actionAssignmentKind(action: AIFiveFacetTagReviewActionDraft) {
  return (
    action.actionKind === "approve_bundle" ||
    action.actionKind === "approve_single_tag"
  );
}

function normalizeCategoryFilter(
  filter: FiveFacetTagSearchCategoryFilter | undefined,
  scope: "exclude" | "include",
) {
  const normalized = emptyCategoryMap();
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [category, values] of Object.entries(filter ?? {})) {
    if (category === "difficulty") {
      errors.push(`${scope}.difficulty_is_numeric_field_not_taxonomy_category`);
      continue;
    }
    if (category === "error_pattern") {
      errors.push(`${scope}.error_pattern_is_attempt_diagnosis_not_question_taxonomy`);
      continue;
    }
    if (!isFiveFacetCategory(category)) {
      errors.push(`${scope}.unknown_five_facet_category:${category}`);
      continue;
    }

    normalized[category] = uniqueStrings(values ?? []);

    for (const tagId of normalized[category]) {
      const node = getFiveFacetTagNode(tagId);
      if (!node) {
        errors.push(`${scope}.unknown_tag:${tagId}`);
        continue;
      }
      if (node.category !== category) {
        errors.push(`${scope}.wrong_category:${tagId}:expected_${category}`);
      }
    }
  }

  if (normalized.curriculum.length) {
    warnings.push(`${scope}.curriculum_expands_to_concepts_without_hierarchy_mutation`);
  }

  return { errors, normalized, warnings };
}

function normalizeDifficulty(
  difficulty: FiveFacetQuestionTagSearchFilterInput["difficulty"],
) {
  const errors: string[] = [];
  const normalized: { max?: number; min?: number } = {};

  if (difficulty?.min !== undefined) {
    if (!Number.isFinite(difficulty.min)) {
      errors.push("difficulty.min_must_be_numeric");
    } else {
      normalized.min = difficulty.min;
    }
  }
  if (difficulty?.max !== undefined) {
    if (!Number.isFinite(difficulty.max)) {
      errors.push("difficulty.max_must_be_numeric");
    } else {
      normalized.max = difficulty.max;
    }
  }
  if (
    normalized.min !== undefined &&
    normalized.max !== undefined &&
    normalized.min > normalized.max
  ) {
    errors.push("difficulty.min_cannot_exceed_max");
  }

  return { errors, normalized };
}

function curriculumConceptExpansion(curriculumTagIds: string[]) {
  return curriculumTagIds.map((curriculumTagId) => ({
    conceptTagIds: getCurriculumConceptMappings(curriculumTagId).map(
      (node) => node.tagId,
    ),
    curriculumTagId,
    hierarchyMutation: false as const,
  }));
}

export function validateApprovedFiveFacetReviewAction(
  action: AIFiveFacetTagReviewActionDraft,
) {
  const actionRecord = action as ReviewActionLike;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (actionReviewStatus(actionRecord) !== "approved") {
    errors.push(`review_action_not_approved:${action.actionId}`);
  }
  if (!actionAssignmentKind(action)) {
    errors.push(`review_action_kind_not_assignment:${action.actionKind}`);
  }
  if (!isUuidLike(action.questionRef.id)) {
    errors.push(`review_action_missing_valid_question_id:${action.actionId}`);
  }
  if (!action.proposedTagIds.length) {
    errors.push(`review_action_missing_proposed_tags:${action.actionId}`);
  }

  for (const tagId of action.proposedTagIds) {
    const node = getFiveFacetTagNode(tagId);
    if (!node) {
      errors.push(`unknown_five_facet_tag:${tagId}`);
    }
  }

  if (action.reviewRequired !== true) {
    warnings.push(`review_action_missing_human_review_flag:${action.actionId}`);
  }

  return {
    action,
    errors,
    valid: errors.length === 0,
    warnings,
  };
}

export function validateFiveFacetQuestionTagAssignmentRow(
  assignment: FiveFacetQuestionTagAssignmentInput,
) {
  return validateFiveFacetQuestionTagAssignment(assignment);
}

export function buildFiveFacetQuestionTagAssignmentsFromApprovedActions(
  input: AIFiveFacetTagReviewActionDraft[] | AIFiveFacetTagReviewActionPlan,
) {
  const actions = Array.isArray(input) ? input : input.actions;
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: FiveFacetQuestionTagAssignmentRow[] = [];
  const seen = new Set<string>();

  for (const action of actions) {
    const actionValidation = validateApprovedFiveFacetReviewAction(action);
    if (!actionValidation.valid) {
      errors.push(...actionValidation.errors);
      warnings.push(...actionValidation.warnings);
      continue;
    }

    for (const tagId of action.proposedTagIds) {
      const node = getFiveFacetTagNode(tagId);
      if (!node || !action.questionRef.id) continue;

      const assignment = validateFiveFacetQuestionTagAssignmentRow({
        category: node.category,
        confidence: action.confidence,
        evidence: {
          actionId: action.actionId,
          actionKind: action.actionKind,
          reason: action.reason,
        },
        question_id: action.questionRef.id,
        review_status: "approved",
        source: "review_action" satisfies AssignmentSource,
        tag_id: tagId,
      });

      if (!assignment.row) {
        errors.push(...assignment.errors);
        warnings.push(...assignment.warnings);
        continue;
      }

      const key = `${assignment.row.question_id}:${assignment.row.tag_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(assignment.row);
      warnings.push(...assignment.warnings);
    }
  }

  return {
    errors: uniqueStrings(errors),
    rows,
    valid: errors.length === 0,
    warnings: uniqueStrings(warnings),
  };
}

export function buildFiveFacetQuestionTagSearchFilter(
  filter: FiveFacetQuestionTagSearchFilterInput,
) {
  const include = normalizeCategoryFilter(filter.include, "include");
  const exclude = normalizeCategoryFilter(filter.exclude, "exclude");
  const difficulty = normalizeDifficulty(filter.difficulty);
  const errors = [
    ...include.errors,
    ...exclude.errors,
    ...difficulty.errors,
  ];
  const warnings = [...include.warnings, ...exclude.warnings];

  return {
    errors,
    filter: {
      difficulty:
        difficulty.normalized.min !== undefined ||
        difficulty.normalized.max !== undefined
          ? difficulty.normalized
          : undefined,
      exclude: exclude.normalized,
      include: include.normalized,
      requireReviewed: filter.requireReviewed ?? true,
    },
    valid: errors.length === 0,
    warnings: uniqueStrings(warnings),
  };
}

export function buildFiveFacetQuestionTagSearchPlan(
  filter: FiveFacetQuestionTagSearchFilterInput,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): FiveFacetQuestionTagSearchPlan {
  const normalized = buildFiveFacetQuestionTagSearchFilter(filter);

  return {
    errors: normalized.errors,
    filter: normalized.filter,
    generatedAt,
    mode: "planning_only",
    noDbMutation: true,
    noExtractionBehaviorChange: true,
    noProviderCall: true,
    noReviewDraftWrite: true,
    searchContract: {
      assignmentTable: "five_facet_question_tag_assignments",
      curriculumConceptExpansion: curriculumConceptExpansion(
        normalized.filter.include.curriculum,
      ),
      difficultyIsNumericOnly: true,
      errorPatternIsNotQuestionTaxonomy: true,
      reviewStatusFilter: normalized.filter.requireReviewed
        ? "approved"
        : "any_review_status",
    },
    valid: normalized.valid,
    version: "five_facet_question_tag_search_plan_v1",
    warnings: normalized.warnings,
  };
}

export function summarizeFiveFacetQuestionTagAssignments(
  rows: FiveFacetQuestionTagAssignmentRow[],
): FiveFacetAssignmentSummary {
  const byCategory = Object.fromEntries(
    FIVE_FACET_CATEGORIES.map((category) => [category, 0]),
  ) as Record<AIFiveFacetTagCategory, number>;
  const questionIds = new Set<string>();
  let approvedCount = 0;
  let pendingReviewCount = 0;
  let rejectedCount = 0;

  for (const row of rows) {
    byCategory[row.category] += 1;
    questionIds.add(row.question_id);
    if (row.review_status === "approved") approvedCount += 1;
    if (row.review_status === "pending_review") pendingReviewCount += 1;
    if (row.review_status === "rejected") rejectedCount += 1;
  }

  return {
    approvedCount,
    byCategory,
    pendingReviewCount,
    questionCount: questionIds.size,
    rejectedCount,
    rowCount: rows.length,
  };
}
