import type {
  TaxonomyCatalogView,
  TaxonomyNodeView,
} from "@/components/tags/taxonomy-tag-tree-picker";
import { taxonomyDisplayLabelFromId } from "@/lib/tags/taxonomy-display";

export const QUESTION_BLUEPRINT_PLAN_VERSION = "question_blueprint_plan_v1";
export const QUESTION_BLUEPRINT_FACETS = [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
] as const;
export const QUESTION_BLUEPRINT_QUESTION_TYPES = [
  "mcq",
  "fill_blank",
  "frq",
  "mixed",
] as const;

export type QuestionBlueprintFacet = (typeof QUESTION_BLUEPRINT_FACETS)[number];
export type QuestionBlueprintQuestionType =
  (typeof QUESTION_BLUEPRINT_QUESTION_TYPES)[number];

export type QuestionBlueprintDifficultyBucket = {
  count: number;
  label: string;
  max: number;
  min: number;
};

export type QuestionBlueprintQuestionTypeBucket = {
  count: number;
  questionType: QuestionBlueprintQuestionType;
};

export type QuestionBlueprintCandidateInput = {
  difficulty: number;
  hasAnswerSpec?: boolean;
  hasOptions?: boolean;
  id: string;
  questionCode?: string;
  questionType: QuestionBlueprintQuestionType;
  status?: string;
  tagIds: string[];
  title?: string;
};

export type QuestionBlueprintRequest = {
  difficultyDistribution: QuestionBlueprintDifficultyBucket[];
  questionCount: number;
  questionTypeDistribution: QuestionBlueprintQuestionTypeBucket[];
  targetTagIds?: string[];
  targetTagsByFacet?: Partial<Record<QuestionBlueprintFacet, string[]>>;
};

export type QuestionBlueprintValidationResult = {
  errors: string[];
  normalizedTargetTagIds: string[];
  valid: boolean;
  warnings: string[];
};

export type QuestionBlueprintRequirement = {
  desiredCount: number;
  existingCandidateCount: number;
  facet: QuestionBlueprintFacet;
  label: string;
  missingCount: number;
  tagId: string;
};

export type QuestionBlueprintSection = {
  facet: QuestionBlueprintFacet;
  requirementCount: number;
  requirements: QuestionBlueprintRequirement[];
  sectionId: string;
  title: string;
};

export type QuestionBlueprintCandidate = {
  difficulty: number;
  hasAnswerSpec: boolean;
  hasOptions: boolean;
  id: string;
  matchedTagIds: string[];
  questionCode?: string;
  questionType: QuestionBlueprintQuestionType;
  title?: string;
};

export type QuestionBlueprintCandidateSet = {
  candidates: QuestionBlueprintCandidate[];
  selectedCandidateIds: string[];
  searchPlan: {
    assignmentReviewStatus: "approved";
    difficultyMax: number;
    difficultyMin: number;
    includeTagIds: string[];
    questionStatus: "published";
    rpc: "search_questions_by_taxonomy";
  };
  warnings: string[];
};

export type QuestionBlueprintCoverageGap = {
  existingCount: number;
  facet: QuestionBlueprintFacet;
  generationRequestIds: string[];
  missingCount: number;
  reason: string;
  tagId: string;
};

export type QuestionBlueprintGenerationRequest = {
  count: number;
  difficultyRange: {
    max: number;
    min: number;
  };
  questionTypes: QuestionBlueprintQuestionType[];
  reason: string;
  requestId: string;
  reviewRequired: true;
  status: "draft";
  targetTagIds: string[];
};

export type QuestionBlueprintModelRoutingPlan = {
  noProviderCall: true;
  routes: Array<{
    modelHint: string;
    providerFamily: "local" | "deepseek" | "openai" | "gemini";
    task:
      | "deterministic_taxonomy_search_planning"
      | "text_only_blueprint_draft"
      | "complex_balancing_reasoning"
      | "pdf_image_multimodal_extraction"
      | "cheap_classification"
      | "final_quality_fallback";
  }>;
};

export type QuestionBlueprintPlanSummary = {
  candidateCount: number;
  coverageGapCount: number;
  generationRequestCount: number;
  questionCount: number;
  sectionCount: number;
  targetTagCount: number;
  valid: boolean;
};

export type QuestionBlueprintPlan = {
  candidateSet: QuestionBlueprintCandidateSet;
  coverageGaps: QuestionBlueprintCoverageGap[];
  generatedAt: string;
  generationRequests: QuestionBlueprintGenerationRequest[];
  mode: "planning_only";
  modelRoutingPlan: QuestionBlueprintModelRoutingPlan;
  request: QuestionBlueprintRequest;
  sections: QuestionBlueprintSection[];
  summary: QuestionBlueprintPlanSummary;
  validation: QuestionBlueprintValidationResult & {
    noDbWrite: true;
    noGeneratedQuestions: true;
    noProviderCall: true;
    noReviewDraftWrite: true;
  };
  version: typeof QUESTION_BLUEPRINT_PLAN_VERSION;
  warnings: string[];
};

const facetSet = new Set<string>(QUESTION_BLUEPRINT_FACETS);
const questionTypeSet = new Set<string>(QUESTION_BLUEPRINT_QUESTION_TYPES);

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sumCounts(values: { count: number }[]) {
  return values.reduce((total, item) => total + item.count, 0);
}

function catalogIndexes(catalog: TaxonomyCatalogView) {
  const nodesById = new Map(catalog.nodes.map((node) => [node.tag_id, node]));
  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );
  const facetKeys = new Set(catalog.facets.map((facet) => facet.facet_key));

  return { facetKeys, nodesById, parentTagIds };
}

function nodeFacet(node: TaxonomyNodeView | undefined): QuestionBlueprintFacet | null {
  return node?.facet_key && facetSet.has(node.facet_key)
    ? (node.facet_key as QuestionBlueprintFacet)
    : null;
}

function isActiveAssignableLeaf(
  node: TaxonomyNodeView | undefined,
  parentTagIds: Set<string>,
) {
  return Boolean(node?.is_assignable && !parentTagIds.has(node.tag_id));
}

function normalizeTargetTagIds(request: QuestionBlueprintRequest) {
  return uniqueStrings([
    ...(request.targetTagIds ?? []),
    ...Object.values(request.targetTagsByFacet ?? {}).flatMap(
      (values) => values ?? [],
    ),
  ]);
}

function normalizedQuestionCount(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function difficultyRange(
  distribution: QuestionBlueprintDifficultyBucket[],
): { max: number; min: number } {
  const mins = distribution.map((bucket) => bucket.min).filter(Number.isFinite);
  const maxes = distribution.map((bucket) => bucket.max).filter(Number.isFinite);

  return {
    max: maxes.length ? Math.max(...maxes) : 1000,
    min: mins.length ? Math.min(...mins) : 0,
  };
}

export function validateQuestionBlueprintRequest(
  request: QuestionBlueprintRequest,
  catalog: TaxonomyCatalogView,
): QuestionBlueprintValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { facetKeys, nodesById, parentTagIds } = catalogIndexes(catalog);
  const normalizedTargetTagIds = normalizeTargetTagIds(request);
  const questionCount = normalizedQuestionCount(request.questionCount);

  if (!questionCount) {
    errors.push("question_count_invalid");
  }

  if (!normalizedTargetTagIds.length) {
    errors.push("target_tags_required");
  }

  for (const facetKey of Object.keys(request.targetTagsByFacet ?? {})) {
    if (!facetSet.has(facetKey)) {
      errors.push(`unknown_facet:${facetKey}`);
    }
    if (!facetKeys.has(facetKey)) {
      warnings.push(`facet_not_in_catalog:${facetKey}`);
    }
  }

  for (const [facetKey, tagIds] of Object.entries(request.targetTagsByFacet ?? {})) {
    for (const tagId of tagIds ?? []) {
      const node = nodesById.get(tagId);
      const facet = nodeFacet(node as TaxonomyNodeView | undefined);
      if (node && facet && facet !== facetKey) {
        errors.push(`wrong_facet:${tagId}:${facetKey}:${facet}`);
      }
    }
  }

  for (const tagId of normalizedTargetTagIds) {
    const node = nodesById.get(tagId);
    const facet = nodeFacet(node);
    if (!node) {
      errors.push(`invalid_taxonomy_tag:${tagId}`);
      continue;
    }
    if (!facet) {
      errors.push(`invalid_taxonomy_facet:${tagId}`);
    }
    if (!isActiveAssignableLeaf(node, parentTagIds)) {
      errors.push(`tag_not_active_assignable_leaf:${tagId}`);
    }
  }

  if (sumCounts(request.difficultyDistribution) !== questionCount) {
    errors.push("difficulty_distribution_sum_mismatch");
  }

  for (const bucket of request.difficultyDistribution) {
    if (
      bucket.count < 0 ||
      bucket.min < 0 ||
      bucket.max > 1000 ||
      bucket.min > bucket.max
    ) {
      errors.push(`invalid_difficulty_bucket:${bucket.label}`);
    }
  }

  if (sumCounts(request.questionTypeDistribution) !== questionCount) {
    errors.push("question_type_distribution_sum_mismatch");
  }

  for (const bucket of request.questionTypeDistribution) {
    if (!questionTypeSet.has(bucket.questionType)) {
      errors.push(`invalid_question_type:${bucket.questionType}`);
    }
    if (bucket.count < 0) {
      errors.push(`invalid_question_type_count:${bucket.questionType}`);
    }
  }

  return {
    errors: uniqueStrings(errors),
    normalizedTargetTagIds,
    valid: errors.length === 0,
    warnings: uniqueStrings(warnings),
  };
}

export function buildBlueprintCandidatePlan({
  candidates = [],
  catalog,
  request,
}: {
  candidates?: QuestionBlueprintCandidateInput[];
  catalog: TaxonomyCatalogView;
  request: QuestionBlueprintRequest;
}): QuestionBlueprintCandidateSet {
  const validation = validateQuestionBlueprintRequest(request, catalog);
  const targetTagIds = new Set(validation.normalizedTargetTagIds);
  const range = difficultyRange(request.difficultyDistribution);
  const normalizedCandidates = candidates
    .filter((candidate) =>
      candidate.tagIds.some((tagId) => targetTagIds.has(tagId)),
    )
    .filter((candidate) => candidate.difficulty >= range.min && candidate.difficulty <= range.max)
    .map((candidate): QuestionBlueprintCandidate => ({
      difficulty: candidate.difficulty,
      hasAnswerSpec: Boolean(candidate.hasAnswerSpec),
      hasOptions: Boolean(candidate.hasOptions),
      id: candidate.id,
      matchedTagIds: candidate.tagIds.filter((tagId) => targetTagIds.has(tagId)),
      questionCode: candidate.questionCode,
      questionType: candidate.questionType,
      title: candidate.title,
    }));

  return {
    candidates: normalizedCandidates,
    selectedCandidateIds: normalizedCandidates
      .slice(0, request.questionCount)
      .map((candidate) => candidate.id),
    searchPlan: {
      assignmentReviewStatus: "approved",
      difficultyMax: range.max,
      difficultyMin: range.min,
      includeTagIds: validation.normalizedTargetTagIds,
      questionStatus: "published",
      rpc: "search_questions_by_taxonomy",
    },
    warnings: uniqueStrings([
      ...validation.warnings,
      ...(normalizedCandidates.length ? [] : ["no_existing_candidates_planned"]),
    ]),
  };
}

export function buildBlueprintCoverageGaps({
  candidateSet,
  catalog,
  request,
}: {
  candidateSet: QuestionBlueprintCandidateSet;
  catalog: TaxonomyCatalogView;
  request: QuestionBlueprintRequest;
}): QuestionBlueprintCoverageGap[] {
  const validation = validateQuestionBlueprintRequest(request, catalog);
  const { nodesById } = catalogIndexes(catalog);
  const desiredPerTag = Math.max(
    1,
    Math.ceil(request.questionCount / Math.max(1, validation.normalizedTargetTagIds.length)),
  );

  return validation.normalizedTargetTagIds.flatMap((tagId) => {
    const node = nodesById.get(tagId);
    const facet = nodeFacet(node);
    if (!node || !facet) return [];

    const existingCount = candidateSet.candidates.filter((candidate) =>
      candidate.matchedTagIds.includes(tagId),
    ).length;
    const missingCount = Math.max(0, desiredPerTag - existingCount);
    if (!missingCount) return [];

    return {
      existingCount,
      facet,
      generationRequestIds: [`blueprint-generation-${tagId.replaceAll(".", "-")}`],
      missingCount,
      reason: "Not enough existing published candidates cover this active taxonomy leaf tag.",
      tagId,
    };
  });
}

export function buildBlueprintModelRoutingPlan(): QuestionBlueprintModelRoutingPlan {
  return {
    noProviderCall: true,
    routes: [
      {
        modelHint: "local code",
        providerFamily: "local",
        task: "deterministic_taxonomy_search_planning",
      },
      {
        modelHint: "deepseek-v4-flash non-thinking",
        providerFamily: "deepseek",
        task: "text_only_blueprint_draft",
      },
      {
        modelHint: "deepseek-v4-flash thinking or OpenAI GPT-5.4 mini",
        providerFamily: "openai",
        task: "complex_balancing_reasoning",
      },
      {
        modelHint: "Gemini Flash family",
        providerFamily: "gemini",
        task: "pdf_image_multimodal_extraction",
      },
      {
        modelHint: "Gemini Flash-Lite",
        providerFamily: "gemini",
        task: "cheap_classification",
      },
      {
        modelHint: "OpenAI GPT-5.4 mini / GPT-5.4 only when needed",
        providerFamily: "openai",
        task: "final_quality_fallback",
      },
    ],
  };
}

function buildRequirements({
  candidateSet,
  catalog,
  request,
}: {
  candidateSet: QuestionBlueprintCandidateSet;
  catalog: TaxonomyCatalogView;
  request: QuestionBlueprintRequest;
}) {
  const validation = validateQuestionBlueprintRequest(request, catalog);
  const { nodesById } = catalogIndexes(catalog);
  const desiredPerTag = Math.max(
    1,
    Math.ceil(request.questionCount / Math.max(1, validation.normalizedTargetTagIds.length)),
  );

  return validation.normalizedTargetTagIds.flatMap((tagId) => {
    const node = nodesById.get(tagId);
    const facet = nodeFacet(node);
    if (!node || !facet) return [];
    const existingCandidateCount = candidateSet.candidates.filter((candidate) =>
      candidate.matchedTagIds.includes(tagId),
    ).length;

    return {
      desiredCount: desiredPerTag,
      existingCandidateCount,
      facet,
      label: taxonomyDisplayLabelFromId(tagId),
      missingCount: Math.max(0, desiredPerTag - existingCandidateCount),
      tagId,
    };
  });
}

function buildSections(requirements: QuestionBlueprintRequirement[]) {
  return QUESTION_BLUEPRINT_FACETS.flatMap((facet) => {
    const facetRequirements = requirements.filter(
      (requirement) => requirement.facet === facet,
    );
    if (!facetRequirements.length) return [];

    return {
      facet,
      requirementCount: facetRequirements.length,
      requirements: facetRequirements,
      sectionId: `blueprint-section-${facet}`,
      title: `${facet.charAt(0).toUpperCase()}${facet.slice(1)} requirements`,
    };
  });
}

function generationRequestsFromGaps({
  gaps,
  request,
}: {
  gaps: QuestionBlueprintCoverageGap[];
  request: QuestionBlueprintRequest;
}): QuestionBlueprintGenerationRequest[] {
  const range = difficultyRange(request.difficultyDistribution);
  const questionTypes = request.questionTypeDistribution
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => bucket.questionType);

  return gaps.map((gap) => ({
    count: gap.missingCount,
    difficultyRange: range,
    questionTypes,
    reason: gap.reason,
    requestId: gap.generationRequestIds[0],
    reviewRequired: true,
    status: "draft",
    targetTagIds: [gap.tagId],
  }));
}

export function summarizeQuestionBlueprintPlan(plan: Pick<
  QuestionBlueprintPlan,
  "candidateSet" | "coverageGaps" | "generationRequests" | "request" | "sections" | "validation"
>): QuestionBlueprintPlanSummary {
  return {
    candidateCount: plan.candidateSet.candidates.length,
    coverageGapCount: plan.coverageGaps.length,
    generationRequestCount: plan.generationRequests.length,
    questionCount: plan.request.questionCount,
    sectionCount: plan.sections.length,
    targetTagCount: plan.validation.normalizedTargetTagIds.length,
    valid: plan.validation.valid,
  };
}

export function buildQuestionBlueprintPlan({
  candidates = [],
  catalog,
  generatedAt = new Date().toISOString(),
  request,
}: {
  candidates?: QuestionBlueprintCandidateInput[];
  catalog: TaxonomyCatalogView;
  generatedAt?: string;
  request: QuestionBlueprintRequest;
}): QuestionBlueprintPlan {
  const validation = validateQuestionBlueprintRequest(request, catalog);
  const candidateSet = buildBlueprintCandidatePlan({ candidates, catalog, request });
  const coverageGaps = buildBlueprintCoverageGaps({
    candidateSet,
    catalog,
    request,
  });
  const generationRequests = generationRequestsFromGaps({ gaps: coverageGaps, request });
  const requirements = buildRequirements({ candidateSet, catalog, request });
  const sections = buildSections(requirements);
  const modelRoutingPlan = buildBlueprintModelRoutingPlan();
  const planWithoutSummary = {
    candidateSet,
    coverageGaps,
    generatedAt,
    generationRequests,
    mode: "planning_only" as const,
    modelRoutingPlan,
    request,
    sections,
    validation: {
      ...validation,
      noDbWrite: true as const,
      noGeneratedQuestions: true as const,
      noProviderCall: true as const,
      noReviewDraftWrite: true as const,
    },
    version: QUESTION_BLUEPRINT_PLAN_VERSION as typeof QUESTION_BLUEPRINT_PLAN_VERSION,
    warnings: uniqueStrings([
      ...validation.warnings,
      ...candidateSet.warnings,
      ...(validation.valid ? [] : ["question_blueprint_request_invalid"]),
      ...(coverageGaps.length ? ["coverage_gaps_require_generation_drafts"] : []),
    ]),
  };
  const summary = summarizeQuestionBlueprintPlan({
    ...planWithoutSummary,
  });

  return {
    ...planWithoutSummary,
    summary,
  };
}
