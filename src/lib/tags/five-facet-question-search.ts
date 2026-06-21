import { createRequire } from "node:module";

import type { AIFiveFacetTagCategory } from "@/lib/ai-pdf-import/five-facet-tag-taxonomy";
import type {
  FiveFacetQuestionTagSearchFilterInput,
  FiveFacetQuestionTagSearchPlan,
} from "@/lib/tags/five-facet-tag-assignment";

const require = createRequire(import.meta.url);
const {
  buildFiveFacetQuestionTagSearchPlan,
} = require("./five-facet-tag-assignment.ts") as typeof import("@/lib/tags/five-facet-tag-assignment");
const {
  getCurriculumConceptMappings,
  listFiveFacetTagCategories,
} = require("./five-facet-tag-catalog.ts") as typeof import("@/lib/tags/five-facet-tag-catalog");

export interface FiveFacetQuestionSearchAssignmentRow {
  category: AIFiveFacetTagCategory;
  question_id: string;
  review_status: string;
  tag_id: string;
}

export interface FiveFacetQuestionSearchQuestionRow {
  difficulty_rating?: number | null;
  id: string;
}

export interface FiveFacetQuestionBankSearchPlan {
  assignmentQuery: {
    includeConceptExpansion: Array<{
      conceptTagIds: string[];
      curriculumTagId: string;
      hierarchyMutation: false;
    }>;
    requireReviewed: boolean;
    table: "five_facet_question_tag_assignments";
  };
  errors: string[];
  filter: FiveFacetQuestionTagSearchPlan["filter"];
  generatedAt: string;
  mode: "planning_only";
  noDbMutation: true;
  noExtractionBehaviorChange: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  searchContract: FiveFacetQuestionTagSearchPlan["searchContract"];
  valid: boolean;
  version: "five_facet_question_bank_search_plan_v1";
  warnings: string[];
}

export interface FiveFacetQuestionBankSearchResult {
  errors: string[];
  matchedQuestionIds: string[];
  plan: FiveFacetQuestionBankSearchPlan;
  valid: boolean;
  warnings: string[];
}

const FIVE_FACET_CATEGORIES = listFiveFacetTagCategories();

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function emptyCategoryMap(): Record<AIFiveFacetTagCategory, string[]> {
  return FIVE_FACET_CATEGORIES.reduce(
    (accumulator, category) => ({
      ...accumulator,
      [category]: [],
    }),
    {} as Record<AIFiveFacetTagCategory, string[]>,
  );
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

function questionDifficultyMatches(
  question: FiveFacetQuestionSearchQuestionRow,
  difficulty: FiveFacetQuestionBankSearchPlan["filter"]["difficulty"],
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
  assignments: FiveFacetQuestionSearchAssignmentRow[];
  category: AIFiveFacetTagCategory;
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
  assignments: FiveFacetQuestionSearchAssignmentRow[];
  plan: FiveFacetQuestionBankSearchPlan;
}) {
  const { include, requireReviewed } = plan.filter;

  for (const category of FIVE_FACET_CATEGORIES) {
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
  assignments: FiveFacetQuestionSearchAssignmentRow[];
  plan: FiveFacetQuestionBankSearchPlan;
}) {
  const { exclude, requireReviewed } = plan.filter;

  for (const category of FIVE_FACET_CATEGORIES) {
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

export function buildFiveFacetQuestionBankSearchPlan(
  filter: FiveFacetQuestionTagSearchFilterInput,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): FiveFacetQuestionBankSearchPlan {
  const searchPlan = buildFiveFacetQuestionTagSearchPlan(filter, {
    generatedAt,
  });

  return {
    assignmentQuery: {
      includeConceptExpansion: curriculumConceptExpansion(
        searchPlan.filter.include.curriculum,
      ),
      requireReviewed: searchPlan.filter.requireReviewed,
      table: "five_facet_question_tag_assignments",
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
    version: "five_facet_question_bank_search_plan_v1",
    warnings: searchPlan.warnings,
  };
}

export function filterQuestionsByFiveFacetAssignments({
  assignments,
  filter,
  questions,
}: {
  assignments: FiveFacetQuestionSearchAssignmentRow[];
  filter: FiveFacetQuestionTagSearchFilterInput;
  questions: FiveFacetQuestionSearchQuestionRow[];
}): FiveFacetQuestionBankSearchResult {
  const plan = buildFiveFacetQuestionBankSearchPlan(filter);
  if (!plan.valid) {
    return {
      errors: plan.errors,
      matchedQuestionIds: [],
      plan,
      valid: false,
      warnings: plan.warnings,
    };
  }

  const assignmentMap = new Map<string, FiveFacetQuestionSearchAssignmentRow[]>();
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

export function hasFiveFacetQuestionBankFilters(
  filter: FiveFacetQuestionTagSearchFilterInput,
) {
  const include = filter.include ?? {};
  const exclude = filter.exclude ?? {};
  return (
    Boolean(filter.difficulty?.min !== undefined || filter.difficulty?.max !== undefined) ||
    Object.values(include).some((values) => Boolean(values?.length)) ||
    Object.values(exclude).some((values) => Boolean(values?.length))
  );
}

export function emptyFiveFacetQuestionSearchFilter(): FiveFacetQuestionTagSearchFilterInput {
  return {
    exclude: emptyCategoryMap(),
    include: emptyCategoryMap(),
    requireReviewed: true,
  };
}
