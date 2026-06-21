import { z } from "zod";

const tagIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z][a-z0-9]*(\.[a-z0-9_]+)*$/);

const optionalTagIdSchema = z
  .string()
  .trim()
  .transform((value) => (value ? value : null))
  .pipe(tagIdSchema.nullable());

export const taxonomyNodeCreateSchema = z.object({
  tag_id: tagIdSchema,
  parent_tag_id: optionalTagIdSchema,
  facet_key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  is_assignable: z
    .union([z.literal("on"), z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value !== "false"),
});

export const taxonomyNodeDeleteSchema = z.object({
  tag_id: tagIdSchema,
});

export const taxonomyActionSchema = z.object({
  id: z.uuid(),
});
