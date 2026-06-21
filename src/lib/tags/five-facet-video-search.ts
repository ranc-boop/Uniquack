import { createRequire } from "node:module";

import type { AIFiveFacetTagCategory } from "@/lib/ai-pdf-import/five-facet-tag-taxonomy";
import type {
  FiveFacetVideoTagSearchFilterInput,
  FiveFacetVideoTagSearchPlan,
} from "@/lib/tags/five-facet-video-tag-assignment";

const require = createRequire(import.meta.url);
const {
  buildFiveFacetVideoTagSearchPlan,
} = require("./five-facet-video-tag-assignment.ts") as typeof import("@/lib/tags/five-facet-video-tag-assignment");
const {
  getCurriculumConceptMappings,
  listFiveFacetTagCategories,
} = require("./five-facet-tag-catalog.ts") as typeof import("@/lib/tags/five-facet-tag-catalog");

export interface FiveFacetVideoSearchAssignmentRow {
  category: AIFiveFacetTagCategory;
  review_status: string;
  tag_id: string;
  video_id: string;
}

export interface FiveFacetVideoSearchVideoRow {
  id: string;
}

export interface FiveFacetVideoBankSearchPlan {
  assignmentQuery: {
    includeConceptExpansion: Array<{
      conceptTagIds: string[];
      curriculumTagId: string;
      hierarchyMutation: false;
    }>;
    requireReviewed: boolean;
    table: "five_facet_video_tag_assignments";
  };
  errors: string[];
  filter: FiveFacetVideoTagSearchPlan["filter"];
  generatedAt: string;
  mode: "planning_only";
  noDbMutation: true;
  noExtractionBehaviorChange: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  searchContract: FiveFacetVideoTagSearchPlan["searchContract"];
  valid: boolean;
  version: "five_facet_video_bank_search_plan_v1";
  warnings: string[];
}

export interface FiveFacetVideoBankSearchResult {
  errors: string[];
  matchedVideoIds: string[];
  plan: FiveFacetVideoBankSearchPlan;
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

function assignmentMatchesTagSet({
  assignments,
  category,
  requireReviewed,
  tagIds,
}: {
  assignments: FiveFacetVideoSearchAssignmentRow[];
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

function videoMatchesIncludeFilters({
  assignments,
  plan,
}: {
  assignments: FiveFacetVideoSearchAssignmentRow[];
  plan: FiveFacetVideoBankSearchPlan;
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

function videoMatchesExcludeFilters({
  assignments,
  plan,
}: {
  assignments: FiveFacetVideoSearchAssignmentRow[];
  plan: FiveFacetVideoBankSearchPlan;
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

export function buildFiveFacetVideoBankSearchPlan(
  filter: FiveFacetVideoTagSearchFilterInput,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): FiveFacetVideoBankSearchPlan {
  const searchPlan = buildFiveFacetVideoTagSearchPlan(filter, {
    generatedAt,
  });

  return {
    assignmentQuery: {
      includeConceptExpansion: curriculumConceptExpansion(
        searchPlan.filter.include.curriculum,
      ),
      requireReviewed: searchPlan.filter.requireReviewed,
      table: "five_facet_video_tag_assignments",
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
    version: "five_facet_video_bank_search_plan_v1",
    warnings: searchPlan.warnings,
  };
}

export function filterVideosByFiveFacetAssignments({
  assignments,
  filter,
  videos,
}: {
  assignments: FiveFacetVideoSearchAssignmentRow[];
  filter: FiveFacetVideoTagSearchFilterInput;
  videos: FiveFacetVideoSearchVideoRow[];
}): FiveFacetVideoBankSearchResult {
  const plan = buildFiveFacetVideoBankSearchPlan(filter);
  if (!plan.valid) {
    return {
      errors: plan.errors,
      matchedVideoIds: [],
      plan,
      valid: false,
      warnings: plan.warnings,
    };
  }

  const assignmentMap = new Map<string, FiveFacetVideoSearchAssignmentRow[]>();
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

export function hasFiveFacetVideoBankFilters(
  filter: FiveFacetVideoTagSearchFilterInput,
) {
  const include = filter.include ?? {};
  const exclude = filter.exclude ?? {};
  return (
    Object.values(include).some((values) => Boolean(values?.length)) ||
    Object.values(exclude).some((values) => Boolean(values?.length))
  );
}

export function emptyFiveFacetVideoSearchFilter(): FiveFacetVideoTagSearchFilterInput {
  return {
    exclude: emptyCategoryMap(),
    include: emptyCategoryMap(),
    requireReviewed: true,
  };
}
