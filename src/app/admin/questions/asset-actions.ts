"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import {
  QUESTION_ASSETS_BUCKET,
  questionAssetExtensionForMimeType,
} from "@/lib/question-assets";
import { createClient } from "@/lib/supabase/server";
import { getQuestionAssetUrl } from "@/lib/storage/question-assets";
import type { QuestionAssetView } from "@/lib/questions/media-workspace";
import {
  deleteQuestionAssetSchema,
  ensureQuestionDraftForUploadSchema,
  finalizeQuestionAssetUploadSchema,
  reserveQuestionAssetUploadSchema,
  updateQuestionAssetDisplaySchema,
} from "@/lib/validations/question-asset";

export type { QuestionAssetView } from "@/lib/questions/media-workspace";

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

async function assertGlobalQuestion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questionId: string,
) {
  const { data, error } = await supabase
    .from("questions")
    .select("id")
    .eq("id", questionId)
    .is("owner_bank_id", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "Admin asset actions only support Central Public Library questions.",
    );
  }
}

export async function ensureQuestionDraftForUpload(input: unknown) {
  const profile = await requireAdmin();
  const parsed = ensureQuestionDraftForUploadSchema.parse(input);
  const supabase = await createClient();

  if (parsed.draftId) {
    const { data: draft, error: draftError } = await supabase
      .from("questions")
      .select("id, status, created_by")
      .eq("id", parsed.draftId)
      .is("owner_bank_id", null)
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

  const { data: questionId, error } = await supabase.rpc(
    "create_global_manual_question_draft",
    {
      p_question_code: parsed.questionCode,
      p_title: parsed.title,
    },
  );

  if (error) {
    throw new Error(error.message);
  }
  if (!questionId) throw new Error("The global Review Draft was not created.");

  revalidatePath("/admin/questions");
  revalidatePath("/admin/review");
  return { questionId };
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
    .is("owner_bank_id", null)
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
    .select("id, question_id, storage_path, label, alt_text, display_on_detail")
    .eq("id", parsed.assetId)
    .maybeSingle();

  if (assetError) {
    throw new Error(assetError.message);
  }

  if (!asset || !asset.question_id) {
    throw new Error("Image upload record not found.");
  }
  await assertGlobalQuestion(supabase, asset.question_id);

  const directory = `questions/${asset.question_id}`;
  const filename = asset.storage_path.slice(directory.length + 1);
  const { data: objects, error: listError } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .list(directory, { search: filename });

  if (listError) {
    throw new Error(listError.message);
  }

  if (!objects?.some((object) => object.name === filename)) {
    throw new Error("Uploaded image was not found in storage.");
  }

  return {
    id: asset.id,
    questionId: asset.question_id,
    originalFilename: assetDisplayName(asset),
    publicUrl: getQuestionAssetUrl(asset.id),
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
    .select("id, question_id, display_on_detail")
    .single();

  if (error) {
    throw new Error(error.message);
  }
  await assertGlobalQuestion(supabase, asset.question_id);

  if (asset.question_id) {
    revalidatePath(`/questions/${asset.question_id}`);
  }

  revalidatePath("/admin/questions");
  return {
    assetId: asset.id,
    displayOnDetail: asset.display_on_detail,
  };
}

export async function deleteQuestionAsset(input: unknown) {
  await requireAdmin();
  const parsed = deleteQuestionAssetSchema.parse(input);
  const supabase = await createClient();
  const { data: asset, error: assetError } = await supabase
    .from("question_assets")
    .select("id, question_id, storage_path")
    .eq("id", parsed.assetId)
    .maybeSingle();

  if (assetError) {
    throw new Error(assetError.message);
  }

  if (!asset) {
    throw new Error("Image not found.");
  }
  await assertGlobalQuestion(supabase, asset.question_id);

  const { error: storageError } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .remove([asset.storage_path]);

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
