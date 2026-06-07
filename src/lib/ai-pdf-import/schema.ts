import { z } from "zod";

const bboxSchema = z.object({
  height: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeQuestionType(value: unknown) {
  const normalized = String(value ?? "frq")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  if (
    normalized === "mcq" ||
    normalized.includes("multiple choice") ||
    normalized.includes("choice question") ||
    normalized === "multiple"
  ) {
    return "mcq";
  }

  if (normalized === "mixed" || normalized.includes("mixed")) {
    return "mixed";
  }

  return "frq";
}

const questionTypeSchema = z.preprocess(
  normalizeQuestionType,
  z.enum(["mcq", "frq", "mixed"]),
);

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function sourceToHtml(value: unknown) {
  const source = String(value ?? "").trim();

  return source ? `<p>${escapeHtml(source)}</p>` : "";
}

function fallbackTitle(input: Record<string, unknown>) {
  const code = String(input.question_code ?? "").trim();
  const content = stripHtml(String(input.content_html ?? input.content_source ?? ""));
  const prefix = code ? `Question ${code}` : "AI imported question";

  if (!content) {
    return prefix;
  }

  return `${prefix}: ${content.slice(0, 120)}`;
}

const optionalStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return value;
  }

  return String(value);
}, z.string().trim().optional().nullable());

const stringArraySchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}, z.array(z.string().trim().min(1).max(120)).default([]));

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

  return Math.max(0, Math.min(1000, Math.round(numeric)));
}, z.number().int().min(0).max(1000).default(500));

export const aiPdfAssetPlaceholderSchema = z.object({
  alt: z.string().trim().max(240).optional(),
  bbox: bboxSchema,
  page: z.number().int().min(1),
  placeholder: z.string().trim().min(1).max(80),
});

const assetPlaceholdersSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return [value];
  }

  return [];
}, z.array(aiPdfAssetPlaceholderSchema).default([]));

export const aiPdfQuestionSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const input = value as Record<string, unknown>;
  const contentHtml =
    typeof input.content_html === "string" && input.content_html.trim()
      ? input.content_html
      : sourceToHtml(input.content_source);
  const solutionHtml =
    input.solution_html === null
      ? null
      : typeof input.solution_html === "string" && input.solution_html.trim()
        ? input.solution_html
        : sourceToHtml(input.solution_source) || null;

  return {
    ...input,
    content_html: contentHtml,
    question_code:
      input.question_code === null || input.question_code === undefined
        ? undefined
        : String(input.question_code),
    solution_html: solutionHtml,
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title
        : fallbackTitle(input),
  };
}, z.object({
  asset_placeholders: assetPlaceholdersSchema,
  content_html: z.string().trim().min(1),
  content_source: optionalStringSchema,
  difficulty_rating: difficultyRatingSchema,
  new_tag_names: stringArraySchema,
  page_refs: pageRefsSchema,
  question_code: z.string().trim().max(80).optional(),
  question_type: questionTypeSchema.default("frq"),
  solution_html: z.string().trim().nullable().default(null),
  solution_source: optionalStringSchema,
  tag_names: stringArraySchema,
  tag_slugs: stringArraySchema,
  title: z.string().trim().min(1).max(240),
}));

export const aiPdfExtractionSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return {
      questions: value,
      warnings: ["AI provider returned a top-level array; normalized to questions."],
    };
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const input = value as Record<string, unknown>;

    if (!("questions" in input) && Array.isArray(input.items)) {
      return {
        ...input,
        questions: input.items,
      };
    }
  }

  return value;
}, z.object({
  questions: z.array(aiPdfQuestionSchema).min(1).max(200),
  warnings: z.array(z.string()).default([]),
}));

export type AIPdfAssetPlaceholder = z.infer<typeof aiPdfAssetPlaceholderSchema>;
export type AIPdfExtraction = z.infer<typeof aiPdfExtractionSchema>;
export type AIPdfQuestion = z.infer<typeof aiPdfQuestionSchema>;
