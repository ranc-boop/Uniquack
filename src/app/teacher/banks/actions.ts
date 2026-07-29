"use server";

import { Buffer } from "node:buffer";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import {
  AI_IMPORT_SOURCES_BUCKET,
} from "@/lib/ai-pdf-import/constants";
import {
  buildAIPdfCoverageRecoveryJobIdempotencyKey,
  enqueueAIProviderJob,
} from "@/lib/ai-jobs/queue";
import { buildAICoverageRecoveryExecutionPlan } from "@/lib/ai-pdf-import/coverage-recovery-executor";
import { getPdfPageCount } from "@/lib/ai-pdf-import/pdf";
import {
  isAIProviderError,
  safeAIProviderMessage,
} from "@/lib/ai-providers/errors";
import {
  resolveTeacherAIPdfProviderProfile,
} from "@/lib/ai-pdf-import/teacher-parsing-profiles";
import { requireTeacher } from "@/lib/auth/guards";
import {
  importBatchImportJson,
  previewBatchImportJson,
} from "@/lib/batch-import/service";
import { markdownLatexToHtml } from "@/lib/markdown-latex/markdown";
import {
  answerSpecFromFormData,
  answerSpecToJson,
  optionsToJson,
} from "@/lib/questions/answer-spec";
import {
  canManageBankContent,
  getTeacherQuestionBankDetail,
} from "@/lib/question-banks";
import { sanitizeContentHtml } from "@/lib/sanitize/html";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { questionCreateSchema } from "@/lib/validations/question";
import { copyQuestionAssetsForIndependentUse } from "@/lib/questions/copy-assets";

const bankCreateSchema = z.object({
  description: z.string().trim().max(2000).optional().default(""),
  name: z.string().trim().min(1).max(120),
  visibility: z
    .enum(["private", "shared", "organization"])
    .default("private"),
});

const bankShareCodeCreateSchema = z.object({
  bankId: z.string().uuid(),
  grantedRole: z.enum(["viewer", "editor"]).default("viewer"),
});

const bankShareCodeRevokeSchema = z.object({
  bankId: z.string().uuid(),
  shareCodeId: z.string().uuid(),
});

const bankJoinSchema = z.object({
  shareCode: z.string().trim().min(6).max(64),
});

const bankMemberRoleSchema = z.object({
  bankId: z.string().uuid(),
  role: z.enum(["viewer", "editor"]),
  userId: z.string().uuid(),
});

const bankMemberRemoveSchema = z.object({
  bankId: z.string().uuid(),
  userId: z.string().uuid(),
});

const bankImportJsonSchema = z.object({
  bankId: z.string().uuid(),
  jsonText: z.string().trim().min(2),
});

const bankManualQuestionSchema = questionCreateSchema
  .omit({ status: true })
  .extend({
    bankId: z.string().uuid(),
    draft_id: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().uuid().optional(),
    ),
  });

const taxonomyTagIdPattern = /^math\.[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

function taxonomyTagIdsFromForm(formData: FormData, prefix = "question_tax") {
  const tagIds = new Set<string>();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(`${prefix}_`) || key.endsWith("_search")) continue;
    if (typeof value !== "string") continue;

    const tagId = value.trim();
    if (taxonomyTagIdPattern.test(tagId)) tagIds.add(tagId);
  }

  return Array.from(tagIds);
}

const bankCoverageRecoverySchema = z.object({
  bankId: z.string().uuid(),
  batchId: z.string().uuid(),
});

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const bankReviewQuestionApproveSchema = z.object({
  bankId: z.string().uuid(),
  questionId: z.string().uuid(),
});

const bankReviewQuestionEditSchema = z.object({
  bankId: z.string().uuid(),
  contentSource: z.string().trim().min(1).max(20000),
  difficultyRating: z.coerce.number().int().min(0).max(1000),
  questionId: z.string().uuid(),
  solutionSource: z.string().trim().max(20000).optional().default(""),
  title: z.string().trim().min(1).max(240),
});

const bankReviewQuestionDecisionSchema = z.object({
  bankId: z.string().uuid(),
  questionId: z.string().uuid(),
  reason: z.string().trim().max(1200).optional().default(""),
});

const bankAssignmentCreateSchema = z.object({
  bankId: z.string().uuid(),
  classroomId: z.string().uuid(),
  dueAt: z.string().trim().optional().default(""),
  instructions: z.string().trim().max(4000).optional().default(""),
  publishMode: z.enum(["assigned", "draft"]).default("draft"),
  title: z.string().trim().min(1).max(180),
});

const bankQuestionRevisionSchema = z.object({
  bankId: z.string().uuid(),
  questionId: z.string().uuid(),
});

const bankPublicSubmissionSchema = z.object({
  bankId: z.string().uuid(),
  publicLicenseConfirmed: z.literal("confirmed"),
});

const publicSubmissionWithdrawSchema = z.object({
  bankId: z.string().uuid(),
  submissionId: z.string().uuid(),
});

const publicQuestionPullSchema = z.object({
  bankId: z.string().uuid(),
  publicQuestionId: z.string().uuid(),
});

type ApproveBankReviewQuestionResult = {
  bank_question_id: string;
  question_id: string;
  source_review_item_id: string | null;
};

type ApproveBankReviewQuestionRpc = {
  rpc(
    functionName: "approve_bank_review_question",
    args: { p_target_bank_id: string; p_target_question_id: string },
  ): Promise<{
    data: ApproveBankReviewQuestionResult[] | null;
    error: { message: string } | null;
  }>;
};

type BankReviewDraftQuestionRow = {
  deleted_at: string | null;
  id: string;
  organization_id: string;
  owner_bank_id: string | null;
  published_at: string | null;
  question_code: string;
  source_kind: string | null;
  source_review_item_id: string | null;
  status: string;
  title: string;
  visibility: string | null;
};

type BankReviewBatchRow = {
  id: string;
  organization_id: string;
  target_bank_id: string | null;
};

type BankReviewDraftItemRow = {
  created_question_id: string | null;
  id: string;
  item_kind: string;
  review_batch_id: string;
  target_bank_id: string | null;
};

type BankImportBatchRow = {
  id: string;
  organization_id: string;
  source_type: string | null;
  target_bank_id: string | null;
};

function normalizeDueAt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Due date is invalid.");
  }

  return parsed.toISOString();
}

function renderMarkdownDraftSource(value: string) {
  return sanitizeContentHtml(markdownLatexToHtml(value.trim()));
}

function reviewBatchSourceKind(sourceType: string | null | undefined) {
  if (sourceType === "ai_pdf") return "ai_import";
  if (sourceType === "package") return "package_import";
  if (sourceType === "course_builder") return "course_builder";

  return "manual";
}

function draftDecisionReason(value: string, fallback: string) {
  return value.trim() || fallback;
}

async function requireManageableBankForAction({
  bankId,
  profileId,
}: {
  bankId: string;
  profileId: string;
}) {
  const supabase = await createClient();
  const detail = await getTeacherQuestionBankDetail({
    bankId,
    profileId,
    supabase,
  });

  if (!detail || !canManageBankContent(detail.currentUserRole)) {
    throw new Error("Only Library owners and editors can manage content.");
  }

  if (detail.bank.status !== "active") {
    throw new Error("Only active Libraries can receive new content.");
  }

  return { detail, supabase };
}

async function loadManageableBankReviewDraft({
  bankId,
  profileId,
  questionId,
  supabase,
}: {
  bankId: string;
  profileId: string;
  questionId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const detail = await getTeacherQuestionBankDetail({
    bankId,
    profileId,
    supabase,
  });

  if (!detail) {
    throw new Error("Library was not found.");
  }

  if (!canManageBankContent(detail.currentUserRole)) {
    throw new Error("Only Library owners or editors can change Review Drafts.");
  }

  if (detail.bank.status !== "active") {
    throw new Error("Only active Libraries can change Review Drafts.");
  }

  const { data: question, error } = await supabase
    .from("questions")
    .select(
      "id, organization_id, owner_bank_id, status, visibility, published_at, deleted_at, source_review_item_id, question_code, title, source_kind",
    )
    .eq("id", questionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!question) {
    throw new Error("Review Draft question was not found.");
  }

  const draftQuestion = question as BankReviewDraftQuestionRow;

  if (draftQuestion.owner_bank_id !== bankId) {
    throw new Error("This Review Draft belongs to a different Library.");
  }

  if (draftQuestion.deleted_at) {
    throw new Error("Deleted drafts cannot be changed.");
  }

  if (draftQuestion.status !== "draft") {
    throw new Error("Only pending draft questions can be changed here.");
  }

  if (draftQuestion.published_at) {
    throw new Error("Published questions cannot be changed from Review Drafts.");
  }

  if (draftQuestion.visibility === "public") {
    throw new Error("Public questions cannot be changed from Library Review Drafts.");
  }

  return { detail, question: draftQuestion };
}

async function resolveOrCreateBankReviewDraftLineage({
  bankId,
  profileId,
  question,
  supabase,
}: {
  bankId: string;
  profileId: string;
  question: BankReviewDraftQuestionRow;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  if (question.source_review_item_id) {
    const { data: item, error: itemError } = await supabase
      .from("review_draft_items")
      .select("id, review_batch_id, target_bank_id, created_question_id, item_kind")
      .eq("id", question.source_review_item_id)
      .maybeSingle();

    if (itemError) {
      throw new Error(itemError.message);
    }

    const reviewItem = item as BankReviewDraftItemRow | null;

    if (!reviewItem || reviewItem.item_kind !== "question") {
      throw new Error("Review Draft lineage was not found for this question.");
    }

    const { data: batch, error: batchError } = await supabase
      .from("review_batches")
      .select("id, organization_id, target_bank_id")
      .eq("id", reviewItem.review_batch_id)
      .maybeSingle();

    if (batchError) {
      throw new Error(batchError.message);
    }

    const reviewBatch = batch as BankReviewBatchRow | null;

    if (!reviewBatch || reviewBatch.organization_id !== question.organization_id) {
      throw new Error("Review Draft batch lineage does not match this question.");
    }

    if (
      (reviewItem.target_bank_id ?? reviewBatch.target_bank_id ?? bankId) !==
      bankId
    ) {
      throw new Error("Review Draft lineage is not scoped to this Library.");
    }

    const itemPatch: Record<string, string> = {};
    if (!reviewItem.target_bank_id) {
      itemPatch.target_bank_id = bankId;
    }
    if (!reviewItem.created_question_id) {
      itemPatch.created_question_id = question.id;
    }

    if (Object.keys(itemPatch).length) {
      const { error: patchError } = await supabase
        .from("review_draft_items")
        .update(itemPatch as never)
        .eq("id", reviewItem.id);

      if (patchError) {
        throw new Error(patchError.message);
      }
    }

    return {
      reviewBatchId: reviewItem.review_batch_id,
      reviewDraftItemId: reviewItem.id,
    };
  }

  const { data: importItems, error: importItemsError } = await supabase
    .from("import_batch_items")
    .select("batch_id")
    .eq("created_question_id", question.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (importItemsError) {
    throw new Error(importItemsError.message);
  }

  const importBatchIds = Array.from(
    new Set((importItems ?? []).map((item) => item.batch_id).filter(Boolean)),
  );
  const { data: importBatchData, error: importBatchError } = importBatchIds.length
    ? await supabase
        .from("import_batches")
        .select("id, organization_id, source_type, target_bank_id")
        .in("id", importBatchIds)
        .eq("organization_id", question.organization_id)
        .eq("target_bank_id", bankId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };

  if (importBatchError) {
    throw new Error(importBatchError.message);
  }

  const importBatch = importBatchData as BankImportBatchRow | null;

  const { data: reviewBatch, error: reviewBatchError } = await supabase
    .from("review_batches")
    .insert({
      created_by: profileId,
      organization_id: question.organization_id,
      source_kind: reviewBatchSourceKind(importBatch?.source_type),
      source_record_id: importBatch?.id ?? null,
      status: "pending_review",
      summary: {
        lineageCreatedBy: "teacher_review_draft_action",
        reviewScope: "question_bank",
        sourceImportBatchId: importBatch?.id ?? null,
        targetBankId: bankId,
      },
      target_bank_id: bankId,
      title: "Library-scoped Review Draft action",
    } as never)
    .select("id")
    .single();

  if (reviewBatchError) {
    throw new Error(reviewBatchError.message);
  }

  const createdReviewBatch = reviewBatch as { id: string };

  const { data: reviewItem, error: reviewItemError } = await supabase
    .from("review_draft_items")
    .insert({
      created_question_id: question.id,
      draft_payload: {
        lineageCreatedBy: "teacher_review_draft_action",
        questionCode: question.question_code,
        questionId: question.id,
        sourceKind: question.source_kind,
        targetBankId: bankId,
        title: question.title,
      },
      item_kind: "question",
      review_batch_id: createdReviewBatch.id,
      status: "pending_review",
      target_bank_id: bankId,
      validation_warnings: [],
    } as never)
    .select("id")
    .single();

  if (reviewItemError) {
    throw new Error(reviewItemError.message);
  }

  const createdReviewItem = reviewItem as { id: string };

  const { error: questionLineageError } = await supabase
    .from("questions")
    .update({
      source_review_item_id: createdReviewItem.id,
      updated_by: profileId,
    } as never)
    .eq("id", question.id)
    .eq("owner_bank_id", bankId)
    .eq("status", "draft");

  if (questionLineageError) {
    throw new Error(questionLineageError.message);
  }

  return {
    reviewBatchId: createdReviewBatch.id,
    reviewDraftItemId: createdReviewItem.id,
  };
}

async function recordBankReviewAction({
  actionKind,
  evidence,
  profileId,
  reason,
  reviewBatchId,
  reviewDraftItemId,
  supabase,
}: {
  actionKind: "edit" | "reject" | "request_more_evidence";
  evidence: unknown[];
  profileId: string;
  reason: string;
  reviewBatchId: string;
  reviewDraftItemId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { error } = await supabase.from("review_actions").insert({
    action_kind: actionKind,
    evidence,
    reason,
    review_batch_id: reviewBatchId,
    review_draft_item_id: reviewDraftItemId,
    reviewer_id: profileId,
    status: "completed",
  } as never);

  if (error) {
    throw new Error(error.message);
  }
}

const forbiddenProviderConfigFields = [
  "apiKey",
  "api_key",
  "baseUrl",
  "base_url",
  "model",
  "modelId",
  "model_id",
  "provider",
  "providerId",
  "provider_id",
  "providerProfileId",
  "provider_profile_id",
  "supports_pdf_input",
  "supports_vision_images",
  "vendor",
];

function assertNoRawProviderConfig(formData: FormData) {
  const blockedField = forbiddenProviderConfigFields.find((field) =>
    formData.has(field),
  );

  if (blockedField) {
    throw new Error(
      "AI PDF provider configuration is admin-only and cannot be submitted from teacher imports.",
    );
  }
}

function formatTeacherAIPdfImportError(error: unknown) {
  if (isAIProviderError(error)) {
    return safeAIProviderMessage(error);
  }

  return formatActionError(error);
}

export async function createQuestionBank(formData: FormData) {
  try {
    await requireTeacher();
    const parsed = bankCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { data: bankId, error } = await supabase.rpc("create_question_bank", {
      bank_description: parsed.description || null,
      bank_name: parsed.name,
      bank_visibility: parsed.visibility,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!bankId) {
      throw new Error("Library was not created.");
    }

    revalidatePath("/teacher");
    revalidatePath("/teacher/banks");
    redirectWithSaved(
      `/teacher/banks/${bankId}`,
      "Library created. Start with reviewed content before assigning work.",
    );
  } catch (error) {
    redirectWithError("/teacher/banks/new", formatActionError(error));
  }
}

export async function createBankShareCode(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/members`;

  try {
    await requireTeacher();
    const parsed = bankShareCodeCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("create_bank_share_code", {
      expires_at: null,
      granted_role: parsed.grantedRole,
      target_bank_id: parsed.bankId,
    });

    if (error) {
      throw new Error(error.message);
    }

    const created = data?.[0];

    if (!created?.raw_share_code) {
      throw new Error("Library share code was not created.");
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/members`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/members?newCode=${encodeURIComponent(
        created.raw_share_code,
      )}&role=${encodeURIComponent(created.role_granted)}`,
      "Share code created. Copy it now; only the hash is stored.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function revokeBankShareCode(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/members`;

  try {
    await requireTeacher();
    const parsed = bankShareCodeRevokeSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.rpc("revoke_bank_share_code", {
      target_share_code_id: parsed.shareCodeId,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}/members`);
    redirectWithSaved(fallbackPath, "Share code revoked.");
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function joinQuestionBankByCode(formData: FormData) {
  try {
    await requireTeacher();
    const parsed = bankJoinSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("join_question_bank_by_code", {
      raw_share_code: parsed.shareCode,
    });

    if (error) {
      throw new Error(error.message);
    }

    const joined = data?.[0];

    if (!joined?.bank_id) {
      throw new Error("Unable to join that Library.");
    }

    revalidatePath("/teacher");
    revalidatePath("/teacher/banks");
    redirectWithSaved(
      `/teacher/banks/${joined.bank_id}`,
      `Joined ${joined.bank_name} as ${joined.granted_role}.`,
    );
  } catch (error) {
    redirectWithError("/teacher/banks/join", formatActionError(error));
  }
}

export async function updateBankMemberRole(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/members`;

  try {
    await requireTeacher();
    const parsed = bankMemberRoleSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.rpc("update_bank_member_role", {
      new_role: parsed.role,
      target_bank_id: parsed.bankId,
      target_user_id: parsed.userId,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/members`);
    redirectWithSaved(fallbackPath, "Library member role updated.");
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function removeBankMember(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/members`;

  try {
    await requireTeacher();
    const parsed = bankMemberRemoveSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.rpc("remove_bank_member", {
      target_bank_id: parsed.bankId,
      target_user_id: parsed.userId,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/members`);
    redirectWithSaved(fallbackPath, "Library member removed.");
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function previewBankJsonImport(
  bankId: string,
  input: { jsonText: string },
) {
  const profile = await requireTeacher();
  const parsed = bankImportJsonSchema.parse({
    bankId,
    jsonText: input.jsonText,
  });
  const { supabase } = await requireManageableBankForAction({
    bankId: parsed.bankId,
    profileId: profile.id,
  });

  return previewBatchImportJson({
    jsonText: parsed.jsonText,
    supabase,
  });
}

export async function importBankJsonDraftsInteractive(
  bankId: string,
  input: { jsonText: string },
) {
  const profile = await requireTeacher();
  const parsed = bankImportJsonSchema.parse({
    bankId,
    jsonText: input.jsonText,
  });
  const { supabase } = await requireManageableBankForAction({
    bankId: parsed.bankId,
    profileId: profile.id,
  });
  const summary = await importBatchImportJson({
    initialSummaryExtras: {
      importedFrom: "teacher_bank_import",
      reviewGate: "bank_review_required",
      targetBankId: parsed.bankId,
    },
    jsonText: parsed.jsonText,
    profileId: profile.id,
    sourceType: "manual_json",
    supabase,
    targetBankId: parsed.bankId,
  });

  revalidatePath(`/teacher/banks/${parsed.bankId}`);
  revalidatePath(`/teacher/banks/${parsed.bankId}/imports`);
  revalidatePath(`/teacher/banks/${parsed.bankId}/review`);

  return summary;
}

export async function createBankManualQuestionDraft(formData: FormData) {
  const bankId = String(formData.get("bankId") ?? "");
  const fallbackPath = `/teacher/banks/${bankId}/imports?mode=manual`;

  try {
    const profile = await requireTeacher();
    const parsed = bankManualQuestionSchema.parse({
      ...Object.fromEntries(formData),
      bankId,
    });
    const { supabase } = await requireManageableBankForAction({
      bankId: parsed.bankId,
      profileId: profile.id,
    });
    const answerData = answerSpecFromFormData(formData);
    const tagIds = taxonomyTagIdsFromForm(formData);

    if (parsed.draft_id) {
      await loadManageableBankReviewDraft({
        bankId: parsed.bankId,
        profileId: profile.id,
        questionId: parsed.draft_id,
        supabase,
      });

      const { error: updateError } = await supabase
        .from("questions")
        .update({
          answer_spec: answerSpecToJson(answerData.answerSpec),
          content_html: sanitizeContentHtml(parsed.content_html),
          content_source: parsed.content_source || parsed.content_html,
          content_source_format: parsed.content_source_format,
          difficulty_rating: parsed.difficulty_rating,
          options: optionsToJson(answerData.options),
          question_code: parsed.question_code,
          question_type: parsed.question_type,
          solution_html: parsed.solution_html
            ? sanitizeContentHtml(parsed.solution_html)
            : null,
          solution_source:
            parsed.solution_source || parsed.solution_html || null,
          solution_source_format: parsed.solution_source_format,
          source_kind: "review_draft",
          title: parsed.title,
          updated_by: profile.id,
          visibility: "private",
        })
        .eq("id", parsed.draft_id)
        .eq("owner_bank_id", parsed.bankId)
        .eq("status", "draft");

      if (updateError) throw new Error(updateError.message);

      const { error: deleteTagsError } = await supabase
        .from("question_taxonomy_assignments")
        .delete()
        .eq("question_id", parsed.draft_id);
      if (deleteTagsError) throw new Error(deleteTagsError.message);

      if (tagIds.length) {
        const { error: insertTagsError } = await supabase
          .from("question_taxonomy_assignments")
          .insert(
            tagIds.map((tagId) => ({
              confidence: 1,
              created_by: profile.id,
              evidence: { source: "teacher_manual_form" },
              question_id: parsed.draft_id as string,
              review_status: "pending_review",
              source: "manual",
              tag_id: tagId,
              updated_by: profile.id,
            })),
          );
        if (insertTagsError) throw new Error(insertTagsError.message);
      }

      revalidatePath(`/teacher/banks/${parsed.bankId}`);
      revalidatePath(`/teacher/banks/${parsed.bankId}/imports`);
      revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
      redirectWithSaved(
        `/teacher/banks/${parsed.bankId}/review`,
        "Manual draft created. Review it before assignment.",
      );
    }

    const payload = {
      questions: [
        {
          answer_spec: answerSpecToJson(answerData.answerSpec),
          code: parsed.question_code,
          content_html: parsed.content_html,
          difficulty: parsed.difficulty_rating,
          options: optionsToJson(answerData.options),
          solution_html: parsed.solution_html,
          tag_ids: tagIds,
          title: parsed.title,
          type: parsed.question_type,
        },
      ],
    };
    const summary = await importBatchImportJson({
      initialSummaryExtras: {
        importedFrom: "teacher_manual_form",
        reviewGate: "bank_review_required",
        targetBankId: parsed.bankId,
      },
      jsonText: JSON.stringify(payload),
      profileId: profile.id,
      sourceType: "manual_json",
      supabase,
      targetBankId: parsed.bankId,
    });

    if (!summary.createdCount) {
      throw new Error(
        summary.validationErrorReasons[0] ??
          "The manual question could not be saved.",
      );
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/imports`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/review`,
      "Manual draft created. Review it before assignment.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

/** Queues a plan that was already derived from a completed private import. */
export async function queueBankPdfCoverageRecovery(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/imports`;

  try {
    const profile = await requireTeacher();
    assertNoRawProviderConfig(formData);
    const parsed = bankCoverageRecoverySchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const detail = await getTeacherQuestionBankDetail({
      bankId: parsed.bankId,
      profileId: profile.id,
      supabase,
    });

    if (!detail || !canManageBankContent(detail.currentUserRole)) {
      throw new Error("Only Library owners and editors can queue coverage recovery.");
    }
    if (detail.bank.status !== "active") {
      throw new Error("Only active Libraries can recover missing source coverage.");
    }

    const importSupabase = createServiceRoleClient();
    const { data: batch, error: batchError } = await importSupabase
      .from("import_batches")
      .select("id, status, summary, target_bank_id")
      .eq("id", parsed.batchId)
      .eq("target_bank_id", parsed.bankId)
      .eq("source_type", "ai_pdf")
      .maybeSingle();
    if (batchError) throw new Error(batchError.message);
    if (!batch) throw new Error("The original AI PDF import was not found for this Library.");

    const summary = plainObject(batch.summary);
    const aiPdfImport = plainObject(summary.aiPdfImport);
    const summarySourceAssetId =
      typeof aiPdfImport.sourceAssetId === "string"
        ? aiPdfImport.sourceAssetId
        : null;
    let assetQuery = importSupabase
      .from("import_batch_assets")
      .select("id, object_path, status")
      .eq("batch_id", batch.id)
      .eq("asset_role", "source_pdf")
      .order("created_at", { ascending: true })
      .limit(1);
    if (summarySourceAssetId) assetQuery = assetQuery.eq("id", summarySourceAssetId);
    const { data: sourceAsset, error: sourceAssetError } = await assetQuery.maybeSingle();
    if (sourceAssetError) throw new Error(sourceAssetError.message);

    let sourcePageCount = Number(aiPdfImport.pageCount ?? 0);
    if (sourceAsset?.status === "ready" && (!Number.isFinite(sourcePageCount) || sourcePageCount < 1)) {
      const { data: sourceBlob, error: sourceDownloadError } = await importSupabase.storage
        .from(AI_IMPORT_SOURCES_BUCKET)
        .download(sourceAsset.object_path);
      if (sourceDownloadError) throw new Error(sourceDownloadError.message);
      sourcePageCount = await getPdfPageCount(Buffer.from(await sourceBlob.arrayBuffer()));
    }

    const executionPlan = buildAICoverageRecoveryExecutionPlan({
      actorCanManageBank: true,
      bankActive: detail.bank.status === "active",
      originalBatchStatus: batch.status,
      sourcePageCount,
      sourceReady: sourceAsset?.status === "ready",
      summary,
    });
    if (executionPlan.status !== "eligible" || !executionPlan.planHash || !sourceAsset) {
      throw new Error("Coverage recovery is not ready for this import. The original source and bounded recovery plan were preserved.");
    }

    const storedProviderProfileId =
      typeof aiPdfImport.providerProfileId === "string"
        ? aiPdfImport.providerProfileId
        : null;
    const provider = storedProviderProfileId
      ? { id: storedProviderProfileId }
      : await resolveTeacherAIPdfProviderProfile({ parsingProfile: "standard", supabase });
    const windowIds = executionPlan.windows.map((window) => window.windowId);
    const queuedJob = await enqueueAIProviderJob({
      idempotencyKey: buildAIPdfCoverageRecoveryJobIdempotencyKey({
        batchId: batch.id,
        planHash: executionPlan.planHash,
        sourceAssetId: sourceAsset.id,
      }),
      jobKind: "ai_pdf_coverage_recovery",
      payload: {
        operationVersion: 1,
        originalImportBatchId: batch.id,
        recoveryPlanHash: executionPlan.planHash,
        recoveryPlanVersion: executionPlan.sourcePlanVersion,
        sourceAssetId: sourceAsset.id,
        targetBankId: parsed.bankId,
        windowIds,
      },
      providerProfileId: provider.id,
      resourceId: batch.id,
      resourceType: "import_batch",
      supabase,
      targetBankId: parsed.bankId,
    });

    const recoveryExecution = {
      detail:
        queuedJob.status === "completed"
          ? "The missing sections were already rechecked for this recovery plan."
          : "Targeted recovery is waiting for available AI capacity.",
      durableJobId: queuedJob.id,
      pageCount: executionPlan.pageCount,
      planHash: executionPlan.planHash,
      planVersion: executionPlan.version,
      status: queuedJob.status === "completed" ? "completed" : "queued",
      windowCount: executionPlan.windows.length,
      windowIds,
    };
    const { error: updateError } = await importSupabase
      .from("import_batches")
      .update({
        summary: {
          ...summary,
          aiPdfImport: {
            ...aiPdfImport,
            coverageRecoveryExecution: recoveryExecution,
          },
        },
      } as never)
      .eq("id", batch.id);
    if (updateError) throw new Error(updateError.message);

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/imports`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/imports?job=${encodeURIComponent(queuedJob.id)}`,
      queuedJob.status === "completed"
        ? "This targeted recovery plan has already completed. Review any recovered drafts."
        : "Targeted recovery is queued. Only the planned missing sections will be rechecked.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatTeacherAIPdfImportError(error));
  }
}

export async function approveBankReviewQuestion(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/review`;

  try {
    await requireTeacher();
    const parsed = bankReviewQuestionApproveSchema.parse(
      Object.fromEntries(formData),
    );
    const supabase = await createClient();
    const { data, error } = await (
      supabase as unknown as ApproveBankReviewQuestionRpc
    ).rpc("approve_bank_review_question", {
      p_target_bank_id: parsed.bankId,
      p_target_question_id: parsed.questionId,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.[0]?.bank_question_id) {
      throw new Error("Review Draft was not approved into this Library.");
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/questions`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/review`,
      "Review Draft approved into this Library. It was not published to the Public Library.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function editBankReviewDraftQuestion(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/review`;

  try {
    const profile = await requireTeacher();
    const parsed = bankReviewQuestionEditSchema.parse(
      Object.fromEntries(formData),
    );
    const supabase = await createClient();
    const { question } = await loadManageableBankReviewDraft({
      bankId: parsed.bankId,
      profileId: profile.id,
      questionId: parsed.questionId,
      supabase,
    });
    const lineage = await resolveOrCreateBankReviewDraftLineage({
      bankId: parsed.bankId,
      profileId: profile.id,
      question,
      supabase,
    });
    const contentHtml = renderMarkdownDraftSource(parsed.contentSource);
    const solutionHtml = parsed.solutionSource
      ? renderMarkdownDraftSource(parsed.solutionSource)
      : null;

    const { error } = await supabase
      .from("questions")
      .update({
        content_html: contentHtml,
        content_source: parsed.contentSource,
        content_source_format: "markdown_latex",
        difficulty_rating: parsed.difficultyRating,
        solution_html: solutionHtml,
        solution_source: parsed.solutionSource,
        solution_source_format: "markdown_latex",
        title: parsed.title,
        updated_by: profile.id,
      } as never)
      .eq("id", parsed.questionId)
      .eq("owner_bank_id", parsed.bankId)
      .eq("status", "draft")
      .is("published_at", null);

    if (error) {
      throw new Error(error.message);
    }

    const { error: reviewItemError } = await supabase
      .from("review_draft_items")
      .update({
        status: "pending_review",
        target_bank_id: parsed.bankId,
      } as never)
      .eq("id", lineage.reviewDraftItemId);

    if (reviewItemError) {
      throw new Error(reviewItemError.message);
    }

    await recordBankReviewAction({
      actionKind: "edit",
      evidence: [
        {
          draftOnly: true,
          questionId: parsed.questionId,
          targetBankId: parsed.bankId,
        },
      ],
      profileId: profile.id,
      reason: "Teacher edited Review Draft content before Library approval.",
      reviewBatchId: lineage.reviewBatchId,
      reviewDraftItemId: lineage.reviewDraftItemId,
      supabase,
    });

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/review`,
      "Review Draft saved. It remains private and still requires approval before assignment.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function markBankReviewDraftNeedsFix(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/review`;

  try {
    const profile = await requireTeacher();
    const parsed = bankReviewQuestionDecisionSchema.parse(
      Object.fromEntries(formData),
    );
    const supabase = await createClient();
    const { question } = await loadManageableBankReviewDraft({
      bankId: parsed.bankId,
      profileId: profile.id,
      questionId: parsed.questionId,
      supabase,
    });
    const lineage = await resolveOrCreateBankReviewDraftLineage({
      bankId: parsed.bankId,
      profileId: profile.id,
      question,
      supabase,
    });
    const reason = draftDecisionReason(
      parsed.reason,
      "Teacher requested fixes before Library approval.",
    );
    const { error } = await supabase
      .from("review_draft_items")
      .update({
        status: "needs_more_evidence",
        target_bank_id: parsed.bankId,
      } as never)
      .eq("id", lineage.reviewDraftItemId);

    if (error) {
      throw new Error(error.message);
    }

    await recordBankReviewAction({
      actionKind: "request_more_evidence",
      evidence: [
        {
          draftOnly: true,
          questionId: parsed.questionId,
          targetBankId: parsed.bankId,
        },
      ],
      profileId: profile.id,
      reason,
      reviewBatchId: lineage.reviewBatchId,
      reviewDraftItemId: lineage.reviewDraftItemId,
      supabase,
    });

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/review`,
      "Review Draft marked needs fix. It remains private and is not assigned or published.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function rejectBankReviewDraftQuestion(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/review`;

  try {
    const profile = await requireTeacher();
    const parsed = bankReviewQuestionDecisionSchema.parse(
      Object.fromEntries(formData),
    );
    const supabase = await createClient();
    const { question } = await loadManageableBankReviewDraft({
      bankId: parsed.bankId,
      profileId: profile.id,
      questionId: parsed.questionId,
      supabase,
    });
    const lineage = await resolveOrCreateBankReviewDraftLineage({
      bankId: parsed.bankId,
      profileId: profile.id,
      question,
      supabase,
    });
    const reason = draftDecisionReason(
      parsed.reason,
      "Teacher rejected this Review Draft before Library approval.",
    );

    const { error: reviewItemError } = await supabase
      .from("review_draft_items")
      .update({
        status: "rejected",
        target_bank_id: parsed.bankId,
      } as never)
      .eq("id", lineage.reviewDraftItemId);

    if (reviewItemError) {
      throw new Error(reviewItemError.message);
    }

    const { error: questionError } = await supabase
      .from("questions")
      .update({
        published_at: null,
        source_review_item_id: lineage.reviewDraftItemId,
        status: "archived",
        updated_by: profile.id,
      } as never)
      .eq("id", parsed.questionId)
      .eq("owner_bank_id", parsed.bankId)
      .eq("status", "draft")
      .is("published_at", null);

    if (questionError) {
      throw new Error(questionError.message);
    }

    await recordBankReviewAction({
      actionKind: "reject",
      evidence: [
        {
          archivedDraft: true,
          questionId: parsed.questionId,
          targetBankId: parsed.bankId,
        },
      ],
      profileId: profile.id,
      reason,
      reviewBatchId: lineage.reviewBatchId,
      reviewDraftItemId: lineage.reviewDraftItemId,
      supabase,
    });

    await supabase.from("question_status_events").insert({
      actor_id: profile.id,
      from_status: question.status,
      question_id: parsed.questionId,
      reason: "Review Draft rejected before Library approval.",
      to_status: "archived",
    } as never);

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/questions`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/review`,
      "Review Draft rejected and archived. It was not published, assigned, or added to the Library.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function createAssignmentFromBankQuestions(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/assignments/new`;

  try {
    await requireTeacher();
    const parsed = bankAssignmentCreateSchema.parse(Object.fromEntries(formData));
    const selectedBankQuestionIds = Array.from(
      new Set(
        formData
          .getAll("bankQuestionIds")
          .map((value) => String(value))
          .filter(Boolean),
      ),
    );

    if (!selectedBankQuestionIds.length) {
      throw new Error("Choose at least one approved Library question.");
    }

    const supabase = await createClient();
    const { data: assignmentId, error } = await supabase.rpc(
      "create_assignment_from_bank",
      {
        p_assign_now: parsed.publishMode === "assigned",
        p_assignment_due_at: normalizeDueAt(parsed.dueAt),
        p_assignment_instructions: parsed.instructions || null,
        p_assignment_title: parsed.title,
        p_selected_bank_question_ids: selectedBankQuestionIds,
        p_target_bank_id: parsed.bankId,
        p_target_classroom_id: parsed.classroomId,
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    if (!assignmentId) {
      throw new Error("Assignment was not created from this Library.");
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/assignments/new`);
    revalidatePath(`/teacher/classrooms/${parsed.classroomId}/assignments`);
    revalidatePath(`/teacher/classrooms/${parsed.classroomId}/assignments/${assignmentId}`);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/assignments/${assignmentId}`,
      parsed.publishMode === "assigned"
        ? "Assignment created from selected Library questions and assigned to class."
        : "Draft assignment created from selected Library questions.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function createBankQuestionRevisionDraft(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/questions`;
  let copiedAssets:
    | Awaited<ReturnType<typeof copyQuestionAssetsForIndependentUse>>
    | undefined;

  try {
    const profile = await requireTeacher();
    const parsed = bankQuestionRevisionSchema.parse(Object.fromEntries(formData));
    const { supabase } = await requireManageableBankForAction({
      bankId: parsed.bankId,
      profileId: profile.id,
    });
    const { data: assets, error: assetError } = await supabase
      .from("question_assets")
      .select(
        "id, asset_kind, storage_bucket, storage_path, label, alt_text, display_order",
      )
      .eq("question_id", parsed.questionId)
      .order("display_order");
    if (assetError) throw new Error(assetError.message);

    copiedAssets = await copyQuestionAssetsForIndependentUse({
      assets: assets ?? [],
      destinationPrefix: `library-revisions/${parsed.bankId}/${parsed.questionId}`,
    });
    const finalizeClient = createServiceRoleClient();
    const { data: revisionId, error } = await finalizeClient.rpc(
      "create_bank_question_revision_draft",
      {
        p_actor_id: profile.id,
        p_bank_id: parsed.bankId,
        p_copied_assets: copiedAssets.assets,
        p_source_question_id: parsed.questionId,
      },
    );

    if (error) throw new Error(error.message);
    if (!revisionId) throw new Error("The revision draft was not created.");

    revalidatePath(`/teacher/banks/${parsed.bankId}/questions`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/review`,
      "Revision draft created. The current assignment-ready question remains active until this revision is approved.",
    );
  } catch (error) {
    const message = formatActionError(error);
    await copiedAssets?.cleanup();
    redirectWithError(fallbackPath, message);
  }
}

export async function submitBankQuestionsToPublicReview(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/questions`;

  try {
    const profile = await requireTeacher();
    const parsed = bankPublicSubmissionSchema.parse(Object.fromEntries(formData));
    const bankQuestionIds = Array.from(
      new Set(
        formData
          .getAll("bankQuestionId")
          .map(String)
          .filter(Boolean),
      ),
    );

    if (!bankQuestionIds.length) {
      throw new Error("Select at least one assignment-ready question.");
    }

    const { supabase } = await requireManageableBankForAction({
      bankId: parsed.bankId,
      profileId: profile.id,
    });
    const { data: scopedRows, error: scopeError } = await supabase
      .from("bank_questions")
      .select("id")
      .eq("bank_id", parsed.bankId)
      .eq("status", "active")
      .in("id", bankQuestionIds);

    if (scopeError) throw new Error(scopeError.message);
    if ((scopedRows?.length ?? 0) !== bankQuestionIds.length) {
      throw new Error(
        "Every selected question must be assignment-ready in the current Library.",
      );
    }

    const { data, error } = await supabase.rpc(
      "submit_bank_questions_to_public_review",
      {
        p_public_license_confirmed: true,
        p_source_bank_question_ids: bankQuestionIds,
      },
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/teacher/banks/${parsed.bankId}/questions`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/submissions`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/submissions`,
      `${data?.length ?? 0} immutable snapshot${data?.length === 1 ? "" : "s"} submitted for independent Super Admin review.`,
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function withdrawPublicQuestionSubmission(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/submissions`;

  try {
    const profile = await requireTeacher();
    const parsed = publicSubmissionWithdrawSchema.parse(
      Object.fromEntries(formData),
    );
    const { supabase } = await requireManageableBankForAction({
      bankId: parsed.bankId,
      profileId: profile.id,
    });
    const { error } = await supabase.rpc(
      "withdraw_public_question_submission",
      { p_submission_id: parsed.submissionId },
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/teacher/banks/${parsed.bankId}/submissions`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/submissions`,
      "Public submission withdrawn. The Library question was not changed.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function pullPublicQuestionIntoBank(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/questions?public=1`;
  let copiedAssets:
    | Awaited<ReturnType<typeof copyQuestionAssetsForIndependentUse>>
    | undefined;

  try {
    const profile = await requireTeacher();
    const parsed = publicQuestionPullSchema.parse(Object.fromEntries(formData));
    const { supabase } = await requireManageableBankForAction({
      bankId: parsed.bankId,
      profileId: profile.id,
    });
    const { data: publicQuestion, error: questionError } = await supabase
      .from("questions")
      .select("id, owner_bank_id, status, visibility")
      .eq("id", parsed.publicQuestionId)
      .is("owner_bank_id", null)
      .eq("status", "published")
      .eq("visibility", "public")
      .maybeSingle();

    if (questionError) throw new Error(questionError.message);
    if (!publicQuestion) {
      throw new Error("The Central Public Library question is unavailable.");
    }

    const { data: assets, error: assetError } = await supabase
      .from("question_assets")
      .select(
        "id, asset_kind, storage_bucket, storage_path, label, alt_text, display_order",
      )
      .eq("question_id", parsed.publicQuestionId)
      .order("display_order");

    if (assetError) throw new Error(assetError.message);

    copiedAssets = await copyQuestionAssetsForIndependentUse({
      assets: assets ?? [],
      destinationPrefix: `library-pulls/${parsed.bankId}`,
    });
    const finalizeClient = createServiceRoleClient();
    const { data: copiedQuestionId, error } = await finalizeClient.rpc(
      "pull_public_question_to_bank",
      {
        p_actor_id: profile.id,
        p_bank_id: parsed.bankId,
        p_copied_assets: copiedAssets.assets,
        p_public_question_id: parsed.publicQuestionId,
      },
    );

    if (error) throw new Error(error.message);
    if (!copiedQuestionId) throw new Error("The public question was not copied.");

    revalidatePath(`/teacher/banks/${parsed.bankId}/questions`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/questions`,
      "Independent Library copy created with approved taxonomy and asset lineage.",
    );
  } catch (error) {
    const message = formatActionError(error);
    await copiedAssets?.cleanup();
    redirectWithError(fallbackPath, message);
  }
}
