import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  BankMemberRole,
  Json,
  Question,
  QuestionBank,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PublishSourceType = "bank" | "blueprint" | "package";
export type PublishDifficultyFilter = "all" | "foundational" | "practice" | "challenge";

export type PublishBlueprintLineage = {
  blueprintId: string | null;
  blueprintTitle: string | null;
  reviewItemId: string | null;
  reviewItemStatus: string | null;
};

export type PublishableBankQuestion = {
  addedAt: string;
  bankId: string;
  bankQuestionId: string;
  bankQuestionSourceKind: string;
  bankQuestionStatus: string;
  blueprintLineage: PublishBlueprintLineage | null;
  difficultyBucket: PublishDifficultyFilter;
  difficultyLabel: string;
  isAssignmentReady: boolean;
  isBlueprintApprovedContent: boolean;
  question: Pick<
    Question,
    | "deleted_at"
    | "difficulty_rating"
    | "id"
    | "owner_bank_id"
    | "published_at"
    | "question_code"
    | "question_type"
    | "source"
    | "source_kind"
    | "source_review_item_id"
    | "status"
    | "title"
    | "visibility"
  > | null;
  readinessReasons: string[];
};

export type PublishableQuestionFilters = {
  blueprintId?: string;
  difficulty?: PublishDifficultyFilter;
  query?: string;
  questionType?: string;
  source?: PublishSourceType;
};

export type PublishContentSummary = {
  assignmentReadyCount: number;
  bankQuestionCount: number;
  blueprintApprovedCount: number;
  blueprintSources: Array<{
    blueprintId: string | null;
    blueprintTitle: string;
    count: number;
  }>;
  packageReadyCount: number;
  questionTypeCounts: Array<{ count: number; questionType: string }>;
};

type BankQuestionRow = {
  added_at: string;
  bank_id: string;
  id: string;
  metadata: unknown;
  question: PublishableBankQuestion["question"] | PublishableBankQuestion["question"][];
  source_kind: string;
  status: string;
};

type ReviewDraftItemRow = {
  created_question_id: string | null;
  draft_payload: unknown;
  id: string;
  status: string;
  target_bank_id: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function singleJoin<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function normalizePublishSourceType(value: unknown): PublishSourceType {
  return value === "blueprint" || value === "package" ? value : "bank";
}

export function normalizePublishDifficultyFilter(
  value: unknown,
): PublishDifficultyFilter {
  if (
    value === "foundational" ||
    value === "practice" ||
    value === "challenge"
  ) {
    return value;
  }

  return "all";
}

export function difficultyBucket(
  difficultyRating: number | null | undefined,
): PublishDifficultyFilter {
  if (typeof difficultyRating !== "number") return "all";
  if (difficultyRating < 400) return "foundational";
  if (difficultyRating < 700) return "practice";
  return "challenge";
}

export function difficultyLabel(difficultyRating: number | null | undefined) {
  if (typeof difficultyRating !== "number") return "Difficulty not set";
  if (difficultyRating < 400) return `Foundational ${difficultyRating}`;
  if (difficultyRating < 700) return `Practice ${difficultyRating}`;
  return `Challenge ${difficultyRating}`;
}

function assignmentReadinessReasons({
  bankId,
  bankQuestionStatus,
  question,
}: {
  bankId: string;
  bankQuestionStatus: string;
  question: PublishableBankQuestion["question"];
}) {
  const reasons: string[] = [];

  if (bankQuestionStatus !== "active") {
    reasons.push("Library question is not active.");
  }

  if (!question) {
    reasons.push("Question row is missing.");
    return reasons;
  }

  if (question.deleted_at) {
    reasons.push("Question has been deleted.");
  }

  if (question.status === "draft") {
    reasons.push("Question is still a draft.");
  }

  if (question.status === "archived" || question.status === "deprecated") {
    reasons.push("Question is archived or deprecated.");
  }

  if (question.owner_bank_id && question.owner_bank_id !== bankId) {
    reasons.push("Question belongs to a different source Library.");
  }

  return reasons;
}

function extractBlueprintLineage({
  question,
  reviewItem,
}: {
  question: PublishableBankQuestion["question"];
  reviewItem: ReviewDraftItemRow | null;
}): PublishBlueprintLineage | null {
  const payload = asRecord(reviewItem?.draft_payload);
  const nestedBlueprint = asRecord(payload.blueprint);
  const sourceRecord = asRecord(payload.sourceMetadata);
  const blueprintId =
    stringValue(payload.blueprintId) ??
    stringValue(payload.questionBlueprintId) ??
    stringValue(payload.sourceBlueprintId) ??
    stringValue(sourceRecord.blueprintId) ??
    stringValue(nestedBlueprint.blueprintId) ??
    stringValue(nestedBlueprint.id);
  const blueprintTitle =
    stringValue(payload.blueprintTitle) ??
    stringValue(payload.questionBlueprintTitle) ??
    stringValue(sourceRecord.blueprintTitle) ??
    stringValue(nestedBlueprint.title);
  const payloadSource = stringValue(payload.source);
  const sourceKind = question?.source_kind ?? null;
  const source = question?.source ?? null;
  const hasBlueprintSignal =
    Boolean(blueprintId) ||
    sourceKind === "blueprint_generation" ||
    source?.startsWith("blueprint_generation:") ||
    payloadSource === "blueprint_generation";

  if (!hasBlueprintSignal) {
    return null;
  }

  return {
    blueprintId,
    blueprintTitle,
    reviewItemId: reviewItem?.id ?? question?.source_review_item_id ?? null,
    reviewItemStatus: reviewItem?.status ?? null,
  };
}

function matchesQuery(question: PublishableBankQuestion, query: string) {
  if (!query) return true;
  const haystack = [
    question.question?.title,
    question.question?.question_code,
    question.question?.question_type,
    question.blueprintLineage?.blueprintTitle,
    question.blueprintLineage?.blueprintId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export function filterPublishableQuestions(
  questions: PublishableBankQuestion[],
  filters: PublishableQuestionFilters,
) {
  const source = filters.source ?? "bank";
  const difficulty = filters.difficulty ?? "all";
  const query = filters.query?.trim() ?? "";
  const questionType = filters.questionType?.trim() ?? "";
  const blueprintId = filters.blueprintId?.trim() ?? "";

  if (source === "package") {
    return [];
  }

  return questions.filter((question) => {
    if (!question.isAssignmentReady) return false;
    if (source === "blueprint" && !question.isBlueprintApprovedContent) {
      return false;
    }
    if (
      blueprintId &&
      question.blueprintLineage?.blueprintId !== blueprintId
    ) {
      return false;
    }
    if (
      difficulty !== "all" &&
      question.difficultyBucket !== difficulty
    ) {
      return false;
    }
    if (
      questionType &&
      question.question?.question_type !== questionType
    ) {
      return false;
    }

    return matchesQuery(question, query);
  });
}

export function summarizePublishableQuestions(
  questions: PublishableBankQuestion[],
): PublishContentSummary {
  const assignmentReady = questions.filter((question) => question.isAssignmentReady);
  const blueprintCount = new Map<string, { blueprintId: string | null; blueprintTitle: string; count: number }>();
  const questionTypeCounts = new Map<string, number>();

  for (const question of assignmentReady) {
    if (question.question?.question_type) {
      questionTypeCounts.set(
        question.question.question_type,
        (questionTypeCounts.get(question.question.question_type) ?? 0) + 1,
      );
    }

    if (question.isBlueprintApprovedContent) {
      const key = question.blueprintLineage?.blueprintId ?? "unknown-blueprint";
      const current =
        blueprintCount.get(key) ?? {
          blueprintId: question.blueprintLineage?.blueprintId ?? null,
          blueprintTitle:
            question.blueprintLineage?.blueprintTitle ??
            "Approved Blueprint-generated questions",
          count: 0,
        };

      current.count += 1;
      blueprintCount.set(key, current);
    }
  }

  return {
    assignmentReadyCount: assignmentReady.length,
    bankQuestionCount: assignmentReady.length,
    blueprintApprovedCount: assignmentReady.filter(
      (question) => question.isBlueprintApprovedContent,
    ).length,
    blueprintSources: Array.from(blueprintCount.values()).sort((a, b) =>
      a.blueprintTitle.localeCompare(b.blueprintTitle),
    ),
    packageReadyCount: 0,
    questionTypeCounts: Array.from(questionTypeCounts.entries())
      .map(([questionType, count]) => ({ count, questionType }))
      .sort((a, b) => a.questionType.localeCompare(b.questionType)),
  };
}

async function loadReviewItems({
  bankId,
  questionIds,
  sourceReviewItemIds,
  supabase,
}: {
  bankId: string;
  questionIds: string[];
  sourceReviewItemIds: string[];
  supabase: SupabaseServerClient;
}) {
  const reviewItems: ReviewDraftItemRow[] = [];

  if (questionIds.length) {
    const { data, error } = await supabase
      .from("review_draft_items")
      .select("id, created_question_id, status, target_bank_id, draft_payload")
      .eq("item_kind", "question")
      .in("created_question_id", questionIds)
      .limit(400);

    if (error) {
      throw new Error(error.message);
    }

    reviewItems.push(
      ...((data ?? []) as ReviewDraftItemRow[]).filter(
        (item) => !item.target_bank_id || item.target_bank_id === bankId,
      ),
    );
  }

  if (sourceReviewItemIds.length) {
    const { data, error } = await supabase
      .from("review_draft_items")
      .select("id, created_question_id, status, target_bank_id, draft_payload")
      .eq("item_kind", "question")
      .in("id", sourceReviewItemIds)
      .limit(400);

    if (error) {
      throw new Error(error.message);
    }

    reviewItems.push(
      ...((data ?? []) as ReviewDraftItemRow[]).filter(
        (item) => !item.target_bank_id || item.target_bank_id === bankId,
      ),
    );
  }

  const byQuestionId = new Map<string, ReviewDraftItemRow>();
  const byId = new Map<string, ReviewDraftItemRow>();

  for (const item of reviewItems) {
    byId.set(item.id, item);
    if (item.created_question_id) {
      byQuestionId.set(item.created_question_id, item);
    }
  }

  return { byId, byQuestionId };
}

export async function listPublishableBankQuestions({
  bankId,
  supabase,
}: {
  bankId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("bank_questions")
    .select(
      "id, bank_id, status, source_kind, added_at, metadata, question:questions(id, question_code, title, question_type, difficulty_rating, status, source, source_kind, source_review_item_id, owner_bank_id, visibility, published_at, deleted_at)",
    )
    .eq("bank_id", bankId)
    .eq("status", "active")
    .order("added_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as BankQuestionRow[];
  const questionIds = rows
    .map((row) => singleJoin(row.question)?.id)
    .filter((questionId): questionId is string => Boolean(questionId));
  const sourceReviewItemIds = Array.from(
    new Set(
      rows
        .map((row) => singleJoin(row.question)?.source_review_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const reviewItems = await loadReviewItems({
    bankId,
    questionIds,
    sourceReviewItemIds,
    supabase,
  });

  return rows.map((row) => {
    const question = singleJoin(row.question);
    const reviewItem =
      (question?.source_review_item_id
        ? reviewItems.byId.get(question.source_review_item_id)
        : null) ??
      (question?.id ? reviewItems.byQuestionId.get(question.id) : null) ??
      null;
    const blueprintLineage = extractBlueprintLineage({ question, reviewItem });
    const readinessReasons = assignmentReadinessReasons({
      bankId,
      bankQuestionStatus: row.status,
      question,
    });

    return {
      addedAt: row.added_at,
      bankId: row.bank_id,
      bankQuestionId: row.id,
      bankQuestionSourceKind: row.source_kind,
      bankQuestionStatus: row.status,
      blueprintLineage,
      difficultyBucket: difficultyBucket(question?.difficulty_rating),
      difficultyLabel: difficultyLabel(question?.difficulty_rating),
      isAssignmentReady: readinessReasons.length === 0,
      isBlueprintApprovedContent: Boolean(
        blueprintLineage && readinessReasons.length === 0,
      ),
      question,
      readinessReasons,
    } satisfies PublishableBankQuestion;
  });
}

export function verifyPublishableSelection({
  questions,
  selectedBankQuestionIds,
}: {
  questions: PublishableBankQuestion[];
  selectedBankQuestionIds: string[];
}) {
  const readyById = new Map(
    questions
      .filter((question) => question.isAssignmentReady)
      .map((question) => [question.bankQuestionId, question]),
  );
  const missing = selectedBankQuestionIds.filter((id) => !readyById.has(id));

  if (missing.length) {
    throw new Error(
      "Some selected questions are no longer assignment-ready. Reload Assignments and choose reviewed Library questions again.",
    );
  }

  return selectedBankQuestionIds.map((id) => readyById.get(id)!);
}

export function buildPublishAssignmentSourceSummary({
  bank,
  mode,
  selectedQuestions,
  source,
}: {
  bank: Pick<QuestionBank, "id" | "name" | "visibility">;
  mode: "assigned" | "draft";
  selectedQuestions: PublishableBankQuestion[];
  source: PublishSourceType;
}): Json {
  const blueprintSources = summarizePublishableQuestions(selectedQuestions).blueprintSources;
  const questionTypes = Array.from(
    new Set(
      selectedQuestions
        .map((question) => question.question?.question_type)
        .filter(Boolean)
        .map((questionType) => String(questionType)),
    ),
  ).sort();

  return {
    assignmentVisibility: "assignment_only",
    bankId: bank.id,
    bankName: bank.name,
    bankVisibility: bank.visibility,
    blueprintApprovedItemCount: selectedQuestions.filter(
      (question) => question.isBlueprintApprovedContent,
    ).length,
    blueprintSources,
    exposesBlueprintInternalsToStudents: false,
    exposesProviderMetadataToStudents: false,
    exposesSourceBankToStudents: false,
    itemCount: selectedQuestions.length,
    mode,
    packageReady: false,
    publishCenterVersion: "v2",
    questionTypes,
    selectedBankQuestionIds: selectedQuestions.map(
      (question) => question.bankQuestionId,
    ),
    sourceType:
      source === "blueprint" && blueprintSources.length
        ? "blueprint_approved_bank_questions"
        : "question_bank",
    studentPreview: {
      hidesAnswers: true,
      hidesBlueprintInternals: true,
      hidesProviderMetadata: true,
      hidesSourceBank: true,
    },
  };
}

export function canPublishFromBank(role: BankMemberRole | null | undefined) {
  return role === "owner" || role === "editor";
}
