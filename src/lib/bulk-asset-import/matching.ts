export const BULK_ASSET_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const BULK_ASSET_PDF_MIME_TYPE = "application/pdf";
export const BULK_ASSET_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
export const BULK_ASSET_PDF_MAX_BYTES = 20 * 1024 * 1024;

export type BulkAssetQuestionMatch = {
  id: string;
  questionCode: string;
  title: string;
};

export type BulkAssetFileKind = "image" | "pdf";
export type BulkAssetMatchStatus =
  | "matched"
  | "unmatched"
  | "ambiguous"
  | "invalid";

export type BulkAssetFileClassification = {
  actionLabel: string;
  fileKind: BulkAssetFileKind | null;
  fileName: string;
  matchedQuestion: BulkAssetQuestionMatch | null;
  matchedQuestions: BulkAssetQuestionMatch[];
  message: string;
  mimeType: string | null;
  status: BulkAssetMatchStatus;
};

const imageMimeTypeByExtension: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function extensionForFileName(fileName: string) {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());

  return match?.[1]?.toLowerCase() ?? "";
}

function stemForFileName(fileName: string) {
  return fileName.trim().replace(/\.[^.]+$/, "");
}

function isPrefixBoundary(value: string | undefined) {
  return value === undefined || value === "" || value === "_" || value === "-";
}

export function inferBulkAssetMimeType(fileName: string, mimeType?: string) {
  const normalizedMimeType = mimeType?.trim().toLowerCase();

  if (
    normalizedMimeType &&
    [...BULK_ASSET_IMAGE_MIME_TYPES, BULK_ASSET_PDF_MIME_TYPE].includes(
      normalizedMimeType,
    )
  ) {
    return normalizedMimeType;
  }

  const extension = extensionForFileName(fileName);

  if (extension === "pdf") {
    return BULK_ASSET_PDF_MIME_TYPE;
  }

  return imageMimeTypeByExtension[extension] ?? null;
}

export function detectBulkAssetFileKind(mimeType: string | null) {
  if (!mimeType) {
    return null;
  }

  if (mimeType === BULK_ASSET_PDF_MIME_TYPE) {
    return "pdf";
  }

  return BULK_ASSET_IMAGE_MIME_TYPES.includes(
    mimeType as (typeof BULK_ASSET_IMAGE_MIME_TYPES)[number],
  )
    ? "image"
    : null;
}

export function matchQuestionsByFilenamePrefix(
  fileName: string,
  questions: BulkAssetQuestionMatch[],
) {
  const normalizedStem = normalizeCode(stemForFileName(fileName));

  return questions.filter((question) => {
    const normalizedCode = normalizeCode(question.questionCode);

    if (!normalizedCode || !normalizedStem.startsWith(normalizedCode)) {
      return false;
    }

    return isPrefixBoundary(normalizedStem[normalizedCode.length]);
  });
}

export function classifyBulkAssetFile({
  fileName,
  mimeType,
  questions,
  sizeBytes,
}: {
  fileName: string;
  mimeType?: string;
  questions: BulkAssetQuestionMatch[];
  sizeBytes: number;
}): BulkAssetFileClassification {
  const inferredMimeType = inferBulkAssetMimeType(fileName, mimeType);
  const extension = extensionForFileName(fileName);
  const fileKind = detectBulkAssetFileKind(inferredMimeType);

  if (extension === "svg" || mimeType?.toLowerCase() === "image/svg+xml") {
    return {
      actionLabel: "invalid file type",
      fileKind: null,
      fileName,
      matchedQuestion: null,
      matchedQuestions: [],
      message: "SVG files are not supported.",
      mimeType: null,
      status: "invalid",
    };
  }

  if (!fileKind || !inferredMimeType) {
    return {
      actionLabel: "invalid file type",
      fileKind: null,
      fileName,
      matchedQuestion: null,
      matchedQuestions: [],
      message: "Only PNG, JPEG, WebP, GIF, and PDF files are supported.",
      mimeType: null,
      status: "invalid",
    };
  }

  const maxBytes =
    fileKind === "image" ? BULK_ASSET_IMAGE_MAX_BYTES : BULK_ASSET_PDF_MAX_BYTES;

  if (sizeBytes <= 0 || sizeBytes > maxBytes) {
    return {
      actionLabel: "invalid file size",
      fileKind,
      fileName,
      matchedQuestion: null,
      matchedQuestions: [],
      message:
        fileKind === "image"
          ? "Image exceeds the 6 MB limit."
          : "PDF exceeds the 20 MB limit.",
      mimeType: inferredMimeType,
      status: "invalid",
    };
  }

  const matchedQuestions = matchQuestionsByFilenamePrefix(fileName, questions);

  if (matchedQuestions.length === 0) {
    return {
      actionLabel: "unmatched",
      fileKind,
      fileName,
      matchedQuestion: null,
      matchedQuestions: [],
      message: "No draft question code matches this filename prefix.",
      mimeType: inferredMimeType,
      status: "unmatched",
    };
  }

  if (matchedQuestions.length > 1) {
    return {
      actionLabel: "ambiguous match",
      fileKind,
      fileName,
      matchedQuestion: null,
      matchedQuestions,
      message: "Multiple draft question codes match this filename prefix.",
      mimeType: inferredMimeType,
      status: "ambiguous",
    };
  }

  return {
    actionLabel:
      fileKind === "image"
        ? "will upload as image asset"
        : "will upload as PDF source file",
    fileKind,
    fileName,
    matchedQuestion: matchedQuestions[0],
    matchedQuestions,
    message: "Ready to upload and bind.",
    mimeType: inferredMimeType,
    status: "matched",
  };
}
