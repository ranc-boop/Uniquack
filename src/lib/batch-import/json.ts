import { z } from "zod";

import {
  answerSpecToJson,
  normalizeAnswerSpec,
  normalizeQuestionOptions,
  optionsToJson,
} from "@/lib/questions/answer-spec";
import { sanitizeContentHtml } from "@/lib/sanitize/html";

const importItemSchema = z
  .object({
    code: z.string().optional(),
    question_code: z.string().optional(),
    title: z.string().optional(),
    type: z.string().optional(),
    question_type: z.string().optional(),
    difficulty: z.number().or(z.string()).optional(),
    difficulty_rating: z.number().or(z.string()).optional(),
    status: z.string().optional(),
    tag_ids: z.array(z.string()).optional(),
    content_html: z.string().optional(),
    content_source: z.string().optional(),
    content_source_format: z.enum(["markdown_latex", "html"]).optional(),
    solution_html: z.string().optional(),
    solution_source: z.string().optional(),
    solution_source_format: z.enum(["markdown_latex", "html"]).optional(),
    answer_spec: z.unknown().optional(),
    accepted_answers: z.array(z.string()).or(z.string()).optional(),
    answer: z.string().or(z.array(z.string())).optional(),
    answers: z.array(z.string()).or(z.string()).optional(),
    choices: z.unknown().optional(),
    correct_answer: z.string().or(z.array(z.string())).optional(),
    correct_answers: z.array(z.string()).or(z.string()).optional(),
    final_answer: z.string().or(z.array(z.string())).optional(),
    final_answers: z.array(z.string()).or(z.string()).optional(),
    options: z.unknown().optional(),
    image_urls: z.array(z.string()).optional(),
    image_files: z.array(z.string()).optional(),
    source_file_ids: z.array(z.string()).optional(),
    source_files: z.array(z.string()).optional(),
    question_asset_ids: z.array(z.string()).optional(),
    video_url: z.string().optional(),
    embed_url: z.string().optional(),
    ai_metadata: z.unknown().optional(),
  })
  .passthrough();

export type ExistingImportTag = {
  id: string;
};

export type NormalizedImportQuestion = {
  question_code: string;
  title: string;
  answer_spec: ReturnType<typeof answerSpecToJson>;
  options: ReturnType<typeof optionsToJson>;
  question_type: "mcq" | "fill_blank" | "frq" | "mixed";
  difficulty_rating: number;
  status: "draft";
  tag_ids: string[];
  content_html: string;
  content_source: string;
  content_source_format: "markdown_latex" | "html";
  solution_html: string | null;
  solution_source: string | null;
  solution_source_format: "markdown_latex" | "html";
  image_urls: string[];
  image_files: string[];
  source_file_ids: string[];
  source_files: string[];
  question_asset_ids: string[];
  video_url: string | null;
  embed_url: string | null;
  ai_metadata?: unknown;
};

export type BatchImportPreviewItem = {
  index: number;
  raw: unknown;
  normalized: NormalizedImportQuestion | null;
  errors: string[];
  warnings: string[];
};

export type BatchImportPreview = {
  items: BatchImportPreviewItem[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  unknownTagCount: number;
};

function stringArray(values: string[] | undefined) {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );
}

function normalizeCode(value: string | undefined) {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeTitle(value: string | undefined) {
  return value?.trim().slice(0, 240) ?? "";
}

function normalizeType(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "mcq" ||
    normalized === "multiple_choice" ||
    normalized === "multiple choice" ||
    normalized === "choice"
  ) {
    return "mcq";
  }
  if (
    normalized === "fill_blank" ||
    normalized === "fill blank" ||
    normalized === "fill-in-the-blank" ||
    normalized === "short_answer" ||
    normalized === "short answer"
  ) {
    return "fill_blank";
  }
  return normalized === "mixed" ? normalized : "frq";
}

function looseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : typeof value === "string"
      ? value
          .split(/[,;\n]/)
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
}

function inferQuestionType({
  answerValues,
  options,
  rawType,
}: {
  answerValues: string[];
  options: ReturnType<typeof normalizeQuestionOptions>;
  rawType: string | undefined;
}) {
  const normalized = normalizeType(rawType);

  if (rawType?.trim()) {
    return normalized;
  }

  if (options.length) {
    return "mcq";
  }

  if (answerValues.length) {
    return "fill_blank";
  }

  return normalized;
}

function normalizeDifficulty(value: string | number | undefined) {
  const parsed = Number(value ?? 500);

  if (!Number.isFinite(parsed)) {
    return 500;
  }

  return Math.min(1000, Math.max(0, Math.trunc(parsed)));
}

function httpUrlOrNull(value: string | undefined) {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function httpUrlArray(values: string[] | undefined) {
  return (values ?? [])
    .map((value) => httpUrlOrNull(value))
    .filter((value): value is string => Boolean(value));
}

function idReferenceArray(values: string[] | undefined) {
  return stringArray(values).slice(0, 50);
}

export function parseBatchImportJson(jsonText: string) {
  const parsed = JSON.parse(jsonText) as unknown;

  if (Array.isArray(parsed)) return parsed;

  if (
    parsed &&
    typeof parsed === "object" &&
    "questions" in parsed &&
    Array.isArray(parsed.questions)
  ) {
    return parsed.questions;
  }

  throw new Error("JSON must be an array or an object with a questions array.");
}

export function evaluateBatchImportItems({
  rawItems,
  existingTags,
  existingQuestionCodes,
}: {
  rawItems: unknown[];
  existingTags: ExistingImportTag[];
  existingQuestionCodes: Set<string>;
}): BatchImportPreview {
  const existingTagIds = new Set(existingTags.map((tag) => tag.id));
  const seenCodes = new Set<string>();

  const items = rawItems.map((raw, index): BatchImportPreviewItem => {
    const parsed = importItemSchema.safeParse(raw);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!parsed.success) {
      return {
        index,
        raw,
        normalized: null,
        errors: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "item"}: ${issue.message}`,
        ),
        warnings,
      };
    }

    const item = parsed.data;
    const questionCode = normalizeCode(item.question_code ?? item.code);
    const title = normalizeTitle(item.title);
    const contentHtml = item.content_html?.trim() ?? "";
    const contentSource = item.content_source || contentHtml;
    const contentSourceFormat = item.content_source_format ?? "html";
    const solutionHtml = item.solution_html?.trim() || null;
    const solutionSource = item.solution_source || solutionHtml;
    const solutionSourceFormat = item.solution_source_format ?? "html";

    if (!questionCode) errors.push("Missing code or question_code.");
    if (!title) errors.push("Missing title.");
    if (!contentHtml) errors.push("Missing content_html.");

    const codeKey = questionCode.toLowerCase();
    if (questionCode && existingQuestionCodes.has(codeKey)) {
      errors.push(`Duplicate question code already exists: ${questionCode}.`);
    }
    if (questionCode && seenCodes.has(codeKey)) {
      errors.push(`Duplicate question code within import: ${questionCode}.`);
    }
    if (questionCode) seenCodes.add(codeKey);

    const tagIds = stringArray(item.tag_ids);
    for (const tagId of tagIds) {
      if (!existingTagIds.has(tagId)) {
        errors.push(`Unknown tag ID: ${tagId}.`);
      }
    }

    const sanitizedContent = sanitizeContentHtml(contentHtml);
    const sanitizedSolution = solutionHtml
      ? sanitizeContentHtml(solutionHtml)
      : null;

    if (sanitizedContent !== contentHtml || sanitizedSolution !== solutionHtml) {
      warnings.push("Unsafe HTML will be sanitized before saving.");
    }

    if (item.status && item.status !== "draft") {
      warnings.push("Imported status is forced to draft for review.");
    }

    const videoUrl = httpUrlOrNull(item.video_url);
    const embedUrl = httpUrlOrNull(item.embed_url);
    const imageUrls = httpUrlArray(item.image_urls);
    const imageFiles = stringArray(item.image_files).slice(0, 50);
    const sourceFileIds = idReferenceArray(item.source_file_ids);
    const sourceFiles = stringArray(item.source_files).slice(0, 50);
    const questionAssetIds = idReferenceArray(item.question_asset_ids);
    const options = normalizeQuestionOptions(item.options ?? item.choices);
    const correctAnswerValues = looseStringArray(
      item.correct_answers ?? item.correct_answer ?? item.answer,
    );
    const finalAnswerValues = looseStringArray(
      item.final_answers ?? item.final_answer ?? item.answers ?? item.answer,
    );
    const acceptedAnswerValues = looseStringArray(item.accepted_answers);
    const questionType = inferQuestionType({
      answerValues: [...finalAnswerValues, ...acceptedAnswerValues],
      options,
      rawType: item.question_type ?? item.type,
    });
    const answerSpec = normalizeAnswerSpec(
      item.answer_spec ??
        (questionType === "mcq"
          ? {
              allow_multiple: correctAnswerValues.length > 1,
              correct_option_ids: correctAnswerValues,
              kind: "mcq",
            }
          : questionType === "fill_blank"
            ? {
                accepted_answers: acceptedAnswerValues.length
                  ? acceptedAnswerValues
                  : finalAnswerValues,
                equivalence: "math",
                final_answers: finalAnswerValues,
                kind: "fill_blank",
                numeric_tolerance: 0,
              }
            : {}),
    );

    if (questionType === "mcq" && !options.length) {
      warnings.push("MCQ import has no options; automatic grading will not work until options are added.");
    }
    if (
      questionType === "mcq" &&
      answerSpec.kind === "mcq" &&
      !answerSpec.correct_option_ids?.length
    ) {
      warnings.push("MCQ import has no correct_option_ids in answer_spec.");
    }

    if (item.video_url && !videoUrl) warnings.push("Invalid video_url was ignored.");
    if (item.embed_url && !embedUrl) warnings.push("Invalid embed_url was ignored.");
    if ((item.image_urls?.length ?? 0) !== imageUrls.length) {
      warnings.push("One or more invalid image_urls were ignored.");
    }

    if (
      imageUrls.length ||
      imageFiles.length ||
      sourceFileIds.length ||
      sourceFiles.length ||
      questionAssetIds.length
    ) {
      warnings.push(
        "Asset references are preserved for review only in Batch Import v2.",
      );
    }

    return {
      index,
      raw,
      normalized: errors.length
        ? null
        : {
            question_code: questionCode,
            title,
            answer_spec: answerSpecToJson(answerSpec),
            options: optionsToJson(options),
            question_type: questionType,
            difficulty_rating: normalizeDifficulty(
              item.difficulty_rating ?? item.difficulty,
            ),
            status: "draft",
            tag_ids: tagIds,
            content_html: sanitizedContent,
            content_source: contentSource,
            content_source_format: contentSourceFormat,
            solution_html: sanitizedSolution,
            solution_source: solutionSource,
            solution_source_format: solutionSourceFormat,
            image_urls: imageUrls,
            image_files: imageFiles,
            source_file_ids: sourceFileIds,
            source_files: sourceFiles,
            question_asset_ids: questionAssetIds,
            video_url: videoUrl,
            embed_url: embedUrl,
            ai_metadata: item.ai_metadata,
          },
      errors,
      warnings,
    };
  });

  return {
    items,
    validCount: items.filter((item) => item.normalized).length,
    invalidCount: items.filter((item) => !item.normalized).length,
    duplicateCount: items.filter((item) =>
      item.errors.some((error) => error.toLowerCase().includes("duplicate")),
    ).length,
    unknownTagCount: items.filter((item) =>
      item.errors.some((error) => error.toLowerCase().includes("unknown tag")),
    ).length,
  };
}
