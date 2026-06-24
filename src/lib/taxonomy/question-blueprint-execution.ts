import "server-only";

import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";
import { parsePossiblyMalformedJson } from "@/lib/ai-providers/json-repair";
import type { BlueprintGenerationRequestDraft } from "@/lib/taxonomy/question-blueprint-generation";
import type { BlueprintProviderRunDraft } from "@/lib/taxonomy/question-blueprint-provider-runner";
import {
  QUESTION_BLUEPRINT_QUESTION_TYPES,
  type QuestionBlueprintQuestionType,
} from "@/lib/taxonomy/question-blueprint";
import type { Json } from "@/types/database";

type DeepSeekProviderProfile = {
  apiKey: string;
  base_url: string;
  model: string;
  name: string;
  provider: string;
};

export type BlueprintGeneratedQuestionDraft = {
  answerSpec: Json;
  contentHtml: string;
  difficulty: number;
  options: Json[];
  questionType: QuestionBlueprintQuestionType;
  reviewRequired: true;
  solutionHtml: string | null;
  status: "draft";
  taxonomyTagIds: string[];
  title: string;
  validationErrors: string[];
  validationWarnings: string[];
};

export type BlueprintExecutionResult = {
  generatedDraftCount: number;
  generatedDrafts: BlueprintGeneratedQuestionDraft[];
  modelName: string;
  providerName: string;
  requestId: string;
  responsePreview: string;
  status: "succeeded" | "failed";
  validationErrors: string[];
  warnings: string[];
};

type RawGeneratedQuestion = {
  answerSpec?: unknown;
  contentHtml?: unknown;
  difficulty?: unknown;
  options?: unknown;
  questionType?: unknown;
  solutionHtml?: unknown;
  taxonomyTagIds?: unknown;
  title?: unknown;
};

const BLUEPRINT_DEEPSEEK_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_PREVIEW_CHARS = 1200;

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function responsePreview(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_RESPONSE_PREVIEW_CHARS);
}

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
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function jsonArray(value: unknown): Json[] {
  return asArray(value).filter((item): item is Json => item !== undefined) as Json[];
}

function jsonRecord(value: unknown): Json {
  const record = asRecord(value);
  return Object.keys(record).length ? (record as Json) : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function numericDifficulty(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 500;
  return Math.min(1000, Math.max(0, Math.trunc(numeric)));
}

function questionType(value: unknown): QuestionBlueprintQuestionType {
  return QUESTION_BLUEPRINT_QUESTION_TYPES.includes(
    value as QuestionBlueprintQuestionType,
  )
    ? (value as QuestionBlueprintQuestionType)
    : "frq";
}

function catalogLeafTagIds(catalog: TaxonomyCatalogView) {
  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );

  return new Set(
    catalog.nodes
      .filter((node) => node.is_assignable !== false && !parentTagIds.has(node.tag_id))
      .map((node) => node.tag_id),
  );
}

function normalizeRawQuestion(raw: unknown): RawGeneratedQuestion {
  const record = asRecord(raw);

  return {
    answerSpec: record.answerSpec ?? record.answer_spec,
    contentHtml: record.contentHtml ?? record.content_html,
    difficulty: record.difficulty ?? record.difficulty_rating,
    options: record.options,
    questionType: record.questionType ?? record.question_type,
    solutionHtml: record.solutionHtml ?? record.solution_html,
    taxonomyTagIds: record.taxonomyTagIds ?? record.taxonomy_tag_ids ?? record.tag_ids,
    title: record.title,
  };
}

export function parseBlueprintGeneratedQuestions(responseText: string) {
  const parsed = parsePossiblyMalformedJson(responseText);
  const record = asRecord(parsed);
  const draftQuestions = asArray(record.draftQuestions ?? record.draft_questions);

  return draftQuestions.map(normalizeRawQuestion);
}

export function validateBlueprintGeneratedQuestion({
  allowedTagIds,
  catalog,
  question,
}: {
  allowedTagIds: string[];
  catalog: TaxonomyCatalogView;
  question: RawGeneratedQuestion;
}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const activeAssignableLeafTagIds = catalogLeafTagIds(catalog);
  const allowedTagSet = new Set(allowedTagIds);
  const normalizedQuestionType = questionType(question.questionType);
  const taxonomyTagIds = stringList(question.taxonomyTagIds);
  const options = jsonArray(question.options);
  const answerSpec = jsonRecord(question.answerSpec);

  if (!stringValue(question.title)) {
    errors.push("generated_question_title_required");
  }

  if (!stringValue(question.contentHtml)) {
    errors.push("generated_question_content_required");
  }

  if (!QUESTION_BLUEPRINT_QUESTION_TYPES.includes(normalizedQuestionType)) {
    errors.push("generated_question_type_invalid");
  }

  if (!taxonomyTagIds.length) {
    errors.push("generated_question_taxonomy_tags_required");
  }

  for (const tagId of taxonomyTagIds) {
    if (!activeAssignableLeafTagIds.has(tagId)) {
      errors.push(`generated_question_invalid_taxonomy_tag:${tagId}`);
    }
    if (allowedTagSet.size && !allowedTagSet.has(tagId)) {
      warnings.push(`generated_question_tag_outside_request:${tagId}`);
    }
  }

  if (normalizedQuestionType === "mcq" && options.length < 2) {
    errors.push("generated_question_mcq_options_required");
  }

  if (
    normalizedQuestionType === "mcq" &&
    (!answerSpec || typeof answerSpec !== "object" || !Object.keys(answerSpec).length)
  ) {
    warnings.push("generated_question_mcq_answer_spec_missing");
  }

  return {
    errors: Array.from(new Set(errors)),
    valid: errors.length === 0,
    warnings: Array.from(new Set(warnings)),
  };
}

export function buildBlueprintGeneratedDrafts({
  catalog,
  rawQuestions,
  request,
}: {
  catalog: TaxonomyCatalogView;
  rawQuestions: RawGeneratedQuestion[];
  request: BlueprintGenerationRequestDraft;
}): BlueprintGeneratedQuestionDraft[] {
  const allowedTagIds = request.targetTags.map((tag) => tag.tagId);

  return rawQuestions.map((rawQuestion) => {
    const validation = validateBlueprintGeneratedQuestion({
      allowedTagIds,
      catalog,
      question: rawQuestion,
    });

    return {
      answerSpec: jsonRecord(rawQuestion.answerSpec),
      contentHtml: stringValue(rawQuestion.contentHtml),
      difficulty: numericDifficulty(rawQuestion.difficulty),
      options: jsonArray(rawQuestion.options),
      questionType: questionType(rawQuestion.questionType),
      reviewRequired: true,
      solutionHtml: stringValue(rawQuestion.solutionHtml) || null,
      status: "draft",
      taxonomyTagIds: stringList(rawQuestion.taxonomyTagIds),
      title: stringValue(rawQuestion.title, "Untitled generated draft"),
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
    };
  });
}

function messagesForDeepSeek({
  request,
  run,
}: {
  request: BlueprintGenerationRequestDraft;
  run: BlueprintProviderRunDraft;
}) {
  const schema = run.expectedOutputSchema;

  return [
    {
      content: [
        run.promptPayloadPreview.system,
        "Return JSON only.",
        `Root field: ${schema.root}.`,
        `Draft fields: ${schema.fields.join(", ")}.`,
        "Generated questions are draft-only and require review.",
      ].join(" "),
      role: "system" as const,
    },
    {
      content: [
        run.promptPayloadPreview.user,
        `Allowed taxonomyTagIds: ${request.targetTags.map((tag) => tag.tagId).join(", ")}.`,
        "Never return status='published'. Never write or publish content.",
      ].join(" "),
      role: "user" as const,
    },
  ];
}

export async function executeBlueprintGenerationRequestWithDeepSeek({
  catalog,
  profile,
  request,
  run,
}: {
  catalog: TaxonomyCatalogView;
  profile: DeepSeekProviderProfile;
  request: BlueprintGenerationRequestDraft;
  run: BlueprintProviderRunDraft;
}): Promise<BlueprintExecutionResult> {
  if (run.providerKind !== "deepseek") {
    throw new Error("Blueprint generation V1 only supports DeepSeek text-only runs.");
  }

  if (run.realCall !== false || run.mode !== "shadow_only") {
    throw new Error("Blueprint generation V1 requires a shadow run draft as input.");
  }

  const requestBody = {
    messages: messagesForDeepSeek({ request, run }),
    model: profile.model,
    response_format: { type: "json_object" },
    temperature: 0.2,
  };

  let response: Response;
  try {
    response = await fetch(endpoint(profile.base_url), {
      body: JSON.stringify(requestBody),
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(BLUEPRINT_DEEPSEEK_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `DeepSeek blueprint generation could not reach the provider: ${
        error instanceof Error ? error.message : "Unknown network error."
      }`,
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `DeepSeek blueprint generation failed (${response.status}). Response preview: ${responsePreview(
        responseText,
      )}`,
    );
  }

  const responseRecord = asRecord(parsePossiblyMalformedJson(responseText));
  const contentText = stringValue(
    asRecord(asArray(responseRecord.choices)[0]).message
      ? asRecord(asRecord(asArray(responseRecord.choices)[0]).message).content
      : responseRecord.content,
  );
  const generatedText = contentText || responseText;
  const rawQuestions = parseBlueprintGeneratedQuestions(generatedText);
  const generatedDrafts = buildBlueprintGeneratedDrafts({
    catalog,
    rawQuestions,
    request,
  });
  const validationErrors = generatedDrafts.flatMap((draft) => draft.validationErrors);
  const warnings = generatedDrafts.flatMap((draft) => draft.validationWarnings);

  return {
    generatedDraftCount: generatedDrafts.length,
    generatedDrafts,
    modelName: profile.model,
    providerName: profile.name,
    requestId: request.requestId,
    responsePreview: responsePreview(generatedText),
    status: validationErrors.length ? "failed" : "succeeded",
    validationErrors: Array.from(new Set(validationErrors)),
    warnings: Array.from(new Set(warnings)),
  };
}
