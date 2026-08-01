import "server-only";

import {
  questionBoundaryFindingsForQuestion,
  type QuestionBoundaryGuardFinding,
} from "@/lib/ai-pdf-import/question-boundary-guard";
import { createClient } from "@/lib/supabase/server";
import type {
  BankMember,
  BankMemberRole,
  BankQuestion,
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
import type {
  QuestionAssetView,
  QuestionSourceFileView,
} from "@/lib/questions/media-workspace";
import { validateReviewQuestionForPublish } from "@/lib/questions/review-publish-validation";
import { getQuestionAssetUrl } from "@/lib/storage/question-assets";

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

export type TeacherQuestionBankAccess = {
  accessSource: "active_membership" | "organization_policy" | "platform_admin";
  activeMemberRole: BankMemberRole | null;
  bank: QuestionBank;
  canManage: boolean;
  canRead: true;
  currentUserRole: BankMemberRole | null;
  organizationRole: "admin" | "teacher" | null;
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
  lineageLinked: boolean;
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
  assets: QuestionAssetView[];
  sourceFiles: QuestionSourceFileView[];
};

export type BankReviewQuestionSummary = {
  hardErrors: string[];
  id: string;
  lineageLinked: boolean;
  publishable: boolean;
  questionCode: string;
  questionType: Question["question_type"];
  reviewItemId: string | null;
  reviewStatus:
    | "pending_review"
    | "needs_more_evidence"
    | "approved"
    | "rejected"
    | "archived"
    | null;
  softWarnings: string[];
  state: "draft";
  title: string;
  updatedAt: string;
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
    | "updated_at"
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
  constructor(message = "Library tables are not available yet.") {
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

function isMissingQuestionBankSummaryRpc(error: {
  code?: string;
  message?: string;
} | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    (
      message.includes("list_teacher_question_bank_summaries_v1") &&
      (message.includes("does not exist") || message.includes("schema cache"))
    )
  );
}

function isMissingBankImportWorkspaceRpc(error: {
  code?: string;
  message?: string;
} | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    (message.includes("get_teacher_bank_import_workspace_v1") &&
      (message.includes("does not exist") || message.includes("schema cache")))
  );
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
  const {
    data: summaryRows,
    error: summaryError,
  } = await supabase.rpc("list_teacher_question_bank_summaries_v1");

  if (!summaryError) {
    return (summaryRows ?? []).map((row) => ({
      activeMemberCount: Number(row.active_member_count ?? 0),
      assignmentReadyCount: Number(row.assignment_ready_count ?? 0),
      created_at: row.created_at,
      created_by: row.created_by,
      description: row.description,
      id: row.id,
      importBatchCount: Number(row.import_batch_count ?? 0),
      membershipRole: row.membership_role as BankMemberRole,
      metadata: row.metadata,
      name: row.name,
      organization_id: row.organization_id,
      owner_id: row.owner_id,
      questionCount: Number(row.question_count ?? 0),
      reviewDraftCount: Number(row.review_draft_count ?? 0),
      status: row.status as QuestionBankStatus,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      visibility: row.visibility as QuestionBankVisibility,
    } satisfies TeacherQuestionBankSummary));
  }

  if (!isMissingQuestionBankSummaryRpc(summaryError)) {
    throw new Error(summaryError.message);
  }

  // Forward-compatible fallback while migration 0060 is not yet applied.
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

  const [
    { data: banks, error: banksError },
    { data: bankQuestionRows, error: questionError },
    { data: memberRows, error: memberCountError },
    { data: reviewDraftRows, error: reviewDraftError },
    { data: importRows, error: importError },
  ] = await Promise.all([
    supabase
      .from("question_banks")
      .select(
        "id, organization_id, owner_id, name, description, visibility, status, metadata, created_by, updated_by, created_at, updated_at",
      )
      .in("id", bankIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("bank_questions")
      .select("bank_id")
      .in("bank_id", bankIds)
      .eq("status", "active"),
    supabase
      .from("bank_members")
      .select("bank_id")
      .in("bank_id", bankIds)
      .eq("status", "active"),
    supabase
      .from("questions")
      .select("owner_bank_id")
      .in("owner_bank_id", bankIds)
      .eq("status", "draft"),
    supabase
      .from("import_batches")
      .select("target_bank_id")
      .in("target_bank_id", bankIds),
  ]);

  for (const error of [
    banksError,
    questionError,
    memberCountError,
    reviewDraftError,
    importError,
  ]) {
    assertQuestionBankSchema(error);
    if (error) {
      throw new Error(error.message);
    }
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

  const [
    { data: members, error: memberError },
    { count: questionCount, error: questionError },
    { count: reviewDraftCount, error: reviewDraftError },
    { count: importBatchCount, error: importError },
  ] = await Promise.all([
    supabase
      .from("bank_members")
      .select("id, bank_id, user_id, role, status, invited_by, joined_at, created_at, updated_at")
      .eq("bank_id", bankId)
      .order("created_at", { ascending: true }),
    supabase
      .from("bank_questions")
      .select("id", { count: "exact", head: true })
      .eq("bank_id", bankId)
      .eq("status", "active"),
    supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("owner_bank_id", bankId)
      .eq("status", "draft"),
    supabase
      .from("import_batches")
      .select("id", { count: "exact", head: true })
      .eq("target_bank_id", bankId),
  ]);

  for (const error of [
    memberError,
    questionError,
    reviewDraftError,
    importError,
  ]) {
    assertQuestionBankSchema(error);
    if (error) {
      throw new Error(error.message);
    }
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
    assignmentReadyCount: questionCount ?? 0,
    bank,
    currentUserRole:
      members?.find(
        (member) =>
          member.user_id === profileId && member.status === "active",
      )?.role ?? null,
    importBatchCount: importBatchCount ?? 0,
    members: membersWithProfiles,
    questionCount: questionCount ?? 0,
    reviewDraftCount: reviewDraftCount ?? 0,
  } satisfies TeacherQuestionBankDetail;
}

export async function getTeacherQuestionBankAccess({
  bankId,
  profileId,
  supabase,
}: {
  bankId: string;
  profileId: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherQuestionBankAccess | null> {
  const [
    { data: bank, error: bankError },
    { data: membership, error: membershipError },
  ] = await Promise.all([
    supabase
      .from("question_banks")
      .select(
        "id, organization_id, owner_id, name, description, visibility, status, metadata, created_by, updated_by, created_at, updated_at",
      )
      .eq("id", bankId)
      .maybeSingle(),
    supabase
      .from("bank_members")
      .select("role, status")
      .eq("bank_id", bankId)
      .eq("user_id", profileId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  assertQuestionBankSchema(bankError);
  assertQuestionBankSchema(membershipError);
  if (bankError) {
    throw new Error(bankError.message);
  }
  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!bank) {
    return null;
  }

  const activeMemberRole = membership?.role ?? null;

  if (activeMemberRole) {
    return {
      accessSource: "active_membership",
      activeMemberRole,
      bank,
      canManage: canManageBankContent(activeMemberRole),
      canRead: true,
      currentUserRole: activeMemberRole,
      organizationRole: null,
    };
  }

  const [
    { data: profile, error: profileError },
    { data: organizationMembership, error: organizationMembershipError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("role")
      .eq("id", profileId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("role, status")
      .eq("organization_id", bank.organization_id)
      .eq("user_id", profileId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (profileError) throw new Error(profileError.message);
  if (organizationMembershipError) {
    throw new Error(organizationMembershipError.message);
  }

  if (profile?.role === "super_admin") {
    return {
      accessSource: "platform_admin",
      activeMemberRole: null,
      bank,
      // Platform administration is not Library content ownership.
      canManage: false,
      canRead: true,
      currentUserRole: null,
      organizationRole: null,
    };
  }

  const organizationRole =
    organizationMembership?.role === "admin" ||
    organizationMembership?.role === "teacher"
      ? organizationMembership.role
      : null;

  if (
    organizationRole &&
    (bank.visibility === "organization" || bank.visibility === "public")
  ) {
    return {
      accessSource: "organization_policy",
      activeMemberRole: null,
      bank,
      // Organization visibility grants read access. Content changes still
      // require an explicit active owner/editor Library membership.
      canManage: false,
      canRead: true,
      currentUserRole: null,
      organizationRole,
    };
  }

  // Fail closed if a future RLS policy exposes a bank without a matching
  // application capability classification.
  return null;
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

type TeacherBankImportWorkspacePayload = {
  bank?: QuestionBank;
  current_user_role?: BankMemberRole | null;
  import_batches?: BankImportBatchSummary[];
};

type TeacherBankImportWorkspaceRpc = {
  rpc(
    functionName: "get_teacher_bank_import_workspace_v1",
    args: { p_bank_id: string },
  ): Promise<{
    data: TeacherBankImportWorkspacePayload | null;
    error: { code?: string; message: string } | null;
  }>;
};

export async function getTeacherBankImportWorkspace({
  bankId,
  resolveProfileId,
  supabase,
}: {
  bankId: string;
  resolveProfileId: () => Promise<string>;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await (
    supabase as unknown as TeacherBankImportWorkspaceRpc
  ).rpc("get_teacher_bank_import_workspace_v1", {
    p_bank_id: bankId,
  });

  if (!error) {
    return {
      access: data?.bank
        ? {
            bank: data.bank,
            currentUserRole: data.current_user_role ?? null,
          }
        : null,
      importBatches: Array.isArray(data?.import_batches)
        ? data.import_batches
        : [],
      usedReadModel: true,
    };
  }

  if (!isMissingBankImportWorkspaceRpc(error)) {
    assertQuestionBankSchema(error);
    throw new Error(error.message);
  }

  const profileId = await resolveProfileId();
  const [access, importBatches] = await Promise.all([
    getTeacherQuestionBankAccess({ bankId, profileId, supabase }),
    listBankImportBatches({ bankId, supabase }),
  ]);

  return { access, importBatches, usedReadModel: false };
}

type ReviewSummaryQuestionRow = Pick<
  Question,
  | "answer_spec"
  | "content_html"
  | "content_source"
  | "difficulty_rating"
  | "id"
  | "options"
  | "owner_bank_id"
  | "question_code"
  | "question_type"
  | "solution_html"
  | "solution_source"
  | "source"
  | "source_review_item_id"
  | "status"
  | "title"
  | "updated_at"
>;

type ReviewSummaryItemRow = {
  created_question_id: string | null;
  id: string;
  status: BankReviewQuestionSummary["reviewStatus"];
  target_bank_id: string | null;
  validation_warnings: unknown;
};

async function loadBankReviewQuestionSummaries({
  bankId,
  questionIds,
  supabase,
}: {
  bankId: string;
  questionIds: string[];
  supabase: SupabaseServerClient;
}) {
  if (!questionIds.length) {
    return [] as BankReviewQuestionSummary[];
  }

  const { data: questionRows, error: questionError } = await supabase
    .from("questions")
    .select(
      "id, question_code, title, question_type, status, owner_bank_id, source_review_item_id, content_html, content_source, solution_html, solution_source, options, answer_spec, difficulty_rating, source, updated_at",
    )
    .in("id", questionIds);
  assertQuestionBankSchema(questionError);
  if (questionError) throw new Error(questionError.message);

  const questions = (questionRows ?? []) as ReviewSummaryQuestionRow[];
  const sourceReviewItemIds = Array.from(
    new Set(
      questions
        .map((question) => question.source_review_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const [
    itemByQuestionResult,
    itemByIdResult,
    assetResult,
    taxonomyResult,
    importWarningResult,
  ] = await Promise.all([
    supabase
      .from("review_draft_items")
      .select(
        "id, created_question_id, status, target_bank_id, validation_warnings",
      )
      .eq("item_kind", "question")
      .in("created_question_id", questionIds)
      .limit(100),
    sourceReviewItemIds.length
      ? supabase
          .from("review_draft_items")
          .select(
            "id, created_question_id, status, target_bank_id, validation_warnings",
          )
          .eq("item_kind", "question")
          .in("id", sourceReviewItemIds)
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("question_assets")
      .select("id, question_id, alt_text")
      .in("question_id", questionIds)
      .limit(250),
    supabase
      .from("question_taxonomy_assignments")
      .select("question_id, tag_id, review_status")
      .in("question_id", questionIds)
      .limit(250),
    supabase
      .from("import_batch_items")
      .select("created_question_id, validation_errors")
      .in("created_question_id", questionIds)
      .limit(100),
  ]);

  for (const result of [
    itemByQuestionResult,
    itemByIdResult,
    assetResult,
    taxonomyResult,
    importWarningResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const reviewItems = [
    ...((itemByQuestionResult.data ?? []) as ReviewSummaryItemRow[]),
    ...((itemByIdResult.data ?? []) as ReviewSummaryItemRow[]),
  ].filter((item) => !item.target_bank_id || item.target_bank_id === bankId);
  const reviewItemById = new Map(reviewItems.map((item) => [item.id, item]));
  const reviewItemByQuestionId = new Map(
    reviewItems
      .filter((item) => item.created_question_id)
      .map((item) => [item.created_question_id as string, item]),
  );
  const assetsByQuestionId = new Map<
    string,
    Array<{ altText: string | null; id: string }>
  >();
  for (const asset of assetResult.data ?? []) {
    const current = assetsByQuestionId.get(asset.question_id) ?? [];
    current.push({ altText: asset.alt_text, id: asset.id });
    assetsByQuestionId.set(asset.question_id, current);
  }
  const taxonomyCountByQuestionId = new Map<string, number>();
  for (const assignment of taxonomyResult.data ?? []) {
    if (
      assignment.review_status !== "approved" &&
      assignment.review_status !== "pending_review"
    ) {
      continue;
    }
    taxonomyCountByQuestionId.set(
      assignment.question_id,
      (taxonomyCountByQuestionId.get(assignment.question_id) ?? 0) + 1,
    );
  }
  const importWarningsByQuestionId = new Map<string, unknown[]>();
  for (const item of importWarningResult.data ?? []) {
    if (!item.created_question_id || !Array.isArray(item.validation_errors)) {
      continue;
    }
    importWarningsByQuestionId.set(
      item.created_question_id,
      item.validation_errors,
    );
  }

  const byId = new Map(
    questions.map((question) => {
      const reviewItem =
        (question.source_review_item_id
          ? reviewItemById.get(question.source_review_item_id)
          : null) ?? reviewItemByQuestionId.get(question.id) ?? null;
      const mergedWarnings = [
        ...(Array.isArray(reviewItem?.validation_warnings)
          ? reviewItem.validation_warnings
          : []),
        ...(importWarningsByQuestionId.get(question.id) ?? []),
      ];
      const validation = validateReviewQuestionForPublish({
        answerSpec: question.answer_spec,
        assetRows: assetsByQuestionId.get(question.id) ?? [],
        contentHtml: question.content_html,
        contentSource: question.content_source,
        difficultyRating: question.difficulty_rating,
        expectedBankId: bankId,
        options: question.options,
        ownerBankId: question.owner_bank_id,
        questionId: question.id,
        questionType: question.question_type,
        reviewItem: reviewItem
          ? {
              createdQuestionId: reviewItem.created_question_id,
              id: reviewItem.id,
              status: reviewItem.status ?? "",
              targetBankId: reviewItem.target_bank_id,
              validationWarnings: mergedWarnings,
            }
          : null,
        solutionHtml: question.solution_html,
        solutionSource: question.solution_source,
        source: question.source,
        sourceReviewItemId: question.source_review_item_id,
        status: question.status,
        taxonomyCount: taxonomyCountByQuestionId.get(question.id) ?? 0,
      });

      return [
        question.id,
        {
          hardErrors: validation.hardErrors,
          id: question.id,
          lineageLinked: !validation.hardErrors.includes(
            "Review lineage is incomplete.",
          ),
          publishable: validation.hardErrors.length === 0,
          questionCode: question.question_code,
          questionType: question.question_type,
          reviewItemId: reviewItem?.id ?? null,
          reviewStatus: reviewItem?.status ?? null,
          softWarnings: validation.softWarnings,
          state: "draft" as const,
          title: question.title,
          updatedAt: question.updated_at,
        } satisfies BankReviewQuestionSummary,
      ] as const;
    }),
  );

  return questionIds
    .map((questionId) => byId.get(questionId))
    .filter(Boolean) as BankReviewQuestionSummary[];
}

export async function assertBankReviewQuestionsPublishable({
  bankId,
  questionIds,
  supabase,
}: {
  bankId: string;
  questionIds: string[];
  supabase: SupabaseServerClient;
}) {
  const summaries = await loadBankReviewQuestionSummaries({
    bankId,
    questionIds,
    supabase,
  });

  if (summaries.length !== questionIds.length) {
    throw new Error("One or more selected Drafts are no longer available.");
  }

  const blocked = summaries.filter((question) => !question.publishable);
  if (blocked.length) {
    const firstError = blocked[0]?.hardErrors[0] ?? "A hard error blocks approval.";
    throw new Error(
      `${blocked.length} selected question${blocked.length === 1 ? "" : "s"} cannot be approved. ${firstError}`,
    );
  }

  return summaries;
}

export async function listBankReviewQuestionSummaries({
  bankId,
  page = 1,
  pageSize = 25,
  query,
  reviewStatus,
  supabase,
}: {
  bankId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  reviewStatus?: "needs_more_evidence" | "pending_review";
  supabase: SupabaseServerClient;
}) {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(25, Math.max(1, Math.floor(pageSize)));
  const reviewFilters = {
    p_bank_id: bankId,
    p_query: query?.trim() || null,
    p_review_status: reviewStatus ?? null,
  };
  const { data: reviewPageRows, error: reviewPageError } = await supabase.rpc(
    "search_bank_review_question_ids",
    {
      ...reviewFilters,
      p_limit: safePageSize,
      p_offset: (safePage - 1) * safePageSize,
    },
  );

  assertQuestionBankSchema(reviewPageError);
  if (reviewPageError) throw new Error(reviewPageError.message);

  const questionIds = (reviewPageRows ?? []).map((row) => row.question_id);
  let total = Number(reviewPageRows?.[0]?.total_count ?? 0);

  if (!reviewPageRows?.length && safePage > 1) {
    const { data: reviewTotal, error: reviewCountError } = await supabase.rpc(
      "count_bank_review_questions",
      reviewFilters,
    );
    assertQuestionBankSchema(reviewCountError);
    if (reviewCountError) throw new Error(reviewCountError.message);
    total = Number(reviewTotal ?? 0);
  }

  return {
    items: await loadBankReviewQuestionSummaries({
      bankId,
      questionIds,
      supabase,
    }),
    page: safePage,
    pageSize: safePageSize,
    total,
  };
}

export async function listBankReviewDraftQuestions({
  bankId,
  page = 1,
  pageSize = 25,
  query,
  reviewStatus,
  supabase,
}: {
  bankId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  reviewStatus?: "needs_more_evidence" | "pending_review";
  supabase: SupabaseServerClient;
}) {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(50, Math.max(1, Math.floor(pageSize)));
  const reviewFilters = {
    p_bank_id: bankId,
    p_query: query?.trim() || null,
    p_review_status: reviewStatus ?? null,
  };
  const { data: reviewPageRows, error: reviewPageError } = await supabase.rpc(
    "search_bank_review_question_ids",
    {
      ...reviewFilters,
      p_bank_id: bankId,
      p_limit: safePageSize,
      p_offset: (safePage - 1) * safePageSize,
    },
  );

  assertQuestionBankSchema(reviewPageError);
  if (reviewPageError) throw new Error(reviewPageError.message);
  const reviewQuestionIds = (reviewPageRows ?? []).map((row) => row.question_id);
  let total = Number(reviewPageRows?.[0]?.total_count ?? 0);

  // The page RPC already returns count(*) over() for every non-empty page.
  // Only an out-of-range deep page needs the count-only fallback so the caller
  // can redirect to the last valid page.
  if (!reviewPageRows?.length && safePage > 1) {
    const { data: reviewTotal, error: reviewCountError } = await supabase.rpc(
      "count_bank_review_questions",
      reviewFilters,
    );
    assertQuestionBankSchema(reviewCountError);
    if (reviewCountError) throw new Error(reviewCountError.message);
    total = Number(reviewTotal ?? 0);
  }

  if (!reviewQuestionIds.length) {
    return {
      items: [] as BankReviewDraftQuestion[],
      page: safePage,
      pageSize: safePageSize,
      total,
    };
  }

  const { data: questions, error } = await supabase
    .from("questions")
    .select(
      "id, question_code, title, question_type, difficulty_rating, status, source, source_kind, source_review_item_id, owner_bank_id, visibility, published_at, created_at, answer_spec, content_html, content_source, content_source_format, options, solution_html, solution_source, solution_source_format",
    )
    .in("id", reviewQuestionIds)
    .order("created_at", { ascending: false });

  assertQuestionBankSchema(error);

  if (error) {
    throw new Error(error.message);
  }

  const questionIds = (questions ?? []).map((question) => question.id);
  const sourceReviewItemIds = Array.from(
    new Set(
      (questions ?? [])
        .map((question) => question.source_review_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const [
    tagResult,
    importItemResult,
    assetResult,
    sourceFileResult,
    reviewItemsByQuestionResult,
    reviewItemsByIdResult,
  ] = questionIds.length
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
        supabase
          .from("question_assets")
          .select(
            "id, question_id, storage_path, label, alt_text, display_on_detail",
          )
          .in("question_id", questionIds)
          .order("display_order")
          .limit(300),
        supabase
          .from("question_source_files")
          .select(
            "id, question_id, original_filename, mime_type, size_bytes, status",
          )
          .in("question_id", questionIds)
          .neq("status", "deleted")
          .order("created_at")
          .limit(300),
        supabase
          .from("review_draft_items")
          .select(
            "id, created_question_id, status, target_bank_id, draft_payload, validation_warnings",
          )
          .eq("item_kind", "question")
          .in("created_question_id", questionIds)
          .limit(200),
        sourceReviewItemIds.length
          ? supabase
              .from("review_draft_items")
              .select(
                "id, created_question_id, status, target_bank_id, draft_payload, validation_warnings",
              )
              .eq("item_kind", "question")
              .in("id", sourceReviewItemIds)
              .limit(200)
          : Promise.resolve({ data: [], error: null }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (tagResult.error) {
    throw new Error(tagResult.error.message);
  }

  if (importItemResult.error) {
    throw new Error(importItemResult.error.message);
  }
  if (assetResult.error) throw new Error(assetResult.error.message);
  if (sourceFileResult.error) throw new Error(sourceFileResult.error.message);
  if (reviewItemsByQuestionResult.error) {
    throw new Error(reviewItemsByQuestionResult.error.message);
  }
  if (reviewItemsByIdResult.error) {
    throw new Error(reviewItemsByIdResult.error.message);
  }

  const assetsByQuestionId = new Map<string, QuestionAssetView[]>();
  for (const asset of assetResult.data ?? []) {
    const current = assetsByQuestionId.get(asset.question_id) ?? [];
    current.push({
      displayOnDetail: asset.display_on_detail,
      id: asset.id,
      originalFilename:
        asset.label ||
        asset.alt_text ||
        asset.storage_path.split("/").pop() ||
        "Question image",
      publicUrl: getQuestionAssetUrl(asset.id),
      questionId: asset.question_id,
    });
    assetsByQuestionId.set(asset.question_id, current);
  }

  const sourceFilesByQuestionId = new Map<string, QuestionSourceFileView[]>();
  for (const sourceFile of sourceFileResult.data ?? []) {
    if (!sourceFile.question_id) continue;
    const current = sourceFilesByQuestionId.get(sourceFile.question_id) ?? [];
    current.push({
      id: sourceFile.id,
      mimeType: sourceFile.mime_type,
      originalFilename: sourceFile.original_filename,
      questionId: sourceFile.question_id,
      sizeBytes: sourceFile.size_bytes,
      status: sourceFile.status,
    });
    sourceFilesByQuestionId.set(sourceFile.question_id, current);
  }

  const importBatchIdByQuestionId = new Map<string, string>();
  for (const row of importItemResult.data ?? []) {
    if (row.created_question_id && row.batch_id) {
      importBatchIdByQuestionId.set(row.created_question_id, row.batch_id);
    }
  }
  const importBatchIds = Array.from(new Set(importBatchIdByQuestionId.values()));
  const tagIds = Array.from(
    new Set((tagResult.data ?? []).map((row) => row.tag_id).filter(Boolean)),
  );
  const [importBatchResult, tagNodeResult] = await Promise.all([
    importBatchIds.length
      ? supabase
          .from("import_batches")
          .select("id, summary")
          .in("id", importBatchIds)
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    tagIds.length
      ? supabase
          .from("taxonomy_nodes")
          .select("tag_id, label, facet_key")
          .in("tag_id", tagIds)
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (importBatchResult.error) {
    throw new Error(importBatchResult.error.message);
  }
  if (tagNodeResult.error) {
    throw new Error(tagNodeResult.error.message);
  }

  const questionBoundaryPlanByBatchId = new Map<string, unknown>(
    (importBatchResult.data ?? []).map((batch) => {
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

  type ReviewItemRow = {
    created_question_id: string | null;
    draft_payload: unknown;
    id: string;
    status: BankReviewDraftQuestion["reviewItemStatus"];
    target_bank_id: string | null;
    validation_warnings?: unknown;
  };
  const reviewItems = [
    ...((reviewItemsByQuestionResult.data ?? []) as ReviewItemRow[]),
    ...((reviewItemsByIdResult.data ?? []) as ReviewItemRow[]),
  ].filter((item) => !item.target_bank_id || item.target_bank_id === bankId);

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

  const tagNodeById = new Map(
    (tagNodeResult.data ?? []).map((tag) => [tag.tag_id, tag]),
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

  const items = (questions ?? [])
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
        lineageLinked: Boolean(
          reviewItem &&
            question.source_review_item_id === reviewItem.id &&
            reviewItem.created_question_id === question.id,
        ),
        reviewItemId: reviewItem?.id ?? null,
        reviewItemPayload: reviewItem?.draft_payload ?? null,
        reviewItemStatus: reviewItem?.status ?? null,
        tagIds: tagsByQuestionId.get(question.id) ?? [],
        tagSummaries: tagSummariesByQuestionId.get(question.id) ?? [],
        warningCount: warningCountByQuestionId.get(question.id) ?? 0,
        warningMessages: warningMessagesByQuestionId.get(question.id) ?? [],
        assets: assetsByQuestionId.get(question.id) ?? [],
        sourceFiles: sourceFilesByQuestionId.get(question.id) ?? [],
      };
    })
    .filter(
      (question) =>
        question.reviewItemStatus !== "approved" &&
        question.reviewItemStatus !== "archived" &&
        question.reviewItemStatus !== "rejected",
    ) as BankReviewDraftQuestion[];

  return {
    items,
    page: safePage,
    pageSize: safePageSize,
    total,
  };
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
      "id, status, source_kind, added_at, metadata, question:questions(id, question_code, title, question_type, difficulty_rating, status, source, source_kind, source_review_item_id, visibility, published_at, updated_at)",
    )
    .eq("bank_id", bankId)
    .eq("status", "active")
    .order("added_at", { ascending: false })
    .limit(500);

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

export async function listBankQuestionsPage({
  bankId,
  page = 1,
  pageSize = 25,
  query,
  readiness = "active",
  sourceKind,
  supabase,
  taxonomyTagId,
}: {
  bankId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  readiness?: "active" | "archived";
  sourceKind?: BankQuestion["source_kind"];
  supabase: SupabaseServerClient;
  taxonomyTagId?: string;
}) {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const rpcFilters = {
    p_bank_id: bankId,
    p_query: query?.trim() || null,
    p_readiness: readiness,
    p_source_kind: sourceKind ?? null,
    p_taxonomy_tag_id: taxonomyTagId?.trim() || null,
  };
  const { data, error } = await supabase.rpc("search_bank_question_rows", {
    ...rpcFilters,
    p_limit: safePageSize,
    p_offset: (safePage - 1) * safePageSize,
  });

  assertQuestionBankSchema(error);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  let total = Number(rows[0]?.total_count ?? 0);

  // The search RPC includes count(*) over(), so the normal list/filter path
  // should not repeat the same filtered scan through a second count RPC.
  // Preserve a count-only fallback for stale, out-of-range deep-page URLs.
  if (!rows.length && safePage > 1) {
    const { data: totalCount, error: countError } = await supabase.rpc(
      "count_bank_question_rows",
      rpcFilters,
    );
    assertQuestionBankSchema(countError);
    if (countError) throw new Error(countError.message);
    total = Number(totalCount ?? 0);
  }

  return {
    items: rows.map((row) => {
      const tagSummaries = Array.isArray(row.tag_summaries)
        ? (row.tag_summaries as unknown as BankQuestionTaxonomySummary[])
        : [];
      return {
        added_at: row.added_at,
        bank_question_id: row.bank_question_id,
        metadata: row.metadata,
        question: {
          difficulty_rating: row.difficulty_rating,
          id: row.question_id,
          published_at: row.published_at,
          question_code: row.question_code,
          question_type: row.question_type as Question["question_type"],
          source: row.question_source,
          source_kind: row.question_source_kind,
          source_review_item_id: row.source_review_item_id,
          status: row.question_status as Question["status"],
          title: row.title,
          visibility: row.visibility as Question["visibility"],
        },
        source_kind: row.bank_source_kind,
        status: row.bank_question_status,
        tagSummaries,
      };
    }) as BankApprovedQuestion[],
    page: safePage,
    pageSize: safePageSize,
    total,
  };
}

export function canManageBankMembers(role: BankMemberRole | null | undefined) {
  return role === "owner";
}

export function canManageBankContent(role: BankMemberRole | null | undefined) {
  return role === "owner" || role === "editor";
}

export function teacherQuestionBankAccessLabel(
  access: TeacherQuestionBankAccess,
) {
  if (access.activeMemberRole) {
    return `${access.activeMemberRole} member`;
  }

  if (access.organizationRole) {
    return `organization ${access.organizationRole} · read only`;
  }

  if (access.accessSource === "platform_admin") {
    return "platform administrator · read only";
  }

  return "read only";
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
    public: "Legacy public-review scope",
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
