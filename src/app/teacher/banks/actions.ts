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
  AI_PDF_IMPORT_MAX_BYTES,
} from "@/lib/ai-pdf-import/constants";
import {
  processAIPdfImport,
  recordAIPdfProviderFailure,
} from "@/lib/ai-pdf-import/service";
import {
  isAIProviderError,
  safeAIProviderMessage,
} from "@/lib/ai-providers/errors";
import {
  resolveTeacherAIPdfProviderProfile,
  TEACHER_AI_PDF_PARSING_PROFILES,
} from "@/lib/ai-pdf-import/teacher-parsing-profiles";
import { requireTeacher } from "@/lib/auth/guards";
import {
  importBatchImportJson,
  resolveImportOrganizationContext,
} from "@/lib/batch-import/service";
import { markdownLatexToHtml } from "@/lib/markdown-latex/markdown";
import {
  canManageBankContent,
  getTeacherQuestionBankDetail,
} from "@/lib/question-banks";
import { sanitizeContentHtml } from "@/lib/sanitize/html";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

const bankCreateSchema = z.object({
  description: z.string().trim().max(2000).optional().default(""),
  name: z.string().trim().min(1).max(120),
  visibility: z
    .enum(["private", "shared", "organization", "public"])
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

const bankImportPdfSchema = z.object({
  bankId: z.string().uuid(),
  parsingProfile: z
    .enum(TEACHER_AI_PDF_PARSING_PROFILES)
    .default("standard"),
});

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
    throw new Error("Question Bank was not found.");
  }

  if (!canManageBankContent(detail.currentUserRole)) {
    throw new Error("Only bank owners or editors can change Review Drafts.");
  }

  if (detail.bank.status !== "active") {
    throw new Error("Only active Question Banks can change Review Drafts.");
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
    throw new Error("This Review Draft belongs to a different Question Bank.");
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
    throw new Error("Public questions cannot be changed from bank Review Drafts.");
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
      throw new Error("Review Draft lineage is not scoped to this Question Bank.");
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
      title: "Bank-scoped Review Draft action",
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

function safeFilename(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "teacher-ai-import.pdf"
  );
}

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function getPdfFileFromForm(formData: FormData) {
  const value = formData.get("pdf") ?? formData.get("sourcePdf");

  if (!value || typeof value === "string") {
    throw new Error("Choose a private PDF source before starting AI Parsing.");
  }

  const file = value as File;

  if (!isPdfFile(file)) {
    throw new Error("Only PDF files can be imported into a bank.");
  }

  if (!file.size || file.size <= 0) {
    throw new Error("The selected PDF is empty.");
  }

  if (file.size > AI_PDF_IMPORT_MAX_BYTES) {
    throw new Error("PDF is larger than 50MB.");
  }

  return file;
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
      throw new Error("Question Bank was not created.");
    }

    revalidatePath("/teacher");
    revalidatePath("/teacher/banks");
    redirectWithSaved(
      `/teacher/banks/${bankId}`,
      "Question Bank created. Start with reviewed content before assigning work.",
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
      throw new Error("Bank share code was not created.");
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
      throw new Error("Unable to join that Question Bank.");
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
    redirectWithSaved(fallbackPath, "Bank member role updated.");
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
    redirectWithSaved(fallbackPath, "Bank member removed.");
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function importBankJsonDrafts(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/imports`;

  try {
    const profile = await requireTeacher();
    const parsed = bankImportJsonSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

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
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/review`,
      `Imported ${summary.createdCount} draft question(s). Review before adding them to this bank.`,
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function importBankPdfDrafts(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/imports`;

  try {
    const profile = await requireTeacher();
    assertNoRawProviderConfig(formData);
    const parsed = bankImportPdfSchema.parse(Object.fromEntries(formData));
    const pdfFile = getPdfFileFromForm(formData);
    const supabase = await createClient();
    const detail = await getTeacherQuestionBankDetail({
      bankId: parsed.bankId,
      profileId: profile.id,
      supabase,
    });

    if (!detail) {
      throw new Error("Target Question Bank was not found.");
    }

    if (!canManageBankContent(detail.currentUserRole)) {
      throw new Error("Only bank owners and editors can import PDF drafts.");
    }

    if (detail.bank.status !== "active") {
      throw new Error("Only active Question Banks can receive AI imports.");
    }

    const provider = await resolveTeacherAIPdfProviderProfile({
      parsingProfile: parsed.parsingProfile,
      supabase,
    });

    const organizationContext = await resolveImportOrganizationContext({
      existingOrganizationId: detail.bank.organization_id,
      profileId: profile.id,
      supabase,
    });
    const importSupabase = createServiceRoleClient();
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    const batchId = crypto.randomUUID();
    const sourceAssetId = crypto.randomUUID();
    const sourceObjectPath = `ai-pdf-imports/${batchId}/${sourceAssetId}-${safeFilename(
      pdfFile.name,
    )}`;
    const reviewRoute = `/teacher/banks/${parsed.bankId}/review`;
    const now = new Date().toISOString();
    let sourceObjectUploaded = false;

    try {
      const { error: batchError } = await importSupabase
        .from("import_batches")
        .insert({
          created_by: profile.id,
          id: batchId,
          organization_id: organizationContext.organizationId,
          source_type: "ai_pdf",
          status: "draft",
          summary: {
            aiPdfImport: {
              fileName: pdfFile.name,
              importedFrom: "teacher_bank_ai_pdf_import",
              phase: "source_uploaded",
              reviewRoute,
              reviewScope: "question_bank",
              sourceAssetId,
              sourceObjectPath,
              targetBankId: parsed.bankId,
            },
            importedFrom: "teacher_bank_ai_pdf_import",
            reviewGate: "bank_review_required",
            reviewRoute,
            reviewScope: "question_bank",
            targetBankId: parsed.bankId,
          },
          target_bank_id: parsed.bankId,
        } as never);

      if (batchError) {
        throw new Error(batchError.message);
      }

      const { error: sourceAssetError } = await importSupabase
        .from("import_batch_assets")
        .insert({
          asset_role: "source_pdf",
          batch_id: batchId,
          created_by: profile.id,
          id: sourceAssetId,
          metadata: {
            targetBankId: parsed.bankId,
            uploadReservedAt: now,
            uploadState: "server_uploading",
          },
          mime_type: "application/pdf",
          object_path: sourceObjectPath,
          original_filename: pdfFile.name,
          size_bytes: pdfFile.size,
          status: "pending",
        } as never);

      if (sourceAssetError) {
        throw new Error(sourceAssetError.message);
      }

      const { error: uploadError } = await importSupabase.storage
        .from(AI_IMPORT_SOURCES_BUCKET)
        .upload(sourceObjectPath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      sourceObjectUploaded = true;

      const { error: readyError } = await importSupabase
        .from("import_batch_assets")
        .update({
          metadata: {
            targetBankId: parsed.bankId,
            uploadCompletedAt: new Date().toISOString(),
            uploadReservedAt: now,
            uploadState: "server_uploaded",
          },
          status: "ready",
        } as never)
        .eq("id", sourceAssetId);

      if (readyError) {
        throw new Error(readyError.message);
      }
    } catch (error) {
      if (sourceObjectUploaded) {
        await importSupabase.storage
          .from(AI_IMPORT_SOURCES_BUCKET)
          .remove([sourceObjectPath]);
      }

      await importSupabase
        .from("import_batch_assets")
        .delete()
        .eq("id", sourceAssetId);
      await importSupabase.from("import_batches").delete().eq("id", batchId);

      throw error;
    }

    const processInput = {
      batchId,
      fileName: pdfFile.name,
      pdfBuffer,
      profileId: profile.id,
      providerProfileId: provider.id,
      sourceAssetId,
      sourceObjectPath,
      supabase: importSupabase,
      targetBankId: parsed.bankId,
    };
    let summary: Awaited<ReturnType<typeof processAIPdfImport>>;

    try {
      summary = await processAIPdfImport(processInput);
    } catch (error) {
      if (isAIProviderError(error)) {
        try {
          await recordAIPdfProviderFailure({
            error,
            input: processInput,
          });
        } catch {
          // Preserve the original provider failure for the teacher redirect.
        }
      }

      throw error;
    }
    const createdCount =
      typeof summary.createdCount === "number" ? summary.createdCount : 0;

    revalidatePath("/teacher/ai-parsing");
    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/imports`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
    redirectWithSaved(
      reviewRoute,
      `AI Parsing created ${createdCount} bank-scoped draft question(s). Review before assignment.`,
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
      throw new Error("Review Draft was not approved into this bank.");
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/questions`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/review`,
      "Review Draft approved into this bank. It was not published to the public library.",
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
      reason: "Teacher edited Review Draft content before bank approval.",
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
      "Teacher requested fixes before bank approval.",
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
      "Teacher rejected this Review Draft before bank approval.",
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
      reason: "Review Draft rejected before bank approval.",
      to_status: "archived",
    } as never);

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/review`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/questions`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/review`,
      "Review Draft rejected and archived. It was not published, assigned, or added to the bank.",
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
      throw new Error("Choose at least one approved bank question.");
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
      throw new Error("Assignment was not created from this bank.");
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/assignments/new`);
    revalidatePath(`/teacher/classrooms/${parsed.classroomId}/assignments`);
    revalidatePath(`/teacher/classrooms/${parsed.classroomId}/assignments/${assignmentId}`);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/assignments/${assignmentId}`,
      parsed.publishMode === "assigned"
        ? "Assignment created from selected bank questions and assigned to class."
        : "Draft assignment created from selected bank questions.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}
