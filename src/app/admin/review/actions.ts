"use server";

import { revalidatePath } from "next/cache";

import { syncBoundVideoTagsForQuestion } from "@/app/admin/videos/tag-sync";
import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireAdmin } from "@/lib/auth/guards";
import { sanitizeContentHtml } from "@/lib/sanitize/html";
import { createClient } from "@/lib/supabase/server";
import {
  questionTagIdsSchema,
  questionUpdateSchema,
} from "@/lib/validations/question";

function reviewReturnPath(batchId: string | null) {
  return batchId ? `/admin/review?batch=${batchId}` : "/admin/review";
}

function questionSourceValues(values: {
  content_html: string;
  content_source: string;
  content_source_format: "markdown_latex" | "html";
  solution_html: string | null;
  solution_source: string;
  solution_source_format: "markdown_latex" | "html";
}) {
  return {
    content_html: sanitizeContentHtml(values.content_html),
    content_source: values.content_source || values.content_html,
    content_source_format: values.content_source_format,
    solution_html: values.solution_html
      ? sanitizeContentHtml(values.solution_html)
      : null,
    solution_source: values.solution_source || values.solution_html || null,
    solution_source_format: values.solution_source_format,
  };
}

export async function updateQuestionFromReview(
  batchId: string | null,
  formData: FormData,
) {
  let questionId = "";
  let syncedVideoId: string | null = null;
  const returnPath = reviewReturnPath(batchId);

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
        ...questionSourceValues(values),
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
    redirectWithError(returnPath, formatActionError(error));
  }

  revalidatePath("/admin/review");
  revalidatePath("/admin/questions");
  revalidatePath("/questions");
  revalidatePath(`/questions/${questionId}`);
  revalidatePath("/videos");
  revalidatePath("/admin/videos");
  if (syncedVideoId) {
    revalidatePath(`/videos/${syncedVideoId}`);
  }
  redirectWithSaved(returnPath, "Question updated.");
}
