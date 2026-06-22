"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
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
  questionUpdateSchema,
} from "@/lib/validations/question";

const bulkQuestionActionSchema = z.object({
  bulk_action: z.enum(["status", "delete"]),
  return_to: z.string().optional().default("/admin/questions"),
  status: questionStatusSchema.shape.status.optional(),
});

function idsFromFormData(formData: FormData) {
  return Array.from(new Set(formData.getAll("question_id")))
    .filter((value): value is string => typeof value === "string")
    .map((value) => uuidSchema.parse(value));
}

function safeReturnTo(value: string) {
  return value.startsWith("/admin/review") || value.startsWith("/admin/questions")
    ? value
    : "/admin/questions";
}

const taxonomyTagIdPattern = /^math\.[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

function taxonomyTagIdsFromForm(formData: FormData, prefix = "question_tax") {
  const tagIds = new Set<string>();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(`${prefix}_`) || key.endsWith("_search")) {
      continue;
    }

    if (typeof value !== "string") {
      continue;
    }

    const tagId = value.trim();
    if (taxonomyTagIdPattern.test(tagId)) {
      tagIds.add(tagId);
    }
  }

  return Array.from(tagIds);
}

async function replaceQuestionTaxonomyAssignments({
  profileId,
  questionId,
  supabase,
  tagIds,
}: {
  profileId: string;
  questionId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  tagIds: string[];
}) {
  const uniqueTagIds = Array.from(new Set(tagIds));

  const { error: deleteError } = await supabase
    .from("question_taxonomy_assignments")
    .delete()
    .eq("question_id", questionId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!uniqueTagIds.length) {
    return;
  }

  const { error: insertError } = await supabase
    .from("question_taxonomy_assignments")
    .insert(
      uniqueTagIds.map((tagId) => ({
        approved_at: new Date().toISOString(),
        approved_by: profileId,
        confidence: 1,
        created_by: profileId,
        evidence: { source: "admin_question_form" },
        question_id: questionId,
        review_status: "approved",
        source: "manual",
        tag_id: tagId,
        updated_by: profileId,
      })),
    );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function approveQuestionTaxonomyAssignmentsForPublish({
  profileId,
  questionIds,
  supabase,
}: {
  profileId: string;
  questionIds: string[];
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const uniqueQuestionIds = Array.from(new Set(questionIds));

  if (!uniqueQuestionIds.length) {
    return;
  }

  const { error } = await supabase
    .from("question_taxonomy_assignments")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: profileId,
      review_status: "approved",
      updated_by: profileId,
    })
    .in("question_id", uniqueQuestionIds)
    .in("review_status", ["pending_review", "needs_review"]);

  if (error) {
    throw new Error(error.message);
  }
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

export async function createQuestion(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = questionCreateSchema.parse(Object.fromEntries(formData));
    const draftIdValue = formData.get("draft_id");
    const draftId =
      typeof draftIdValue === "string" && draftIdValue
        ? uuidSchema.parse(draftIdValue)
        : null;
    const supabase = await createClient();

    const values = {
      ...parsed,
      ...questionSourceValues(parsed),
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

    await replaceQuestionTaxonomyAssignments({
      profileId: profile.id,
      questionId: question.id,
      supabase,
      tagIds: taxonomyTagIdsFromForm(formData),
    });
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

  try {
    const profile = await requireAdmin();
    const parsed = questionUpdateSchema.parse(Object.fromEntries(formData));
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

    await replaceQuestionTaxonomyAssignments({
      profileId: profile.id,
      questionId: id,
      supabase,
      tagIds: taxonomyTagIdsFromForm(formData),
    });

  } catch (error) {
    redirectWithError("/admin/questions", formatActionError(error));
  }

  revalidatePath("/admin/questions");
  revalidatePath("/questions");
  revalidatePath(`/questions/${questionId}`);
  revalidatePath("/videos");
  revalidatePath("/admin/videos");
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

    if (parsed.status === "published") {
      await approveQuestionTaxonomyAssignmentsForPublish({
        profileId: profile.id,
        questionIds: [parsed.id],
        supabase,
      });
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
    await deleteQuestionById({ questionId: parsed.id, supabase });
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

async function deleteQuestionById({
  questionId,
  supabase,
}: {
  questionId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: assets, error: assetsError } = await supabase
    .from("question_assets")
    .select("id, object_path")
    .eq("question_id", questionId);

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
      .eq("question_id", questionId);

    if (assetsDeleteError) {
      throw new Error(assetsDeleteError.message);
    }
  }

  const { data: sourceFiles, error: sourceFilesError } = await supabase
    .from("question_source_files")
    .select("id, object_path")
    .eq("question_id", questionId)
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
      .eq("question_id", questionId);

    if (sourceFilesUpdateError) {
      throw new Error(sourceFilesUpdateError.message);
    }
  }

  const { error } = await supabase.from("questions").delete().eq("id", questionId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function bulkUpdateQuestions(formData: FormData) {
  let returnTo = "/admin/questions";
  let questionIds: string[] = [];

  try {
    const profile = await requireAdmin();
    const parsed = bulkQuestionActionSchema.parse(Object.fromEntries(formData));
    returnTo = safeReturnTo(parsed.return_to);
    questionIds = idsFromFormData(formData);

    if (!questionIds.length) {
      throw new Error("Select at least one question.");
    }

    const supabase = await createClient();

    if (parsed.bulk_action === "status") {
      if (!parsed.status) {
        throw new Error("Choose a status.");
      }

      const { error } = await supabase
        .from("questions")
        .update({
          published_at:
            parsed.status === "published" ? new Date().toISOString() : null,
          status: parsed.status,
          updated_by: profile.id,
        })
        .in("id", questionIds);

      if (error) {
        throw new Error(error.message);
      }

      if (parsed.status === "published") {
        await approveQuestionTaxonomyAssignmentsForPublish({
          profileId: profile.id,
          questionIds,
          supabase,
        });
      }
    } else {
      for (const questionId of questionIds) {
        await deleteQuestionById({ questionId, supabase });
      }
    }
  } catch (error) {
    redirectWithError(returnTo, formatActionError(error));
  }

  revalidatePath("/admin/questions");
  revalidatePath("/admin/review");
  revalidatePath("/questions");
  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  for (const questionId of questionIds) {
    revalidatePath(`/questions/${questionId}`);
  }
  redirectWithSaved(returnTo, `Updated ${questionIds.length} question(s).`);
}
