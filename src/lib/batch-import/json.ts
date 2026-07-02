import { z } from "zod";

import {
  answerSpecToJson,
  normalizeAnswerSpec,
  normalizeQuestionOptions,
  optionsToJson,
  type QuestionAnswerSpec,
  type QuestionOption,
} from "@/lib/questions/answer-spec";
import { parseImportQuestionsJsonWithLatexRepair } from "@/lib/import-json/latex-repair";
import { markdownLatexToHtml } from "@/lib/markdown-latex/markdown";
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

function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function answerSpecCorrectOptionValues(value: unknown) {
  const record = plainRecord(value);

  return [
    ...looseStringArray(record.correct_option_ids),
    ...looseStringArray(record.correct_option_id),
    ...looseStringArray(record.correct_answers),
    ...looseStringArray(record.correct_answer),
    ...looseStringArray(record.answer),
  ];
}

function normalizeAnswerChoiceToken(value: string) {
  return value
    .trim()
    .replace(/^[([{\s]+/, "")
    .replace(/[)\]}\s.:;-]+$/, "")
    .toLowerCase();
}

function resolveCorrectOptionIds({
  candidates,
  options,
}: {
  candidates: string[];
  options: QuestionOption[];
}) {
  const idByToken = new Map<string, string>();

  for (const option of options) {
    for (const value of [option.id, option.label]) {
      const token = normalizeAnswerChoiceToken(value);
      if (token) {
        idByToken.set(token, option.id);
      }
    }
  }

  return Array.from(
    new Set(
      candidates
        .map((candidate) => idByToken.get(normalizeAnswerChoiceToken(candidate)))
        .filter((candidate): candidate is string => Boolean(candidate)),
    ),
  );
}

function buildImportAnswerSpec({
  correctAnswerValues,
  itemAnswerSpec,
  questionType,
  options,
  finalAnswerValues,
  acceptedAnswerValues,
}: {
  correctAnswerValues: string[];
  itemAnswerSpec: unknown;
  questionType: "mcq" | "fill_blank" | "frq" | "mixed";
  options: QuestionOption[];
  finalAnswerValues: string[];
  acceptedAnswerValues: string[];
}): QuestionAnswerSpec {
  if (questionType === "mcq" && options.length) {
    const correctOptionIds = resolveCorrectOptionIds({
      candidates: [
        ...answerSpecCorrectOptionValues(itemAnswerSpec),
        ...correctAnswerValues,
      ],
      options,
    });

    return normalizeAnswerSpec({
      allow_multiple: correctOptionIds.length > 1,
      correct_option_ids: correctOptionIds,
      kind: "mcq",
    });
  }

  if (itemAnswerSpec !== undefined) {
    return normalizeAnswerSpec(itemAnswerSpec);
  }

  if (questionType === "fill_blank") {
    return normalizeAnswerSpec({
      accepted_answers: acceptedAnswerValues.length
        ? acceptedAnswerValues
        : finalAnswerValues,
      equivalence: "math",
      final_answers: finalAnswerValues,
      kind: "fill_blank",
      numeric_tolerance: 0,
    });
  }

  return normalizeAnswerSpec({ kind: questionType });
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

function renderImportContentSource({
  html,
  source,
  sourceFormat,
}: {
  html: string | null | undefined;
  source: string | null | undefined;
  sourceFormat: "markdown_latex" | "html";
}) {
  const cleanHtml = html?.trim() ?? "";
  const cleanSource = source?.trim() ?? "";
  const renderable = cleanHtml || cleanSource;

  if (!renderable) {
    return {
      html: "",
      source: "",
    };
  }

  if (sourceFormat === "markdown_latex" && cleanSource) {
    return {
      html: markdownLatexToHtml(cleanSource),
      source: cleanSource,
    };
  }

  return {
    html: renderable,
    source: cleanSource || renderable,
  };
}

function normalizeContentFormat(value: "markdown_latex" | "html" | undefined) {
  return value ?? "html";
}

export function normalizeQuestionContent(item: z.infer<typeof importItemSchema>) {
  const contentSourceFormat = normalizeContentFormat(item.content_source_format);
  const solutionSourceFormat = normalizeContentFormat(item.solution_source_format);
  const content = renderImportContentSource({
    html: item.content_html,
    source: item.content_source,
    sourceFormat: contentSourceFormat,
  });
  const solution = renderImportContentSource({
    html: item.solution_html,
    source: item.solution_source,
    sourceFormat: solutionSourceFormat,
  });
  const normalizedOptions = normalizeQuestionOptions(item.options ?? item.choices).map(
    (option) => {
      const optionContent = renderImportContentSource({
        html: option.content_html,
        source: option.content_source,
        sourceFormat: "html",
      });

      return {
        ...option,
        content_html: sanitizeContentHtml(optionContent.html),
        content_source: optionContent.source,
      };
    },
  );

  return {
    content_html: sanitizeContentHtml(content.html),
    content_source: content.source,
    content_source_format: contentSourceFormat,
    options: normalizedOptions,
    raw_content_html: content.html,
    raw_solution_html: solution.html || null,
    solution_html: solution.html ? sanitizeContentHtml(solution.html) : null,
    solution_source: solution.source || null,
    solution_source_format: solutionSourceFormat,
  };
}

export function parseBatchImportJson(jsonText: string) {
  return parseImportQuestionsJsonWithLatexRepair(jsonText);
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
    const normalizedContent = normalizeQuestionContent(item);

    if (!questionCode) errors.push("Missing code or question_code.");
    if (!title) errors.push("Missing title.");
    if (!normalizedContent.content_html) {
      errors.push("Missing content_html or content_source.");
    }

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

    if (
      normalizedContent.content_html !== normalizedContent.raw_content_html ||
      normalizedContent.solution_html !== normalizedContent.raw_solution_html
    ) {
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
    const options = normalizedContent.options;
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
    const answerSpec = buildImportAnswerSpec({
      acceptedAnswerValues,
      correctAnswerValues,
      finalAnswerValues,
      itemAnswerSpec: item.answer_spec,
      options,
      questionType,
    });

    if (questionType === "mcq" && !options.length) {
      warnings.push("MCQ import has no options; automatic grading will not work until options are added.");
    }
    if (
      questionType === "mcq" &&
      answerSpec.kind === "mcq" &&
      !answerSpec.correct_option_ids?.length
    ) {
      warnings.push(
        "MCQ import has options but no reliable correct_option_ids in answer_spec; review the correct answer before approving.",
      );
    }
    if (!normalizedContent.solution_html && !normalizedContent.solution_source) {
      warnings.push(
        "Missing solution or explanation; add solution guidance during review before approving.",
      );
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
            content_html: normalizedContent.content_html,
            content_source: normalizedContent.content_source,
            content_source_format: normalizedContent.content_source_format,
            solution_html: normalizedContent.solution_html,
            solution_source: normalizedContent.solution_source,
            solution_source_format: normalizedContent.solution_source_format,
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
