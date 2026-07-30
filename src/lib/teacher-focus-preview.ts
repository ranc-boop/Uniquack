import "server-only";

import { getTeacherQuestionBankAccess } from "@/lib/question-banks";
import {
  normalizeAnswerSpec,
  normalizeQuestionOptions,
} from "@/lib/questions/answer-spec";
import { getQuestionAssetUrl } from "@/lib/storage/question-assets";
import { createClient } from "@/lib/supabase/server";
import type {
  BankMemberRole,
  Question,
  QuestionBankVisibility,
  TaxonomyReviewStatus,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PreviewQuestionRow = Pick<
  Question,
  | "answer_spec"
  | "content_html"
  | "difficulty_rating"
  | "id"
  | "options"
  | "question_code"
  | "question_type"
  | "solution_html"
  | "source_kind"
  | "source_review_item_id"
  | "status"
  | "title"
  | "updated_at"
  | "visibility"
>;

type ReviewPreviewRow = {
  created_question_id: string | null;
  id: string;
  status: string;
  target_bank_id: string | null;
  validation_warnings: unknown;
};

export type TeacherQuestionPreviewDTO = {
  assets: Array<{
    altText: string;
    displayOnDetail: boolean;
    id: string;
    label: string;
    url: string;
  }>;
  bank: {
    accessSource:
      | "active_membership"
      | "organization_policy"
      | "platform_admin";
    canManage: boolean;
    id: string;
    name: string;
    role: BankMemberRole | null;
    organizationRole: "admin" | "teacher" | null;
    visibility: QuestionBankVisibility;
  };
  kind: "teacher-question-preview";
  provenance: {
    hasReviewLineage: boolean;
    sourceKind: string;
  };
  question: {
    answerSpec: unknown;
    bankQuestionId: string;
    code: string;
    contentHtml: string;
    difficulty: number;
    options: unknown;
    questionId: string;
    solutionHtml: string | null;
    status: string;
    title: string;
    type: string;
    updatedAt: string;
    visibility: string;
  };
  taxonomy: Array<{
    facetKey: string | null;
    label: string;
    reviewStatus: TaxonomyReviewStatus;
    tagId: string;
  }>;
};

export type ReviewPreviewDTO = {
  assets: TeacherQuestionPreviewDTO["assets"];
  bank: TeacherQuestionPreviewDTO["bank"];
  kind: "review-preview";
  provenance: {
    hasReviewLineage: boolean;
    sourceAccess: "not_requested";
    sourceKind: string;
  };
  question: Omit<TeacherQuestionPreviewDTO["question"], "bankQuestionId">;
  review: {
    id: string;
    lineageStatus: "linked" | "missing";
    status: string;
    warnings: string[];
  };
  taxonomy: TeacherQuestionPreviewDTO["taxonomy"];
};

type PreviewEnrichment = Pick<
  TeacherQuestionPreviewDTO,
  "assets" | "taxonomy"
>;

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const warningCopyBySignal = [
  {
    copy: "The question prompt needs review.",
    pattern: /content|prompt|question[_ -]?text/i,
  },
  {
    copy: "The answer or option alignment needs review.",
    pattern: /answer|choice|option/i,
  },
  {
    copy: "The solution or explanation needs review.",
    pattern: /solution|explanation|rationale/i,
  },
  {
    copy: "The taxonomy assignment needs review.",
    pattern: /taxonomy|tag|classification/i,
  },
  {
    copy: "The question media association needs review.",
    pattern: /asset|image|figure|media|visual/i,
  },
  {
    copy: "The source alignment needs review.",
    pattern: /boundary|page|source|extraction|lineage/i,
  },
] as const;

function safeWarningMessages(value: unknown) {
  if (!Array.isArray(value)) return [];

  const safeCopy = value.map((warning) => {
    const signal =
      typeof warning === "string"
        ? warning
        : warning && typeof warning === "object"
          ? String(
              (warning as Record<string, unknown>).code ??
                (warning as Record<string, unknown>).kind ??
                "",
            )
          : "";

    return (
      warningCopyBySignal.find(({ pattern }) => pattern.test(signal))?.copy ??
      "A stored validation check needs review."
    );
  });

  return Array.from(new Set(safeCopy)).slice(0, 10);
}

async function loadPreviewEnrichment({
  questionId,
  supabase,
}: {
  questionId: string;
  supabase: SupabaseServerClient;
}): Promise<PreviewEnrichment> {
  const [taxonomyResult, assetResult] = await Promise.all([
    supabase
      .from("question_taxonomy_assignments")
      .select("tag_id, review_status")
      .eq("question_id", questionId)
      .limit(50),
    supabase
      .from("question_assets")
      .select("id, label, alt_text, display_on_detail")
      .eq("question_id", questionId)
      .order("display_order")
      .limit(25),
  ]);

  if (taxonomyResult.error) {
    throw new Error(taxonomyResult.error.message);
  }
  if (assetResult.error) {
    throw new Error(assetResult.error.message);
  }

  const tagIds = Array.from(
    new Set(
      (taxonomyResult.data ?? [])
        .map((assignment) => assignment.tag_id)
        .filter(Boolean),
    ),
  );
  const taxonomyNodeResult = tagIds.length
    ? await supabase
        .from("taxonomy_nodes")
        .select("tag_id, facet_key, label")
        .in("tag_id", tagIds)
        .limit(50)
    : { data: [], error: null };

  if (taxonomyNodeResult.error) {
    throw new Error(taxonomyNodeResult.error.message);
  }

  const nodeById = new Map(
    (taxonomyNodeResult.data ?? []).map((node) => [node.tag_id, node]),
  );

  return {
    assets: (assetResult.data ?? []).map((asset) => ({
      altText: asset.alt_text?.trim() || asset.label?.trim() || "Question image",
      displayOnDetail: Boolean(asset.display_on_detail),
      id: asset.id,
      label: asset.label?.trim() || asset.alt_text?.trim() || "Question image",
      url: getQuestionAssetUrl(asset.id),
    })),
    taxonomy: (taxonomyResult.data ?? []).map((assignment) => {
      const node = nodeById.get(assignment.tag_id);

      return {
        facetKey: node?.facet_key ?? null,
        label: node?.label?.trim() || "Taxonomy tag",
        reviewStatus: assignment.review_status as TaxonomyReviewStatus,
        tagId: assignment.tag_id,
      };
    }),
  };
}

async function loadPreviewEnrichmentBatch({
  questionIds,
  supabase,
}: {
  questionIds: string[];
  supabase: SupabaseServerClient;
}) {
  const uniqueQuestionIds = Array.from(new Set(questionIds));
  const [taxonomyResult, assetResult] = await Promise.all([
    supabase
      .from("question_taxonomy_assignments")
      .select("question_id, tag_id, review_status")
      .in("question_id", uniqueQuestionIds)
      .limit(1250),
    supabase
      .from("question_assets")
      .select("id, question_id, label, alt_text, display_on_detail, display_order")
      .in("question_id", uniqueQuestionIds)
      .order("display_order")
      .limit(625),
  ]);

  if (taxonomyResult.error) throw new Error(taxonomyResult.error.message);
  if (assetResult.error) throw new Error(assetResult.error.message);

  const tagIds = Array.from(
    new Set((taxonomyResult.data ?? []).map((assignment) => assignment.tag_id)),
  );
  const taxonomyNodeResult = tagIds.length
    ? await supabase
        .from("taxonomy_nodes")
        .select("tag_id, facet_key, label")
        .in("tag_id", tagIds)
        .limit(1250)
    : { data: [], error: null };

  if (taxonomyNodeResult.error) {
    throw new Error(taxonomyNodeResult.error.message);
  }

  const nodeById = new Map(
    (taxonomyNodeResult.data ?? []).map((node) => [node.tag_id, node]),
  );
  const enrichmentByQuestionId = new Map<string, PreviewEnrichment>(
    uniqueQuestionIds.map((questionId) => [
      questionId,
      { assets: [], taxonomy: [] },
    ]),
  );

  for (const asset of assetResult.data ?? []) {
    const enrichment = enrichmentByQuestionId.get(asset.question_id);
    if (!enrichment) continue;

    enrichment.assets.push({
      altText: asset.alt_text?.trim() || asset.label?.trim() || "Question image",
      displayOnDetail: Boolean(asset.display_on_detail),
      id: asset.id,
      label: asset.label?.trim() || asset.alt_text?.trim() || "Question image",
      url: getQuestionAssetUrl(asset.id),
    });
  }

  for (const assignment of taxonomyResult.data ?? []) {
    const enrichment = enrichmentByQuestionId.get(assignment.question_id);
    if (!enrichment) continue;
    const node = nodeById.get(assignment.tag_id);

    enrichment.taxonomy.push({
      facetKey: node?.facet_key ?? null,
      label: node?.label?.trim() || "Taxonomy tag",
      reviewStatus: assignment.review_status as TaxonomyReviewStatus,
      tagId: assignment.tag_id,
    });
  }

  return enrichmentByQuestionId;
}

function questionProjection(
  question: PreviewQuestionRow,
  bankQuestionId?: string,
) {
  return {
    answerSpec: normalizeAnswerSpec(question.answer_spec),
    ...(bankQuestionId ? { bankQuestionId } : {}),
    code: question.question_code,
    contentHtml: question.content_html,
    difficulty: question.difficulty_rating,
    options: normalizeQuestionOptions(question.options),
    questionId: question.id,
    solutionHtml: question.solution_html,
    status: question.status,
    title: question.title,
    type: question.question_type,
    updatedAt: question.updated_at,
    visibility: question.visibility,
  };
}

function bankProjection(
  access: NonNullable<
    Awaited<ReturnType<typeof getTeacherQuestionBankAccess>>
  >,
) {
  return {
    accessSource: access.accessSource,
    canManage: access.canManage,
    id: access.bank.id,
    name: access.bank.name,
    organizationRole: access.organizationRole,
    role: access.activeMemberRole,
    visibility: access.bank.visibility,
  };
}

export async function getTeacherQuestionPreviewDTO({
  bankId,
  bankQuestionId,
  profileId,
  supabase,
}: {
  bankId: string;
  bankQuestionId: string;
  profileId: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherQuestionPreviewDTO | null> {
  const access = await getTeacherQuestionBankAccess({
    bankId,
    profileId,
    supabase,
  });

  if (!access) return null;

  const { data, error } = await supabase
    .from("bank_questions")
    .select(
      "id, source_kind, question:questions(id, question_code, title, content_html, solution_html, answer_spec, options, question_type, difficulty_rating, status, source_kind, source_review_item_id, visibility, updated_at)",
    )
    .eq("bank_id", bankId)
    .eq("id", bankQuestionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const question = firstRelation(data.question) as PreviewQuestionRow | null;

  if (!question) return null;

  const enrichment = await loadPreviewEnrichment({
    questionId: question.id,
    supabase,
  });

  return {
    ...enrichment,
    bank: bankProjection(access),
    kind: "teacher-question-preview",
    provenance: {
      hasReviewLineage: Boolean(question.source_review_item_id),
      sourceKind: data.source_kind || question.source_kind || "unknown",
    },
    question: questionProjection(
      question,
      bankQuestionId,
    ) as TeacherQuestionPreviewDTO["question"],
  };
}

export async function getTeacherQuestionPreviewDTOs({
  bankId,
  bankQuestionIds,
  profileId,
  supabase,
}: {
  bankId: string;
  bankQuestionIds: string[];
  profileId: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherQuestionPreviewDTO[] | null> {
  const access = await getTeacherQuestionBankAccess({
    bankId,
    profileId,
    supabase,
  });

  if (!access) return null;

  const { data, error } = await supabase
    .from("bank_questions")
    .select(
      "id, source_kind, question:questions(id, question_code, title, content_html, solution_html, answer_spec, options, question_type, difficulty_rating, status, source_kind, source_review_item_id, visibility, updated_at)",
    )
    .eq("bank_id", bankId)
    .in("id", bankQuestionIds)
    .limit(25);

  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) !== bankQuestionIds.length) return null;

  const rowById = new Map((data ?? []).map((row) => [row.id, row]));
  const questionRows = bankQuestionIds.map((bankQuestionId) => {
    const row = rowById.get(bankQuestionId);
    const question = firstRelation(row?.question) as PreviewQuestionRow | null;
    return row && question ? { bankQuestionId, question, row } : null;
  });

  if (questionRows.some((row) => !row)) return null;

  const safeRows = questionRows.filter(
    (
      row,
    ): row is {
      bankQuestionId: string;
      question: PreviewQuestionRow;
      row: NonNullable<(typeof data)[number]>;
    } => Boolean(row),
  );
  const enrichmentByQuestionId = await loadPreviewEnrichmentBatch({
    questionIds: safeRows.map(({ question }) => question.id),
    supabase,
  });

  return safeRows.map(({ bankQuestionId, question, row }) => ({
    ...(enrichmentByQuestionId.get(question.id) ?? {
      assets: [],
      taxonomy: [],
    }),
    bank: bankProjection(access),
    kind: "teacher-question-preview",
    provenance: {
      hasReviewLineage: Boolean(question.source_review_item_id),
      sourceKind: row.source_kind || question.source_kind || "unknown",
    },
    question: questionProjection(
      question,
      bankQuestionId,
    ) as TeacherQuestionPreviewDTO["question"],
  }));
}

export async function getReviewPreviewDTO({
  bankId,
  profileId,
  reviewItemId,
  supabase,
}: {
  bankId: string;
  profileId: string;
  reviewItemId: string;
  supabase: SupabaseServerClient;
}): Promise<ReviewPreviewDTO | null> {
  const access = await getTeacherQuestionBankAccess({
    bankId,
    profileId,
    supabase,
  });

  if (!access) return null;

  const reviewResult = await supabase
    .from("review_draft_items")
    .select(
      "id, created_question_id, status, target_bank_id, validation_warnings",
    )
    .eq("id", reviewItemId)
    .eq("target_bank_id", bankId)
    .eq("item_kind", "question")
    .maybeSingle();
  const reviewItem = reviewResult.data as {
    created_question_id: string | null;
    id: string;
    status: string;
    target_bank_id: string | null;
    validation_warnings: unknown;
  } | null;

  if (reviewResult.error) throw new Error(reviewResult.error.message);
  if (!reviewItem?.created_question_id) return null;

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select(
      "id, question_code, title, content_html, solution_html, answer_spec, options, question_type, difficulty_rating, status, source_kind, source_review_item_id, visibility, updated_at",
    )
    .eq("id", reviewItem.created_question_id)
    .eq("owner_bank_id", bankId)
    .maybeSingle();

  if (questionError) throw new Error(questionError.message);
  if (!question) return null;

  const typedQuestion = question as PreviewQuestionRow;
  const enrichment = await loadPreviewEnrichment({
    questionId: typedQuestion.id,
    supabase,
  });
  const lineageLinked =
    typedQuestion.source_review_item_id === reviewItem.id;

  return {
    ...enrichment,
    bank: bankProjection(access),
    kind: "review-preview",
    provenance: {
      hasReviewLineage: lineageLinked,
      sourceAccess: "not_requested",
      sourceKind: typedQuestion.source_kind || "unknown",
    },
    question: questionProjection(
      typedQuestion,
    ) as ReviewPreviewDTO["question"],
    review: {
      id: reviewItem.id,
      lineageStatus: lineageLinked ? "linked" : "missing",
      status: reviewItem.status,
      warnings: safeWarningMessages(reviewItem.validation_warnings),
    },
  };
}

export async function getReviewPreviewDTOs({
  bankId,
  profileId,
  reviewItemIds,
  supabase,
}: {
  bankId: string;
  profileId: string;
  reviewItemIds: string[];
  supabase: SupabaseServerClient;
}): Promise<ReviewPreviewDTO[] | null> {
  const access = await getTeacherQuestionBankAccess({
    bankId,
    profileId,
    supabase,
  });

  if (!access) return null;

  const reviewResult = await supabase
    .from("review_draft_items")
    .select(
      "id, created_question_id, status, target_bank_id, validation_warnings",
    )
    .in("id", reviewItemIds)
    .eq("target_bank_id", bankId)
    .eq("item_kind", "question")
    .limit(25);

  if (reviewResult.error) throw new Error(reviewResult.error.message);
  if ((reviewResult.data?.length ?? 0) !== reviewItemIds.length) return null;

  const reviewRows = (reviewResult.data ?? []) as ReviewPreviewRow[];
  const reviewById = new Map(
    reviewRows.map((reviewItem) => [reviewItem.id, reviewItem]),
  );
  const questionIds = reviewItemIds
    .map((reviewItemId) => reviewById.get(reviewItemId)?.created_question_id)
    .filter((id): id is string => Boolean(id));

  if (questionIds.length !== reviewItemIds.length) return null;

  const { data: questions, error: questionError } = await supabase
    .from("questions")
    .select(
      "id, question_code, title, content_html, solution_html, answer_spec, options, question_type, difficulty_rating, status, source_kind, source_review_item_id, visibility, updated_at",
    )
    .eq("owner_bank_id", bankId)
    .in("id", questionIds)
    .limit(25);

  if (questionError) throw new Error(questionError.message);
  if ((questions?.length ?? 0) !== questionIds.length) return null;

  const questionById = new Map(
    (questions ?? []).map((question) => [
      question.id,
      question as PreviewQuestionRow,
    ]),
  );
  const enrichmentByQuestionId = await loadPreviewEnrichmentBatch({
    questionIds,
    supabase,
  });

  const previews: Array<ReviewPreviewDTO | null> = reviewItemIds.map((reviewItemId) => {
    const reviewItem = reviewById.get(reviewItemId);
    const question = reviewItem?.created_question_id
      ? questionById.get(reviewItem.created_question_id)
      : null;

    if (
      !reviewItem ||
      !question ||
      question.source_review_item_id !== reviewItem.id
    ) {
      return null;
    }

    return {
      ...(enrichmentByQuestionId.get(question.id) ?? {
        assets: [],
        taxonomy: [],
      }),
      bank: bankProjection(access),
      kind: "review-preview" as const,
      provenance: {
        hasReviewLineage: true,
        sourceAccess: "not_requested" as const,
        sourceKind: question.source_kind || "unknown",
      },
      question: questionProjection(question) as ReviewPreviewDTO["question"],
      review: {
        id: reviewItem.id,
        lineageStatus: "linked" as const,
        status: reviewItem.status,
        warnings: safeWarningMessages(reviewItem.validation_warnings),
      },
    } satisfies ReviewPreviewDTO;
  });

  if (previews.some((preview) => !preview)) return null;

  return previews.filter(
    (preview): preview is ReviewPreviewDTO => Boolean(preview),
  );
}
