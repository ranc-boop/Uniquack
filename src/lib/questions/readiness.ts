import {
  countImportAssetReferences,
  type ImportAssetReferences,
} from "@/lib/batch-import/asset-references";

export type QuestionReadinessInput = {
  contentHtml?: string | null;
  difficultyRating?: number | null;
  imageCount?: number;
  importedAssetReferences?: ImportAssetReferences | null;
  solutionHtml?: string | null;
  sourceFileCount?: number;
  tagCount?: number;
};

export type QuestionReadiness = {
  hasContent: boolean;
  hasDifficulty: boolean;
  hasImages: boolean;
  hasImportedAssetRefs: boolean;
  hasSolution: boolean;
  hasSourceFiles: boolean;
  hasTags: boolean;
  isReady: boolean;
  missingLabels: string[];
  summaryLabel: "Ready to publish" | "Needs review";
  warningLabels: string[];
};

function hasMeaningfulText(value: string | null | undefined) {
  return Boolean(value?.replace(/<[^>]*>/g, "").trim());
}

export function getQuestionReadiness(
  input: QuestionReadinessInput,
): QuestionReadiness {
  const importRefCount = input.importedAssetReferences
    ? countImportAssetReferences(input.importedAssetReferences).total
    : 0;
  const hasContent = hasMeaningfulText(input.contentHtml);
  const hasSolution = hasMeaningfulText(input.solutionHtml);
  const hasTags = (input.tagCount ?? 0) > 0;
  const hasDifficulty =
    typeof input.difficultyRating === "number" &&
    Number.isFinite(input.difficultyRating) &&
    input.difficultyRating >= 0 &&
    input.difficultyRating <= 1000;
  const hasImportedAssetRefs = importRefCount > 0;
  const missingLabels = [
    !hasContent ? "Needs content" : null,
    !hasSolution ? "Needs solution" : null,
    !hasTags ? "Needs tags" : null,
    !hasDifficulty ? "Needs difficulty" : null,
  ].filter((label): label is string => Boolean(label));
  const warningLabels = hasImportedAssetRefs ? ["Needs media review"] : [];
  const isReady = missingLabels.length === 0 && warningLabels.length === 0;

  return {
    hasContent,
    hasDifficulty,
    hasImages: (input.imageCount ?? 0) > 0,
    hasImportedAssetRefs,
    hasSolution,
    hasSourceFiles: (input.sourceFileCount ?? 0) > 0,
    hasTags,
    isReady,
    missingLabels,
    summaryLabel: isReady ? "Ready to publish" : "Needs review",
    warningLabels,
  };
}
