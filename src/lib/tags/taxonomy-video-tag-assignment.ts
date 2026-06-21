import type { AITaxonomyTagCategory } from "@/lib/ai-pdf-import/taxonomy-tag-taxonomy";

type AssignmentSource =
  | "ai_suggestion"
  | "batch_import"
  | "manual"
  | "review_action";

type ReviewStatus =
  | "approved"
  | "archived"
  | "needs_review"
  | "pending_review"
  | "rejected";

export type TaxonomyVideoTagSearchCategoryFilter = Partial<
  Record<AITaxonomyTagCategory, string[]>
>;

export interface TaxonomyVideoTagAssignmentInput {
  category: string;
  confidence?: number | null;
  evidence?: Record<string, unknown> | null;
  review_status?: string | null;
  source?: string | null;
  tag_id: string;
  video_id: string;
}

export interface TaxonomyVideoTagAssignmentRow {
  category: AITaxonomyTagCategory;
  confidence: number | null;
  evidence: Record<string, unknown>;
  review_status: ReviewStatus;
  source: AssignmentSource;
  tag_id: string;
  video_id: string;
}

export interface TaxonomyVideoTagSearchFilterInput {
  exclude?: TaxonomyVideoTagSearchCategoryFilter;
  include?: TaxonomyVideoTagSearchCategoryFilter;
  requireReviewed?: boolean;
}

export interface TaxonomyVideoTagSearchPlan {
  errors: string[];
  filter: {
    exclude: Record<AITaxonomyTagCategory, string[]>;
    include: Record<AITaxonomyTagCategory, string[]>;
    requireReviewed: boolean;
  };
  generatedAt: string;
  mode: "planning_only";
  noDbMutation: true;
  noExtractionBehaviorChange: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  searchContract: {
    assignmentTable: "question_taxonomy_assignments";
    curriculumConceptExpansion: Array<{
      conceptTagIds: string[];
      curriculumTagId: string;
      hierarchyMutation: false;
    }>;
    difficultyIsNumericOnly: true;
    errorPatternIsNotVideoTaxonomy: true;
    reviewStatusFilter: "approved" | "any_review_status";
  };
  valid: boolean;
  version: "taxonomy_video_tag_search_plan_v1";
  warnings: string[];
}

export interface TaxonomyVideoAssignmentSummary {
  approvedCount: number;
  byCategory: Record<AITaxonomyTagCategory, number>;
  pendingReviewCount: number;
  rejectedCount: number;
  rowCount: number;
  videoCount: number;
}

const DEFAULT_TAXONOMY_CATEGORIES = [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
] as AITaxonomyTagCategory[];
const REVIEW_STATUSES = new Set<string>([
  "approved",
  "archived",
  "needs_review",
  "pending_review",
  "rejected",
]);
const ASSIGNMENT_SOURCES = new Set<string>([
  "ai_suggestion",
  "batch_import",
  "manual",
  "review_action",
]);

function emptyCategoryMap(
  categories: AITaxonomyTagCategory[] = DEFAULT_TAXONOMY_CATEGORIES,
): Record<AITaxonomyTagCategory, string[]> {
  return categories.reduce(
    (accumulator, category) => ({
      ...accumulator,
      [category]: [],
    }),
    {} as Record<AITaxonomyTagCategory, string[]>,
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isTaxonomyCategory(
  category: string,
): category is AITaxonomyTagCategory {
  return /^[a-z][a-z0-9_]*$/.test(category);
}

function categoryFromTagId(tagId: string): AITaxonomyTagCategory | null {
  const category = tagId.split(".")[0];
  return isTaxonomyCategory(category) ? category : null;
}

function isUuidLike(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function normalizedConfidence(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : NaN;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeCategoryFilter(
  filter: TaxonomyVideoTagSearchCategoryFilter | undefined,
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
      errors.push(`${scope}.error_pattern_is_attempt_diagnosis_not_video_taxonomy`);
      continue;
    }
    if (!isTaxonomyCategory(category)) {
      errors.push(`${scope}.unknown_taxonomy_category:${category}`);
      continue;
    }

    normalized[category] = uniqueStrings(values ?? []);

    for (const tagId of normalized[category]) {
      if (categoryFromTagId(tagId) !== category) {
        errors.push(`${scope}.wrong_category:${tagId}:expected_${category}`);
      }
    }
  }

  if (normalized.curriculum.length) {
    warnings.push(`${scope}.curriculum_expands_to_concepts_without_hierarchy_mutation`);
  }

  return { errors, normalized, warnings };
}

function curriculumConceptExpansion(curriculumTagIds: string[]) {
  return curriculumTagIds.map((curriculumTagId) => ({
    conceptTagIds: [],
    curriculumTagId,
    hierarchyMutation: false as const,
  }));
}

export function validateTaxonomyVideoTagAssignmentRow(
  assignment: TaxonomyVideoTagAssignmentInput,
) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isUuidLike(assignment.video_id)) {
    errors.push("video_id_must_be_uuid");
  }
  if (!isTaxonomyCategory(assignment.category)) {
    errors.push(`unknown_taxonomy_category:${assignment.category}`);
  }
  if (/^difficulty(\.|$)/.test(assignment.tag_id)) {
    errors.push("difficulty_is_not_taxonomy");
  }
  if (/^error_pattern(\.|$)/.test(assignment.tag_id)) {
    errors.push("error_pattern_is_not_video_taxonomy");
  }

  if (!categoryFromTagId(assignment.tag_id)) {
    errors.push(`unknown_taxonomy_tag:${assignment.tag_id}`);
  } else if (categoryFromTagId(assignment.tag_id) !== assignment.category) {
    errors.push(`wrong_category:${assignment.tag_id}:expected_${assignment.category}`);
  }

  const confidence = normalizedConfidence(assignment.confidence);
  if (
    Number.isNaN(confidence) ||
    (confidence !== null && (confidence < 0 || confidence > 1))
  ) {
    errors.push("confidence_must_be_between_0_and_1");
  }

  const source = assignment.source ?? "manual";
  if (!ASSIGNMENT_SOURCES.has(source)) {
    errors.push(`unknown_assignment_source:${source}`);
  }

  const reviewStatus = assignment.review_status ?? "pending_review";
  if (!REVIEW_STATUSES.has(reviewStatus)) {
    errors.push(`unknown_review_status:${reviewStatus}`);
  }

  return {
    errors,
    row:
      errors.length === 0
        ? ({
            category: assignment.category as AITaxonomyTagCategory,
            confidence,
            evidence: asRecord(assignment.evidence),
            review_status: reviewStatus as ReviewStatus,
            source: source as AssignmentSource,
            tag_id: assignment.tag_id,
            video_id: assignment.video_id,
          } satisfies TaxonomyVideoTagAssignmentRow)
        : null,
    valid: errors.length === 0,
    warnings,
  };
}

export function buildTaxonomyVideoTagSearchFilter(
  filter: TaxonomyVideoTagSearchFilterInput,
) {
  const include = normalizeCategoryFilter(filter.include, "include");
  const exclude = normalizeCategoryFilter(filter.exclude, "exclude");
  const errors = [...include.errors, ...exclude.errors];
  const warnings = [...include.warnings, ...exclude.warnings];

  return {
    errors,
    filter: {
      exclude: exclude.normalized,
      include: include.normalized,
      requireReviewed: filter.requireReviewed ?? true,
    },
    valid: errors.length === 0,
    warnings: uniqueStrings(warnings),
  };
}

export function buildTaxonomyVideoTagSearchPlan(
  filter: TaxonomyVideoTagSearchFilterInput,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): TaxonomyVideoTagSearchPlan {
  const normalized = buildTaxonomyVideoTagSearchFilter(filter);

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
      assignmentTable: "question_taxonomy_assignments",
      curriculumConceptExpansion: curriculumConceptExpansion(
        normalized.filter.include.curriculum,
      ),
      difficultyIsNumericOnly: true,
      errorPatternIsNotVideoTaxonomy: true,
      reviewStatusFilter: normalized.filter.requireReviewed
        ? "approved"
        : "any_review_status",
    },
    valid: normalized.valid,
    version: "taxonomy_video_tag_search_plan_v1",
    warnings: normalized.warnings,
  };
}

export function summarizeTaxonomyVideoTagAssignments(
  rows: TaxonomyVideoTagAssignmentRow[],
): TaxonomyVideoAssignmentSummary {
  const byCategory = Object.fromEntries(
    DEFAULT_TAXONOMY_CATEGORIES.map((category) => [category, 0]),
  ) as Record<AITaxonomyTagCategory, number>;
  const videoIds = new Set<string>();
  let approvedCount = 0;
  let pendingReviewCount = 0;
  let rejectedCount = 0;

  for (const row of rows) {
    if (byCategory[row.category] === undefined) {
      byCategory[row.category] = 0;
    }
    byCategory[row.category] += 1;
    videoIds.add(row.video_id);
    if (row.review_status === "approved") approvedCount += 1;
    if (row.review_status === "pending_review") pendingReviewCount += 1;
    if (row.review_status === "rejected") rejectedCount += 1;
  }

  return {
    approvedCount,
    byCategory,
    pendingReviewCount,
    rejectedCount,
    rowCount: rows.length,
    videoCount: videoIds.size,
  };
}
