import {
  contentStatusSchema,
  optionalUuidSchema,
  uuidSchema,
} from "@/lib/validations/common";
import { z } from "zod";

const tagFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120),
  parent_id: optionalUuidSchema,
  tag_type: z.enum(["knowledge", "attribute"]).default("knowledge"),
  status: contentStatusSchema.default("draft"),
});

export const tagCreateSchema = tagFieldsSchema;

export const tagUpdateSchema = tagFieldsSchema.extend({
  id: uuidSchema,
});

export const tagStatusSchema = z.object({
  id: uuidSchema,
  status: contentStatusSchema,
});

export const tagDeleteSchema = z.object({
  id: uuidSchema,
});
