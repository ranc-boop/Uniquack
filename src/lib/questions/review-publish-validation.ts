import {
  getQuestionReadiness,
} from "@/lib/questions/grading-capability";

export type ReviewPublishQuestionInput = {
  answerSpec: unknown;
  assetRows: Array<{ altText: string | null; id: string }>;
  contentHtml: string | null;
  contentSource: string | null;
  difficultyRating: number | null;
  expectedBankId: string;
  ownerBankId: string | null;
  options: unknown;
  questionId: string;
  questionType: string;
  reviewItem: {
    createdQuestionId: string | null;
    id: string;
    status: string;
    targetBankId: string | null;
    validationWarnings: unknown;
  } | null;
  solutionHtml: string | null;
  solutionSource: string | null;
  source: string | null;
  sourceReviewItemId: string | null;
  status: string;
  taxonomyCount: number;
};

export type ReviewPublishValidation = {
  hardErrors: string[];
  softWarnings: string[];
};

const SUPPORTED_QUESTION_TYPES = new Set([
  "fill_blank",
  "frq",
  "mcq",
  "mixed",
]);

function hasReadableContent(html: string | null, source: string | null) {
  const text = `${source ?? ""} ${html ?? ""}`
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return Boolean(text || /<img\b/i.test(html ?? ""));
}

function warningStrings(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((warning) => {
      if (typeof warning === "string") return warning.trim();
      if (!warning) return "";
      try {
        return JSON.stringify(warning);
      } catch {
        return "Content quality warning";
      }
    })
    .filter(Boolean);
}

function referencedQuestionAssetIds(
  contentHtml: string | null,
  solutionHtml: string | null,
) {
  const references = `${contentHtml ?? ""} ${solutionHtml ?? ""}`.matchAll(
    /\/api\/question-assets\/([0-9a-f-]{36})/gi,
  );

  return Array.from(new Set(Array.from(references, (match) => match[1])));
}

export function validateReviewQuestionForPublish(
  input: ReviewPublishQuestionInput,
): ReviewPublishValidation {
  const hardErrors: string[] = [];
  const softWarnings = warningStrings(
    input.reviewItem?.validationWarnings,
  );

  if (input.status !== "draft") {
    hardErrors.push("This question is no longer a Draft.");
  }

  if (input.ownerBankId !== input.expectedBankId) {
    hardErrors.push("This question does not belong to this Library.");
  }

  if (
    !input.reviewItem ||
    input.sourceReviewItemId !== input.reviewItem.id ||
    input.reviewItem.createdQuestionId !== input.questionId ||
    input.reviewItem.targetBankId !== input.expectedBankId
  ) {
    hardErrors.push("Review lineage is incomplete.");
  }

  if (
    input.reviewItem &&
    input.reviewItem.status !== "pending_review" &&
    input.reviewItem.status !== "needs_more_evidence"
  ) {
    hardErrors.push("This Draft is no longer awaiting approval.");
  }

  if (!SUPPORTED_QUESTION_TYPES.has(input.questionType)) {
    hardErrors.push("This question type cannot be published.");
  }

  if (!hasReadableContent(input.contentHtml, input.contentSource)) {
    hardErrors.push("Question content is required.");
  }

  const readiness = getQuestionReadiness({
    answerSpec: input.answerSpec,
    options: input.options,
    questionType: input.questionType,
    solutionHtml: input.solutionHtml,
    solutionSource: input.solutionSource,
  });
  hardErrors.push(...readiness.blockingReasons);

  const availableAssets = new Map(
    input.assetRows.map((asset) => [asset.id, asset]),
  );
  const referencedAssetIds = referencedQuestionAssetIds(
    input.contentHtml,
    input.solutionHtml,
  );

  for (const assetId of referencedAssetIds) {
    const asset = availableAssets.get(assetId);
    if (!asset) {
      hardErrors.push("A referenced question image is unavailable.");
      continue;
    }
    if (!asset.altText?.trim()) {
      hardErrors.push("Question images require alternative text.");
    }
  }

  if (
    !hasReadableContent(input.solutionHtml, input.solutionSource)
  ) {
    softWarnings.push("Explanation is missing.");
  }
  if (!input.taxonomyCount) {
    softWarnings.push("Taxonomy is not set.");
  }
  if (input.difficultyRating === null) {
    softWarnings.push("Difficulty is not set.");
  }
  if (!input.source?.trim()) {
    softWarnings.push("Source metadata is incomplete.");
  }

  return {
    hardErrors: Array.from(new Set(hardErrors)),
    softWarnings: Array.from(new Set(softWarnings)),
  };
}
