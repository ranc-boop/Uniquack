export const QUESTION_SOURCE_FILES_BUCKET = "question-source-files";
export const QUESTION_SOURCE_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const QUESTION_SOURCE_FILE_MIME_TYPE = "application/pdf";

export function questionSourceFileExtensionForMimeType(mimeType: string) {
  return mimeType === QUESTION_SOURCE_FILE_MIME_TYPE ? "pdf" : null;
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
