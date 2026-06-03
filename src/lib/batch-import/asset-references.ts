import type { Json } from "@/types/database";

export type ImportAssetReferences = {
  imageUrls: string[];
  sourceFileIds: string[];
  questionAssetIds: string[];
};

export const emptyImportAssetReferences: ImportAssetReferences = {
  imageUrls: [],
  sourceFileIds: [],
  questionAssetIds: [],
};

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

export function extractImportAssetReferences(
  value: Json | Record<string, unknown> | null | undefined,
): ImportAssetReferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyImportAssetReferences;
  }
  const record = value as Record<string, unknown>;

  return {
    imageUrls: stringArray(record.image_urls),
    sourceFileIds: stringArray(record.source_file_ids),
    questionAssetIds: stringArray(record.question_asset_ids),
  };
}

export function countImportAssetReferences(refs: ImportAssetReferences) {
  return {
    imageUrls: refs.imageUrls.length,
    sourceFileIds: refs.sourceFileIds.length,
    questionAssetIds: refs.questionAssetIds.length,
    total:
      refs.imageUrls.length +
      refs.sourceFileIds.length +
      refs.questionAssetIds.length,
  };
}
