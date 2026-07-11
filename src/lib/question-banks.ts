import "server-only";

import {
  questionBoundaryFindingsForQuestion,
  type QuestionBoundaryGuardFinding,
} from "@/lib/ai-pdf-import/question-boundary-guard";
import { createClient } from "@/lib/supabase/server";
import type {
  BankMember,
  BankMemberRole,
  BankShareCode,
  QuestionTaxonomyAssignment,
  Profile,
  Question,
  QuestionBank,
  QuestionBankStatus,
  QuestionBankVisibility,
  TaxonomyNode,
  TaxonomyReviewStatus,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TeacherQuestionBankSummary = QuestionBank & {
  activeMemberCount: number;
  assignmentReadyCount: number;
  importBatchCount: number;
  membershipRole: BankMemberRole;
  questionCount: number;
  reviewDraftCount: number;
};

export type TeacherQuestionBankDetail = {
  activeMemberCount: number;
  assignmentReadyCount: number;
  bank: QuestionBank;
  currentUserRole: BankMemberRole | null;
  importBatchCount: number;
  members: BankMemberWithProfile[];
  questionCount: number;
  reviewDraftCount: number;
};

export type BankMemberWithProfile = BankMember & {
  profile: Pick<
    Profile,
    "display_name" | "email" | "full_name" | "id" | "username"
  > | null;
};

export type BankShareCodeSummary = Pick<
  BankShareCode,
  | "id"
  | "bank_id"
  | "code_hint"
  | "created_at"
  | "expires_at"
  | "last_used_at"
  | "role_granted"
  | "status"
  | "updated_at"
>;

export type BankImportBatchSummary = {
  created_at: string;
  id: string;
  source_type: string;
  status: string;
  summary: unknown;
  target_bank_id: string | null;
};

export type BankReviewDraftQuestion = Pick<
  Question,
  | "created_at"
  | "answer_spec"
  | "content_html"
  | "content_source"
  | "content_source_format"
  | "difficulty_rating"
  | "id"
  | "owner_bank_id"
  | "options"
  | "published_at"
  | "question_code"
  | "question_type"
  | "solution_html"
  | "solution_source"
  | "solution_source_format"
  | "source"
  | "source_kind"
  | "source_review_item_id"
  | "status"
  | "title"
  | "visibility"
> & {
  reviewItemId: string | null;
  reviewItemPayload: unknown;
  reviewItemStatus:
    | "pending_review"
    | "approved"
    | "rejected"
    | "needs_more_evidence"
    | "archived"
    | null;
  tagIds: string[];
  tagSummaries: BankQuestionTaxonomySummary[];
  boundaryFindings: QuestionBoundaryGuardFinding[];
  warningCount: number;
  warningMessages: string[];
};

export type BankApprovedQuestion = {
  added_at: string;
  bank_question_id: string;
  metadata: unknown;
  question: Pick<
    Question,
    | "difficulty_rating"
    | "id"
    | "question_code"
    | "question_type"
    | "source"
    | "source_kind"
    | "source_review_item_id"
    | "status"
    | "title"
    | "visibility"
    | "published_at"
  > | null;
  source_kind: string;
  status: string;
  tagSummaries: BankQuestionTaxonomySummary[];
};

export type BankQuestionTaxonomySummary = Pick<
  QuestionTaxonomyAssignment,
  "review_status" | "tag_id"
> & {
  facet_key: string | null;
  label: string | null;
};

export class QuestionBankSchemaMissingError extends Error {
  constructor(message = "Question Bank tables are not available yet.") {
    super(message);
    this.name = "QuestionBankSchemaMissingError";
  }
}

function isMissingQuestionBankSchemaError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("question_banks") ||
    message.includes("bank_members") ||
    message.includes("bank_questions") ||
    message.includes("bank_share_codes")
  ) && (message.includes("does not exist") || message.includes("schema cache"));
}

function assertQuestionBankSchema(error: { message?: string } | null) {
  if (isMissingQuestionBankSchemaError(error)) {
    throw new QuestionBankSchemaMissingError();
  }
}

function countByBankId(rows: Array<{ bank_id: string }> | null | undefined) {
  const counts = new Map<string, number>();

  for (const row of rows ?? []) {
    counts.set(row.bank_id, (counts.get(row.bank_id) ?? 0) + 1);
  }

  return counts;
}

function countByNullableBankId(
  rows: Array<{ bank_id?: string | null; owner_bank_id?: string | null; target_bank_id?: string | null }> | null | undefined,
) {
  const counts = new Map<string, number>();

  for (const row of rows ?? []) {
    const bankId = row.bank_id ?? row.owner_bank_id ?? row.target_bank_id;

    if (!bankId) {
      continue;
    }

    counts.set(bankId, (counts.get(bankId) ?? 0) + 1);
  }

  return counts;
}

export async function listTeacherQuestionBanks({
  profileId,
  supabase,
}: {
  profileId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: memberships, error: membershipError } = await supabase
    .from("bank_members")
    .select("bank_id, role, status")
    .eq("user_id", profileId)
    .eq("status", "active");

  assertQuestionBankSchema(membershipError);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const membershipByBankId = new Map(
    (memberships ?? []).map((membership) => [membership.bank_id, membership]),
  );
  const bankIds = Array.from(membershipByBankId.keys());

  if (!bankIds.length) {
    return [];
  }

  const { data: banks, error: banksError } = await supabase
    .from("question_banks")
    .select(
      "id, organization_id, owner_id, name, description, visibility, status, metadata, created_by, updated_by, created_at, updated_at",
    )
    .in("id", bankIds)
    .order("updated_at", { ascending: false });

  assertQuestionBankSchema(banksError);

  if (banksError) {
    throw new Error(banksError.message);
  }

  const { data: bankQuestionRows, error: questionError } = await supabase
    .from("bank_questions")
    .select("bank_id")
    .in("bank_id", bankIds)
    .eq("status", "active");

  assertQuestionBankSchema(questionError);

  if (questionError) {
    throw new Error(questionError.message);
  }

  const { data: memberRows, error: memberCountError } = await supabase
    .from("bank_members")
    .select("bank_id")
    .in("bank_id", bankIds)
    .eq("status", "active");

  assertQuestionBankSchema(memberCountError);

  if (memberCountError) {
    throw new Error(memberCountError.message);
  }

  const { data: reviewDraftRows, error: reviewDraftError } = await supabase
    .from("questions")
    .select("owner_bank_id")
    .in("owner_bank_id", bankIds)
    .eq("status", "draft");

  assertQuestionBankSchema(reviewDraftError);

  if (reviewDraftError) {
    throw new Error(reviewDraftError.message);
  }

  const { data: importRows, error: importError } = await supabase
    .from("import_batches")
    .select("target_bank_id")
    .in("target_bank_id", bankIds);

  assertQuestionBankSchema(importError);

  if (importError) {
    throw new Error(importError.message);
  }

  const questionCounts = countByBankId(bankQuestionRows);
  const memberCounts = countByBankId(memberRows);
  const reviewDraftCounts = countByNullableBankId(reviewDraftRows);
  const importCounts = countByNullableBankId(importRows);

  return (banks ?? []).map((bank) => {
    const membership = membershipByBankId.get(bank.id);

    return {
      ...bank,
      activeMemberCount: memberCounts.get(bank.id) ?? 0,
      assignmentReadyCount: questionCounts.get(bank.id) ?? 0,
      importBatchCount: importCounts.get(bank.id) ?? 0,
      membershipRole: membership?.role ?? "viewer",
      questionCount: questionCounts.get(bank.id) ?? 0,
      reviewDraftCount: reviewDraftCounts.get(bank.id) ?? 0,
    } satisfies TeacherQuestionBankSummary;
  });
}

export async function getTeacherQuestionBankDetail({
  bankId,
  profileId,
  supabase,
}: {
  bankId: string;
  profileId?: string;
  supabase: SupabaseServerClient;
}) {
  const { data: bank, error: bankError } = await supabase
    .from("question_banks")
    .select(
      "id, organization_id, owner_id, name, description, visibility, status, metadata, created_by, updated_by, created_at, updated_at",
    )
    .eq("id", bankId)
    .maybeSingle();

  assertQuestionBankSchema(bankError);

  if (bankError) {
    throw new Error(bankError.message);
  }

  if (!bank) {
    return null;
  }

  const { data: members, error: memberError } = await supabase
    .from("bank_members")
    .select("id, bank_id, user_id, role, status, invited_by, joined_at, created_at, updated_at")
    .eq("bank_id", bankId)
    .order("created_at", { ascending: true });

  assertQuestionBankSchema(memberError);

  if (memberError) {
    throw new Error(memberError.message);
  }

  const { data: bankQuestionRows, error: questionError } = await supabase
    .from("bank_questions")
    .select("bank_id")
    .eq("bank_id", bankId)
    .eq("status", "active");

  assertQuestionBankSchema(questionError);

  if (questionError) {
    throw new Error(questionError.message);
  }

  const { data: reviewDraftRows, error: reviewDraftError } = await supabase
    .from("questions")
    .select("id")
    .eq("owner_bank_id", bankId)
    .eq("status", "draft");

  assertQuestionBankSchema(reviewDraftError);

  if (reviewDraftError) {
    throw new Error(reviewDraftError.message);
  }

  const { data: importRows, error: importError } = await supabase
    .from("import_batches")
    .select("id")
    .eq("target_bank_id", bankId);

  assertQuestionBankSchema(importError);

  if (importError) {
    throw new Error(importError.message);
  }

  const userIds = Array.from(new Set((members ?? []).map((member) => member.user_id)));
  let profilesById = new Map<string, BankMemberWithProfile["profile"]>();

  if (userIds.length) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, email, full_name, username")
      .in("id", userIds);

    if (profileError) {
      throw new Error(profileError.message);
    }

    profilesById = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile]),
    );
  }

  const membersWithProfiles = (members ?? []).map((member) => ({
    ...member,
    profile: profilesById.get(member.user_id) ?? null,
  }));

  return {
    activeMemberCount:
      members?.filter((member) => member.status === "active").length ?? 0,
    assignmentReadyCount: bankQuestionRows?.length ?? 0,
    bank,
    currentUserRole:
      members?.find((member) => member.user_id === profileId)?.role ?? null,
    importBatchCount: importRows?.length ?? 0,
    members: membersWithProfiles,
    questionCount: bankQuestionRows?.length ?? 0,
    reviewDraftCount: reviewDraftRows?.length ?? 0,
  } satisfies TeacherQuestionBankDetail;
}

export async function listBankShareCodes({
  bankId,
  supabase,
}: {
  bankId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("bank_share_codes")
    .select(
      "id, bank_id, code_hint, role_granted, status, expires_at, last_used_at, created_at, updated_at",
    )
    .eq("bank_id", bankId)
    .order("created_at", { ascending: false });

  assertQuestionBankSchema(error);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listBankImportBatches({
  bankId,
  supabase,
}: {
  bankId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, source_type, status, summary, target_bank_id, created_at")
    .eq("target_bank_id", bankId)
    .order("created_at", { ascending: false })
    .limit(25);

  assertQuestionBankSchema(error);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as BankImportBatchSummary[];
}

export async function listBankReviewDraftQuestions({
  bankId,
  supabase,
}: {
  bankId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: questions, error } = await supabase
    .from("questions")
    .select(
      "id, question_code, title, question_type, difficulty_rating, status, source, source_kind, source_review_item_id, owner_bank_id, visibility, published_at, created_at, answer_spec, content_html, content_source, content_source_format, options, solution_html, solution_source, solution_source_format",
    )
    .eq("owner_bank_id", bankId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(50);

  assertQuestionBankSchema(error);

  if (error) {
    throw new Error(error.message);
  }

  const questionIds = (questions ?? []).map((question) => question.id);
  const [tagResult, importItemResult] = questionIds.length
    ? await Promise.all([
        supabase
          .from("question_taxonomy_assignments")
          .select("question_id, tag_id, review_status")
          .in("question_id", questionIds)
          .limit(300),
        supabase
          .from("import_batch_items")
          .select("batch_id, created_question_id, validation_errors")
          .in("created_question_id", questionIds)
          .limit(100),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (tagResult.error) {
    throw new Error(tagResult.error.message);
  }

  if (importItemResult.error) {
    throw new Error(importItemResult.error.message);
  }

  const importBatchIdByQuestionId = new Map<string, string>();
  for (const row of importItemResult.data ?? []) {
    if (row.created_question_id && row.batch_id) {
      importBatchIdByQuestionId.set(row.created_question_id, row.batch_id);
    }
  }
  const importBatchIds = Array.from(new Set(importBatchIdByQuestionId.values()));
  const { data: importBatches, error: importBatchesError } = importBatchIds.length
    ? await supabase
        .from("import_batches")
        .select("id, summary")
        .in("id", importBatchIds)
        .limit(100)
    : { data: [], error: null };

  if (importBatchesError) {
    throw new Error(importBatchesError.message);
  }

  const questionBoundaryPlanByBatchId = new Map<string, unknown>(
    (importBatches ?? []).map((batch) => {
      const summary =
        batch.summary && typeof batch.summary === "object"
          ? (batch.summary as Record<string, unknown>)
          : {};
      const aiPdfImport =
        summary.aiPdfImport && typeof summary.aiPdfImport === "object"
          ? (summary.aiPdfImport as Record<string, unknown>)
          : {};

      return [batch.id, aiPdfImport.questionBoundaryGuardPlan];
    }),
  );

  const sourceReviewItemIds = Array.from(
    new Set(
      (questions ?? [])
        .map((question) => question.source_review_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const reviewItems: Array<{
    created_question_id: string | null;
    draft_payload: unknown;
    id: string;
    status: BankReviewDraftQuestion["reviewItemStatus"];
    target_bank_id: string | null;
    validation_warnings?: unknown;
  }> = [];

  if (questionIds.length) {
    const { data: itemsByQuestion, error: itemsByQuestionError } =
      await supabase
        .from("review_draft_items")
        .select("id, created_question_id, status, target_bank_id, draft_payload, validation_warnings")
        .eq("item_kind", "question")
        .in("created_question_id", questionIds)
        .limit(200);

    if (itemsByQuestionError) {
      throw new Error(itemsByQuestionError.message);
    }

    reviewItems.push(
      ...((itemsByQuestion ?? []) as typeof reviewItems).filter(
        (item) => !item.target_bank_id || item.target_bank_id === bankId,
      ),
    );
  }

  if (sourceReviewItemIds.length) {
    const { data: itemsById, error: itemsByIdError } = await supabase
      .from("review_draft_items")
      .select("id, created_question_id, status, target_bank_id, draft_payload, validation_warnings")
      .eq("item_kind", "question")
      .in("id", sourceReviewItemIds)
      .limit(200);

    if (itemsByIdError) {
      throw new Error(itemsByIdError.message);
    }

    reviewItems.push(
      ...((itemsById ?? []) as typeof reviewItems).filter(
        (item) => !item.target_bank_id || item.target_bank_id === bankId,
      ),
    );
  }

  const reviewItemByQuestionId = new Map<
    string,
    (typeof reviewItems)[number]
  >();
  const reviewItemById = new Map<string, (typeof reviewItems)[number]>();

  for (const item of reviewItems) {
    reviewItemById.set(item.id, item);
    if (item.created_question_id) {
      reviewItemByQuestionId.set(item.created_question_id, item);
    }
  }

  const tagIds = Array.from(
    new Set((tagResult.data ?? []).map((row) => row.tag_id).filter(Boolean)),
  );
  const { data: tagNodes, error: tagNodesError } = tagIds.length
    ? await supabase
        .from("taxonomy_nodes")
        .select("tag_id, label, facet_key")
        .in("tag_id", tagIds)
        .limit(300)
    : { data: [], error: null };

  if (tagNodesError) {
    throw new Error(tagNodesError.message);
  }

  const tagNodeById = new Map(
    (tagNodes ?? []).map((tag) => [tag.tag_id, tag]),
  );
  const tagsByQuestionId = new Map<string, string[]>();
  const tagSummariesByQuestionId = new Map<
    string,
    BankQuestionTaxonomySummary[]
  >();
  for (const row of tagResult.data ?? []) {
    const tags = tagsByQuestionId.get(row.question_id) ?? [];
    tags.push(row.tag_id);
    tagsByQuestionId.set(row.question_id, tags);

    const node = tagNodeById.get(row.tag_id);
    const summaries = tagSummariesByQuestionId.get(row.question_id) ?? [];
    summaries.push({
      facet_key: node?.facet_key ?? null,
      label: node?.label ?? null,
      review_status: row.review_status as TaxonomyReviewStatus,
      tag_id: row.tag_id,
    });
    tagSummariesByQuestionId.set(row.question_id, summaries);
  }

  const warningCountByQuestionId = new Map<string, number>();
  const warningMessagesByQuestionId = new Map<string, string[]>();
  for (const row of importItemResult.data ?? []) {
    if (!row.created_question_id) {
      continue;
    }

    const warnings = Array.isArray(row.validation_errors)
      ? row.validation_errors.length
      : 0;
    warningCountByQuestionId.set(row.created_question_id, warnings);
    warningMessagesByQuestionId.set(
      row.created_question_id,
      Array.isArray(row.validation_errors)
        ? row.validation_errors
            .map((warning) =>
              typeof warning === "string"
                ? warning.trim()
                : JSON.stringify(warning),
            )
            .filter(Boolean)
        : [],
    );
  }

  for (const item of reviewItems) {
    if (!item.created_question_id || !Array.isArray(item.validation_warnings)) {
      continue;
    }

    const current = warningMessagesByQuestionId.get(item.created_question_id) ?? [];
    const reviewWarnings = item.validation_warnings
      .map((warning) =>
        typeof warning === "string" ? warning.trim() : JSON.stringify(warning),
      )
      .filter(Boolean);
    const merged = Array.from(new Set([...current, ...reviewWarnings]));

    warningMessagesByQuestionId.set(item.created_question_id, merged);
    warningCountByQuestionId.set(item.created_question_id, merged.length);
  }

  return (questions ?? [])
    .map((question) => {
      const reviewItem =
        (question.source_review_item_id
          ? reviewItemById.get(question.source_review_item_id)
          : null) ?? reviewItemByQuestionId.get(question.id);

      return {
        ...question,
        boundaryFindings: questionBoundaryFindingsForQuestion({
          plan: questionBoundaryPlanByBatchId.get(
            importBatchIdByQuestionId.get(question.id) ?? "",
          ),
          questionCode: question.question_code,
          questionId: question.id,
        }),
        reviewItemId: reviewItem?.id ?? null,
        reviewItemPayload: reviewItem?.draft_payload ?? null,
        reviewItemStatus: reviewItem?.status ?? null,
        tagIds: tagsByQuestionId.get(question.id) ?? [],
        tagSummaries: tagSummariesByQuestionId.get(question.id) ?? [],
        warningCount: warningCountByQuestionId.get(question.id) ?? 0,
        warningMessages: warningMessagesByQuestionId.get(question.id) ?? [],
      };
    })
    .filter(
      (question) =>
        question.reviewItemStatus !== "approved" &&
        question.reviewItemStatus !== "archived" &&
        question.reviewItemStatus !== "rejected",
    ) as BankReviewDraftQuestion[];
}

export async function listBankApprovedQuestions({
  bankId,
  supabase,
}: {
  bankId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("bank_questions")
    .select(
      "id, status, source_kind, added_at, metadata, question:questions(id, question_code, title, question_type, difficulty_rating, status, source, source_kind, source_review_item_id, visibility, published_at)",
    )
    .eq("bank_id", bankId)
    .eq("status", "active")
    .order("added_at", { ascending: false })
    .limit(100);

  assertQuestionBankSchema(error);

  if (error) {
    throw new Error(error.message);
  }

  const questionIds = (data ?? [])
    .map((row) => (Array.isArray(row.question) ? row.question[0] : row.question)?.id)
    .filter((questionId): questionId is string => Boolean(questionId));

  const tagSummariesByQuestionId = new Map<string, BankQuestionTaxonomySummary[]>();

  if (questionIds.length) {
    const { data: assignments, error: assignmentError } = await supabase
      .from("question_taxonomy_assignments")
      .select("question_id, tag_id, review_status")
      .in("question_id", questionIds)
      .limit(400);

    if (assignmentError) {
      throw new Error(assignmentError.message);
    }

    const tagIds = Array.from(
      new Set((assignments ?? []).map((assignment) => assignment.tag_id)),
    );
    let taxonomyNodesById = new Map<
      string,
      Pick<TaxonomyNode, "facet_key" | "label" | "tag_id">
    >();

    if (tagIds.length) {
      const { data: taxonomyNodes, error: taxonomyError } = await supabase
        .from("taxonomy_nodes")
        .select("tag_id, label, facet_key")
        .in("tag_id", tagIds)
        .limit(400);

      if (taxonomyError) {
        throw new Error(taxonomyError.message);
      }

      taxonomyNodesById = new Map(
        (taxonomyNodes ?? []).map((node) => [node.tag_id, node]),
      );
    }

    for (const assignment of assignments ?? []) {
      const node = taxonomyNodesById.get(assignment.tag_id);
      const summaries = tagSummariesByQuestionId.get(assignment.question_id) ?? [];

      summaries.push({
        facet_key: node?.facet_key ?? null,
        label: node?.label ?? null,
        review_status: assignment.review_status as TaxonomyReviewStatus,
        tag_id: assignment.tag_id,
      });
      tagSummariesByQuestionId.set(assignment.question_id, summaries);
    }
  }

  return (data ?? []).map((row) => ({
    added_at: row.added_at,
    bank_question_id: row.id,
    metadata: row.metadata,
    question: Array.isArray(row.question) ? row.question[0] : row.question,
    source_kind: row.source_kind,
    status: row.status,
    tagSummaries: tagSummariesByQuestionId.get(
      (Array.isArray(row.question) ? row.question[0] : row.question)?.id ?? "",
    ) ?? [],
  })) as BankApprovedQuestion[];
}

export function canManageBankMembers(role: BankMemberRole | null | undefined) {
  return role === "owner";
}

export function canManageBankContent(role: BankMemberRole | null | undefined) {
  return role === "owner" || role === "editor";
}

export function bankMemberProfileLabel(member: BankMemberWithProfile) {
  return (
    member.profile?.display_name ||
    member.profile?.full_name ||
    member.profile?.username ||
    member.profile?.email ||
    "Unknown member"
  );
}

export function questionBankVisibilityLabel(
  visibility: QuestionBankVisibility,
) {
  const labels: Record<QuestionBankVisibility, string> = {
    organization: "Organization",
    private: "Private",
    public: "Public review",
    shared: "Shared",
  };

  return labels[visibility];
}

export function questionBankStatusLabel(status: QuestionBankStatus) {
  const labels: Record<QuestionBankStatus, string> = {
    active: "Active",
    archived: "Archived",
    disabled: "Disabled",
  };

  return labels[status];
}

export function bankMemberRoleLabel(role: BankMemberRole) {
  const labels: Record<BankMemberRole, string> = {
    editor: "Editor",
    owner: "Owner",
    viewer: "Viewer",
  };

  return labels[role];
}
