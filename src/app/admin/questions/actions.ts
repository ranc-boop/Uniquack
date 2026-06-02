"use server";

import { revalidatePath } from "next/cache";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { syncBoundVideoTagsForQuestion } from "@/app/admin/videos/tag-sync";
import { requireAdmin } from "@/lib/auth/guards";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { QUESTION_SOURCE_FILES_BUCKET } from "@/lib/question-source-files";
import { sanitizeContentHtml } from "@/lib/sanitize/html";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validations/common";
import {
  questionCreateSchema,
  questionDeleteSchema,
  questionStatusSchema,
  questionTagIdsSchema,
  questionUpdateSchema,
} from "@/lib/validations/question";

export async function createQuestion(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = questionCreateSchema.parse(Object.fromEntries(formData));
    const tagIds = questionTagIdsSchema.parse(
      formData.getAll("tag_ids").map(String).filter(Boolean),
    );
    const draftIdValue = formData.get("draft_id");
    const draftId =
      typeof draftIdValue === "string" && draftIdValue
        ? uuidSchema.parse(draftIdValue)
        : null;
    const supabase = await createClient();

    const values = {
      ...parsed,
      content_html: sanitizeContentHtml(parsed.content_html),
      solution_html: parsed.solution_html
        ? sanitizeContentHtml(parsed.solution_html)
        : null,
      created_by: profile.id,
      updated_by: profile.id,
      published_at:
        parsed.status === "published" ? new Date().toISOString() : null,
    };
    const questionRequest = draftId
      ? supabase
          .from("questions")
          .update(values)
          .eq("id", draftId)
          .eq("status", "draft")
          .eq("created_by", profile.id)
          .select("id")
          .single()
      : supabase.from("questions").insert(values).select("id").single();
    const { data: question, error } = await questionRequest;

    if (error) {
      throw new Error(error.message);
    }

    if (tagIds.length > 0) {
      const { error: tagError } = await supabase.from("question_tags").insert(
        tagIds.map((tagId) => ({
          question_id: question.id,
          tag_id: tagId,
        })),
      );

      if (tagError) {
        throw new Error(tagError.message);
      }
    }
  } catch (error) {
    redirectWithError("/admin/questions", formatActionError(error));
  }

  revalidatePath("/admin/questions");
  revalidatePath("/questions");
  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  redirectWithSaved("/admin/questions", "Question created.");
}

export async function updateQuestion(formData: FormData) {
  let questionId = "";
  let syncedVideoId: string | null = null;

  try {
    const profile = await requireAdmin();
    const parsed = questionUpdateSchema.parse(Object.fromEntries(formData));
    const tagIds = questionTagIdsSchema.parse(
      formData.getAll("tag_ids").map(String).filter(Boolean),
    );
    const supabase = await createClient();
    const { id, ...values } = parsed;
    questionId = id;

    const { error } = await supabase
      .from("questions")
      .update({
        ...values,
        content_html: sanitizeContentHtml(values.content_html),
        solution_html: values.solution_html
          ? sanitizeContentHtml(values.solution_html)
          : null,
        updated_by: profile.id,
        published_at:
          values.status === "published" ? new Date().toISOString() : null,
      })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    const { error: deleteTagsError } = await supabase
      .from("question_tags")
      .delete()
      .eq("question_id", id);

    if (deleteTagsError) {
      throw new Error(deleteTagsError.message);
    }

    if (tagIds.length > 0) {
      const { error: tagError } = await supabase.from("question_tags").insert(
        tagIds.map((tagId) => ({
          question_id: id,
          tag_id: tagId,
        })),
      );

      if (tagError) {
        throw new Error(tagError.message);
      }
    }

    syncedVideoId = await syncBoundVideoTagsForQuestion({
      supabase,
      questionId: id,
    });
  } catch (error) {
    redirectWithError("/admin/questions", formatActionError(error));
  }

  revalidatePath("/admin/questions");
  revalidatePath("/questions");
  revalidatePath(`/questions/${questionId}`);
  revalidatePath("/videos");
  revalidatePath("/admin/videos");
  if (syncedVideoId) {
    revalidatePath(`/videos/${syncedVideoId}`);
  }
  redirectWithSaved("/admin/questions", "Question updated.");
}

export async function updateQuestionStatus(formData: FormData) {
  let questionId = "";

  try {
    const profile = await requireAdmin();
    const parsed = questionStatusSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    questionId = parsed.id;

    const { error } = await supabase
      .from("questions")
      .update({
        status: parsed.status,
        updated_by: profile.id,
        published_at:
          parsed.status === "published" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/questions", formatActionError(error));
  }

  revalidatePath("/admin/questions");
  revalidatePath("/questions");
  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  revalidatePath(`/questions/${questionId}`);
  redirectWithSaved("/admin/questions", "Question status updated.");
}

export async function deleteQuestion(formData: FormData) {
  let questionId = "";

  try {
    await requireAdmin();
    const parsed = questionDeleteSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    questionId = parsed.id;
    const { data: assets, error: assetsError } = await supabase
      .from("question_assets")
      .select("id, object_path")
      .eq("question_id", parsed.id);

    if (assetsError) {
      throw new Error(assetsError.message);
    }

    if (assets?.length) {
      const { error: storageError } = await supabase.storage
        .from(QUESTION_ASSETS_BUCKET)
        .remove(assets.map((asset) => asset.object_path));

      if (storageError) {
        throw new Error(storageError.message);
      }

      const { error: assetsDeleteError } = await supabase
        .from("question_assets")
        .delete()
        .eq("question_id", parsed.id);

      if (assetsDeleteError) {
        throw new Error(assetsDeleteError.message);
      }
    }

    const { data: sourceFiles, error: sourceFilesError } = await supabase
      .from("question_source_files")
      .select("id, object_path")
      .eq("question_id", parsed.id)
      .neq("status", "deleted");

    if (sourceFilesError) {
      throw new Error(sourceFilesError.message);
    }

    if (sourceFiles?.length) {
      const { error: sourceStorageError } = await supabase.storage
        .from(QUESTION_SOURCE_FILES_BUCKET)
        .remove(sourceFiles.map((sourceFile) => sourceFile.object_path));

      if (sourceStorageError) {
        throw new Error(sourceStorageError.message);
      }

      const { error: sourceFilesUpdateError } = await supabase
        .from("question_source_files")
        .update({ status: "deleted" })
        .eq("question_id", parsed.id);

      if (sourceFilesUpdateError) {
        throw new Error(sourceFilesUpdateError.message);
      }
    }

    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/questions", formatActionError(error));
  }

  revalidatePath("/admin/questions");
  revalidatePath("/questions");
  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  revalidatePath(`/questions/${questionId}`);
  redirectWithSaved("/admin/questions", "Question deleted.");
}
