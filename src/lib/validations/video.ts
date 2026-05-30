import { z } from "zod";

import { contentStatusSchema, uuidSchema } from "@/lib/validations/common";

export function isAllowedVideoEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "www.youtube.com" || hostname === "youtube.com") {
      return url.pathname.startsWith("/embed/");
    }

    if (hostname === "player.bilibili.com") {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

const embedUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(isAllowedVideoEmbedUrl, {
    message: "Use a YouTube /embed/ URL or a player.bilibili.com embed URL.",
  });

export const videoCreateSchema = z.object({
  question_id: uuidSchema,
  title: z
    .string()
    .trim()
    .transform((value) => value || null),
  video_url: z.string().trim().url(),
  embed_url: embedUrlSchema,
  thumbnail_url: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.string().url().nullable()),
  provider: z
    .string()
    .trim()
    .transform((value) => value || null),
  status: contentStatusSchema.default("draft"),
});

export const videoUpdateSchema = videoCreateSchema.extend({
  id: uuidSchema,
});

export const videoStatusSchema = z.object({
  id: uuidSchema,
  status: contentStatusSchema,
});

export const videoDeleteSchema = z.object({
  id: uuidSchema,
});
