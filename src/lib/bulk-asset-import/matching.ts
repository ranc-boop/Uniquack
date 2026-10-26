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
export type BulkAssetDuplicateReason = "existing" | "queue";
type BulkAssetMatchStatus =
  | "matched"
  | "unmatched"
  | "ambiguous"
  | "invalid"
  | "duplicate";

export type BulkAssetExistingFileRecord = {
  fileKind: BulkAssetFileKind;
  objectPath?: string | null;
  originalFilename?: string | null;
  questionId: string;
};

export type BulkAssetExistingFilesByQuestionId = Record<
  string,
  {
    imageFilenames: string[];
    pdfFilenames: string[];
  }
>;

export type BulkAssetFileClassification = {
  actionLabel: string;
  duplicateReason: BulkAssetDuplicateReason | null;
  fileKind: BulkAssetFileKind | null;
  fileName: string;
  matchedQuestion: BulkAssetQuestionMatch | null;
  matchedQuestions: BulkAssetQuestionMatch[];
  message: string;
  mimeType: string | null;
  status: BulkAssetMatchStatus;
};

export type BulkAssetFileInput = {
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
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

function normalizeFilename(value: string) {
  return value.trim().toLowerCase();
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

function basenameForBulkAssetPath(path: string | null | undefined) {
  if (!path) {
    return "";
  }

  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}

function bulkAssetDuplicateKey(file: BulkAssetFileInput) {
  const inferredMimeType = inferBulkAssetMimeType(file.fileName, file.mimeType);

  return [
    normalizeFilename(file.fileName),
    inferredMimeType ?? file.mimeType?.trim().toLowerCase() ?? "",
    file.sizeBytes,
  ].join("::");
}

export function buildBulkAssetExistingFileIndex(
  records: BulkAssetExistingFileRecord[],
): BulkAssetExistingFilesByQuestionId {
  const index: BulkAssetExistingFilesByQuestionId = {};

  for (const record of records) {
    const existing = (index[record.questionId] ??= {
      imageFilenames: [],
      pdfFilenames: [],
    });
    const filenames = [
      record.originalFilename,
      basenameForBulkAssetPath(record.objectPath),
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(normalizeFilename);

    if (!filenames.length) {
      continue;
    }

    const target =
      record.fileKind === "image"
        ? existing.imageFilenames
        : existing.pdfFilenames;

    for (const filename of filenames) {
      if (!target.includes(filename)) {
        target.push(filename);
      }
    }
  }

  return index;
}

export function addBulkAssetExistingFilename(
  index: BulkAssetExistingFilesByQuestionId,
  {
    fileKind,
    fileName,
    questionId,
  }: {
    fileKind: BulkAssetFileKind;
    fileName: string;
    questionId: string;
  },
): BulkAssetExistingFilesByQuestionId {
  const next = {
    ...index,
    [questionId]: {
      imageFilenames: [...(index[questionId]?.imageFilenames ?? [])],
      pdfFilenames: [...(index[questionId]?.pdfFilenames ?? [])],
    },
  };
  const target =
    fileKind === "image"
      ? next[questionId].imageFilenames
      : next[questionId].pdfFilenames;
  const normalized = normalizeFilename(fileName);

  if (!target.includes(normalized)) {
    target.push(normalized);
  }

  return next;
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

function matchQuestionsByFilenamePrefix(
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

function duplicateClassification({
  duplicateReason,
  fileKind,
  fileName,
  matchedQuestion,
  matchedQuestions,
  message,
  mimeType,
}: {
  duplicateReason: BulkAssetDuplicateReason;
  fileKind: BulkAssetFileKind | null;
  fileName: string;
  matchedQuestion: BulkAssetQuestionMatch | null;
  matchedQuestions: BulkAssetQuestionMatch[];
  message: string;
  mimeType: string | null;
}): BulkAssetFileClassification {
  return {
    actionLabel: "duplicate",
    duplicateReason,
    fileKind,
    fileName,
    matchedQuestion,
    matchedQuestions,
    message,
    mimeType,
    status: "duplicate",
  };
}

export function classifyBulkAssetFile({
  existingFilesByQuestionId,
  fileName,
  mimeType,
  questions,
  sizeBytes,
}: BulkAssetFileInput & {
  existingFilesByQuestionId?: BulkAssetExistingFilesByQuestionId;
  questions: BulkAssetQuestionMatch[];
}): BulkAssetFileClassification {
  const inferredMimeType = inferBulkAssetMimeType(fileName, mimeType);
  const extension = extensionForFileName(fileName);
  const fileKind = detectBulkAssetFileKind(inferredMimeType);

  if (extension === "svg" || mimeType?.toLowerCase() === "image/svg+xml") {
    return {
      actionLabel: "invalid file type",
      duplicateReason: null,
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
      duplicateReason: null,
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
      duplicateReason: null,
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
      duplicateReason: null,
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
      duplicateReason: null,
      fileKind,
      fileName,
      matchedQuestion: null,
      matchedQuestions,
      message: "Multiple draft question codes match this filename prefix.",
      mimeType: inferredMimeType,
      status: "ambiguous",
    };
  }

  const matchedQuestion = matchedQuestions[0];
  const existingFilenames =
    fileKind === "image"
      ? existingFilesByQuestionId?.[matchedQuestion.id]?.imageFilenames
      : existingFilesByQuestionId?.[matchedQuestion.id]?.pdfFilenames;

  if (existingFilenames?.includes(normalizeFilename(fileName))) {
    return duplicateClassification({
      duplicateReason: "existing",
      fileKind,
      fileName,
      matchedQuestion,
      matchedQuestions,
      message: "Already uploaded for this question.",
      mimeType: inferredMimeType,
    });
  }

  return {
    actionLabel:
      fileKind === "image"
        ? "will upload as image asset"
        : "will upload as PDF source file",
    duplicateReason: null,
    fileKind,
    fileName,
    matchedQuestion,
    matchedQuestions,
    message: "Ready to upload and bind.",
    mimeType: inferredMimeType,
    status: "matched",
  };
}

export function classifyBulkAssetQueue({
  existingFilesByQuestionId,
  files,
  questions,
}: {
  existingFilesByQuestionId?: BulkAssetExistingFilesByQuestionId;
  files: BulkAssetFileInput[];
  questions: BulkAssetQuestionMatch[];
}) {
  const seen = new Set<string>();

  return files.map((file) => {
    const classification = classifyBulkAssetFile({
      ...file,
      existingFilesByQuestionId,
      questions,
    });
    const duplicateKey = bulkAssetDuplicateKey(file);

    if (classification.status !== "invalid" && seen.has(duplicateKey)) {
      return duplicateClassification({
        duplicateReason: "queue",
        fileKind: classification.fileKind,
        fileName: classification.fileName,
        matchedQuestion: classification.matchedQuestion,
        matchedQuestions: classification.matchedQuestions,
        message: "Duplicate in current selection.",
        mimeType: classification.mimeType,
      });
    }

    seen.add(duplicateKey);
    return classification;
  });
}
