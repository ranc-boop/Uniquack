import { createRequire } from "node:module";

import type {
  AIFiveFacetTagReviewActionDraft,
  AIFiveFacetTagReviewActionPlan,
} from "@/lib/ai-pdf-import/five-facet-tag-review-actions";
import type { AIFiveFacetTagCategory } from "@/lib/ai-pdf-import/five-facet-tag-taxonomy";

const require = createRequire(import.meta.url);
const {
  getFiveFacetTagNode,
  listFiveFacetTagCategories,
  listFiveFacetTagNodes,
  normalizeFiveFacetTagBundle,
  validateFiveFacetTagBundle,
} = require("./five-facet-tag-catalog.ts") as typeof import("@/lib/tags/five-facet-tag-catalog");

export type FiveFacetTagPersistencePlanVersion =
  "five_facet_tag_persistence_plan_v1";

export type FiveFacetReviewStatus =
  | "approved"
  | "archived"
  | "needs_review"
  | "pending_review"
  | "rejected";

export interface FiveFacetTagNodeRowInput {
  category: string;
  description?: string | null;
  label: string;
  status?: "active" | "archived" | "deprecated";
  tag_id: string;
}

export interface FiveFacetQuestionTagAssignmentInput {
  category: string;
  confidence?: number | null;
  evidence?: Record<string, unknown>;
  question_id: string;
  review_status?: FiveFacetReviewStatus;
  source?: "ai_suggestion" | "batch_import" | "manual" | "review_action";
  tag_id: string;
}

export interface FiveFacetQuestionTagAssignmentRow {
  category: AIFiveFacetTagCategory;
  confidence: number | null;
  evidence: Record<string, unknown>;
  question_id: string;
  review_status: FiveFacetReviewStatus;
  source: "ai_suggestion" | "batch_import" | "manual" | "review_action";
  tag_id: string;
}

export interface FiveFacetPersistenceValidationResult<T> {
  errors: string[];
  row: T | null;
  valid: boolean;
  warnings: string[];
}

export interface FiveFacetTagPersistencePlan {
  categories: AIFiveFacetTagCategory[];
  generatedAt: string;
  migration: "0009_five_facet_tag_persistence.sql";
  mode: "schema_foundation";
  safety: {
    noDbMutation: true;
    noOfficialTagWrite: true;
    noProviderCall: true;
    noReviewDraftWrite: true;
  };
  status: "planned";
  tableNames: string[];
  validation: {
    categoriesLimitedToFiveFacets: true;
    difficultyIsNumericMetadata: true;
    errorPatternIsAttemptDiagnosis: true;
    officialAssignmentsRequireReviewStatus: true;
    reviewActionsAuditable: true;
  };
  version: FiveFacetTagPersistencePlanVersion;
}

export interface FiveFacetTagPersistencePlanSummary {
  categoryCount: number;
  migration: string;
  nodeSeedCount: number;
  noDbMutation: true;
  noOfficialTagWrite: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  tableCount: number;
}

const FIVE_FACET_TABLE_NAMES = [
  "five_facet_tag_nodes",
  "five_facet_tag_edges",
  "five_facet_tag_aliases",
  "five_facet_curriculum_concept_mappings",
  "five_facet_question_tag_assignments",
  "five_facet_tag_review_actions",
] as const;

const REVIEW_STATUSES = new Set<FiveFacetReviewStatus>([
  "approved",
  "archived",
  "needs_review",
  "pending_review",
  "rejected",
]);

function isFiveFacetCategory(
  category: string,
): category is AIFiveFacetTagCategory {
  return listFiveFacetTagCategories().includes(
    category as AIFiveFacetTagCategory,
  );
}

function isReviewStatus(status: string): status is FiveFacetReviewStatus {
  return REVIEW_STATUSES.has(status as FiveFacetReviewStatus);
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function confidenceValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number.isFinite(value) ? value : NaN;
}

function uniqueRowsByQuestionAndTag(
  rows: FiveFacetQuestionTagAssignmentRow[],
) {
  const seen = new Set<string>();
  const uniqueRows: FiveFacetQuestionTagAssignmentRow[] = [];

  for (const row of rows) {
    const key = `${row.question_id}:${row.tag_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

export function buildFiveFacetCatalogPersistencePlan({
  generatedAt = new Date().toISOString(),
}: { generatedAt?: string } = {}): FiveFacetTagPersistencePlan {
  return {
    categories: listFiveFacetTagCategories(),
    generatedAt,
    migration: "0009_five_facet_tag_persistence.sql",
    mode: "schema_foundation",
    safety: {
      noDbMutation: true,
      noOfficialTagWrite: true,
      noProviderCall: true,
      noReviewDraftWrite: true,
    },
    status: "planned",
    tableNames: [...FIVE_FACET_TABLE_NAMES],
    validation: {
      categoriesLimitedToFiveFacets: true,
      difficultyIsNumericMetadata: true,
      errorPatternIsAttemptDiagnosis: true,
      officialAssignmentsRequireReviewStatus: true,
      reviewActionsAuditable: true,
    },
    version: "five_facet_tag_persistence_plan_v1",
  };
}

export function validateFiveFacetTagNodeRow(
  row: FiveFacetTagNodeRowInput,
): FiveFacetPersistenceValidationResult<FiveFacetTagNodeRowInput> {
  const errors: string[] = [];

  if (!row.tag_id?.trim()) {
    errors.push("tag_id_required");
  }
  if (!row.label?.trim()) {
    errors.push("label_required");
  }
  if (!isFiveFacetCategory(row.category)) {
    errors.push(`invalid_five_facet_category:${row.category}`);
  }
  if (/^difficulty(\.|$)/.test(row.tag_id)) {
    errors.push("difficulty_is_numeric_question_metadata_not_tag_category");
  }
  if (/^error_pattern(\.|$)/.test(row.tag_id)) {
    errors.push("error_pattern_is_attempt_diagnosis_not_question_taxonomy");
  }
  if (row.status && !["active", "archived", "deprecated"].includes(row.status)) {
    errors.push(`invalid_status:${row.status}`);
  }

  return {
    errors,
    row: errors.length ? null : row,
    valid: errors.length === 0,
    warnings: [],
  };
}

export function validateFiveFacetQuestionTagAssignment(
  assignment: FiveFacetQuestionTagAssignmentInput,
): FiveFacetPersistenceValidationResult<FiveFacetQuestionTagAssignmentRow> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const node = getFiveFacetTagNode(assignment.tag_id);
  const reviewStatus = assignment.review_status ?? "pending_review";
  const confidence = confidenceValue(assignment.confidence);
  const source = assignment.source ?? "manual";

  if (!isUuidLike(assignment.question_id)) {
    errors.push("question_id_must_be_uuid");
  }
  if (!isFiveFacetCategory(assignment.category)) {
    errors.push(`invalid_five_facet_category:${assignment.category}`);
  }
  if (assignment.category === "difficulty") {
    errors.push("difficulty_is_numeric_question_metadata_not_tag_category");
  }
  if (assignment.category === "error_pattern") {
    errors.push("error_pattern_is_attempt_diagnosis_not_question_taxonomy");
  }
  if (!node) {
    errors.push(`unknown_five_facet_tag:${assignment.tag_id}`);
  } else if (node.category !== assignment.category) {
    errors.push(`wrong_category:${assignment.tag_id}:expected_${assignment.category}`);
  }
  if (!isReviewStatus(reviewStatus)) {
    errors.push(`invalid_review_status:${reviewStatus}`);
  }
  if (
    source !== "manual" &&
    source !== "ai_suggestion" &&
    source !== "batch_import" &&
    source !== "review_action"
  ) {
    errors.push(`invalid_source:${source}`);
  }
  if (Number.isNaN(confidence) || (confidence !== null && (confidence < 0 || confidence > 1))) {
    errors.push("confidence_must_be_between_0_and_1");
  }
  if (reviewStatus === "approved" && confidence === null) {
    warnings.push("approved_assignment_without_confidence");
  }

  return {
    errors,
    row: errors.length
      ? null
      : {
          category: assignment.category as AIFiveFacetTagCategory,
          confidence,
          evidence: assignment.evidence ?? {},
          question_id: assignment.question_id,
          review_status: reviewStatus,
          source,
          tag_id: assignment.tag_id,
        },
    valid: errors.length === 0,
    warnings,
  };
}

export function buildQuestionTagAssignmentRowsFromApprovedReviewActions(
  reviewActionPlan: AIFiveFacetTagReviewActionPlan,
) {
  const rows: FiveFacetQuestionTagAssignmentRow[] = [];
  const warnings: string[] = [];

  for (const action of reviewActionPlan.actions) {
    const actionRecord = action as AIFiveFacetTagReviewActionDraft & {
      reviewStatus?: unknown;
      review_status?: unknown;
      status?: unknown;
    };
    const reviewStatus =
      typeof actionRecord.reviewStatus === "string"
        ? actionRecord.reviewStatus
        : typeof actionRecord.review_status === "string"
          ? actionRecord.review_status
          : typeof actionRecord.status === "string"
            ? actionRecord.status
            : "pending_review";

    if (reviewStatus !== "approved") {
      warnings.push(`review_action_not_approved:${action.actionId}`);
      continue;
    }

    if (
      action.actionKind !== "approve_bundle" &&
      action.actionKind !== "approve_single_tag"
    ) {
      warnings.push(`review_action_kind_not_assignment:${action.actionKind}`);
      continue;
    }

    const questionId = action.questionRef.id;
    if (!questionId) {
      warnings.push(`review_action_missing_question_id:${action.actionId}`);
      continue;
    }

    for (const tagId of action.proposedTagIds) {
      const node = getFiveFacetTagNode(tagId);
      if (!node) {
        warnings.push(`review_action_unknown_tag:${tagId}`);
        continue;
      }

      const validation = validateFiveFacetQuestionTagAssignment({
        category: node.category,
        confidence: action.confidence,
        evidence: {
          actionId: action.actionId,
          actionKind: action.actionKind,
          reason: action.reason,
        },
        question_id: questionId,
        review_status: "approved",
        source: "review_action",
        tag_id: tagId,
      });

      if (validation.row) {
        rows.push(validation.row);
      } else {
        warnings.push(...validation.errors);
      }
    }
  }

  return {
    rows: uniqueRowsByQuestionAndTag(rows),
    warnings: uniqueStrings(warnings),
  };
}

export function summarizeFiveFacetTagPersistencePlan(
  plan: FiveFacetTagPersistencePlan,
): FiveFacetTagPersistencePlanSummary {
  return {
    categoryCount: plan.categories.length,
    migration: plan.migration,
    nodeSeedCount: listFiveFacetTagNodes().length,
    noDbMutation: plan.safety.noDbMutation,
    noOfficialTagWrite: plan.safety.noOfficialTagWrite,
    noProviderCall: plan.safety.noProviderCall,
    noReviewDraftWrite: plan.safety.noReviewDraftWrite,
    tableCount: plan.tableNames.length,
  };
}

export function validateFiveFacetTagBundleForPersistence(
  bundle: Parameters<typeof validateFiveFacetTagBundle>[0],
) {
  return validateFiveFacetTagBundle(normalizeFiveFacetTagBundle(bundle));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
