import { createRequire } from "node:module";

import type { AITaxonomyTagCategory } from "@/lib/ai-pdf-import/taxonomy-tag-taxonomy";
import type {
  TaxonomyQuestionTagSearchFilterInput,
  TaxonomyQuestionTagSearchPlan,
} from "@/lib/tags/taxonomy-tag-assignment";

const require = createRequire(import.meta.url);
const {
  buildTaxonomyQuestionTagSearchPlan,
} = require("./taxonomy-tag-assignment.ts") as typeof import("@/lib/tags/taxonomy-tag-assignment");

export interface TaxonomyQuestionSearchAssignmentRow {
  category: AITaxonomyTagCategory;
  question_id: string;
  review_status: string;
  tag_id: string;
}

export interface TaxonomyQuestionSearchQuestionRow {
  difficulty_rating?: number | null;
  id: string;
}

export interface TaxonomyQuestionBankSearchPlan {
  assignmentQuery: {
    includeConceptExpansion: Array<{
      conceptTagIds: string[];
      curriculumTagId: string;
      hierarchyMutation: false;
    }>;
    requireReviewed: boolean;
    table: "question_taxonomy_assignments";
  };
  errors: string[];
  filter: TaxonomyQuestionTagSearchPlan["filter"];
  generatedAt: string;
  mode: "planning_only";
  noDbMutation: true;
  noExtractionBehaviorChange: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  searchContract: TaxonomyQuestionTagSearchPlan["searchContract"];
  valid: boolean;
  version: "taxonomy_question_bank_search_plan_v1";
  warnings: string[];
}

export interface TaxonomyQuestionBankSearchResult {
  errors: string[];
  matchedQuestionIds: string[];
  plan: TaxonomyQuestionBankSearchPlan;
  valid: boolean;
  warnings: string[];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function taxonomyCategoriesFromFilter(filter: TaxonomyQuestionTagSearchFilterInput) {
  return uniqueStrings([
    ...Object.keys(filter.include ?? {}),
    ...Object.keys(filter.exclude ?? {}),
  ]) as AITaxonomyTagCategory[];
}

function emptyCategoryMap(
  categories: string[] = ["curriculum", "concept", "method", "task", "form"],
): Record<AITaxonomyTagCategory, string[]> {
  return categories.reduce(
    (accumulator, category) => ({
      ...accumulator,
      [category]: [],
    }),
    {} as Record<AITaxonomyTagCategory, string[]>,
  );
}

function curriculumConceptExpansion(curriculumTagIds: string[]) {
  return curriculumTagIds.map((curriculumTagId) => ({
    conceptTagIds: [],
    curriculumTagId,
    hierarchyMutation: false as const,
  }));
}

function questionDifficultyMatches(
  question: TaxonomyQuestionSearchQuestionRow,
  difficulty: TaxonomyQuestionBankSearchPlan["filter"]["difficulty"],
) {
  if (!difficulty) return true;
  const value = question.difficulty_rating;
  if (value === null || value === undefined) return false;
  if (difficulty.min !== undefined && value < difficulty.min) return false;
  if (difficulty.max !== undefined && value > difficulty.max) return false;

  return true;
}

function assignmentMatchesTagSet({
  assignments,
  category,
  requireReviewed,
  tagIds,
}: {
  assignments: TaxonomyQuestionSearchAssignmentRow[];
  category: AITaxonomyTagCategory;
  requireReviewed: boolean;
  tagIds: string[];
}) {
  if (!tagIds.length) return true;
  const wanted = new Set(tagIds);

  return assignments.some(
    (assignment) =>
      assignment.category === category &&
      wanted.has(assignment.tag_id) &&
      (!requireReviewed || assignment.review_status === "approved"),
  );
}

function questionMatchesIncludeFilters({
  assignments,
  plan,
}: {
  assignments: TaxonomyQuestionSearchAssignmentRow[];
  plan: TaxonomyQuestionBankSearchPlan;
}) {
  const { include, requireReviewed } = plan.filter;
  const categories = taxonomyCategoriesFromFilter(plan.filter);

  for (const category of categories) {
    if (!include[category].length) continue;

    if (
      assignmentMatchesTagSet({
        assignments,
        category,
        requireReviewed,
        tagIds: include[category],
      })
    ) {
      continue;
    }

    if (category === "curriculum") {
      const expandedConceptTagIds = plan.assignmentQuery.includeConceptExpansion
        .filter((mapping) => include.curriculum.includes(mapping.curriculumTagId))
        .flatMap((mapping) => mapping.conceptTagIds);
      if (
        assignmentMatchesTagSet({
          assignments,
          category: "concept",
          requireReviewed,
          tagIds: expandedConceptTagIds,
        })
      ) {
        continue;
      }
    }

    return false;
  }

  return true;
}

function questionMatchesExcludeFilters({
  assignments,
  plan,
}: {
  assignments: TaxonomyQuestionSearchAssignmentRow[];
  plan: TaxonomyQuestionBankSearchPlan;
}) {
  const { exclude, requireReviewed } = plan.filter;
  const categories = taxonomyCategoriesFromFilter(plan.filter);

  for (const category of categories) {
    if (!exclude[category].length) continue;

    if (
      assignmentMatchesTagSet({
        assignments,
        category,
        requireReviewed,
        tagIds: exclude[category],
      })
    ) {
      return false;
    }
  }

  return true;
}

export function buildTaxonomyQuestionBankSearchPlan(
  filter: TaxonomyQuestionTagSearchFilterInput,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): TaxonomyQuestionBankSearchPlan {
  const searchPlan = buildTaxonomyQuestionTagSearchPlan(filter, {
    generatedAt,
  });

  return {
    assignmentQuery: {
      includeConceptExpansion: curriculumConceptExpansion(
        searchPlan.filter.include.curriculum,
      ),
      requireReviewed: searchPlan.filter.requireReviewed,
      table: "question_taxonomy_assignments",
    },
    errors: searchPlan.errors,
    filter: searchPlan.filter,
    generatedAt,
    mode: "planning_only",
    noDbMutation: true,
    noExtractionBehaviorChange: true,
    noProviderCall: true,
    noReviewDraftWrite: true,
    searchContract: searchPlan.searchContract,
    valid: searchPlan.valid,
    version: "taxonomy_question_bank_search_plan_v1",
    warnings: searchPlan.warnings,
  };
}

export function filterQuestionsByTaxonomyAssignments({
  assignments,
  filter,
  questions,
}: {
  assignments: TaxonomyQuestionSearchAssignmentRow[];
  filter: TaxonomyQuestionTagSearchFilterInput;
  questions: TaxonomyQuestionSearchQuestionRow[];
}): TaxonomyQuestionBankSearchResult {
  const plan = buildTaxonomyQuestionBankSearchPlan(filter);
  if (!plan.valid) {
    return {
      errors: plan.errors,
      matchedQuestionIds: [],
      plan,
      valid: false,
      warnings: plan.warnings,
    };
  }

  const assignmentMap = new Map<string, TaxonomyQuestionSearchAssignmentRow[]>();
  for (const assignment of assignments) {
    assignmentMap.set(assignment.question_id, [
      ...(assignmentMap.get(assignment.question_id) ?? []),
      assignment,
    ]);
  }

  const matchedQuestionIds = questions
    .filter((question) => {
      if (!questionDifficultyMatches(question, plan.filter.difficulty)) {
        return false;
      }
      const questionAssignments = assignmentMap.get(question.id) ?? [];
      return (
        questionMatchesIncludeFilters({
          assignments: questionAssignments,
          plan,
        }) &&
        questionMatchesExcludeFilters({
          assignments: questionAssignments,
          plan,
        })
      );
    })
    .map((question) => question.id);

  return {
    errors: [],
    matchedQuestionIds: uniqueStrings(matchedQuestionIds),
    plan,
    valid: true,
    warnings: plan.warnings,
  };
}

export function hasTaxonomyQuestionBankFilters(
  filter: TaxonomyQuestionTagSearchFilterInput,
) {
  const include = filter.include ?? {};
  const exclude = filter.exclude ?? {};
  return (
    Boolean(filter.difficulty?.min !== undefined || filter.difficulty?.max !== undefined) ||
    Object.values(include).some((values) => Boolean(values?.length)) ||
    Object.values(exclude).some((values) => Boolean(values?.length))
  );
}

export function emptyTaxonomyQuestionSearchFilter(): TaxonomyQuestionTagSearchFilterInput {
  return {
    exclude: emptyCategoryMap(),
    include: emptyCategoryMap(),
    requireReviewed: true,
  };
}
