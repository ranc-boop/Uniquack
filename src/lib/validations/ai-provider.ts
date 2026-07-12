import { z } from "zod";

import {
  isMockAIProviderAllowed,
  isMockAIProviderUrl,
} from "@/lib/ai-providers/mock";
import { uuidSchema } from "@/lib/validations/common";

const optionalUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) =>
      (isMockAIProviderUrl(value) && isMockAIProviderAllowed()) ||
      (() => {
        try {
          const url = new URL(value);

          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      })(),
    "Base URL must be http(s). mock://ai-pdf-import is allowed only outside production or when ENABLE_MOCK_AI_PROVIDER=true.",
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

export const aiProviderRoutingPolicyFormSchema = z.object({
  enabled: z.boolean(),
  max_profiles_per_execution: z.coerce.number().int().min(1).max(3),
  operation_kind: z.enum([
    "ai_pdf_extract",
    "blueprint_generate_questions",
    "blueprint_observe_pdf",
    "blueprint_analyze_text",
  ]),
  provider_profile_ids: z.array(uuidSchema).max(3),
});
