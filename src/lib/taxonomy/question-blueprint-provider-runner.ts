import type {
  BlueprintGenerationRequestDraft,
  BlueprintGenerationRequestPlan,
} from "@/lib/taxonomy/question-blueprint-generation";

export const QUESTION_BLUEPRINT_PROVIDER_RUN_PLAN_VERSION =
  "question_blueprint_provider_run_plan_v1";

export type BlueprintProviderKind = "deepseek" | "gemini" | "openai";

export type BlueprintProviderPromptPayloadPreview = {
  constraints: string[];
  count: number;
  difficultyRange: {
    max: number;
    min: number;
  };
  promptPreviewCharLimit: number;
  questionType: string;
  system: string;
  targetTags: Array<{
    facet: string;
    label: string;
    tagId: string;
  }>;
  user: string;
};

export type BlueprintProviderExpectedOutputSchema = {
  fields: [
    "title",
    "questionType",
    "contentHtml",
    "solutionHtml",
    "options",
    "answerSpec",
    "taxonomyTagIds",
    "difficulty",
    "rationale",
  ];
  root: "draftQuestions";
  type: "json_object";
};

export type BlueprintProviderRunSafety = {
  noDbWrite: true;
  noGeneratedQuestionPersistence: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  noSecrets: true;
  shadowOnly: true;
};

export type BlueprintProviderRunDraft = {
  expectedOutputSchema: BlueprintProviderExpectedOutputSchema;
  mode: "shadow_only";
  modelName: string;
  promptPayloadPreview: BlueprintProviderPromptPayloadPreview;
  providerKind: BlueprintProviderKind;
  realCall: false;
  requestId: string;
  runId: string;
  safety: BlueprintProviderRunSafety;
  status: "ready" | "blocked" | "skipped";
  warnings: string[];
};

export type BlueprintProviderRunPlanValidation = {
  errors: string[];
  valid: boolean;
  warnings: string[];
};

export type BlueprintProviderRunPlanSummary = {
  blockedRunCount: number;
  readyRunCount: number;
  runCount: number;
  skippedRunCount: number;
  warningCount: number;
};

export type BlueprintProviderRunPlan = {
  generatedAt: string;
  mode: "shadow_only";
  realCall: false;
  runs: BlueprintProviderRunDraft[];
  sourceGenerationPlanId: string;
  status: "ready" | "blocked" | "skipped";
  summary: BlueprintProviderRunPlanSummary;
  validation: BlueprintProviderRunPlanValidation & BlueprintProviderRunSafety;
  version: typeof QUESTION_BLUEPRINT_PROVIDER_RUN_PLAN_VERSION;
};

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function providerKindFromRequest(
  request: BlueprintGenerationRequestDraft,
): BlueprintProviderKind {
  return request.modelRoute.providerFamily;
}

function modelNameFromRequest(request: BlueprintGenerationRequestDraft) {
  const hint = request.modelRoute.modelHint.toLowerCase();
  if (hint.includes("flash-lite")) return "gemini-flash-lite";
  if (hint.includes("gemini")) return "gemini-flash-family";
  if (hint.includes("gpt-5.4 mini")) return "gpt-5.4-mini";
  if (hint.includes("gpt-5.4")) return "gpt-5.4";
  if (hint.includes("thinking")) return "deepseek-v4-flash-thinking";
  return "deepseek-v4-flash";
}

function expectedOutputSchema(): BlueprintProviderExpectedOutputSchema {
  return {
    fields: [
      "title",
      "questionType",
      "contentHtml",
      "solutionHtml",
      "options",
      "answerSpec",
      "taxonomyTagIds",
      "difficulty",
      "rationale",
    ],
    root: "draftQuestions",
    type: "json_object",
  };
}

function promptPayloadPreviewForRequest(
  request: BlueprintGenerationRequestDraft,
): BlueprintProviderPromptPayloadPreview {
  const targetTagSummary = request.targetTags
    .map((tag) => `${tag.label} (${tag.tagId})`)
    .join(", ");

  return {
    constraints: [
      "Return structured JSON only.",
      "Output draft questions only, not official questions.",
      "Use taxonomyTagIds only from the provided target tags.",
      "Do not include provider secrets, signed URLs, full PDF text, image bytes, or base64.",
      "Do not write records or publish content.",
    ],
    count: request.count,
    difficultyRange: request.difficultyRange,
    promptPreviewCharLimit: 1200,
    questionType: request.questionType,
    system:
      "You are drafting a future question-generation payload from a reviewed blueprint. Return JSON only.",
    targetTags: request.targetTags.map((tag) => ({
      facet: tag.facet,
      label: tag.label,
      tagId: tag.tagId,
    })),
    user: [
      `Create ${request.count} draft ${request.questionType} question(s).`,
      `Difficulty range: ${request.difficultyRange.min}-${request.difficultyRange.max}.`,
      `Target taxonomy tags: ${targetTagSummary || "none"}.`,
      "Match the expected output schema and include rationale for review.",
    ].join(" "),
  };
}

function warningsForRequest(request: BlueprintGenerationRequestDraft) {
  return uniqueStrings([
    ...(request.count > 25 ? ["large_shadow_run_count"] : []),
    ...(request.targetTags.length ? [] : ["shadow_run_has_no_target_tags"]),
    ...(request.safety.noProviderCall ? [] : ["generation_request_allows_provider_call"]),
  ]);
}

function statusForRequest(request: BlueprintGenerationRequestDraft, warnings: string[]) {
  if (request.status !== "draft") return "skipped" as const;
  if (
    !request.safety.noDbWrite ||
    !request.safety.noProviderCall ||
    !request.safety.noReviewDraftWrite ||
    !request.safety.noGeneratedQuestions
  ) {
    return "blocked" as const;
  }
  if (!request.count || !request.targetTags.length || warnings.includes("generation_request_allows_provider_call")) {
    return "blocked" as const;
  }
  return "ready" as const;
}

export function buildBlueprintProviderPayloadDrafts(
  plan: BlueprintGenerationRequestPlan,
): BlueprintProviderRunDraft[] {
  return plan.requests.map((request) => {
    const warnings = warningsForRequest(request);

    return {
      expectedOutputSchema: expectedOutputSchema(),
      mode: "shadow_only",
      modelName: modelNameFromRequest(request),
      promptPayloadPreview: promptPayloadPreviewForRequest(request),
      providerKind: providerKindFromRequest(request),
      realCall: false,
      requestId: request.requestId,
      runId: `shadow-run-${request.requestId}`,
      safety: {
        noDbWrite: true,
        noGeneratedQuestionPersistence: true,
        noProviderCall: true,
        noReviewDraftWrite: true,
        noSecrets: true,
        shadowOnly: true,
      },
      status: statusForRequest(request, warnings),
      warnings,
    };
  });
}

export function validateBlueprintProviderRunPlan(
  plan: Pick<BlueprintProviderRunPlan, "runs">,
): BlueprintProviderRunPlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const run of plan.runs) {
    if (run.realCall !== false) {
      errors.push(`provider_run_real_call_enabled:${run.runId}`);
    }
    if (run.mode !== "shadow_only") {
      errors.push(`provider_run_not_shadow_only:${run.runId}`);
    }
    if (!run.safety.noProviderCall || !run.safety.shadowOnly) {
      errors.push(`provider_run_safety_flags_missing:${run.runId}`);
    }
    if (!run.expectedOutputSchema.fields.includes("taxonomyTagIds")) {
      errors.push(`provider_run_schema_missing_taxonomy_tags:${run.runId}`);
    }
    const previewText = [
      run.promptPayloadPreview.system,
      run.promptPayloadPreview.user,
      ...run.promptPayloadPreview.constraints,
    ].join(" ");
    if (/api[_-]?key|secret|token|signed url/i.test(previewText)) {
      warnings.push(`provider_run_prompt_mentions_blocked_materials:${run.runId}`);
    }
    warnings.push(...run.warnings.map((warning) => `provider_run:${run.runId}:${warning}`));
  }

  return {
    errors: uniqueStrings(errors),
    valid: errors.length === 0,
    warnings: uniqueStrings(warnings),
  };
}

export function summarizeBlueprintProviderRunPlan(
  plan: Pick<BlueprintProviderRunPlan, "runs" | "validation">,
): BlueprintProviderRunPlanSummary {
  return {
    blockedRunCount: plan.runs.filter((run) => run.status === "blocked").length,
    readyRunCount: plan.runs.filter((run) => run.status === "ready").length,
    runCount: plan.runs.length,
    skippedRunCount: plan.runs.filter((run) => run.status === "skipped").length,
    warningCount: plan.validation.warnings.length,
  };
}

export function buildBlueprintProviderRunPlan({
  generatedAt = new Date().toISOString(),
  generationPlan,
}: {
  generatedAt?: string;
  generationPlan: BlueprintGenerationRequestPlan;
}): BlueprintProviderRunPlan {
  const runs = buildBlueprintProviderPayloadDrafts(generationPlan);
  const validation = {
    ...validateBlueprintProviderRunPlan({ runs }),
    noDbWrite: true as const,
    noGeneratedQuestionPersistence: true as const,
    noProviderCall: true as const,
    noReviewDraftWrite: true as const,
    noSecrets: true as const,
    shadowOnly: true as const,
  };
  const status: BlueprintProviderRunPlan["status"] = runs.some(
    (run) => run.status === "blocked",
  )
    ? "blocked"
    : runs.length
      ? "ready"
      : "skipped";
  const planWithoutSummary = {
    generatedAt,
    mode: "shadow_only" as const,
    realCall: false as const,
    runs,
    sourceGenerationPlanId: generationPlan.blueprintId,
    status,
    validation,
    version:
      QUESTION_BLUEPRINT_PROVIDER_RUN_PLAN_VERSION as typeof QUESTION_BLUEPRINT_PROVIDER_RUN_PLAN_VERSION,
  };

  return {
    ...planWithoutSummary,
    summary: summarizeBlueprintProviderRunPlan(planWithoutSummary),
  };
}

export function failedBlueprintProviderRunPlan({
  errorMessage,
  generatedAt = new Date().toISOString(),
  sourceGenerationPlanId,
}: {
  errorMessage: string;
  generatedAt?: string;
  sourceGenerationPlanId: string;
}): BlueprintProviderRunPlan {
  const validation = {
    errors: [errorMessage],
    noDbWrite: true as const,
    noGeneratedQuestionPersistence: true as const,
    noProviderCall: true as const,
    noReviewDraftWrite: true as const,
    noSecrets: true as const,
    shadowOnly: true as const,
    valid: false,
    warnings: [],
  };
  const planWithoutSummary = {
    generatedAt,
    mode: "shadow_only" as const,
    realCall: false as const,
    runs: [],
    sourceGenerationPlanId,
    status: "blocked" as const,
    validation,
    version:
      QUESTION_BLUEPRINT_PROVIDER_RUN_PLAN_VERSION as typeof QUESTION_BLUEPRINT_PROVIDER_RUN_PLAN_VERSION,
  };

  return {
    ...planWithoutSummary,
    summary: summarizeBlueprintProviderRunPlan(planWithoutSummary),
  };
}
