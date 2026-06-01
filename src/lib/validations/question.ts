import { z } from "zod";

import {
  contentStatusSchema,
  tagIdsFormSchema,
  uuidSchema,
} from "@/lib/validations/common";

const optionalHtmlSchema = z
  .string()
  .transform((value) => (value.trim() ? value : null));

export const questionCreateSchema = z.object({
  question_code: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240),
  content_html: z.string().trim().min(1),
  solution_html: optionalHtmlSchema.default(null),
  difficulty_rating: z.coerce.number().int().min(0).max(1000),
  question_type: z.enum(["mcq", "frq", "mixed"]).default("frq"),
  status: contentStatusSchema.default("draft"),
});

export const questionUpdateSchema = questionCreateSchema.extend({
  id: uuidSchema,
});

export const questionStatusSchema = z.object({
  id: uuidSchema,
  status: contentStatusSchema,
});

export const questionDeleteSchema = z.object({
  id: uuidSchema,
});

export const questionTagIdsSchema = tagIdsFormSchema;
