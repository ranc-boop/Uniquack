import { z } from "zod";

export const contentStatusSchema = z.enum(["draft", "published", "archived"]);

export const uuidSchema = z.string().uuid();

export const optionalUuidSchema = z
  .string()
  .trim()
  .transform((value) => (value ? value : null))
  .pipe(uuidSchema.nullable());

export const tagIdsFormSchema = z
  .array(uuidSchema)
  .transform((tagIds) => Array.from(new Set(tagIds)));
