import { z } from "zod";

import {
  answerSpecToJson,
  normalizeAnswerSpec,
  normalizeQuestionOptions,
  optionsToJson,
} from "@/lib/questions/answer-spec";

const bboxSchema = z.object({
  height: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const QUESTION_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeQuestionType(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return "frq";
  }

  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  if (
    normalized === "mcq" ||
    normalized.includes("multiple choice") ||
    normalized.includes("choice question") ||
    normalized.includes("multiple select") ||
    normalized.includes("single choice") ||
    normalized === "multiple"
  ) {
    return "mcq";
  }

  if (
    normalized === "fill blank" ||
    normalized === "fill in the blank" ||
    normalized === "fill_blank" ||
    normalized.includes("blank")
  ) {
    return "fill_blank";
  }

  if (
    normalized === "frq" ||
    normalized.includes("free response") ||
    normalized.includes("short answer") ||
    normalized.includes("open response") ||
    normalized.includes("calculation") ||
    normalized.includes("proof")
  ) {
    return "frq";
  }

  if (normalized === "mixed" || normalized.includes("mixed")) {
    return "mixed";
  }

  return "mixed";
}

const questionTypeSchema = z.preprocess(
  normalizeQuestionType,
  z.enum(["mcq", "fill_blank", "frq", "mixed"]),
);

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function sourceToHtml(value: unknown) {
  const source = String(value ?? "").trim();

  return source ? `<p>${escapeHtml(source)}</p>` : "";
}

function stringifyRecoverableField(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return "";
}

function firstRecoverableString(
  input: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = stringifyRecoverableField(input[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function fallbackTitle(input: Record<string, unknown>) {
  const code = String(
    input.question_number ??
      input.visible_question_number ??
      input.question_code ??
      "",
  ).trim();
  const content = stripHtml(
    firstRecoverableString(input, [
      "content_html",
      "content_source",
      "question",
      "prompt",
      "stem",
      "text",
      "body",
      "content",
    ]),
  );
  const prefix = code ? `Question ${code}` : "AI imported question";

  if (!content) {
    return prefix;
  }

  return `${prefix}: ${content.slice(0, 120)}`;
}

function numberInUnitRange(value: unknown) {
  const numeric = Number(value);

  return Number.isFinite(numeric)
    ? Math.max(0, Math.min(1, numeric))
    : undefined;
}

function normalizeBbox(value: unknown) {
  const input = asRecord(value);
  const x = numberInUnitRange(input.x ?? input.left);
  const y = numberInUnitRange(input.y ?? input.top);
  const width = numberInUnitRange(input.width ?? input.w);
  const height = numberInUnitRange(input.height ?? input.h);

  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return null;
  }

  const parsed = bboxSchema.safeParse({ height, width, x, y });

  return parsed.success ? parsed.data : null;
}

function normalizePageNumber(value: unknown) {
  const numeric = Number(value);

  return Number.isInteger(numeric) && numeric >= 1 ? numeric : null;
}

function placeholderFromValue(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const exactMatch = raw.match(/^\{\{\s*asset:([a-zA-Z0-9_-]+)\s*\}\}$/);

  if (exactMatch) {
    return `{{asset:${exactMatch[1]}}}`;
  }

  if (/^[a-zA-Z0-9_-]+$/.test(raw)) {
    return `{{asset:${raw}}}`;
  }

  return null;
}

function contentPlaceholders(question: Record<string, unknown>) {
  const source = [
    question.content_html,
    question.content_source,
    question.solution_html,
    question.solution_source,
  ]
    .map((value) => (typeof value === "string" ? value : ""))
    .join("\n");
  const matches = source.matchAll(/\{\{\s*asset:([a-zA-Z0-9_-]+)\s*\}\}/g);

  return Array.from(matches, (match) => `{{asset:${match[1]}}}`);
}

function normalizeAssetPlaceholdersForQuestion({
  question,
  questionLabel,
}: {
  question: Record<string, unknown>;
  questionLabel: string;
}) {
  const rawValue = question.asset_placeholders;

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return { placeholders: [], warnings: [] };
  }

  const rawItems = Array.isArray(rawValue)
    ? rawValue
    : rawValue && typeof rawValue === "object"
      ? [rawValue]
      : [];
  const warnings: string[] = [];

  if (!Array.isArray(rawValue)) {
    warnings.push(
      `${questionLabel}: asset_placeholders was not an array and was ignored.`,
    );
  }

  const availableContentPlaceholders = contentPlaceholders(question);
  const usedPlaceholders = new Set<string>();
  const placeholders: {
    alt?: string;
    bbox: { height: number; width: number; x: number; y: number };
    page: number;
    placeholder: string;
  }[] = [];

  rawItems.forEach((item, index) => {
    const input = asRecord(item);
    const bbox = normalizeBbox(input.bbox);
    const page = normalizePageNumber(
      input.page ?? input.page_number ?? input.pageNumber,
    );
    let placeholder = placeholderFromValue(input.placeholder);

    if (!placeholder) {
      placeholder = availableContentPlaceholders.find(
        (candidate) => !usedPlaceholders.has(candidate),
      ) ?? null;
    }

    if (!bbox || !page || !placeholder) {
      warnings.push(
        `${questionLabel}: ignored invalid asset placeholder ${index + 1}.`,
      );
      return;
    }

    usedPlaceholders.add(placeholder);
    placeholders.push({
      alt:
        typeof input.alt === "string"
          ? input.alt
          : typeof input.description === "string"
            ? input.description
            : undefined,
      bbox,
      page,
      placeholder,
    });
  });

  if (warnings.length) {
    warnings.unshift("Some image placeholders were ignored because they were invalid.");
  }

  return { placeholders, warnings: Array.from(new Set(warnings)) };
}

const optionalStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return value;
  }

  return stringifyRecoverableField(value);
}, z.string().trim().optional().nullable());

function normalizeStringArray(value: unknown) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]/)
      : [];

  return Array.from(
    new Set(
      rawValues
        .map((item) => stringifyRecoverableField(item))
        .flatMap((item) => item.split(/[,;\n]/))
        .map((item) => item.trim().slice(0, 120))
        .filter(Boolean),
    ),
  );
}

const stringArraySchema = z.preprocess((value) => {
  return normalizeStringArray(value);
}, z.array(z.string().trim().min(1).max(120)).default([]));

function looseStringList(value: unknown) {
  return normalizeStringArray(value);
}

const pageRefsSchema = z.preprocess((value) => {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];

  return values
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1);
}, z.array(z.number().int().min(1)).default([]));

const difficultyRatingSchema = z.preprocess((value) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 500;
  }

  return Math.max(100, Math.min(1000, Math.round(numeric)));
}, z.number().int().min(100).max(1000).default(500));

export const aiPdfAssetPlaceholderSchema = z.object({
  alt: z.string().trim().max(240).optional(),
  bbox: bboxSchema,
  page: z.number().int().min(1),
  placeholder: z
    .string()
    .trim()
    .regex(/^\{\{asset:[A-Za-z0-9_-]+\}\}$/)
    .max(80),
});

const assetPlaceholdersSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.filter((item) => aiPdfAssetPlaceholderSchema.safeParse(item).success);
  }

  if (value && typeof value === "object") {
    return aiPdfAssetPlaceholderSchema.safeParse(value).success ? [value] : [];
  }

  return [];
}, z.array(aiPdfAssetPlaceholderSchema).default([]));

export const aiPdfQuestionSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const input = value as Record<string, unknown>;
  const contentSource = firstRecoverableString(input, [
    "content_source",
    "question",
    "prompt",
    "stem",
    "text",
    "body",
    "content",
  ]);
  const contentHtml =
    typeof input.content_html === "string" && input.content_html.trim()
      ? input.content_html
      : sourceToHtml(contentSource);
  const solutionSource = firstRecoverableString(input, [
    "solution_source",
    "solution",
    "explanation",
    "answer",
    "answers",
  ]);
  const solutionHtml =
    input.solution_html === null
      ? null
      : typeof input.solution_html === "string" && input.solution_html.trim()
        ? input.solution_html
        : sourceToHtml(solutionSource) || null;
  const rawQuestionCode =
    input.question_code === null || input.question_code === undefined
      ? undefined
      : stringifyRecoverableField(input.question_code).slice(0, 80);
  const questionCode =
    rawQuestionCode && QUESTION_CODE_PATTERN.test(rawQuestionCode)
      ? rawQuestionCode
      : undefined;
  const visibleQuestionNumber =
    firstRecoverableString(input, [
      "question_number",
      "visible_question_number",
      "visibleNumber",
      "questionNumber",
      "number",
      "problem_number",
    ]) ||
    rawQuestionCode ||
    "";
  const rawTitle =
    typeof input.title === "string" && input.title.trim()
      ? input.title
      : fallbackTitle({ ...input, content_html: contentHtml, content_source: contentSource });

  return {
    ...input,
    answer_spec: answerSpecToJson(
      normalizeAnswerSpec(input.answer_spec ?? { kind: normalizeQuestionType(input.question_type) }),
    ),
    content_source: (input.content_source ?? contentSource) || undefined,
    content_html: contentHtml,
    options: optionsToJson(normalizeQuestionOptions(input.options)),
    question_code: questionCode,
    question_number: visibleQuestionNumber || undefined,
    solution_html: solutionHtml,
    solution_source: (input.solution_source ?? solutionSource) || undefined,
    title:
      rawTitle.trim().slice(0, 240),
  };
}, z.object({
  asset_placeholders: assetPlaceholdersSchema,
  answer_spec: z.unknown().default({}),
  content_html: z.string().trim().min(1),
  content_source: optionalStringSchema,
  difficulty_rating: difficultyRatingSchema,
  page_refs: pageRefsSchema,
  question_code: z.string().trim().max(80).optional(),
  question_number: optionalStringSchema,
  question_type: questionTypeSchema.default("frq"),
  options: z.array(z.unknown()).default([]),
  solution_html: z.string().trim().nullable().default(null),
  solution_source: optionalStringSchema,
  tag_ids: stringArraySchema,
  title: z.string().trim().min(1).max(240),
}));

export const aiPdfExtractionSchema = z.preprocess((value) => {
  const normalizeExtractionInput = (
    input: Record<string, unknown>,
    inheritedWarnings: string[] = [],
  ) => {
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const warnings = [
      ...inheritedWarnings,
      ...looseStringList(input.warnings),
    ];
    if (!Array.isArray(input.questions)) {
      warnings.push("AI provider response did not include a questions array.");
    }

    if (questions.length > 200) {
      warnings.push("AI provider returned more than 200 questions; extra questions were ignored.");
    }

    const normalizedQuestions: AIPdfQuestion[] = [];

    questions.slice(0, 200).forEach((question, index) => {
      if (!question || typeof question !== "object" || Array.isArray(question)) {
        warnings.push(`Question ${index + 1} was skipped because it was not an object.`);
        return;
      }

      const questionRecord = question as Record<string, unknown>;
      const label =
        typeof questionRecord.question_code === "string" &&
        questionRecord.question_code.trim()
          ? `Question ${questionRecord.question_code.trim()}`
          : `Question ${index + 1}`;
      const normalized = normalizeAssetPlaceholdersForQuestion({
        question: questionRecord,
        questionLabel: label,
      });

      warnings.push(...normalized.warnings);
      const parsedQuestion = aiPdfQuestionSchema.safeParse({
        ...questionRecord,
        asset_placeholders: normalized.placeholders,
      });

      if (!parsedQuestion.success) {
        warnings.push(
          `${label} was skipped: ${parsedQuestion.error.issues
            .map((issue) => `${issue.path.join(".") || "question"}: ${issue.message}`)
            .slice(0, 4)
            .join("; ")}`,
        );
        return;
      }

      normalizedQuestions.push(parsedQuestion.data);
    });

    return {
      ...input,
      questions: normalizedQuestions,
      warnings: Array.from(new Set(warnings)),
    };
  };

  if (Array.isArray(value)) {
    return normalizeExtractionInput(
      { questions: value },
      ["AI provider returned a top-level array; normalized to questions."],
    );
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const input = value as Record<string, unknown>;

    if (!("questions" in input) && Array.isArray(input.items)) {
      return normalizeExtractionInput({
        ...input,
        questions: input.items,
      });
    }

    return normalizeExtractionInput(input);
  }

  return value;
}, z.object({
  questions: z.array(aiPdfQuestionSchema).min(1).max(200),
  warnings: z.array(z.string()).default([]),
}));

export function normalizeAIPdfExtractionResponse(value: unknown) {
  const parsed = aiPdfExtractionSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
        .slice(0, 8)
        .join("; "),
    );
  }

  if (!parsed.data.questions.length) {
    throw new Error("AI provider response contained zero importable questions.");
  }

  return parsed.data;
}

export type AIPdfAssetPlaceholder = z.infer<typeof aiPdfAssetPlaceholderSchema>;
export type AIPdfExtraction = z.infer<typeof aiPdfExtractionSchema>;
export type AIPdfQuestion = z.infer<typeof aiPdfQuestionSchema>;
