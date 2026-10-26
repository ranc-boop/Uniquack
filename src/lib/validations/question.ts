import { z } from "zod";

import { AI_INPUT_LIMITS } from "@/lib/ai-input-limits";
import {
  contentStatusSchema,
  tagIdsFormSchema,
  uuidSchema,
} from "@/lib/validations/common";
import { questionSourceFormats } from "@/lib/markdown-latex/markdown";

const optionalHtmlSchema = z
  .string()
  .max(AI_INPUT_LIMITS.QUESTION_RENDERED_HTML_CHARS)
  .transform((value) => (value.trim() ? value : null));

export const questionCreateSchema = z.object({
  question_code: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240),
  content_html: z.string().trim().min(1).max(AI_INPUT_LIMITS.QUESTION_RENDERED_HTML_CHARS),
  content_source: z.string().max(AI_INPUT_LIMITS.QUESTION_SOURCE_CHARS).optional().default(""),
  content_source_format: z.enum(questionSourceFormats).default("markdown_latex"),
  solution_html: optionalHtmlSchema.default(null),
  solution_source: z.string().max(AI_INPUT_LIMITS.QUESTION_SOURCE_CHARS).optional().default(""),
  solution_source_format: z.enum(questionSourceFormats).default("markdown_latex"),
  difficulty_rating: z.coerce.number().int().min(0).max(1000),
  question_type: z.enum(["mcq", "fill_blank", "frq", "mixed"]).default("frq"),
  status: contentStatusSchema.default("draft"),
});

export const questionUpdateSchema = questionCreateSchema.extend({
  id: uuidSchema,
});

export const questionStatusSchema = z.object({
  id: uuidSchema,
  status: contentStatusSchema,
});

export const questionTagIdsSchema = tagIdsFormSchema;
