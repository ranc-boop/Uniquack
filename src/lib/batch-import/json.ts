import { z } from "zod";

import { sanitizeContentHtml } from "@/lib/sanitize/html";

const importItemSchema = z
  .object({
    code: z.string().optional(),
    question_code: z.string().optional(),
    title: z.string().optional(),
    type: z.string().optional(),
    question_type: z.string().optional(),
    difficulty: z.number().or(z.string()).optional(),
    difficulty_rating: z.number().or(z.string()).optional(),
    status: z.string().optional(),
    tag_slugs: z.array(z.string()).optional(),
    tag_names: z.array(z.string()).optional(),
    content_html: z.string().optional(),
    solution_html: z.string().optional(),
    image_urls: z.array(z.string()).optional(),
    image_files: z.array(z.string()).optional(),
    source_file_ids: z.array(z.string()).optional(),
    source_files: z.array(z.string()).optional(),
    question_asset_ids: z.array(z.string()).optional(),
    video_url: z.string().optional(),
    embed_url: z.string().optional(),
  })
  .passthrough();

export type ExistingImportTag = {
  id: string;
  name: string;
  slug: string;
};

export type NormalizedImportQuestion = {
  question_code: string;
  title: string;
  question_type: "mcq" | "frq" | "mixed";
  difficulty_rating: number;
  status: "draft";
  tag_ids: string[];
  tag_slugs: string[];
  tag_names: string[];
  content_html: string;
  solution_html: string | null;
  image_urls: string[];
  image_files: string[];
  source_file_ids: string[];
  source_files: string[];
  question_asset_ids: string[];
  video_url: string | null;
  embed_url: string | null;
};

export type BatchImportPreviewItem = {
  index: number;
  raw: unknown;
  normalized: NormalizedImportQuestion | null;
  errors: string[];
  warnings: string[];
};

export type BatchImportPreview = {
  items: BatchImportPreviewItem[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  unknownTagCount: number;
};

function stringArray(values: string[] | undefined) {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );
}

function normalizeCode(value: string | undefined) {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeTitle(value: string | undefined) {
  return value?.trim().slice(0, 240) ?? "";
}

function normalizeType(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  return normalized === "mcq" || normalized === "mixed" ? normalized : "frq";
}

function normalizeDifficulty(value: string | number | undefined) {
  const parsed = Number(value ?? 500);

  if (!Number.isFinite(parsed)) {
    return 500;
  }

  return Math.min(1000, Math.max(0, Math.trunc(parsed)));
}

function httpUrlOrNull(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function httpUrlArray(values: string[] | undefined) {
  return (values ?? [])
    .map((value) => httpUrlOrNull(value))
    .filter((value): value is string => Boolean(value));
}

function idReferenceArray(values: string[] | undefined) {
  return stringArray(values).slice(0, 50);
}

export function parseBatchImportJson(jsonText: string) {
  const parsed = JSON.parse(jsonText) as unknown;

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "questions" in parsed &&
    Array.isArray(parsed.questions)
  ) {
    return parsed.questions;
  }

  throw new Error("JSON must be an array or an object with a questions array.");
}

export function evaluateBatchImportItems({
  rawItems,
  existingTags,
  existingQuestionCodes,
}: {
  rawItems: unknown[];
  existingTags: ExistingImportTag[];
  existingQuestionCodes: Set<string>;
}): BatchImportPreview {
  const tagBySlug = new Map(
    existingTags.map((tag) => [tag.slug.trim().toLowerCase(), tag]),
  );
  const tagByName = new Map(
    existingTags.map((tag) => [tag.name.trim().toLowerCase(), tag]),
  );
  const seenCodes = new Set<string>();
  const items = rawItems.map((raw, index): BatchImportPreviewItem => {
    const parsed = importItemSchema.safeParse(raw);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!parsed.success) {
      return {
        index,
        raw,
        normalized: null,
        errors: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "item"}: ${issue.message}`,
        ),
        warnings,
      };
    }

    const item = parsed.data;
    const questionCode = normalizeCode(item.question_code ?? item.code);
    const title = normalizeTitle(item.title);
    const contentHtml = item.content_html?.trim() ?? "";
    const solutionHtml = item.solution_html?.trim() || null;

    if (!questionCode) {
      errors.push("Missing code or question_code.");
    }

    if (!title) {
      errors.push("Missing title.");
    }

    if (!contentHtml) {
      errors.push("Missing content_html.");
    }

    const codeKey = questionCode.toLowerCase();

    if (questionCode && existingQuestionCodes.has(codeKey)) {
      errors.push(`Duplicate question code already exists: ${questionCode}.`);
    }

    if (questionCode && seenCodes.has(codeKey)) {
      errors.push(`Duplicate question code within import: ${questionCode}.`);
    }

    if (questionCode) {
      seenCodes.add(codeKey);
    }

    const tagSlugs = stringArray(item.tag_slugs);
    const tagNames = stringArray(item.tag_names);
    const tagIds = new Set<string>();

    for (const slug of tagSlugs) {
      const tag = tagBySlug.get(slug.toLowerCase());

      if (tag) {
        tagIds.add(tag.id);
      } else {
        errors.push(`Unknown tag slug: ${slug}.`);
      }
    }

    for (const name of tagNames) {
      const tag = tagByName.get(name.toLowerCase());

      if (tag) {
        tagIds.add(tag.id);
      } else {
        errors.push(`Unknown tag name: ${name}.`);
      }
    }

    const sanitizedContent = sanitizeContentHtml(contentHtml);
    const sanitizedSolution = solutionHtml
      ? sanitizeContentHtml(solutionHtml)
      : null;

    if (sanitizedContent !== contentHtml || sanitizedSolution !== solutionHtml) {
      warnings.push("Unsafe HTML will be sanitized before saving.");
    }

    if (item.status && item.status !== "draft") {
      warnings.push("Imported status is forced to draft for review.");
    }

    const videoUrl = httpUrlOrNull(item.video_url);
    const embedUrl = httpUrlOrNull(item.embed_url);
    const imageUrls = httpUrlArray(item.image_urls);
    const imageFiles = stringArray(item.image_files).slice(0, 50);
    const sourceFileIds = idReferenceArray(item.source_file_ids);
    const sourceFiles = stringArray(item.source_files).slice(0, 50);
    const questionAssetIds = idReferenceArray(item.question_asset_ids);

    if (item.video_url && !videoUrl) {
      warnings.push("Invalid video_url was ignored.");
    }

    if (item.embed_url && !embedUrl) {
      warnings.push("Invalid embed_url was ignored.");
    }

    if ((item.image_urls?.length ?? 0) !== imageUrls.length) {
      warnings.push("One or more invalid image_urls were ignored.");
    }

    // Batch Import v2 preserves asset references in import_batch_items for
    // admin review. It does not download/upload or auto-attach binaries yet.
    if (
      imageUrls.length ||
      imageFiles.length ||
      sourceFileIds.length ||
      sourceFiles.length ||
      questionAssetIds.length
    ) {
      warnings.push(
        "Asset references are preserved for review only in Batch Import v2.",
      );
    }

    return {
      index,
      raw,
      normalized: errors.length
        ? null
        : {
            question_code: questionCode,
            title,
            question_type: normalizeType(item.question_type ?? item.type),
            difficulty_rating: normalizeDifficulty(
              item.difficulty_rating ?? item.difficulty,
            ),
            status: "draft",
            tag_ids: Array.from(tagIds),
            tag_slugs: tagSlugs,
            tag_names: tagNames,
            content_html: sanitizedContent,
            solution_html: sanitizedSolution,
            image_urls: imageUrls,
            image_files: imageFiles,
            source_file_ids: sourceFileIds,
            source_files: sourceFiles,
            question_asset_ids: questionAssetIds,
            video_url: videoUrl,
            embed_url: embedUrl,
          },
      errors,
      warnings,
    };
  });

  return {
    items,
    validCount: items.filter((item) => item.normalized).length,
    invalidCount: items.filter((item) => !item.normalized).length,
    duplicateCount: items.filter((item) =>
      item.errors.some((error) => error.toLowerCase().includes("duplicate")),
    ).length,
    unknownTagCount: items.filter((item) =>
      item.errors.some((error) => error.toLowerCase().includes("unknown tag")),
    ).length,
  };
}
