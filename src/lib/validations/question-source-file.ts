import { z } from "zod";

import {
  QUESTION_SOURCE_FILE_MAX_BYTES,
  QUESTION_SOURCE_FILE_MIME_TYPE,
} from "@/lib/question-source-files";
import { uuidSchema } from "@/lib/validations/common";

export const ensureQuestionDraftForSourceUploadSchema = z.object({
  draftId: z.string().trim().pipe(uuidSchema).optional(),
  questionCode: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240),
});

export const reserveQuestionSourceFileUploadSchema = z.object({
  questionId: uuidSchema,
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.literal(QUESTION_SOURCE_FILE_MIME_TYPE),
  sizeBytes: z.number().int().positive().max(QUESTION_SOURCE_FILE_MAX_BYTES),
});

export const finalizeQuestionSourceFileUploadSchema = z.object({
  sourceFileId: uuidSchema,
});

export const createQuestionSourceFileSignedUrlSchema = z.object({
  sourceFileId: uuidSchema,
});

export const deleteQuestionSourceFileSchema = z.object({
  sourceFileId: uuidSchema,
});
