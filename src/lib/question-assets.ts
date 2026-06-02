export const QUESTION_ASSETS_BUCKET = "question-assets";
export const QUESTION_ASSET_MAX_BYTES = 6 * 1024 * 1024;

export const QUESTION_ASSET_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const extensionByMimeType: Record<(typeof QUESTION_ASSET_MIME_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function questionAssetExtensionForMimeType(mimeType: string) {
  return extensionByMimeType[mimeType as keyof typeof extensionByMimeType] ?? null;
}
