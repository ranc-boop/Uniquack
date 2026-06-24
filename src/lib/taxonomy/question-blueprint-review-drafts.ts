import "server-only";

import { importBatchImportJson, type BatchImportSummary } from "@/lib/batch-import/service";
import { QUESTION_BLUEPRINT_QUESTION_TYPES } from "@/lib/taxonomy/question-blueprint";
import type { BlueprintGeneratedQuestionDraft } from "@/lib/taxonomy/question-blueprint-execution";
import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";
import type { Json } from "@/types/database";

type SupabaseLike = {
  from: (table: string) => any;
};

export type BlueprintReviewDraftSourceMetadata = {
  blueprintId: string;
  provider: "deepseek";
  requestId: string;
  reviewRequired: true;
  source: "blueprint_generation";
};

export type BlueprintReviewDraft = {
  ai_metadata: BlueprintReviewDraftSourceMetadata & {
    generatedDraftIndex: number;
    validationWarnings: string[];
  };
  answer_spec: Json;
  content_html: string;
  content_source: string;
  content_source_format: "html";
  difficulty_rating: number;
  options: Json[];
  question_code: string;
  question_type: BlueprintGeneratedQuestionDraft["questionType"];
  solution_html?: string;
  solution_source?: string;
  solution_source_format?: "html";
  status: "draft";
  tag_ids: string[];
  title: string;
};

export type BlueprintReviewDraftValidation = {
  errors: string[];
  valid: boolean;
  warnings: string[];
};

export type BlueprintReviewDraftPersistenceSummary = {
  batchId: string | null;
  createdDraftCount: number;
  errorCount: number;
  reviewUrl: string | null;
  skippedCount: number;
  source: "blueprint_generation";
  validationErrorReasons: string[];
  warningCount: number;
};

function activeAssignableLeafTagIds(catalog: TaxonomyCatalogView) {
  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );

  return new Set(
    catalog.nodes
      .filter((node) => node.is_assignable !== false && !parentTagIds.has(node.tag_id))
      .map((node) => node.tag_id),
  );
}

function codePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .toUpperCase();
}

function buildQuestionCode({
  index,
  requestId,
  runNonce,
}: {
  index: number;
  requestId: string;
  runNonce: string;
}) {
  return `BP-${codePart(requestId) || "REQUEST"}-${index + 1}-${codePart(runNonce) || "RUN"}`.slice(
    0,
    80,
  );
}

function asJson(value: Json): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function asJsonArray(value: Json[]): Json[] {
  return JSON.parse(JSON.stringify(value)) as Json[];
}

export function buildBlueprintReviewDrafts({
  blueprintId,
  drafts,
  provider = "deepseek",
  requestId,
  runNonce = Date.now().toString(36),
}: {
  blueprintId: string;
  drafts: BlueprintGeneratedQuestionDraft[];
  provider?: "deepseek";
  requestId: string;
  runNonce?: string;
}): BlueprintReviewDraft[] {
  return drafts.map((draft, index) => {
    const base = {
      ai_metadata: {
        blueprintId,
        generatedDraftIndex: index,
        provider,
        requestId,
        reviewRequired: true as const,
        source: "blueprint_generation" as const,
        validationWarnings: draft.validationWarnings,
      },
      answer_spec: asJson(draft.answerSpec),
      content_html: draft.contentHtml,
      content_source: draft.contentHtml,
      content_source_format: "html" as const,
      difficulty_rating: draft.difficulty,
      options: asJsonArray(draft.options),
      question_code: buildQuestionCode({ index, requestId, runNonce }),
      question_type: draft.questionType,
      status: "draft" as const,
      tag_ids: draft.taxonomyTagIds,
      title: draft.title,
    };

    if (!draft.solutionHtml?.trim()) {
      return base;
    }

    return {
      ...base,
      solution_html: draft.solutionHtml,
      solution_source: draft.solutionHtml,
      solution_source_format: "html" as const,
    };
  });
}

export function validateBlueprintReviewDraft({
  catalog,
  draft,
}: {
  catalog: TaxonomyCatalogView;
  draft: BlueprintReviewDraft;
}): BlueprintReviewDraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const leafTagIds = activeAssignableLeafTagIds(catalog);

  if (draft.status !== "draft") {
    errors.push("blueprint_review_draft_must_remain_draft");
  }

  if (draft.ai_metadata.source !== "blueprint_generation") {
    errors.push("blueprint_review_draft_source_required");
  }

  if (draft.ai_metadata.reviewRequired !== true) {
    errors.push("blueprint_review_draft_review_required");
  }

  if (!draft.title.trim()) {
    errors.push("blueprint_review_draft_title_required");
  }

  if (!draft.content_html.trim()) {
    errors.push("blueprint_review_draft_content_required");
  }

  if (!QUESTION_BLUEPRINT_QUESTION_TYPES.includes(draft.question_type)) {
    errors.push("blueprint_review_draft_question_type_invalid");
  }

  if (!Number.isFinite(draft.difficulty_rating)) {
    errors.push("blueprint_review_draft_difficulty_invalid");
  }

  if (!draft.tag_ids.length) {
    errors.push("blueprint_review_draft_taxonomy_tags_required");
  }

  for (const tagId of draft.tag_ids) {
    if (!leafTagIds.has(tagId)) {
      errors.push(`blueprint_review_draft_invalid_taxonomy_tag:${tagId}`);
    }
  }

  if (draft.question_type === "mcq" && draft.options.length < 2) {
    errors.push("blueprint_review_draft_mcq_options_required");
  }

  if (
    draft.question_type === "mcq" &&
    (!draft.answer_spec ||
      typeof draft.answer_spec !== "object" ||
      Array.isArray(draft.answer_spec) ||
      !Object.keys(draft.answer_spec).length)
  ) {
    errors.push("blueprint_review_draft_answer_spec_required");
  }

  if (!draft.solution_html?.trim()) {
    warnings.push("blueprint_review_draft_solution_missing");
  }

  return {
    errors: Array.from(new Set(errors)),
    valid: errors.length === 0,
    warnings: Array.from(new Set([...warnings, ...draft.ai_metadata.validationWarnings])),
  };
}

export function summarizeBlueprintReviewDraftPersistence({
  summary,
}: {
  summary: BatchImportSummary;
}): BlueprintReviewDraftPersistenceSummary {
  return {
    batchId: summary.batchId,
    createdDraftCount: summary.createdCount,
    errorCount: summary.errorCount,
    reviewUrl: summary.batchId ? `/admin/review?batch=${summary.batchId}` : null,
    skippedCount: summary.skippedCount,
    source: "blueprint_generation",
    validationErrorReasons: summary.validationErrorReasons,
    warningCount: summary.validationErrorReasons.length,
  };
}

export async function persistBlueprintReviewDrafts({
  blueprintId,
  catalog,
  drafts,
  profileId,
  provider = "deepseek",
  requestId,
  runNonce,
  supabase,
}: {
  blueprintId: string;
  catalog: TaxonomyCatalogView;
  drafts: BlueprintGeneratedQuestionDraft[];
  profileId: string;
  provider?: "deepseek";
  requestId: string;
  runNonce?: string;
  supabase: SupabaseLike;
}) {
  const reviewDrafts = buildBlueprintReviewDrafts({
    blueprintId,
    drafts,
    provider,
    requestId,
    runNonce,
  });
  const validations = reviewDrafts.map((draft) =>
    validateBlueprintReviewDraft({ catalog, draft }),
  );
  const validationErrors = Array.from(
    new Set(validations.flatMap((validation) => validation.errors)),
  );

  if (validationErrors.length) {
    throw new Error(
      `Blueprint generated drafts are not ready for Review: ${validationErrors
        .slice(0, 4)
        .join("; ")}`,
    );
  }

  const summary = await importBatchImportJson({
    allowDraftTags: false,
    initialSummaryExtras: {
      blueprintGenerationReview: {
        blueprintId,
        provider,
        readyDraftCount: reviewDrafts.length,
        requestId,
        reviewRequired: true,
        source: "blueprint_generation",
      },
    },
    jsonText: JSON.stringify(reviewDrafts),
    profileId,
    sourceType: "manual_json",
    supabase,
  });

  return summarizeBlueprintReviewDraftPersistence({ summary });
}
