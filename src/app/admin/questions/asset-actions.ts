"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import {
  QUESTION_ASSETS_BUCKET,
  questionAssetExtensionForMimeType,
} from "@/lib/question-assets";
import { createClient } from "@/lib/supabase/server";
import {
  deleteQuestionAssetSchema,
  ensureQuestionDraftForUploadSchema,
  finalizeQuestionAssetUploadSchema,
  reserveQuestionAssetUploadSchema,
  updateQuestionAssetDisplaySchema,
} from "@/lib/validations/question-asset";

export type QuestionAssetView = {
  id: string;
  questionId: string | null;
  originalFilename: string;
  publicUrl: string;
  displayOnDetail: boolean;
};

export async function ensureQuestionDraftForUpload(input: unknown) {
  const profile = await requireAdmin();
  const parsed = ensureQuestionDraftForUploadSchema.parse(input);
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

export async function reserveQuestionAssetUpload(input: unknown) {
  const profile = await requireAdmin();
  const parsed = reserveQuestionAssetUploadSchema.parse(input);
  const extension = questionAssetExtensionForMimeType(parsed.mimeType);

  if (!extension) {
    throw new Error("Unsupported image type.");
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

  const assetId = crypto.randomUUID();
  const objectPath = `questions/${parsed.questionId}/${assetId}.${extension}`;
  const { error: assetError } = await supabase.from("question_assets").insert({
    id: assetId,
    question_id: parsed.questionId,
    object_path: objectPath,
    mime_type: parsed.mimeType,
    size_bytes: parsed.sizeBytes,
    original_filename: parsed.originalFilename,
    status: "pending",
    created_by: profile.id,
  });

  if (assetError) {
    throw new Error(assetError.message);
  }

  const { data, error } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .createSignedUploadUrl(objectPath);

  if (error) {
    await supabase.from("question_assets").delete().eq("id", assetId);
    throw new Error(error.message);
  }

  return {
    assetId,
    objectPath,
    token: data.token,
  };
}

export async function finalizeQuestionAssetUpload(input: unknown) {
  await requireAdmin();
  const parsed = finalizeQuestionAssetUploadSchema.parse(input);
  const supabase = await createClient();
  const { data: asset, error: assetError } = await supabase
    .from("question_assets")
    .select(
      "id, question_id, object_path, original_filename, status, display_on_detail",
    )
    .eq("id", parsed.assetId)
    .maybeSingle();

  if (assetError) {
    throw new Error(assetError.message);
  }

  if (!asset || !asset.question_id) {
    throw new Error("Image upload record not found.");
  }

  const directory = `questions/${asset.question_id}`;
  const filename = asset.object_path.slice(directory.length + 1);
  const { data: objects, error: listError } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .list(directory, { search: filename });

  if (listError) {
    throw new Error(listError.message);
  }

  if (!objects?.some((object) => object.name === filename)) {
    throw new Error("Uploaded image was not found in storage.");
  }

  if (asset.status !== "ready") {
    const { error: updateError } = await supabase
      .from("question_assets")
      .update({ status: "ready" })
      .eq("id", asset.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  const { data } = supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .getPublicUrl(asset.object_path);

  return {
    id: asset.id,
    questionId: asset.question_id,
    originalFilename: asset.original_filename,
    publicUrl: data.publicUrl,
    displayOnDetail: asset.display_on_detail,
  } satisfies QuestionAssetView;
}

export async function updateQuestionAssetDisplay(input: unknown) {
  await requireAdmin();
  const parsed = updateQuestionAssetDisplaySchema.parse(input);
  const supabase = await createClient();
  const { data: asset, error } = await supabase
    .from("question_assets")
    .update({ display_on_detail: parsed.displayOnDetail })
    .eq("id", parsed.assetId)
    .eq("status", "ready")
    .select("id, question_id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (asset.question_id) {
    revalidatePath(`/questions/${asset.question_id}`);
  }

  revalidatePath("/admin/questions");
  return {
    assetId: asset.id,
    displayOnDetail: parsed.displayOnDetail,
  };
}

export async function deleteQuestionAsset(input: unknown) {
  await requireAdmin();
  const parsed = deleteQuestionAssetSchema.parse(input);
  const supabase = await createClient();
  const { data: asset, error: assetError } = await supabase
    .from("question_assets")
    .select("id, object_path")
    .eq("id", parsed.assetId)
    .maybeSingle();

  if (assetError) {
    throw new Error(assetError.message);
  }

  if (!asset) {
    throw new Error("Image not found.");
  }

  const { error: storageError } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .remove([asset.object_path]);

  if (storageError) {
    throw new Error(storageError.message);
  }

  const { error: deleteError } = await supabase
    .from("question_assets")
    .delete()
    .eq("id", asset.id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  revalidatePath("/admin/questions");
  return { assetId: asset.id };
}
