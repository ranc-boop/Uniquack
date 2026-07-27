"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacher } from "@/lib/auth/guards";
import {
  QUESTION_ASSETS_BUCKET,
  questionAssetExtensionForMimeType,
} from "@/lib/question-assets";
import {
  QUESTION_SOURCE_FILES_BUCKET,
  normalizeQuestionSourceFileMimeType,
  questionSourceFileExtensionForMimeType,
} from "@/lib/question-source-files";
import {
  canManageBankContent,
  getTeacherQuestionBankDetail,
} from "@/lib/question-banks";
import type {
  QuestionAssetView,
  QuestionSourceFileView,
} from "@/lib/questions/media-workspace";
import { getQuestionAssetUrl } from "@/lib/storage/question-assets";
import { createClient } from "@/lib/supabase/server";
import {
  deleteQuestionAssetSchema,
  ensureQuestionDraftForUploadSchema,
  finalizeQuestionAssetUploadSchema,
  reserveQuestionAssetUploadSchema,
  updateQuestionAssetDisplaySchema,
} from "@/lib/validations/question-asset";
import {
  cancelQuestionSourceFileUploadSchema,
  createQuestionSourceFileSignedUrlSchema,
  deleteQuestionSourceFileSchema,
  ensureQuestionDraftForSourceUploadSchema,
  finalizeQuestionSourceFileUploadSchema,
  reserveQuestionSourceFileUploadSchema,
} from "@/lib/validations/question-source-file";

const bankScopeSchema = z.string().uuid();

function assetDisplayName(asset: {
  alt_text?: string | null;
  label?: string | null;
  storage_path?: string | null;
}) {
  return (
    asset.label?.trim() ||
    asset.alt_text?.trim() ||
    asset.storage_path?.split("/").pop() ||
    "Question image"
  );
}

async function requireBankManager(bankIdInput: string) {
  const bankId = bankScopeSchema.parse(bankIdInput);
  const profile = await requireTeacher();
  const supabase = await createClient();
  const detail = await getTeacherQuestionBankDetail({
    bankId,
    profileId: profile.id,
    supabase,
  });

  if (!detail || !canManageBankContent(detail.currentUserRole)) {
    throw new Error("Only Library owners and editors can manage question files.");
  }
  if (detail.bank.status !== "active") {
    throw new Error("Only active Libraries can manage question files.");
  }

  return { bankId, profile, supabase };
}

async function assertBankDraft(
  bankId: string,
  questionId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data, error } = await supabase
    .from("questions")
    .select("id, owner_bank_id, status, deleted_at")
    .eq("id", questionId)
    .eq("owner_bank_id", bankId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.status !== "draft" || data.deleted_at) {
    throw new Error("The Library Review Draft is no longer available.");
  }

  return data;
}

async function questionIdForAsset(
  bankId: string,
  assetId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data, error } = await supabase
    .from("question_assets")
    .select(
      "id, question_id, storage_path, label, alt_text, display_on_detail",
    )
    .eq("id", assetId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.question_id) throw new Error("Image not found.");
  await assertBankDraft(bankId, data.question_id, supabase);
  return data;
}

async function sourceFileForBankDraft(
  bankId: string,
  sourceFileId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data, error } = await supabase
    .from("question_source_files")
    .select(
      "id, question_id, object_path, original_filename, mime_type, size_bytes, status",
    )
    .eq("id", sourceFileId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.question_id) throw new Error("Source file not found.");
  await assertBankDraft(bankId, data.question_id, supabase);
  return data;
}

function revalidateBankDraft(bankId: string) {
  revalidatePath(`/teacher/banks/${bankId}/imports`);
  revalidatePath(`/teacher/banks/${bankId}/review`);
}

export async function ensureBankQuestionDraftForUpload(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = ensureQuestionDraftForUploadSchema.parse(input);
  const { bankId, profile, supabase } = await requireBankManager(bankIdInput);

  if (parsed.draftId) {
    await assertBankDraft(bankId, parsed.draftId, supabase);
    const { error } = await supabase
      .from("questions")
      .update({
        question_code: parsed.questionCode,
        title: parsed.title,
        updated_by: profile.id,
      })
      .eq("id", parsed.draftId)
      .eq("owner_bank_id", bankId)
      .eq("status", "draft");

    if (error) throw new Error(error.message);
    return { questionId: parsed.draftId };
  }

  const { data, error } = await supabase.rpc(
    "create_bank_manual_question_draft",
    {
      p_bank_id: bankId,
      p_question_code: parsed.questionCode,
      p_title: parsed.title,
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("The Library Review Draft could not be created.");
  revalidateBankDraft(bankId);
  return { questionId: data };
}

export async function ensureBankQuestionDraftForSourceUpload(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = ensureQuestionDraftForSourceUploadSchema.parse(input);
  return ensureBankQuestionDraftForUpload(bankIdInput, parsed);
}

export async function reserveBankQuestionAssetUpload(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = reserveQuestionAssetUploadSchema.parse(input);
  const extension = questionAssetExtensionForMimeType(parsed.mimeType);
  if (!extension) throw new Error("Unsupported image type.");

  const { bankId, profile, supabase } = await requireBankManager(bankIdInput);
  await assertBankDraft(bankId, parsed.questionId, supabase);

  const assetId = crypto.randomUUID();
  const objectPath = `questions/${parsed.questionId}/${assetId}.${extension}`;
  const { error: assetError } = await supabase.from("question_assets").insert({
    alt_text: parsed.originalFilename,
    asset_kind: "image",
    created_by: profile.id,
    display_order: 0,
    id: assetId,
    label: parsed.originalFilename,
    question_id: parsed.questionId,
    storage_bucket: QUESTION_ASSETS_BUCKET,
    storage_path: objectPath,
  });

  if (assetError) throw new Error(assetError.message);
  const { data, error } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .createSignedUploadUrl(objectPath);

  if (error) {
    await supabase.from("question_assets").delete().eq("id", assetId);
    throw new Error(error.message);
  }

  return { assetId, objectPath, token: data.token };
}

export async function finalizeBankQuestionAssetUpload(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = finalizeQuestionAssetUploadSchema.parse(input);
  const { bankId, supabase } = await requireBankManager(bankIdInput);
  const asset = await questionIdForAsset(bankId, parsed.assetId, supabase);
  const directory = `questions/${asset.question_id}`;
  const filename = asset.storage_path.slice(directory.length + 1);
  const { data: objects, error } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .list(directory, { search: filename });

  if (error) throw new Error(error.message);
  if (!objects?.some((object) => object.name === filename)) {
    throw new Error("Uploaded image was not found in storage.");
  }

  revalidateBankDraft(bankId);
  return {
    id: asset.id,
    questionId: asset.question_id,
    originalFilename: assetDisplayName(asset),
    publicUrl: getQuestionAssetUrl(asset.id),
    displayOnDetail: asset.display_on_detail,
  } satisfies QuestionAssetView;
}

export async function updateBankQuestionAssetDisplay(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = updateQuestionAssetDisplaySchema.parse(input);
  const { bankId, supabase } = await requireBankManager(bankIdInput);
  const asset = await questionIdForAsset(bankId, parsed.assetId, supabase);
  const { data: updated, error } = await supabase
    .from("question_assets")
    .update({ display_on_detail: parsed.displayOnDetail })
    .eq("id", asset.id)
    .select("id, display_on_detail")
    .single();
  if (error) throw new Error(error.message);
  revalidateBankDraft(bankId);
  return {
    assetId: updated.id,
    displayOnDetail: updated.display_on_detail,
  };
}

export async function deleteBankQuestionAsset(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = deleteQuestionAssetSchema.parse(input);
  const { bankId, supabase } = await requireBankManager(bankIdInput);
  const asset = await questionIdForAsset(bankId, parsed.assetId, supabase);
  const { error: storageError } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .remove([asset.storage_path]);
  if (storageError) throw new Error(storageError.message);

  const { error } = await supabase
    .from("question_assets")
    .delete()
    .eq("id", asset.id);
  if (error) throw new Error(error.message);
  revalidateBankDraft(bankId);
  return { assetId: asset.id };
}

export async function reserveBankQuestionSourceFileUpload(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = reserveQuestionSourceFileUploadSchema.parse(input);
  const mimeType = normalizeQuestionSourceFileMimeType({
    fileName: parsed.originalFilename,
    mimeType: parsed.mimeType,
  });
  const extension = mimeType
    ? questionSourceFileExtensionForMimeType(mimeType)
    : null;
  if (!mimeType || !extension) throw new Error("Unsupported source file type.");

  const { bankId, profile, supabase } = await requireBankManager(bankIdInput);
  await assertBankDraft(bankId, parsed.questionId, supabase);
  const sourceFileId = crypto.randomUUID();
  const objectPath = `questions/${parsed.questionId}/${sourceFileId}.${extension}`;
  const { error: insertError } = await supabase
    .from("question_source_files")
    .insert({
      id: sourceFileId,
      question_id: parsed.questionId,
      object_path: objectPath,
      mime_type: mimeType,
      size_bytes: parsed.sizeBytes,
      original_filename: parsed.originalFilename,
      status: "pending",
      created_by: profile.id,
    });

  if (insertError) throw new Error(insertError.message);
  const { data, error } = await supabase.storage
    .from(QUESTION_SOURCE_FILES_BUCKET)
    .createSignedUploadUrl(objectPath);

  if (error) {
    await supabase
      .from("question_source_files")
      .delete()
      .eq("id", sourceFileId);
    throw new Error(error.message);
  }

  return { sourceFileId, objectPath, token: data.token };
}

export async function finalizeBankQuestionSourceFileUpload(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = finalizeQuestionSourceFileUploadSchema.parse(input);
  const { bankId, supabase } = await requireBankManager(bankIdInput);
  const sourceFile = await sourceFileForBankDraft(
    bankId,
    parsed.sourceFileId,
    supabase,
  );
  const directory = `questions/${sourceFile.question_id}`;
  const filename = sourceFile.object_path.slice(directory.length + 1);
  const { data: objects, error } = await supabase.storage
    .from(QUESTION_SOURCE_FILES_BUCKET)
    .list(directory, { search: filename });

  if (error) throw new Error(error.message);
  if (!objects?.some((object) => object.name === filename)) {
    throw new Error("Uploaded source file was not found in storage.");
  }

  if (sourceFile.status !== "ready") {
    const { error: updateError } = await supabase
      .from("question_source_files")
      .update({ status: "ready" })
      .eq("id", sourceFile.id);
    if (updateError) throw new Error(updateError.message);
  }

  revalidateBankDraft(bankId);
  return {
    id: sourceFile.id,
    questionId: sourceFile.question_id,
    originalFilename: sourceFile.original_filename,
    mimeType: sourceFile.mime_type,
    sizeBytes: sourceFile.size_bytes,
    status: "ready",
  } satisfies QuestionSourceFileView;
}

export async function cancelBankQuestionSourceFileUpload(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = cancelQuestionSourceFileUploadSchema.parse(input);
  const { bankId, supabase } = await requireBankManager(bankIdInput);
  const sourceFile = await sourceFileForBankDraft(
    bankId,
    parsed.sourceFileId,
    supabase,
  );
  if (sourceFile.status !== "pending") {
    return { cancelled: false, sourceFileId: sourceFile.id };
  }

  const { error: updateError } = await supabase
    .from("question_source_files")
    .update({ status: "deleted" })
    .eq("id", sourceFile.id)
    .eq("status", "pending");
  if (updateError) throw new Error(updateError.message);

  const { error: storageError } = await supabase.storage
    .from(QUESTION_SOURCE_FILES_BUCKET)
    .remove([sourceFile.object_path]);
  revalidateBankDraft(bankId);
  return {
    cancelled: true,
    sourceFileId: sourceFile.id,
    storageCleanupError: storageError?.message,
  };
}

export async function createBankQuestionSourceFileSignedUrl(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = createQuestionSourceFileSignedUrlSchema.parse(input);
  const { bankId, supabase } = await requireBankManager(bankIdInput);
  const sourceFile = await sourceFileForBankDraft(
    bankId,
    parsed.sourceFileId,
    supabase,
  );
  if (sourceFile.status !== "ready") throw new Error("Source file is not ready.");

  const { data, error } = await supabase.storage
    .from(QUESTION_SOURCE_FILES_BUCKET)
    .createSignedUrl(sourceFile.object_path, 300);
  if (error) throw new Error(error.message);
  return { signedUrl: data.signedUrl };
}

export async function deleteBankQuestionSourceFile(
  bankIdInput: string,
  input: unknown,
) {
  const parsed = deleteQuestionSourceFileSchema.parse(input);
  const { bankId, supabase } = await requireBankManager(bankIdInput);
  const sourceFile = await sourceFileForBankDraft(
    bankId,
    parsed.sourceFileId,
    supabase,
  );
  const { error: storageError } = await supabase.storage
    .from(QUESTION_SOURCE_FILES_BUCKET)
    .remove([sourceFile.object_path]);
  if (storageError) throw new Error(storageError.message);

  const { error } = await supabase
    .from("question_source_files")
    .update({ status: "deleted" })
    .eq("id", sourceFile.id);
  if (error) throw new Error(error.message);
  revalidateBankDraft(bankId);
  return { sourceFileId: sourceFile.id };
}
