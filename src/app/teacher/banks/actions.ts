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
import { processAIPdfImport } from "@/lib/ai-pdf-import/service";
import {
  resolveTeacherAIPdfProviderProfile,
  TEACHER_AI_PDF_PARSING_PROFILES,
} from "@/lib/ai-pdf-import/teacher-parsing-profiles";
import { requireTeacher } from "@/lib/auth/guards";
import {
  importBatchImportJson,
  resolveImportOrganizationContext,
} from "@/lib/batch-import/service";
import {
  canManageBankContent,
  getTeacherQuestionBankDetail,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

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

function normalizeDueAt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Due date is invalid.");
  }

  return parsed.toISOString();
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
      const { error: batchError } = await supabase
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

      const { error: sourceAssetError } = await supabase
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

      const { error: uploadError } = await supabase.storage
        .from(AI_IMPORT_SOURCES_BUCKET)
        .upload(sourceObjectPath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      sourceObjectUploaded = true;

      const { error: readyError } = await supabase
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
        await supabase.storage
          .from(AI_IMPORT_SOURCES_BUCKET)
          .remove([sourceObjectPath]);
      }

      await supabase
        .from("import_batch_assets")
        .delete()
        .eq("id", sourceAssetId);
      await supabase.from("import_batches").delete().eq("id", batchId);

      throw error;
    }

    const summary = await processAIPdfImport({
      batchId,
      fileName: pdfFile.name,
      pdfBuffer,
      profileId: profile.id,
      providerProfileId: provider.id,
      sourceAssetId,
      sourceObjectPath,
      supabase,
      targetBankId: parsed.bankId,
    });
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
    redirectWithError(fallbackPath, formatActionError(error));
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
      `/teacher/banks/${parsed.bankId}/questions`,
      "Review Draft approved into this bank. It was not published to the public library.",
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
