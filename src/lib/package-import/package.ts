import {
  BULK_ASSET_IMAGE_MAX_BYTES,
  BULK_ASSET_IMAGE_MIME_TYPES,
  BULK_ASSET_PDF_MAX_BYTES,
  BULK_ASSET_PDF_MIME_TYPE,
  detectBulkAssetFileKind,
  inferBulkAssetMimeType,
  type BulkAssetFileKind,
} from "@/lib/bulk-asset-import/matching";
import { parseImportQuestionsJsonWithLatexRepair } from "@/lib/import-json/latex-repair";
import type { ZipEntryData } from "@/lib/package-import/zip";

export type PackageQuestionReference = {
  code: string;
  contentHtmlPresent: boolean;
  imageFiles: string[];
  sourceFiles: string[];
  solutionHtmlPresent: boolean;
  tagIds: string[];
  title: string;
};

export type PackageAssetPlan = {
  fileKind: BulkAssetFileKind | null;
  message: string;
  path: string;
  questionCode: string | null;
  sizeBytes: number;
  status: "matched" | "missing" | "unused" | "invalid" | "duplicate";
};

export type PackagePlan = {
  assetPlans: PackageAssetPlan[];
  counts: {
    duplicateAssets: number;
    imageFiles: number;
    invalidFiles: number;
    matchedImages: number;
    matchedPdfs: number;
    missingReferencedFiles: number;
    pdfFiles: number;
    unusedFiles: number;
  };
  errors: string[];
  questions: PackageQuestionReference[];
  questionJsonText: string | null;
};

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean),
        ),
      )
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePackagePath(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
}

export function isUnsafePackagePath(path: string) {
  const normalized = normalizePackagePath(path);

  return (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === "")
  );
}

export function parsePackageQuestionsJson(jsonText: string) {
  try {
    return parseImportQuestionsJsonWithLatexRepair(jsonText);
  } catch (error) {
    if (error instanceof Error && error.message.includes("JSON must be")) {
      throw new Error("questions.json must be an array or an object with questions.");
    }

    throw error;
  }
}

export function extractPackageQuestionReferences(rawItems: unknown[]) {
  return rawItems.map((raw): PackageQuestionReference => {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    return {
      code: stringValue(item.question_code) || stringValue(item.code),
      contentHtmlPresent: Boolean(stringValue(item.content_html)),
      imageFiles: stringArray(item.image_files).map(normalizePackagePath),
      sourceFiles: stringArray(item.source_files).map(normalizePackagePath),
      solutionHtmlPresent: Boolean(stringValue(item.solution_html)),
      tagIds: stringArray(item.tag_ids),
      title: stringValue(item.title),
    };
  });
}

function isAllowedPackageFile(path: string) {
  if (path === "questions.json") {
    return true;
  }

  if (/^images\/[^/]+\.(png|jpe?g|webp|gif)$/i.test(path)) {
    return true;
  }

  return /^pdfs\/[^/]+\.pdf$/i.test(path);
}

function entryFileKind(path: string) {
  const mimeType = inferBulkAssetMimeType(path);

  return detectBulkAssetFileKind(mimeType);
}

function entrySizeValid(path: string, sizeBytes: number) {
  const fileKind = entryFileKind(path);

  if (fileKind === "image") {
    return sizeBytes > 0 && sizeBytes <= BULK_ASSET_IMAGE_MAX_BYTES;
  }

  if (fileKind === "pdf") {
    return sizeBytes > 0 && sizeBytes <= BULK_ASSET_PDF_MAX_BYTES;
  }

  return path === "questions.json" && sizeBytes > 0;
}

function invalidPlan(path: string, sizeBytes: number, message: string): PackageAssetPlan {
  return {
    fileKind: entryFileKind(path),
    message,
    path,
    questionCode: null,
    sizeBytes,
    status: "invalid",
  };
}

export function planPackageImport({
  entries,
  questionJsonText,
  rawQuestions,
}: {
  entries: ZipEntryData[];
  questionJsonText: string | null;
  rawQuestions: unknown[];
}): PackagePlan {
  const errors: string[] = [];
  const entryByPath = new Map<string, ZipEntryData>();
  const duplicatePaths = new Set<string>();
  const invalidPlans: PackageAssetPlan[] = [];

  for (const entry of entries) {
    const path = normalizePackagePath(entry.path);

    if (entry.isDirectory) {
      if (path !== "images/" && path !== "pdfs/") {
        invalidPlans.push(invalidPlan(path, 0, "Unexpected directory in ZIP."));
      }

      continue;
    }

    if (isUnsafePackagePath(path)) {
      invalidPlans.push(
        invalidPlan(path, entry.uncompressedSize, "Unsafe ZIP path was rejected."),
      );
      continue;
    }

    if (!isAllowedPackageFile(path)) {
      invalidPlans.push(
        invalidPlan(
          path,
          entry.uncompressedSize,
          "Unsupported package file path or file type.",
        ),
      );
      continue;
    }

    if (!entrySizeValid(path, entry.uncompressedSize)) {
      invalidPlans.push(
        invalidPlan(path, entry.uncompressedSize, "Package file exceeds size limits."),
      );
      continue;
    }

    if (entryByPath.has(path)) {
      duplicatePaths.add(path);
    } else {
      entryByPath.set(path, entry);
    }
  }

  if (!questionJsonText) {
    errors.push("Missing questions.json.");
  }

  const questions = extractPackageQuestionReferences(rawQuestions);
  const referencedPaths = new Map<string, string>();

  for (const question of questions) {
    for (const imageFile of question.imageFiles) {
      referencedPaths.set(imageFile, question.code);
    }

    for (const sourceFile of question.sourceFiles) {
      referencedPaths.set(sourceFile, question.code);
    }
  }

  const assetPlans: PackageAssetPlan[] = [...invalidPlans];

  for (const duplicatePath of duplicatePaths) {
    const entry = entryByPath.get(duplicatePath);

    assetPlans.push({
      fileKind: entryFileKind(duplicatePath),
      message: "Duplicate file path inside package.",
      path: duplicatePath,
      questionCode: referencedPaths.get(duplicatePath) ?? null,
      sizeBytes: entry?.uncompressedSize ?? 0,
      status: "duplicate",
    });
  }

  for (const [path, questionCode] of referencedPaths) {
    if (!entryByPath.has(path)) {
      assetPlans.push({
        fileKind: entryFileKind(path),
        message: "Referenced file is missing from the package.",
        path,
        questionCode,
        sizeBytes: 0,
        status: "missing",
      });
    }
  }

  for (const [path, entry] of entryByPath) {
    if (path === "questions.json") {
      continue;
    }

    const fileKind = entryFileKind(path);

    if (!fileKind) {
      continue;
    }

    const questionCode = referencedPaths.get(path) ?? null;

    assetPlans.push({
      fileKind,
      message: questionCode
        ? "Ready to upload after draft question creation."
        : "File is present but not referenced by questions.json.",
      path,
      questionCode,
      sizeBytes: entry.uncompressedSize,
      status: questionCode ? "matched" : "unused",
    });
  }

  return {
    assetPlans,
    counts: {
      duplicateAssets: assetPlans.filter((plan) => plan.status === "duplicate")
        .length,
      imageFiles: [...entryByPath.keys()].filter((path) => {
        const mimeType = inferBulkAssetMimeType(path);

        return BULK_ASSET_IMAGE_MIME_TYPES.includes(
          mimeType as (typeof BULK_ASSET_IMAGE_MIME_TYPES)[number],
        );
      }).length,
      invalidFiles: assetPlans.filter((plan) => plan.status === "invalid").length,
      matchedImages: assetPlans.filter(
        (plan) => plan.status === "matched" && plan.fileKind === "image",
      ).length,
      matchedPdfs: assetPlans.filter(
        (plan) => plan.status === "matched" && plan.fileKind === "pdf",
      ).length,
      missingReferencedFiles: assetPlans.filter((plan) => plan.status === "missing")
        .length,
      pdfFiles: [...entryByPath.keys()].filter(
        (path) => inferBulkAssetMimeType(path) === BULK_ASSET_PDF_MIME_TYPE,
      ).length,
      unusedFiles: assetPlans.filter((plan) => plan.status === "unused").length,
    },
    errors,
    questions,
    questionJsonText,
  };
}
