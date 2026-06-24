import type {
  TaxonomyCatalogView,
  TaxonomyNodeView,
} from "@/components/tags/taxonomy-tag-tree-picker";
import { taxonomyDisplayLabelFromId } from "@/lib/tags/taxonomy-display";
import {
  QUESTION_BLUEPRINT_FACETS,
  QUESTION_BLUEPRINT_QUESTION_TYPES,
  type QuestionBlueprintCoverageGap,
  type QuestionBlueprintFacet,
  type QuestionBlueprintModelRoutingPlan,
  type QuestionBlueprintPlan,
  type QuestionBlueprintQuestionType,
} from "@/lib/taxonomy/question-blueprint";

export const QUESTION_BLUEPRINT_GENERATION_PLAN_VERSION =
  "question_blueprint_generation_request_plan_v1";

export const BLUEPRINT_GENERATION_MODEL_ROUTE_RULES = [
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
    modelHint: "OpenAI GPT-5.4 mini / GPT-5.4",
    providerFamily: "openai",
    task: "final_quality_fallback",
  },
] as const;

export type BlueprintGenerationTargetTag = {
  facet: QuestionBlueprintFacet;
  label: string;
  tagId: string;
};

export type BlueprintGenerationPromptPlan = {
  avoid: string[];
  evidencePolicy: "metadata_only";
  instruction: string;
  sourcePolicy: {
    noBase64: true;
    noFullPdfText: true;
    noImageBytes: true;
    noProviderSecrets: true;
  };
  targetCoverage: string;
};

export type BlueprintGenerationModelRoute = {
  modelHint: string;
  providerFamily: "deepseek" | "gemini" | "openai";
  task:
    | "text_only_blueprint_draft"
    | "complex_balancing_reasoning"
    | "pdf_image_multimodal_extraction"
    | "cheap_classification"
    | "final_quality_fallback";
};

export type BlueprintGenerationRequestSafety = {
  noDbWrite: true;
  noGeneratedQuestions: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  planningOnly: true;
};

export type BlueprintGenerationRequestDraft = {
  blueprintId: string;
  count: number;
  difficultyRange: {
    max: number;
    min: number;
  };
  modelRoute: BlueprintGenerationModelRoute;
  promptPlan: BlueprintGenerationPromptPlan;
  questionType: QuestionBlueprintQuestionType;
  requestId: string;
  safety: BlueprintGenerationRequestSafety;
  status: "draft";
  targetTags: BlueprintGenerationTargetTag[];
};

export type BlueprintGenerationRequestValidationResult = {
  errors: string[];
  valid: boolean;
  warnings: string[];
};

export type BlueprintGenerationRequestPlanSummary = {
  coverageGapCount: number;
  draftCount: number;
  invalidDraftCount: number;
  totalRequestedQuestions: number;
  valid: boolean;
};

export type BlueprintGenerationRequestPlan = {
  blueprintId: string;
  generatedAt: string;
  mode: "planning_only";
  requests: BlueprintGenerationRequestDraft[];
  status: "draft";
  summary: BlueprintGenerationRequestPlanSummary;
  validation: BlueprintGenerationRequestValidationResult & BlueprintGenerationRequestSafety;
  version: typeof QUESTION_BLUEPRINT_GENERATION_PLAN_VERSION;
};

const facetSet = new Set<string>(QUESTION_BLUEPRINT_FACETS);
const questionTypeSet = new Set<string>(QUESTION_BLUEPRINT_QUESTION_TYPES);

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function catalogIndexes(catalog: TaxonomyCatalogView) {
  const nodesById = new Map(catalog.nodes.map((node) => [node.tag_id, node]));
  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );

  return { nodesById, parentTagIds };
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

function blueprintIdFromPlan(plan: QuestionBlueprintPlan) {
  const stamp = plan.generatedAt.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `blueprint-${stamp || "preview"}`;
}

function modelRouteForGap({
  gap,
  modelRoutingPlan,
}: {
  gap: QuestionBlueprintCoverageGap;
  modelRoutingPlan: QuestionBlueprintModelRoutingPlan;
}): BlueprintGenerationModelRoute {
  const route =
    modelRoutingPlan.routes.find(
      (item) => item.task === "text_only_blueprint_draft",
    ) ??
    modelRoutingPlan.routes.find(
      (item) => item.task === "complex_balancing_reasoning",
    );

  return {
    modelHint: route?.modelHint ?? "deepseek-v4-flash non-thinking",
    providerFamily:
      route?.providerFamily === "deepseek" ||
      route?.providerFamily === "gemini" ||
      route?.providerFamily === "openai"
        ? route.providerFamily
        : gap.facet === "form"
          ? "gemini"
          : "deepseek",
    task:
      route?.task === "text_only_blueprint_draft" ||
      route?.task === "complex_balancing_reasoning" ||
      route?.task === "pdf_image_multimodal_extraction" ||
      route?.task === "cheap_classification" ||
      route?.task === "final_quality_fallback"
        ? route.task
        : "text_only_blueprint_draft",
  };
}

function requestCountsByQuestionType(plan: QuestionBlueprintPlan) {
  return plan.request.questionTypeDistribution
    .filter((bucket) => bucket.count > 0 && questionTypeSet.has(bucket.questionType))
    .map((bucket) => ({
      questionType: bucket.questionType,
      weight: bucket.count,
    }));
}

function allocateGapCounts({
  missingCount,
  questionTypes,
}: {
  missingCount: number;
  questionTypes: Array<{ questionType: QuestionBlueprintQuestionType; weight: number }>;
}) {
  if (!questionTypes.length || missingCount <= 0) return [];

  const totalWeight = questionTypes.reduce((total, item) => total + item.weight, 0);
  let remaining = missingCount;

  return questionTypes.flatMap((item, index) => {
    const count =
      index === questionTypes.length - 1
        ? remaining
        : Math.max(0, Math.floor((missingCount * item.weight) / totalWeight));
    remaining -= count;

    return count > 0
      ? [
          {
            count,
            questionType: item.questionType,
          },
        ]
      : [];
  });
}

function targetTagForGap({
  catalog,
  gap,
}: {
  catalog: TaxonomyCatalogView;
  gap: QuestionBlueprintCoverageGap;
}): BlueprintGenerationTargetTag | null {
  const { nodesById } = catalogIndexes(catalog);
  const node = nodesById.get(gap.tagId);
  const facet = nodeFacet(node);
  if (!node || !facet) return null;

  return {
    facet,
    label: taxonomyDisplayLabelFromId(gap.tagId),
    tagId: gap.tagId,
  };
}

function promptPlanForRequest({
  gap,
  questionType,
  targetTag,
}: {
  gap: QuestionBlueprintCoverageGap;
  questionType: QuestionBlueprintQuestionType;
  targetTag: BlueprintGenerationTargetTag;
}): BlueprintGenerationPromptPlan {
  return {
    avoid: [
      "Do not invent official tag IDs.",
      "Do not include provider keys, signed URLs, base64, image bytes, or full PDF text.",
      "Do not publish or write review drafts from this request.",
    ],
    evidencePolicy: "metadata_only",
    instruction:
      "Draft a future question-generation prompt from taxonomy metadata and blueprint gaps only.",
    sourcePolicy: {
      noBase64: true,
      noFullPdfText: true,
      noImageBytes: true,
      noProviderSecrets: true,
    },
    targetCoverage: `${gap.missingCount} missing ${questionType} question(s) for ${targetTag.label}.`,
  };
}

export function buildBlueprintGenerationRequests({
  catalog,
  plan,
}: {
  catalog: TaxonomyCatalogView;
  plan: QuestionBlueprintPlan;
}): BlueprintGenerationRequestDraft[] {
  const blueprintId = blueprintIdFromPlan(plan);
  const questionTypes = requestCountsByQuestionType(plan);

  return plan.coverageGaps.flatMap((gap) => {
    const targetTag = targetTagForGap({ catalog, gap });
    if (!targetTag || gap.missingCount <= 0) return [];

    return allocateGapCounts({
      missingCount: gap.missingCount,
      questionTypes,
    }).map((allocation) => ({
      blueprintId,
      count: allocation.count,
      difficultyRange: plan.generationRequests.find((request) =>
        request.targetTagIds.includes(gap.tagId),
      )?.difficultyRange ?? {
        max: plan.candidateSet.searchPlan.difficultyMax,
        min: plan.candidateSet.searchPlan.difficultyMin,
      },
      modelRoute: modelRouteForGap({ gap, modelRoutingPlan: plan.modelRoutingPlan }),
      promptPlan: promptPlanForRequest({
        gap,
        questionType: allocation.questionType,
        targetTag,
      }),
      questionType: allocation.questionType,
      requestId: `${gap.generationRequestIds[0]}-${allocation.questionType}`,
      safety: {
        noDbWrite: true,
        noGeneratedQuestions: true,
        noProviderCall: true,
        noReviewDraftWrite: true,
        planningOnly: true,
      },
      status: "draft",
      targetTags: [targetTag],
    }));
  });
}

export function validateBlueprintGenerationRequest({
  catalog,
  coverageGaps,
  request,
}: {
  catalog: TaxonomyCatalogView;
  coverageGaps: QuestionBlueprintCoverageGap[];
  request: BlueprintGenerationRequestDraft;
}): BlueprintGenerationRequestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { nodesById, parentTagIds } = catalogIndexes(catalog);
  const gapTagIds = new Set(coverageGaps.map((gap) => gap.tagId));

  if (!request.count || request.count < 1) {
    errors.push("generation_request_count_invalid");
  }

  if (
    !Number.isFinite(request.difficultyRange.min) ||
    !Number.isFinite(request.difficultyRange.max) ||
    request.difficultyRange.min < 0 ||
    request.difficultyRange.max > 1000 ||
    request.difficultyRange.min > request.difficultyRange.max
  ) {
    errors.push("generation_request_difficulty_range_invalid");
  }

  if (!questionTypeSet.has(request.questionType)) {
    errors.push(`generation_request_question_type_invalid:${request.questionType}`);
  }

  if (!request.targetTags.length) {
    errors.push("generation_request_target_tags_required");
  }

  for (const targetTag of request.targetTags) {
    const node = nodesById.get(targetTag.tagId);
    const facet = nodeFacet(node);
    if (!node) {
      errors.push(`generation_request_invalid_taxonomy_tag:${targetTag.tagId}`);
      continue;
    }
    if (facet !== targetTag.facet) {
      errors.push(`generation_request_wrong_facet:${targetTag.tagId}`);
    }
    if (!isActiveAssignableLeaf(node, parentTagIds)) {
      errors.push(`generation_request_tag_not_active_assignable_leaf:${targetTag.tagId}`);
    }
    if (!gapTagIds.has(targetTag.tagId)) {
      errors.push(`generation_request_not_a_coverage_gap:${targetTag.tagId}`);
    }
  }

  const promptText = [
    request.promptPlan.instruction,
    request.promptPlan.targetCoverage,
  ].join(" ");
  if (/api[_-]?key|secret|token|signed url|base64|image bytes|full pdf text/i.test(promptText)) {
    warnings.push("generation_request_prompt_mentions_blocked_materials");
  }

  if (
    !request.safety.noDbWrite ||
    !request.safety.noGeneratedQuestions ||
    !request.safety.noProviderCall ||
    !request.safety.noReviewDraftWrite
  ) {
    errors.push("generation_request_safety_flags_missing");
  }

  return {
    errors: uniqueStrings(errors),
    valid: errors.length === 0,
    warnings: uniqueStrings(warnings),
  };
}

export function summarizeBlueprintGenerationRequestPlan(
  plan: Pick<BlueprintGenerationRequestPlan, "requests" | "validation">,
): BlueprintGenerationRequestPlanSummary {
  return {
    coverageGapCount: new Set(
      plan.requests.flatMap((request) => request.targetTags.map((tag) => tag.tagId)),
    ).size,
    draftCount: plan.requests.length,
    invalidDraftCount: plan.validation.errors.filter((error) =>
      error.startsWith("request:"),
    ).length,
    totalRequestedQuestions: plan.requests.reduce(
      (total, request) => total + request.count,
      0,
    ),
    valid: plan.validation.valid,
  };
}

export function buildBlueprintGenerationRequestPlan({
  catalog,
  generatedAt = new Date().toISOString(),
  plan,
}: {
  catalog: TaxonomyCatalogView;
  generatedAt?: string;
  plan: QuestionBlueprintPlan;
}): BlueprintGenerationRequestPlan {
  const requests = buildBlueprintGenerationRequests({ catalog, plan });
  const requestValidations = requests.map((request) => ({
    request,
    validation: validateBlueprintGenerationRequest({
      catalog,
      coverageGaps: plan.coverageGaps,
      request,
    }),
  }));
  const validation = {
    errors: uniqueStrings(
      requestValidations.flatMap(({ request, validation: result }) =>
        result.errors.map((error) => `request:${request.requestId}:${error}`),
      ),
    ),
    noDbWrite: true as const,
    noGeneratedQuestions: true as const,
    noProviderCall: true as const,
    noReviewDraftWrite: true as const,
    planningOnly: true as const,
    valid: true,
    warnings: uniqueStrings(
      requestValidations.flatMap(({ request, validation: result }) =>
        result.warnings.map((warning) => `request:${request.requestId}:${warning}`),
      ),
    ),
  };
  validation.valid = validation.errors.length === 0;
  const planWithoutSummary = {
    blueprintId: blueprintIdFromPlan(plan),
    generatedAt,
    mode: "planning_only" as const,
    requests,
    status: "draft" as const,
    validation,
    version:
      QUESTION_BLUEPRINT_GENERATION_PLAN_VERSION as typeof QUESTION_BLUEPRINT_GENERATION_PLAN_VERSION,
  };

  return {
    ...planWithoutSummary,
    summary: summarizeBlueprintGenerationRequestPlan(planWithoutSummary),
  };
}
