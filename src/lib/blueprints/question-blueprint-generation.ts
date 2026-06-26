import "server-only";

import { parsePossiblyMalformedJson } from "@/lib/ai-providers/json-repair";
import {
  formatBlueprintQualityError,
  validateQuestionBlueprintQuality,
} from "@/lib/blueprints/question-blueprint-quality";
import type { QuestionBlueprintRow } from "@/lib/blueprints/question-blueprint-persistence";
import type { QuestionBlueprintRepairAttempt } from "@/lib/blueprints/question-blueprint-repair";

export type QuestionBlueprintGenerationProvider = {
  apiKey: string;
  base_url: string;
  model: string;
  name?: string | null;
  provider: string;
};

export type QuestionBlueprintGenerationQuestionType =
  | "mcq"
  | "fill_blank"
  | "frq"
  | "mixed";

export type QuestionBlueprintGenerationRequest = {
  blueprintId: string;
  count: number;
  difficultyTarget: number | null;
  difficultyRange: {
    max: number;
    min: number;
  };
  modelRoute: {
    mode: "manual_deepseek_text_only";
    provider: "deepseek";
  };
  questionType: QuestionBlueprintGenerationQuestionType;
  requestId: string;
  safety: {
    noAutoPublish: true;
    noGeminiCall: true;
    noOpenAICall: true;
    reviewRequired: true;
  };
  sourceEvidenceSnippets: string[];
  sourceRefs: Record<string, unknown>;
  taxonomyTagIds: string[];
  variationNote: string;
  blueprint: Pick<
    QuestionBlueprintRow,
    | "answer_spec_pattern"
    | "deleted_at"
    | "difficulty_profile"
    | "distractor_pattern"
    | "generation_constraints"
    | "originality_constraints"
    | "question_pattern"
    | "required_elements"
    | "status"
    | "taxonomy_targets"
    | "title"
  >;
};

export type GeneratedBlueprintQuestionDraft = {
  answerSpec: unknown;
  blocked: boolean;
  contentHtml: string;
  difficulty: number;
  options: unknown[];
  originality: {
    copiedPhraseCount: number;
    originalityChecked: true;
    tooCloseToEvidence: boolean;
  };
  questionType: QuestionBlueprintGenerationQuestionType;
  solutionHtml: string;
  taxonomyTagIds: string[];
  title: string;
  validationWarnings: string[];
};

export type QuestionBlueprintGenerationResult = {
  acceptedDrafts: GeneratedBlueprintQuestionDraft[];
  blockedDrafts: GeneratedBlueprintQuestionDraft[];
  generatedAt: string;
  provider: "deepseek";
  repairAttempts?: QuestionBlueprintRepairAttempt[];
  request: QuestionBlueprintGenerationRequest;
  stats: {
    acceptedCount: number;
    blockedCount: number;
    providerCallCount: number;
    repairAttemptCount?: number;
    reviewDraftWriteCount: 0;
  };
  warnings: string[];
};

export const QUESTION_BLUEPRINT_GENERATION_PROMPT_CONTRACT = [
  "Generate original questions that follow the approved blueprint structure.",
  "Do not copy the source question wording, numbers, scenario, or surface details.",
  "Preserve concept/method/task/form and cognitive demand.",
  "Return JSON only.",
] as const;

const QUESTION_BLUEPRINT_GENERATION_TIMEOUT_MS = 90_000;
const QUESTION_TYPES = new Set<QuestionBlueprintGenerationQuestionType>([
  "mcq",
  "fill_blank",
  "frq",
  "mixed",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown, max = 24) {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

function boundedText(value: unknown, max = 600) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function clampDifficulty(value: unknown, fallback = 500) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(1000, Math.max(0, Math.round(numeric)));
}

function normalizeQuestionType(value: unknown): QuestionBlueprintGenerationQuestionType {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (QUESTION_TYPES.has(normalized as QuestionBlueprintGenerationQuestionType)) {
    return normalized as QuestionBlueprintGenerationQuestionType;
  }

  return "frq";
}

function taxonomyTagIds(targets: unknown) {
  const record = asRecord(targets);

  return Array.from(
    new Set(
      [
        ...stringList(record.curriculum),
        ...stringList(record.concept),
        ...stringList(record.method),
        ...stringList(record.task),
        ...stringList(record.form),
      ].filter(Boolean),
    ),
  );
}

function requestIdFor(blueprintId: string) {
  return `blueprint-generation-${blueprintId.slice(0, 12)}-${Date.now().toString(36)}`;
}

export function buildQuestionBlueprintGenerationRequest({
  blueprint,
  blueprintId,
  count = 1,
  difficultyTarget,
  knownTaxonomyTagIds,
  questionType,
  sourceEvidenceSnippets = [],
  variationNote = "",
}: {
  blueprint: QuestionBlueprintRow;
  blueprintId: string;
  count?: number;
  difficultyTarget?: number | null;
  knownTaxonomyTagIds?: ReadonlySet<string>;
  questionType?: string;
  sourceEvidenceSnippets?: string[];
  variationNote?: string;
}): QuestionBlueprintGenerationRequest {
  if (blueprint.status !== "approved") {
    throw new Error("Only approved question blueprints can generate draft questions.");
  }

  const tagIds = taxonomyTagIds(blueprint.taxonomy_targets);
  const invalidTagIds = knownTaxonomyTagIds
    ? tagIds.filter((tagId) => !knownTaxonomyTagIds.has(tagId))
    : [];

  if (invalidTagIds.length) {
    throw new Error(`Blueprint contains invalid taxonomy tag ids: ${invalidTagIds.join(", ")}`);
  }

  const normalizedCount = Math.min(10, Math.max(1, Math.trunc(Number(count) || 1)));
  const normalizedDifficulty = difficultyTarget == null
    ? null
    : clampDifficulty(difficultyTarget);
  const normalizedQuestionType = normalizeQuestionType(questionType);
  const quality = validateQuestionBlueprintQuality({
    blueprint,
    evidenceSnippets: sourceEvidenceSnippets,
    knownAssignableTagIds: knownTaxonomyTagIds,
    requestedQuestionType: normalizedQuestionType,
  });

  if (!quality.generationReady) {
    throw new Error(
      formatBlueprintQualityError({
        heading: "Blueprint is not generation-ready:",
        reasons: quality.generationBlockingReasons,
      }),
    );
  }

  return {
    blueprint: {
      answer_spec_pattern: blueprint.answer_spec_pattern,
      deleted_at: blueprint.deleted_at,
      difficulty_profile: blueprint.difficulty_profile,
      distractor_pattern: stringList(blueprint.distractor_pattern, 12),
      generation_constraints: stringList(blueprint.generation_constraints, 16),
      originality_constraints: stringList(blueprint.originality_constraints, 16),
      question_pattern: asRecord(blueprint.question_pattern),
      required_elements: stringList(blueprint.required_elements, 16),
      status: blueprint.status,
      taxonomy_targets: asRecord(blueprint.taxonomy_targets) as Record<string, string[]>,
      title: boundedText(blueprint.title, 240),
    },
    blueprintId,
    count: normalizedCount,
    difficultyRange: {
      max: normalizedDifficulty == null ? 1000 : normalizedDifficulty,
      min: normalizedDifficulty == null ? 0 : normalizedDifficulty,
    },
    difficultyTarget: normalizedDifficulty,
    modelRoute: {
      mode: "manual_deepseek_text_only",
      provider: "deepseek",
    },
    questionType: normalizedQuestionType,
    requestId: requestIdFor(blueprintId),
    safety: {
      noAutoPublish: true,
      noGeminiCall: true,
      noOpenAICall: true,
      reviewRequired: true,
    },
    sourceEvidenceSnippets: sourceEvidenceSnippets
      .map((snippet) => boundedText(snippet, 280))
      .filter(Boolean)
      .slice(0, 8),
    sourceRefs: asRecord(blueprint.source_refs),
    taxonomyTagIds: tagIds,
    variationNote: boundedText(variationNote, 280),
  };
}

export function buildQuestionBlueprintGenerationPrompt(
  request: QuestionBlueprintGenerationRequest,
) {
  const payload = {
    answerSpecPattern: request.blueprint.answer_spec_pattern,
    count: request.count,
    difficultyRange: request.difficultyRange,
    distractorPattern: request.blueprint.distractor_pattern,
    generationConstraints: request.blueprint.generation_constraints,
    originalityConstraints: request.blueprint.originality_constraints,
    outputSchema: {
      questions: [
        {
          answerSpec: {},
          contentHtml: "<p>...</p>",
          difficulty: 500,
          options: [],
          questionType: request.questionType,
          solutionHtml: "<p>...</p>",
          taxonomyTagIds: request.taxonomyTagIds,
          title: "Original draft title",
        },
      ],
    },
    promptContract: QUESTION_BLUEPRINT_GENERATION_PROMPT_CONTRACT,
    questionPattern: request.blueprint.question_pattern,
    questionType: request.questionType,
    requiredElements: request.blueprint.required_elements,
    sourceEvidenceSnippetsForDoNotCopy: request.sourceEvidenceSnippets,
    taxonomyTagIds: request.taxonomyTagIds,
    variationNote: request.variationNote,
  };

  return [
    "You are generating original draft assessment questions for admin review.",
    ...QUESTION_BLUEPRINT_GENERATION_PROMPT_CONTRACT,
    "All generated questions must be draft-only and require human review before publishing.",
    "Use $...$ for inline math where helpful.",
    "Do not include API keys, provider secrets, raw PDF text, image bytes, base64, or source URLs.",
    "Return a single JSON object matching the outputSchema.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export async function executeDeepSeekBlueprintGeneration({
  provider,
  request,
}: {
  provider: QuestionBlueprintGenerationProvider;
  request: QuestionBlueprintGenerationRequest;
}) {
  const response = await fetch(endpoint(provider.base_url), {
    body: JSON.stringify({
      messages: [
        {
          content: buildQuestionBlueprintGenerationPrompt(request),
          role: "user",
        },
      ],
      model: provider.model,
      response_format: { type: "json_object" },
      temperature: 0.35,
    }),
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(QUESTION_BLUEPRINT_GENERATION_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `DeepSeek blueprint generation failed with provider status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const providerText = payload.choices?.[0]?.message?.content;

  if (!providerText) {
    throw new Error("DeepSeek blueprint generation returned no message content.");
  }

  return parseQuestionBlueprintGenerationProviderText({
    providerText,
    request,
  });
}

function textForSimilarity(draft: {
  contentHtml?: string;
  solutionHtml?: string;
  title?: string;
}) {
  return [draft.title, draft.contentHtml, draft.solutionHtml]
    .join(" ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function evidencePhrases(snippet: string) {
  const clean = snippet.replace(/\s+/g, " ").trim();
  const phrases = new Set<string>();

  if (clean.length >= 80) {
    phrases.add(clean.slice(0, 100).toLowerCase());
  }

  const words = clean.split(/\s+/).filter((word) => word.length > 2);
  for (let index = 0; index + 5 <= words.length; index += 1) {
    phrases.add(words.slice(index, index + 5).join(" ").toLowerCase());
  }

  return Array.from(phrases);
}

function numberTokens(value: string) {
  return new Set(value.match(/\b\d+(?:\.\d+)?\b/g) ?? []);
}

export function runBlueprintOriginalityGuard({
  draft,
  originalityConstraints,
  sourceEvidenceSnippets,
}: {
  draft: {
    contentHtml?: string;
    solutionHtml?: string;
    title?: string;
  };
  originalityConstraints: string[];
  sourceEvidenceSnippets: string[];
}) {
  const warnings: string[] = [];
  const text = textForSimilarity(draft);
  let copiedPhraseCount = 0;
  let tooCloseToEvidence = false;

  if (!originalityConstraints.length) {
    warnings.push("Missing originality constraints from approved blueprint.");
  }

  for (const snippet of sourceEvidenceSnippets) {
    for (const phrase of evidencePhrases(snippet)) {
      if (phrase.length >= 24 && text.includes(phrase)) {
        copiedPhraseCount += 1;
      }
    }

    const sourceNumbers = numberTokens(snippet);
    const generatedNumbers = numberTokens(text);
    const sharedNumbers = Array.from(sourceNumbers).filter((token) =>
      generatedNumbers.has(token),
    );
    if (sharedNumbers.length >= 3) {
      warnings.push("Generated draft may reuse too many numeric details from source evidence.");
    }
  }

  if (copiedPhraseCount >= 2) {
    tooCloseToEvidence = true;
    warnings.push("Generated draft copies too much bounded source evidence.");
  }

  return {
    blocked: tooCloseToEvidence || !originalityConstraints.length,
    copiedPhraseCount,
    originalityChecked: true as const,
    tooCloseToEvidence,
    warnings,
  };
}

function normalizeOptions(value: unknown) {
  return asArray(value)
    .map((option, index) => {
      const record = asRecord(option);

      return {
        content_html: boundedText(record.contentHtml ?? record.content_html ?? record.label, 1000),
        id: boundedText(record.id, 40) || String.fromCharCode(65 + index),
      };
    })
    .filter((option) => option.content_html);
}

function normalizeGeneratedDraft({
  item,
  request,
}: {
  item: unknown;
  request: QuestionBlueprintGenerationRequest;
}): GeneratedBlueprintQuestionDraft {
  const record = asRecord(item);
  const questionType = normalizeQuestionType(record.questionType ?? record.question_type);
  const title = boundedText(record.title, 240);
  const contentHtml = boundedText(record.contentHtml ?? record.content_html, 12_000);
  const solutionHtml = boundedText(record.solutionHtml ?? record.solution_html, 12_000);
  const taxonomyIds = taxonomyTagIds({ all: record.taxonomyTagIds });
  const tagIds = taxonomyIds.length ? taxonomyIds : request.taxonomyTagIds;
  const warnings: string[] = [];

  if (!title) warnings.push("Generated draft is missing a title.");
  if (!contentHtml) warnings.push("Generated draft is missing contentHtml.");
  if (!solutionHtml) warnings.push("Generated draft is missing solutionHtml.");
  if (!tagIds.length) warnings.push("Generated draft is missing taxonomy tags.");
  if (questionType === "mcq" && !normalizeOptions(record.options).length) {
    warnings.push("Generated MCQ draft is missing options.");
  }

  const originality = runBlueprintOriginalityGuard({
    draft: {
      contentHtml,
      solutionHtml,
      title,
    },
    originalityConstraints: request.blueprint.originality_constraints,
    sourceEvidenceSnippets: request.sourceEvidenceSnippets,
  });

  return {
    answerSpec: record.answerSpec ?? record.answer_spec ?? {},
    blocked: warnings.some((warning) => warning.includes("missing")) || originality.blocked,
    contentHtml,
    difficulty: clampDifficulty(record.difficulty, request.difficultyTarget ?? 500),
    options: normalizeOptions(record.options),
    originality: {
      copiedPhraseCount: originality.copiedPhraseCount,
      originalityChecked: true,
      tooCloseToEvidence: originality.tooCloseToEvidence,
    },
    questionType,
    solutionHtml,
    taxonomyTagIds: tagIds,
    title,
    validationWarnings: [...warnings, ...originality.warnings],
  };
}

export function parseQuestionBlueprintGenerationProviderText({
  providerText,
  request,
}: {
  providerText: string;
  request: QuestionBlueprintGenerationRequest;
}): QuestionBlueprintGenerationResult {
  const parsed = parsePossiblyMalformedJson(providerText);
  const root = asRecord(parsed);
  const items = asArray(root.questions ?? root.draftQuestions);
  const warnings: string[] = [];

  if (!items.length) {
    warnings.push("DeepSeek returned no generated questions.");
  }

  const drafts = items
    .slice(0, request.count)
    .map((item) => normalizeGeneratedDraft({ item, request }));
  const acceptedDrafts = drafts.filter((draft) => !draft.blocked);
  const blockedDrafts = drafts.filter((draft) => draft.blocked);

  return {
    acceptedDrafts,
    blockedDrafts,
    generatedAt: new Date().toISOString(),
    provider: "deepseek",
    request,
    stats: {
      acceptedCount: acceptedDrafts.length,
      blockedCount: blockedDrafts.length,
      providerCallCount: 1,
      reviewDraftWriteCount: 0,
    },
    warnings,
  };
}

export function summarizeQuestionBlueprintGenerationResult(
  result: QuestionBlueprintGenerationResult,
) {
  return {
    acceptedCount: result.stats.acceptedCount,
    blockedCount: result.stats.blockedCount,
    blueprintId: result.request.blueprintId,
    provider: result.provider,
    requestId: result.request.requestId,
    reviewDraftWriteCount: 0,
    repairAttemptCount: result.stats.repairAttemptCount ?? result.repairAttempts?.length ?? 0,
    warningCount:
      result.warnings.length +
      result.acceptedDrafts.reduce(
        (total, draft) => total + draft.validationWarnings.length,
        0,
      ) +
      result.blockedDrafts.reduce(
        (total, draft) => total + draft.validationWarnings.length,
        0,
      ),
  };
}
