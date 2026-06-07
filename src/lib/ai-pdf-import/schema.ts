import { z } from "zod";

const bboxSchema = z.object({
  height: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const aiPdfAssetPlaceholderSchema = z.object({
  alt: z.string().trim().max(240).optional(),
  bbox: bboxSchema,
  page: z.number().int().min(1),
  placeholder: z.string().trim().min(1).max(80),
});

export const aiPdfQuestionSchema = z.object({
  asset_placeholders: z.array(aiPdfAssetPlaceholderSchema).default([]),
  content_html: z.string().trim().min(1),
  content_source: z.string().optional(),
  difficulty_rating: z.number().int().min(0).max(1000).default(500),
  new_tag_names: z.array(z.string().trim().min(1).max(120)).default([]),
  page_refs: z.array(z.number().int().min(1)).default([]),
  question_code: z.string().trim().max(80).optional(),
  question_type: z.enum(["mcq", "frq", "mixed"]).default("frq"),
  solution_html: z.string().trim().nullable().default(null),
  solution_source: z.string().optional().nullable(),
  tag_names: z.array(z.string().trim().min(1).max(120)).default([]),
  tag_slugs: z.array(z.string().trim().min(1).max(120)).default([]),
  title: z.string().trim().min(1).max(240),
});

export const aiPdfExtractionSchema = z.object({
  questions: z.array(aiPdfQuestionSchema).min(1).max(200),
  warnings: z.array(z.string()).default([]),
});

export type AIPdfAssetPlaceholder = z.infer<typeof aiPdfAssetPlaceholderSchema>;
export type AIPdfExtraction = z.infer<typeof aiPdfExtractionSchema>;
export type AIPdfQuestion = z.infer<typeof aiPdfQuestionSchema>;
