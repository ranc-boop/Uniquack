import "server-only";

import type {
  GeneratedBlueprintQuestionDraft,
  QuestionBlueprintGenerationResult,
} from "@/lib/blueprints/question-blueprint-generation";

type BatchImportQuestionJson = {
  ai_metadata: Record<string, unknown>;
  answer_spec?: unknown;
  code: string;
  content_html: string;
  difficulty_rating: number;
  options?: unknown[];
  question_type: string;
  solution_html?: string;
  status: "draft";
  tag_ids: string[];
  title: string;
};

export type BlueprintGeneratedReviewDraftPersistenceSummary = {
  acceptedDraftCount: number;
  blockedDraftCount: number;
  blueprintId: string;
  reviewRequired: true;
  source: "blueprint_generation";
  warnings: string[];
};

function safeCodePart(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}

function questionCode({
  codePrefix,
  draft,
  index,
}: {
  codePrefix: string;
  draft: GeneratedBlueprintQuestionDraft;
  index: number;
}) {
  const titlePart = safeCodePart(draft.title) || `draft-${index + 1}`;

  return `${safeCodePart(codePrefix) || "BP"}-${index + 1}-${titlePart}`.slice(0, 80);
}

export function validateBlueprintGeneratedReviewDraft(
  draft: GeneratedBlueprintQuestionDraft,
) {
  const errors: string[] = [];

  if (draft.blocked) errors.push("Generated draft was blocked by validation.");
  if (!draft.title.trim()) errors.push("Generated draft title is required.");
  if (!draft.contentHtml.trim()) errors.push("Generated draft content is required.");
  if (!draft.taxonomyTagIds.length) errors.push("Generated draft needs taxonomy tags.");
  if (draft.questionType === "mcq" && !draft.options.length) {
    errors.push("Generated MCQ draft needs options.");
  }
  if (!draft.originality.originalityChecked) {
    errors.push("Generated draft must pass originality checks.");
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}

export function buildBlueprintGeneratedReviewDrafts({
  codePrefix,
  result,
}: {
  codePrefix: string;
  result: QuestionBlueprintGenerationResult;
}): BatchImportQuestionJson[] {
  return result.acceptedDrafts
    .map((draft, index): BatchImportQuestionJson | null => {
      const validation = validateBlueprintGeneratedReviewDraft(draft);

      if (!validation.valid) {
        return null;
      }

      return {
        ai_metadata: {
          blockedDraftCount: result.blockedDrafts.length,
          blueprintId: result.request.blueprintId,
          provider: "deepseek",
          requestId: result.request.requestId,
          reviewRequired: true,
          source: "blueprint_generation",
          originality: draft.originality,
          originalityChecked: true,
          validationWarnings: draft.validationWarnings,
        },
        answer_spec: draft.answerSpec,
        code: questionCode({ codePrefix, draft, index }),
        content_html: draft.contentHtml,
        difficulty_rating: draft.difficulty,
        options: draft.options,
        question_type: draft.questionType,
        solution_html: draft.solutionHtml,
        status: "draft",
        tag_ids: draft.taxonomyTagIds,
        title: draft.title,
      };
    })
    .filter((draft): draft is BatchImportQuestionJson => Boolean(draft));
}

export function buildBlueprintGeneratedBatchImportJson({
  codePrefix,
  result,
}: {
  codePrefix: string;
  result: QuestionBlueprintGenerationResult;
}) {
  return JSON.stringify(
    buildBlueprintGeneratedReviewDrafts({ codePrefix, result }),
    null,
    2,
  );
}

export function summarizeBlueprintGeneratedReviewDraftPersistence(
  result: QuestionBlueprintGenerationResult,
): BlueprintGeneratedReviewDraftPersistenceSummary {
  return {
    acceptedDraftCount: result.acceptedDrafts.length,
    blockedDraftCount: result.blockedDrafts.length,
    blueprintId: result.request.blueprintId,
    reviewRequired: true,
    source: "blueprint_generation",
    warnings: [
      ...result.warnings,
      ...result.blockedDrafts.flatMap((draft) => draft.validationWarnings),
    ].slice(0, 12),
  };
}
