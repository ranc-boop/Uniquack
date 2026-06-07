"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import {
  QUESTION_SOURCE_FILES_BUCKET,
  normalizeQuestionSourceFileMimeType,
  questionSourceFileExtensionForMimeType,
} from "@/lib/question-source-files";
import { createClient } from "@/lib/supabase/server";
import {
  cancelQuestionSourceFileUploadSchema,
  createQuestionSourceFileSignedUrlSchema,
  deleteQuestionSourceFileSchema,
  ensureQuestionDraftForSourceUploadSchema,
  finalizeQuestionSourceFileUploadSchema,
  reserveQuestionSourceFileUploadSchema,
} from "@/lib/validations/question-source-file";

export type QuestionSourceFileView = {
  id: string;
  questionId: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: "pending" | "ready" | "deleted";
};

export async function ensureQuestionDraftForSourceUpload(input: unknown) {
  const profile = await requireAdmin();
  const parsed = ensureQuestionDraftForSourceUploadSchema.parse(input);
  const supabase = await createClient();

  if (parsed.draftId) {
    const { data: draft, error: draftError } = await supabase
      .from("questions")
      .select("id, status, created_by")
      .eq("id", parsed.draftId)
      .maybeSingle();

    if (draftError) {
      throw new Error(draftError.message);
    }

    if (
      !draft ||
      draft.status !== "draft" ||
      draft.created_by !== profile.id
    ) {
      throw new Error("The upload draft is no longer available.");
    }

    const { error } = await supabase
      .from("questions")
      .update({
        question_code: parsed.questionCode,
        title: parsed.title,
        updated_by: profile.id,
      })
      .eq("id", parsed.draftId);

    if (error) {
      throw new Error(error.message);
    }

    return { questionId: parsed.draftId };
  }

  const { data: question, error } = await supabase
    .from("questions")
    .insert({
      question_code: parsed.questionCode,
      title: parsed.title,
      content_html: "",
      difficulty_rating: 500,
      question_type: "frq",
      status: "draft",
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/questions");
  return { questionId: question.id };
}

export async function reserveQuestionSourceFileUpload(input: unknown) {
  const profile = await requireAdmin();
  const parsed = reserveQuestionSourceFileUploadSchema.parse(input);
  const mimeType = normalizeQuestionSourceFileMimeType({
    fileName: parsed.originalFilename,
    mimeType: parsed.mimeType,
  });
  const extension = mimeType
    ? questionSourceFileExtensionForMimeType(mimeType)
    : null;

  if (!mimeType || !extension) {
    throw new Error("Unsupported source file type.");
  }

  const supabase = await createClient();
  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("id")
    .eq("id", parsed.questionId)
    .maybeSingle();

  if (questionError) {
    throw new Error(questionError.message);
  }

  if (!question) {
    throw new Error("Question not found.");
  }

  const sourceFileId = crypto.randomUUID();
  const objectPath = `questions/${parsed.questionId}/${sourceFileId}.${extension}`;
  const { error: sourceFileError } = await supabase
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

  if (sourceFileError) {
    throw new Error(sourceFileError.message);
  }

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

  return {
    sourceFileId,
    objectPath,
    token: data.token,
  };
}

export async function finalizeQuestionSourceFileUpload(input: unknown) {
  await requireAdmin();
  const parsed = finalizeQuestionSourceFileUploadSchema.parse(input);
  const supabase = await createClient();
  const { data: sourceFile, error: sourceFileError } = await supabase
    .from("question_source_files")
    .select(
      "id, question_id, object_path, original_filename, mime_type, size_bytes, status",
    )
    .eq("id", parsed.sourceFileId)
    .maybeSingle();

  if (sourceFileError) {
    throw new Error(sourceFileError.message);
  }

  if (!sourceFile?.question_id) {
    throw new Error("Source file upload record not found.");
  }

  const directory = `questions/${sourceFile.question_id}`;
  const filename = sourceFile.object_path.slice(directory.length + 1);
  const { data: objects, error: listError } = await supabase.storage
    .from(QUESTION_SOURCE_FILES_BUCKET)
    .list(directory, { search: filename });

  if (listError) {
    throw new Error(listError.message);
  }

  if (!objects?.some((object) => object.name === filename)) {
    throw new Error("Uploaded source file was not found in storage.");
  }

  if (sourceFile.status !== "ready") {
    const { error: updateError } = await supabase
      .from("question_source_files")
      .update({ status: "ready" })
      .eq("id", sourceFile.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  revalidatePath("/admin/questions");
  return {
    id: sourceFile.id,
    questionId: sourceFile.question_id,
    originalFilename: sourceFile.original_filename,
    mimeType: sourceFile.mime_type,
    sizeBytes: sourceFile.size_bytes,
    status: "ready",
  } satisfies QuestionSourceFileView;
}

export async function cancelQuestionSourceFileUpload(input: unknown) {
  await requireAdmin();
  const parsed = cancelQuestionSourceFileUploadSchema.parse(input);
  const supabase = await createClient();
  const { data: sourceFile, error: sourceFileError } = await supabase
    .from("question_source_files")
    .select("id, object_path, status")
    .eq("id", parsed.sourceFileId)
    .maybeSingle();

  if (sourceFileError) {
    throw new Error(sourceFileError.message);
  }

  if (!sourceFile || sourceFile.status !== "pending") {
    return { cancelled: false, sourceFileId: parsed.sourceFileId };
  }

  const { error: updateError } = await supabase
    .from("question_source_files")
    .update({ status: "deleted" })
    .eq("id", sourceFile.id)
    .eq("status", "pending");

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: storageError } = await supabase.storage
    .from(QUESTION_SOURCE_FILES_BUCKET)
    .remove([sourceFile.object_path]);

  revalidatePath("/admin/questions");

  return {
    cancelled: true,
    sourceFileId: sourceFile.id,
    storageCleanupError: storageError?.message,
  };
}

export async function createQuestionSourceFileSignedUrl(input: unknown) {
  await requireAdmin();
  const parsed = createQuestionSourceFileSignedUrlSchema.parse(input);
  const supabase = await createClient();
  const { data: sourceFile, error: sourceFileError } = await supabase
    .from("question_source_files")
    .select("id, object_path, status")
    .eq("id", parsed.sourceFileId)
    .neq("status", "deleted")
    .maybeSingle();

  if (sourceFileError) {
    throw new Error(sourceFileError.message);
  }

  if (!sourceFile || sourceFile.status !== "ready") {
    throw new Error("Source file is not ready.");
  }

  const { data, error } = await supabase.storage
    .from(QUESTION_SOURCE_FILES_BUCKET)
    .createSignedUrl(sourceFile.object_path, 300);

  if (error) {
    throw new Error(error.message);
  }

  return { signedUrl: data.signedUrl };
}

export async function deleteQuestionSourceFile(input: unknown) {
  await requireAdmin();
  const parsed = deleteQuestionSourceFileSchema.parse(input);
  const supabase = await createClient();
  const { data: sourceFile, error: sourceFileError } = await supabase
    .from("question_source_files")
    .select("id, object_path")
    .eq("id", parsed.sourceFileId)
    .maybeSingle();

  if (sourceFileError) {
    throw new Error(sourceFileError.message);
  }

  if (!sourceFile) {
    throw new Error("Source file not found.");
  }

  const { error: storageError } = await supabase.storage
    .from(QUESTION_SOURCE_FILES_BUCKET)
    .remove([sourceFile.object_path]);

  if (storageError) {
    throw new Error(storageError.message);
  }

  const { error: updateError } = await supabase
    .from("question_source_files")
    .update({ status: "deleted" })
    .eq("id", sourceFile.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/admin/questions");
  return { sourceFileId: sourceFile.id };
}
