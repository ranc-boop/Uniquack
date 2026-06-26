import "server-only";

import {
  buildQuestionBlueprintGenerationRequest,
  executeDeepSeekBlueprintGeneration,
  runBlueprintOriginalityGuard,
  type GeneratedBlueprintQuestionDraft,
  type QuestionBlueprintGenerationProvider,
  type QuestionBlueprintGenerationQuestionType,
  type QuestionBlueprintGenerationRequest,
  type QuestionBlueprintGenerationResult,
} from "@/lib/blueprints/question-blueprint-generation";
import {
  validateQuestionBlueprintQuality,
  type BlueprintQualityValidationResult,
} from "@/lib/blueprints/question-blueprint-quality";
import type { QuestionBlueprintRow } from "@/lib/blueprints/question-blueprint-persistence";

export type QuestionBlueprintCalibrationReadiness =
  | "uncalibrated"
  | "calibrating"
  | "generation_ready"
  | "needs_edit"
  | "blocked";

export type QuestionBlueprintCalibrationRequest = {
  blueprint: QuestionBlueprintRow;
  blueprintId: string;
  difficultyTarget: number | null;
  knownTaxonomyTagIds?: ReadonlySet<string>;
  questionType: QuestionBlueprintGenerationQuestionType;
  sampleCount: number;
  sourceEvidenceSnippets: string[];
  variationNote: string;
};

export type QuestionBlueprintCalibrationSample = {
  adherenceScore: number;
  adherenceWarnings: string[];
  answerReady: boolean;
  blocked: boolean;
  contentPreview: string;
  difficulty: number;
  diversityWarnings: string[];
  originality: GeneratedBlueprintQuestionDraft["originality"] & {
    warnings: string[];
  };
  questionType: QuestionBlueprintGenerationQuestionType;
  schemaValid: boolean;
  taxonomyTagIds: string[];
  title: string;
  validationWarnings: string[];
};

export type QuestionBlueprintCalibrationResult = {
  adherenceScore: number;
  blockingReasons: string[];
  diversityScore: number;
  providerCallCount: 1;
  readiness: Exclude<QuestionBlueprintCalibrationReadiness, "uncalibrated" | "calibrating">;
  sampleCount: number;
};

export type QuestionBlueprintCalibrationRun = {
  generatedAt: string;
  modelName: string;
  provider: "deepseek";
  request: QuestionBlueprintGenerationRequest;
  result: QuestionBlueprintCalibrationResult;
  samples: QuestionBlueprintCalibrationSample[];
  safety: {
    noAutoPublish: true;
    noDbWrite: true;
    noGeminiCall: true;
    noOpenAICall: true;
    noRawProviderResponseStorage: true;
    noReviewDraftWrite: true;
  };
  validationSummary: {
    validSampleCount: number;
    warningCount: number;
  };
};

const MIN_ADHERENCE_SCORE = 0.72;
const MIN_DIVERSITY_SCORE = 0.65;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown) {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean);
}

function boundedText(value: unknown, max = 500) {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function sampleCount(value: unknown) {
  return Math.min(3, Math.max(1, Math.trunc(Number(value) || 2)));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function taxonomyTargets(blueprint: QuestionBlueprintRow) {
  const targets = asRecord(blueprint.taxonomy_targets);

  return uniqueStrings([
    ...stringList(targets.curriculum),
    ...stringList(targets.concept),
    ...stringList(targets.method),
    ...stringList(targets.task),
    ...stringList(targets.form),
  ]);
}

function answerSpecKind(value: unknown) {
  const kind = asRecord(value).kind;

  return typeof kind === "string" ? kind.trim().toLowerCase() : "";
}

function answerSpecText(value: unknown) {
  return JSON.stringify(value ?? {})
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function optionIds(options: unknown[]) {
  return options
    .map((option) => asRecord(option).id)
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);
}

function correctOptionReference(answerSpec: unknown) {
  const record = asRecord(answerSpec);
  const candidates = [
    record.correctOptionId,
    record.correct_option_id,
    record.correctAnswer,
    record.correct_answer,
    record.answer,
  ];

  return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function hasFillBlankAnswers(answerSpec: unknown) {
  const record = asRecord(answerSpec);

  return (
    stringList(record.acceptedAnswers).length > 0 ||
    stringList(record.accepted_answers).length > 0 ||
    stringList(record.finalAnswers).length > 0 ||
    stringList(record.final_answers).length > 0 ||
    typeof record.answer === "string"
  );
}

export function validateQuestionBlueprintCalibrationSample({
  draft,
  knownTaxonomyTagIds,
}: {
  draft: GeneratedBlueprintQuestionDraft;
  knownTaxonomyTagIds?: ReadonlySet<string>;
}) {
  const warnings = [...draft.validationWarnings];
  const tagIds = uniqueStrings(draft.taxonomyTagIds);
  const invalidTagIds = knownTaxonomyTagIds
    ? tagIds.filter((tagId) => !knownTaxonomyTagIds.has(tagId))
    : [];
  const kind = answerSpecKind(draft.answerSpec);
  const answerText = answerSpecText(draft.answerSpec);
  let answerReady = true;

  if (!draft.title.trim()) warnings.push("Calibration sample title is required.");
  if (!draft.contentHtml.trim()) warnings.push("Calibration sample contentHtml is required.");
  if (!["mcq", "fill_blank", "frq", "mixed"].includes(draft.questionType)) {
    warnings.push("Calibration sample has an unsupported question type.");
  }
  if (!Number.isFinite(draft.difficulty) || draft.difficulty < 0 || draft.difficulty > 1000) {
    warnings.push("Calibration sample difficulty must be between 0 and 1000.");
  }
  if (!tagIds.length) warnings.push("Calibration sample needs taxonomy leaf IDs.");
  if (invalidTagIds.length) {
    warnings.push(`Calibration sample uses invalid taxonomy leaf IDs: ${invalidTagIds.join(", ")}.`);
  }
  if (tagIds.some((tagId) => tagId.toLowerCase().includes("legacy"))) {
    warnings.push("Calibration sample must not use legacy tags.");
  }

  if (draft.questionType === "mcq") {
    const ids = optionIds(draft.options);
    const correctRef = correctOptionReference(draft.answerSpec);
    const uniqueIds = new Set(ids);

    if (kind !== "mcq") {
      answerReady = false;
      warnings.push("MCQ calibration sample requires answerSpec kind mcq.");
    }
    if (draft.options.length < 2) {
      answerReady = false;
      warnings.push("MCQ calibration sample requires at least two options.");
    }
    if (ids.length !== uniqueIds.size) {
      answerReady = false;
      warnings.push("MCQ calibration sample option IDs must be unique.");
    }
    if (!correctRef || !uniqueIds.has(correctRef)) {
      answerReady = false;
      warnings.push("MCQ calibration sample needs a valid correct option reference.");
    }
    if (!/distractor|incorrect|wrong|plausible/.test(answerText)) {
      answerReady = false;
      warnings.push("MCQ calibration sample needs distractor structure guidance.");
    }
  }

  if (draft.questionType === "fill_blank") {
    if (kind !== "fill_blank") {
      answerReady = false;
      warnings.push("Fill-blank calibration sample requires answerSpec kind fill_blank.");
    }
    if (!hasFillBlankAnswers(draft.answerSpec)) {
      answerReady = false;
      warnings.push("Fill-blank calibration sample needs accepted or final answers.");
    }
  }

  if ((draft.questionType === "frq" || draft.questionType === "mixed") && !Object.keys(asRecord(draft.answerSpec)).length) {
    answerReady = false;
    warnings.push("FRQ or mixed calibration sample needs lightweight grading or answer guidance.");
  }

  return {
    answerReady,
    schemaValid: warnings.length === 0,
    validationWarnings: uniqueStrings(warnings),
  };
}

export function evaluateBlueprintAdherence({
  draft,
  request,
}: {
  draft: GeneratedBlueprintQuestionDraft;
  request: QuestionBlueprintGenerationRequest;
}) {
  const warnings: string[] = [];
  let score = 1;
  const text = boundedText(
    [draft.title, draft.contentHtml, draft.solutionHtml, JSON.stringify(draft.answerSpec)].join(" "),
    4000,
  ).toLowerCase();
  const missingTags = request.taxonomyTagIds.filter(
    (tagId) => !draft.taxonomyTagIds.includes(tagId),
  );

  if (missingTags.length) {
    score -= 0.25;
    warnings.push(`Sample is missing target taxonomy tags: ${missingTags.slice(0, 4).join(", ")}.`);
  }
  if (draft.questionType !== request.questionType) {
    score -= 0.15;
    warnings.push("Sample question type differs from the calibration request.");
  }
  if (draft.difficulty < request.difficultyRange.min || draft.difficulty > request.difficultyRange.max) {
    score -= 0.1;
    warnings.push("Sample difficulty is outside the requested calibration range.");
  }

  const requiredElements = stringList(request.blueprint.required_elements).slice(0, 5);
  const missingElements = requiredElements.filter((element) => {
    const words = element.toLowerCase().split(/\W+/).filter((word) => word.length >= 5);

    return words.length > 0 && !words.some((word) => text.includes(word));
  });

  if (missingElements.length) {
    score -= 0.15;
    warnings.push("Sample may not reflect all required blueprint elements.");
  }

  if (answerSpecKind(draft.answerSpec) && answerSpecKind(request.blueprint.answer_spec_pattern)) {
    if (answerSpecKind(draft.answerSpec) !== answerSpecKind(request.blueprint.answer_spec_pattern)) {
      score -= 0.15;
      warnings.push("Sample answer structure differs from the blueprint answer pattern.");
    }
  }

  return {
    adherenceScore: Math.max(0, Number(score.toFixed(2))),
    adherenceWarnings: uniqueStrings(warnings),
  };
}

function tokenSet(sample: QuestionBlueprintCalibrationSample) {
  return new Set(
    [sample.title, sample.contentPreview]
      .join(" ")
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length >= 4),
  );
}

export function evaluateCalibrationDiversity(
  samples: QuestionBlueprintCalibrationSample[],
) {
  if (samples.length <= 1) {
    return {
      diversityScore: 1,
      diversityWarnings: [] as string[],
    };
  }

  const warnings: string[] = [];
  let maxSimilarity = 0;

  for (let leftIndex = 0; leftIndex < samples.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < samples.length; rightIndex += 1) {
      const left = tokenSet(samples[leftIndex]);
      const right = tokenSet(samples[rightIndex]);
      const intersection = Array.from(left).filter((token) => right.has(token)).length;
      const union = new Set([...left, ...right]).size || 1;
      const similarity = intersection / union;
      maxSimilarity = Math.max(maxSimilarity, similarity);

      if (
        similarity >= 0.82 ||
        samples[leftIndex].title.trim().toLowerCase() === samples[rightIndex].title.trim().toLowerCase()
      ) {
        warnings.push("Calibration samples are near-duplicates.");
      }
    }
  }

  return {
    diversityScore: Number(Math.max(0, 1 - maxSimilarity).toFixed(2)),
    diversityWarnings: uniqueStrings(warnings),
  };
}

export function deriveBlueprintGenerationReadiness({
  diversityScore,
  diversityWarnings,
  quality,
  samples,
}: {
  diversityScore: number;
  diversityWarnings: string[];
  quality: BlueprintQualityValidationResult;
  samples: QuestionBlueprintCalibrationSample[];
}): QuestionBlueprintCalibrationResult {
  const blockingReasons: string[] = [];
  const severeReasons: string[] = [];

  if (!quality.generationReady) {
    blockingReasons.push(...quality.generationBlockingReasons);
  }
  if (!samples.length) {
    severeReasons.push("Calibration produced no sample previews.");
  }

  for (const sample of samples) {
    if (!sample.schemaValid) {
      blockingReasons.push(...sample.validationWarnings);
    }
    if (!sample.answerReady) {
      blockingReasons.push("Calibration sample answer structure is not ready.");
    }
    if (sample.originality.tooCloseToEvidence) {
      severeReasons.push("Calibration sample is too close to bounded source evidence.");
    }
    if (sample.adherenceScore < MIN_ADHERENCE_SCORE) {
      blockingReasons.push("Calibration sample does not adhere closely enough to the blueprint.");
    }
  }

  if (diversityScore < MIN_DIVERSITY_SCORE || diversityWarnings.length) {
    blockingReasons.push(...diversityWarnings, "Calibration samples are not diverse enough.");
  }

  const uniqueReasons = uniqueStrings([...blockingReasons, ...severeReasons]).slice(0, 12);
  const readiness = uniqueReasons.length
    ? severeReasons.length
      ? "blocked"
      : "needs_edit"
    : "generation_ready";

  return {
    adherenceScore: samples.length
      ? Number(
          (
            samples.reduce((total, sample) => total + sample.adherenceScore, 0) /
            samples.length
          ).toFixed(2),
        )
      : 0,
    blockingReasons: uniqueReasons,
    diversityScore,
    providerCallCount: 1,
    readiness,
    sampleCount: samples.length,
  };
}

function calibrationSampleFromDraft({
  draft,
  knownTaxonomyTagIds,
  request,
}: {
  draft: GeneratedBlueprintQuestionDraft;
  knownTaxonomyTagIds?: ReadonlySet<string>;
  request: QuestionBlueprintGenerationRequest;
}): QuestionBlueprintCalibrationSample {
  const validation = validateQuestionBlueprintCalibrationSample({
    draft,
    knownTaxonomyTagIds,
  });
  const adherence = evaluateBlueprintAdherence({ draft, request });
  const originality = runBlueprintOriginalityGuard({
    draft: {
      contentHtml: draft.contentHtml,
      solutionHtml: draft.solutionHtml,
      title: draft.title,
    },
    originalityConstraints: request.blueprint.originality_constraints,
    sourceEvidenceSnippets: request.sourceEvidenceSnippets,
  });

  return {
    adherenceScore: adherence.adherenceScore,
    adherenceWarnings: adherence.adherenceWarnings,
    answerReady: validation.answerReady,
    blocked: draft.blocked || !validation.schemaValid || originality.blocked,
    contentPreview: boundedText(draft.contentHtml, 500),
    difficulty: draft.difficulty,
    diversityWarnings: [],
    originality: {
      copiedPhraseCount: originality.copiedPhraseCount,
      originalityChecked: true,
      tooCloseToEvidence: originality.tooCloseToEvidence,
      warnings: originality.warnings,
    },
    questionType: draft.questionType,
    schemaValid: validation.schemaValid,
    taxonomyTagIds: draft.taxonomyTagIds.slice(0, 12),
    title: boundedText(draft.title, 180),
    validationWarnings: validation.validationWarnings,
  };
}

export function summarizeQuestionBlueprintCalibration(
  run: QuestionBlueprintCalibrationRun,
) {
  return {
    adherenceScore: run.result.adherenceScore,
    blockingReasons: run.result.blockingReasons,
    diversityScore: run.result.diversityScore,
    modelName: run.modelName,
    provider: run.provider,
    readiness: run.result.readiness,
    sampleCount: run.samples.length,
    validSampleCount: run.validationSummary.validSampleCount,
    warningCount: run.validationSummary.warningCount,
  };
}

export async function runQuestionBlueprintCalibration({
  blueprint,
  blueprintId,
  difficultyTarget,
  knownTaxonomyTagIds,
  provider,
  questionType = "frq",
  sampleCount: requestedSampleCount = 2,
  sourceEvidenceSnippets = [],
  variationNote = "",
}: QuestionBlueprintCalibrationRequest & {
  provider: QuestionBlueprintGenerationProvider;
}): Promise<QuestionBlueprintCalibrationRun> {
  const request = buildQuestionBlueprintGenerationRequest({
    blueprint,
    blueprintId,
    count: sampleCount(requestedSampleCount),
    difficultyTarget,
    knownTaxonomyTagIds,
    questionType,
    sourceEvidenceSnippets,
    variationNote: [
      "Calibration preview only. Generate temporary samples for readiness evaluation.",
      variationNote,
    ].filter(Boolean).join(" "),
  });
  const generationResult: QuestionBlueprintGenerationResult =
    await executeDeepSeekBlueprintGeneration({
      provider,
      request,
    });
  const samples = [...generationResult.acceptedDrafts, ...generationResult.blockedDrafts]
    .slice(0, request.count)
    .map((draft) =>
      calibrationSampleFromDraft({
        draft,
        knownTaxonomyTagIds,
        request,
      }),
    );
  const diversity = evaluateCalibrationDiversity(samples);

  for (const sample of samples) {
    sample.diversityWarnings = diversity.diversityWarnings;
  }

  const quality = validateQuestionBlueprintQuality({
    blueprint,
    evidenceSnippets: sourceEvidenceSnippets,
    knownAssignableTagIds: knownTaxonomyTagIds,
    requestedQuestionType: request.questionType,
  });
  const result = deriveBlueprintGenerationReadiness({
    diversityScore: diversity.diversityScore,
    diversityWarnings: diversity.diversityWarnings,
    quality,
    samples,
  });
  const warningCount = samples.reduce(
    (total, sample) =>
      total +
      sample.validationWarnings.length +
      sample.adherenceWarnings.length +
      sample.originality.warnings.length +
      sample.diversityWarnings.length,
    generationResult.warnings.length,
  );

  return {
    generatedAt: new Date().toISOString(),
    modelName: provider.model,
    provider: "deepseek",
    request,
    result,
    samples,
    safety: {
      noAutoPublish: true,
      noDbWrite: true,
      noGeminiCall: true,
      noOpenAICall: true,
      noRawProviderResponseStorage: true,
      noReviewDraftWrite: true,
    },
    validationSummary: {
      validSampleCount: samples.filter(
        (sample) => sample.schemaValid && sample.answerReady && !sample.blocked,
      ).length,
      warningCount,
    },
  };
}
