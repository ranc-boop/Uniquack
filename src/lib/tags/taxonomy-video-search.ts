import { createRequire } from "node:module";

import type { AITaxonomyTagCategory } from "@/lib/ai-pdf-import/taxonomy-tag-taxonomy";
import type {
  TaxonomyVideoTagSearchFilterInput,
  TaxonomyVideoTagSearchPlan,
} from "@/lib/tags/taxonomy-video-tag-assignment";

const require = createRequire(import.meta.url);
const {
  buildTaxonomyVideoTagSearchPlan,
} = require("./taxonomy-video-tag-assignment.ts") as typeof import("@/lib/tags/taxonomy-video-tag-assignment");

export interface TaxonomyVideoSearchAssignmentRow {
  category: AITaxonomyTagCategory;
  review_status: string;
  tag_id: string;
  video_id: string;
}

export interface TaxonomyVideoSearchVideoRow {
  id: string;
}

export interface TaxonomyVideoBankSearchPlan {
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
  filter: TaxonomyVideoTagSearchPlan["filter"];
  generatedAt: string;
  mode: "planning_only";
  noDbMutation: true;
  noExtractionBehaviorChange: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  searchContract: TaxonomyVideoTagSearchPlan["searchContract"];
  valid: boolean;
  version: "taxonomy_video_bank_search_plan_v1";
  warnings: string[];
}

export interface TaxonomyVideoBankSearchResult {
  errors: string[];
  matchedVideoIds: string[];
  plan: TaxonomyVideoBankSearchPlan;
  valid: boolean;
  warnings: string[];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function taxonomyCategoriesFromFilter(filter: TaxonomyVideoTagSearchFilterInput) {
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

function assignmentMatchesTagSet({
  assignments,
  category,
  requireReviewed,
  tagIds,
}: {
  assignments: TaxonomyVideoSearchAssignmentRow[];
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

function videoMatchesIncludeFilters({
  assignments,
  plan,
}: {
  assignments: TaxonomyVideoSearchAssignmentRow[];
  plan: TaxonomyVideoBankSearchPlan;
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

function videoMatchesExcludeFilters({
  assignments,
  plan,
}: {
  assignments: TaxonomyVideoSearchAssignmentRow[];
  plan: TaxonomyVideoBankSearchPlan;
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

export function buildTaxonomyVideoBankSearchPlan(
  filter: TaxonomyVideoTagSearchFilterInput,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): TaxonomyVideoBankSearchPlan {
  const searchPlan = buildTaxonomyVideoTagSearchPlan(filter, {
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
    version: "taxonomy_video_bank_search_plan_v1",
    warnings: searchPlan.warnings,
  };
}

export function filterVideosByTaxonomyAssignments({
  assignments,
  filter,
  videos,
}: {
  assignments: TaxonomyVideoSearchAssignmentRow[];
  filter: TaxonomyVideoTagSearchFilterInput;
  videos: TaxonomyVideoSearchVideoRow[];
}): TaxonomyVideoBankSearchResult {
  const plan = buildTaxonomyVideoBankSearchPlan(filter);
  if (!plan.valid) {
    return {
      errors: plan.errors,
      matchedVideoIds: [],
      plan,
      valid: false,
      warnings: plan.warnings,
    };
  }

  const assignmentMap = new Map<string, TaxonomyVideoSearchAssignmentRow[]>();
  for (const assignment of assignments) {
    assignmentMap.set(assignment.video_id, [
      ...(assignmentMap.get(assignment.video_id) ?? []),
      assignment,
    ]);
  }

  const matchedVideoIds = videos
    .filter((video) => {
      const videoAssignments = assignmentMap.get(video.id) ?? [];
      return (
        videoMatchesIncludeFilters({
          assignments: videoAssignments,
          plan,
        }) &&
        videoMatchesExcludeFilters({
          assignments: videoAssignments,
          plan,
        })
      );
    })
    .map((video) => video.id);

  return {
    errors: [],
    matchedVideoIds: uniqueStrings(matchedVideoIds),
    plan,
    valid: true,
    warnings: plan.warnings,
  };
}

export function hasTaxonomyVideoBankFilters(
  filter: TaxonomyVideoTagSearchFilterInput,
) {
  const include = filter.include ?? {};
  const exclude = filter.exclude ?? {};
  return (
    Object.values(include).some((values) => Boolean(values?.length)) ||
    Object.values(exclude).some((values) => Boolean(values?.length))
  );
}

export function emptyTaxonomyVideoSearchFilter(): TaxonomyVideoTagSearchFilterInput {
  return {
    exclude: emptyCategoryMap(),
    include: emptyCategoryMap(),
    requireReviewed: true,
  };
}
