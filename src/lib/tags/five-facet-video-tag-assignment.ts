import { createRequire } from "node:module";

import type { AIFiveFacetTagCategory } from "@/lib/ai-pdf-import/five-facet-tag-taxonomy";

const require = createRequire(import.meta.url);
const {
  getCurriculumConceptMappings,
  getFiveFacetTagNode,
  listFiveFacetTagCategories,
} = require("./five-facet-tag-catalog.ts") as typeof import("@/lib/tags/five-facet-tag-catalog");

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

export type FiveFacetVideoTagSearchCategoryFilter = Partial<
  Record<AIFiveFacetTagCategory, string[]>
>;

export interface FiveFacetVideoTagAssignmentInput {
  category: string;
  confidence?: number | null;
  evidence?: Record<string, unknown> | null;
  review_status?: string | null;
  source?: string | null;
  tag_id: string;
  video_id: string;
}

export interface FiveFacetVideoTagAssignmentRow {
  category: AIFiveFacetTagCategory;
  confidence: number | null;
  evidence: Record<string, unknown>;
  review_status: ReviewStatus;
  source: AssignmentSource;
  tag_id: string;
  video_id: string;
}

export interface FiveFacetVideoTagSearchFilterInput {
  exclude?: FiveFacetVideoTagSearchCategoryFilter;
  include?: FiveFacetVideoTagSearchCategoryFilter;
  requireReviewed?: boolean;
}

export interface FiveFacetVideoTagSearchPlan {
  errors: string[];
  filter: {
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
    assignmentTable: "five_facet_video_tag_assignments";
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
  version: "five_facet_video_tag_search_plan_v1";
  warnings: string[];
}

export interface FiveFacetVideoAssignmentSummary {
  approvedCount: number;
  byCategory: Record<AIFiveFacetTagCategory, number>;
  pendingReviewCount: number;
  rejectedCount: number;
  rowCount: number;
  videoCount: number;
}

const FIVE_FACET_CATEGORIES = listFiveFacetTagCategories();
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
  filter: FiveFacetVideoTagSearchCategoryFilter | undefined,
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

function curriculumConceptExpansion(curriculumTagIds: string[]) {
  return curriculumTagIds.map((curriculumTagId) => ({
    conceptTagIds: getCurriculumConceptMappings(curriculumTagId).map(
      (node) => node.tagId,
    ),
    curriculumTagId,
    hierarchyMutation: false as const,
  }));
}

export function validateFiveFacetVideoTagAssignmentRow(
  assignment: FiveFacetVideoTagAssignmentInput,
) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isUuidLike(assignment.video_id)) {
    errors.push("video_id_must_be_uuid");
  }
  if (!isFiveFacetCategory(assignment.category)) {
    errors.push(`unknown_five_facet_category:${assignment.category}`);
  }
  if (/^difficulty(\.|$)/.test(assignment.tag_id)) {
    errors.push("difficulty_is_not_taxonomy");
  }
  if (/^error_pattern(\.|$)/.test(assignment.tag_id)) {
    errors.push("error_pattern_is_not_video_taxonomy");
  }

  const node = getFiveFacetTagNode(assignment.tag_id);
  if (!node) {
    errors.push(`unknown_five_facet_tag:${assignment.tag_id}`);
  } else if (node.category !== assignment.category) {
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
            category: assignment.category as AIFiveFacetTagCategory,
            confidence,
            evidence: asRecord(assignment.evidence),
            review_status: reviewStatus as ReviewStatus,
            source: source as AssignmentSource,
            tag_id: assignment.tag_id,
            video_id: assignment.video_id,
          } satisfies FiveFacetVideoTagAssignmentRow)
        : null,
    valid: errors.length === 0,
    warnings,
  };
}

export function buildFiveFacetVideoTagSearchFilter(
  filter: FiveFacetVideoTagSearchFilterInput,
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

export function buildFiveFacetVideoTagSearchPlan(
  filter: FiveFacetVideoTagSearchFilterInput,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): FiveFacetVideoTagSearchPlan {
  const normalized = buildFiveFacetVideoTagSearchFilter(filter);

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
      assignmentTable: "five_facet_video_tag_assignments",
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
    version: "five_facet_video_tag_search_plan_v1",
    warnings: normalized.warnings,
  };
}

export function summarizeFiveFacetVideoTagAssignments(
  rows: FiveFacetVideoTagAssignmentRow[],
): FiveFacetVideoAssignmentSummary {
  const byCategory = Object.fromEntries(
    FIVE_FACET_CATEGORIES.map((category) => [category, 0]),
  ) as Record<AIFiveFacetTagCategory, number>;
  const videoIds = new Set<string>();
  let approvedCount = 0;
  let pendingReviewCount = 0;
  let rejectedCount = 0;

  for (const row of rows) {
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
