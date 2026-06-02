import { z } from "zod";

import {
  QUESTION_ASSET_MAX_BYTES,
  QUESTION_ASSET_MIME_TYPES,
} from "@/lib/question-assets";
import { uuidSchema } from "@/lib/validations/common";

export const ensureQuestionDraftForUploadSchema = z.object({
  draftId: z.string().trim().pipe(uuidSchema).optional(),
  questionCode: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240),
});

export const reserveQuestionAssetUploadSchema = z.object({
  questionId: uuidSchema,
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(QUESTION_ASSET_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(QUESTION_ASSET_MAX_BYTES),
});

export const finalizeQuestionAssetUploadSchema = z.object({
  assetId: uuidSchema,
});

export const deleteQuestionAssetSchema = z.object({
  assetId: uuidSchema,
});

export const updateQuestionAssetDisplaySchema = z.object({
  assetId: uuidSchema,
  displayOnDetail: z.boolean(),
});
