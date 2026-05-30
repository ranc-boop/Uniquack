"use server";

import { revalidatePath } from "next/cache";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireAdmin } from "@/lib/auth/guards";
import { sanitizeContentHtml } from "@/lib/sanitize/html";
import { createClient } from "@/lib/supabase/server";
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
    const supabase = await createClient();

    const { data: question, error } = await supabase
      .from("questions")
      .insert({
        ...parsed,
        content_html: sanitizeContentHtml(parsed.content_html),
        solution_html: parsed.solution_html
          ? sanitizeContentHtml(parsed.solution_html)
          : null,
        created_by: profile.id,
        updated_by: profile.id,
        published_at:
          parsed.status === "published" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

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
  try {
    const profile = await requireAdmin();
    const parsed = questionUpdateSchema.parse(Object.fromEntries(formData));
    const tagIds = questionTagIdsSchema.parse(
      formData.getAll("tag_ids").map(String).filter(Boolean),
    );
    const supabase = await createClient();
    const { id, ...values } = parsed;

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
  } catch (error) {
    redirectWithError("/admin/questions", formatActionError(error));
  }

  revalidatePath("/admin/questions");
  revalidatePath("/questions");
  revalidatePath("/videos");
  redirectWithSaved("/admin/questions", "Question updated.");
}

export async function updateQuestionStatus(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = questionStatusSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

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
  redirectWithSaved("/admin/questions", "Question status updated.");
}

export async function deleteQuestion(formData: FormData) {
  try {
    await requireAdmin();
    const parsed = questionDeleteSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

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
  redirectWithSaved("/admin/questions", "Question deleted.");
}
