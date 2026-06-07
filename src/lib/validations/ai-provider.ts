import { z } from "zod";

import { uuidSchema } from "@/lib/validations/common";

const optionalUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) =>
      value.startsWith("mock://") ||
      (() => {
        try {
          const url = new URL(value);

          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      })(),
    "Base URL must be http(s) or mock:// for local smoke tests.",
  );

export const aiProviderProfileFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  provider: z.string().trim().min(1).max(80),
  base_url: optionalUrlSchema,
  model: z.string().trim().min(1).max(160),
  api_key: z.string().trim().optional(),
  enabled: z.coerce.boolean().default(false),
  is_default: z.coerce.boolean().default(false),
  supports_pdf_input: z.coerce.boolean().default(false),
  supports_vision_images: z.coerce.boolean().default(false),
});

export const aiProviderProfileUpdateSchema =
  aiProviderProfileFormSchema.extend({
    id: uuidSchema,
  });

export const aiProviderProfileDeleteSchema = z.object({
  id: uuidSchema,
});
