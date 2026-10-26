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
import {
  answerSpecFromFormData,
  answerSpecToJson,
  optionsToJson,
} from "@/lib/questions/answer-spec";
import { copyQuestionAssetsForIndependentUse } from "@/lib/questions/copy-assets";
import { sanitizeContentHtml } from "@/lib/sanitize/html";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validations/common";
import {
  questionCreateSchema,
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

function globalVisibilityForStatus(status: string) {
  return status === "published" ? ("public" as const) : ("private" as const);
}

const taxonomyTagIdPattern = /^math\.[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

type QuestionPublishMetadata = {
  approval_status: "approved" | "pending";
  owner_bank_id: string | null;
  source_kind: string | null;
  source_review_item_id: string | null;
  status: string;
};

async function assertGlobalQuestionIds({
  questionIds,
  supabase,
}: {
  questionIds: string[];
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data, error } = await supabase
    .from("questions")
    .select("id, owner_bank_id")
    .in("id", questionIds);

  if (error) throw new Error(error.message);
  if (
    (data?.length ?? 0) !== questionIds.length ||
    data?.some((question) => question.owner_bank_id !== null)
  ) {
    throw new Error(
      "Admin global actions can only mutate Central Public Library questions.",
    );
  }
}

async function assertQuestionsAreNotApproved({
  questionIds,
  supabase,
}: {
  questionIds: string[];
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data, error } = await supabase
    .from("questions")
    .select("id")
    .in("id", questionIds)
    .eq("approval_status", "approved")
    .limit(1);
  if (error) throw new Error(error.message);
  if (data?.length) {
    throw new Error(
      "Approved questions cannot be deleted or moved back to a legacy status. Archive them through the official Library lifecycle instead.",
    );
  }
}

type QuestionPublishMetadataQuery = {
  select(columns: string): {
    eq(column: "id", value: string): {
      single(): Promise<{
        data: QuestionPublishMetadata | null;
        error: { message: string } | null;
      }>;
    };
  };
};

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
  reviewStatus = "approved",
  supabase,
  tagIds,
}: {
  profileId: string;
  questionId: string;
  reviewStatus?: "approved" | "pending_review";
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
        approved_at:
          reviewStatus === "approved" ? new Date().toISOString() : null,
        approved_by: reviewStatus === "approved" ? profileId : null,
        confidence: 1,
        created_by: profileId,
        evidence: { source: "admin_question_form" },
        question_id: questionId,
        review_status: reviewStatus,
        source: "manual",
        tag_id: tagId,
        updated_by: profileId,
      })),
    );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function publishQuestionsWithReviewLineage({
  questionIds,
  supabase,
}: {
  questionIds: string[];
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const uniqueQuestionIds = Array.from(new Set(questionIds));

  if (!uniqueQuestionIds.length) {
    return;
  }

  const { data: officialBank, error: bankError } = await supabase
    .from("question_banks")
    .select("id")
    .eq("owner_scope", "system")
    .eq("system_key", "official_public")
    .eq("status", "active")
    .single();
  if (bankError) throw new Error(bankError.message);

  const { data: publishedQuestions, error } = await supabase.rpc(
    "approve_library_questions_v2",
    {
      p_target_bank_id: officialBank.id,
      p_target_question_ids: uniqueQuestionIds,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if ((publishedQuestions?.length ?? 0) !== uniqueQuestionIds.length) {
    throw new Error(
      "Only approved " +
        (publishedQuestions?.length ?? 0) +
        " of " +
        uniqueQuestionIds.length +
        " selected question(s).",
    );
  }
}

function questionSourceValues(values: {
  content_html: string;
  content_source: string;
  content_source_format: "markdown_latex" | "html" | "plain_text";
  solution_html: string | null;
  solution_source: string;
  solution_source_format: "markdown_latex" | "html" | "plain_text";
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
  let copiedRevisionAssets:
    | Awaited<ReturnType<typeof copyQuestionAssetsForIndependentUse>>
    | undefined;
  let revisionSourceId: string | null = null;
  let revisionAssetsFinalized = false;
  try {
    const profile = await requireAdmin();
    const parsedInput = questionCreateSchema.parse(Object.fromEntries(formData));
    const parsed = { ...parsedInput, status: "draft" as const };
    const draftIdValue = formData.get("draft_id");
    const draftId =
      typeof draftIdValue === "string" && draftIdValue
        ? uuidSchema.parse(draftIdValue)
        : null;
    const revisionSourceValue = formData.get("revision_of_question_id");
    const revisionOfQuestionId =
      typeof revisionSourceValue === "string" && revisionSourceValue
        ? uuidSchema.parse(revisionSourceValue)
        : null;
    revisionSourceId = revisionOfQuestionId;
    const answerData = answerSpecFromFormData(formData);
    const supabase = await createClient();

    if (revisionOfQuestionId) {
      const { data: sourceQuestion, error: sourceError } = await supabase
        .from("questions")
        .select("id, approval_status, owner_bank_id")
        .eq("id", revisionOfQuestionId)
        .is("owner_bank_id", null)
        .single();
      if (sourceError || sourceQuestion?.approval_status !== "approved") {
        throw new Error("Only an approved official question can be revised.");
      }
    }

    const values = {
      ...parsed,
      ...questionSourceValues(parsed),
      answer_spec: answerSpecToJson(answerData.answerSpec),
      created_by: profile.id,
      options: optionsToJson(answerData.options),
      updated_by: profile.id,
      published_at:
        null,
      revision_of_question_id: revisionOfQuestionId,
      source_kind: "review_draft" as const,
      visibility: "private" as const,
    };
    let resolvedDraftId = draftId;
    if (!resolvedDraftId) {
      const { data, error } = await supabase.rpc(
        "create_global_manual_question_draft",
        {
          p_question_code: parsed.question_code,
          p_title: parsed.title,
        },
      );
      if (error) throw new Error(error.message);
      resolvedDraftId = data;
    }
    if (!resolvedDraftId) {
      throw new Error("The global Review Draft could not be created.");
    }
    const questionRequest = supabase
      .from("questions")
      .update(values)
      .eq("id", resolvedDraftId)
      .eq("status", "draft")
      .eq("created_by", profile.id)
      .is("owner_bank_id", null)
      .select("id")
      .single();
    const { data: question, error } = await questionRequest;

    if (error) {
      throw new Error(error.message);
    }

    await replaceQuestionTaxonomyAssignments({
      profileId: profile.id,
      questionId: question.id,
      reviewStatus: "pending_review",
      supabase,
      tagIds: taxonomyTagIdsFromForm(formData),
    });
    if (revisionOfQuestionId) {
      const { data: sourceAssets, error: sourceAssetsError } = await supabase
        .from("question_assets")
        .select(
          "id, asset_kind, storage_bucket, storage_path, label, alt_text, display_order",
        )
        .eq("question_id", revisionOfQuestionId)
        .order("display_order");
      if (sourceAssetsError) throw new Error(sourceAssetsError.message);

      copiedRevisionAssets = await copyQuestionAssetsForIndependentUse({
        assets: sourceAssets ?? [],
        destinationPrefix: `official-revisions/${revisionOfQuestionId}/${question.id}`,
      });
      const finalizeClient = createServiceRoleClient();
      const { data: attachedCount, error: attachError } = await finalizeClient.rpc(
        "attach_official_question_revision_assets_v2",
        {
          p_actor_id: profile.id,
          p_copied_assets: copiedRevisionAssets.assets,
          p_source_question_id: revisionOfQuestionId,
          p_target_question_id: question.id,
        },
      );
      if (attachError) throw new Error(attachError.message);
      revisionAssetsFinalized = true;
      if (Number(attachedCount ?? -1) !== copiedRevisionAssets.assets.length) {
        throw new Error("The official revision asset manifest was not fully attached.");
      }
    }
  } catch (error) {
    if (!revisionAssetsFinalized) await copiedRevisionAssets?.cleanup();
    redirectWithError(
      revisionSourceId
        ? `/admin/questions/new?source=${encodeURIComponent(revisionSourceId)}`
        : "/admin/questions/new",
      formatActionError(error),
    );
  }

  revalidatePath("/admin/questions");
  revalidatePath("/admin/review");
  revalidatePath("/questions");
  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  redirectWithSaved(
    "/admin/review",
    "Global Review Draft created. Review is required before publication.",
  );
}

export async function updateQuestion(formData: FormData) {
  let questionId = "";
  let returnTo = "/admin/questions";

  try {
    const profile = await requireAdmin();
    returnTo = safeReturnTo(String(formData.get("return_to") ?? returnTo));
    const parsed = questionUpdateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { id, ...values } = parsed;
    const answerData = answerSpecFromFormData(formData);
    questionId = id;
    const { data: existingQuestion, error: existingQuestionError } = await (
      supabase.from("questions") as unknown as QuestionPublishMetadataQuery
    )
      .select("approval_status, source_kind, source_review_item_id, status, owner_bank_id")
      .eq("id", id)
      .single();

    if (existingQuestionError) {
      throw new Error(existingQuestionError.message);
    }

    if (!existingQuestion) {
      throw new Error("Question was not found.");
    }
    if (existingQuestion.owner_bank_id !== null) {
      throw new Error(
        "Teacher-owned Library questions must be revised in the Teacher workspace.",
      );
    }
    if (existingQuestion.approval_status === "approved") {
      throw new Error(
        "Approved questions are immutable. Create a pending revision instead.",
      );
    }

    const needsReviewPublish =
      values.status === "published" &&
      existingQuestion.status !== "published";
    const updateStatus = needsReviewPublish ? "draft" : values.status;

    const { error } = await supabase
      .from("questions")
      .update({
        ...values,
        status: updateStatus,
        ...questionSourceValues(values),
        answer_spec: answerSpecToJson(answerData.answerSpec),
        options: optionsToJson(answerData.options),
        updated_by: profile.id,
        published_at:
          updateStatus === "published" ? new Date().toISOString() : null,
        visibility: globalVisibilityForStatus(updateStatus),
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

    if (needsReviewPublish) {
      await publishQuestionsWithReviewLineage({
        questionIds: [id],
        supabase,
      });
    }
  } catch (error) {
    redirectWithError(returnTo, formatActionError(error));
  }

  revalidatePath("/admin/questions");
  revalidatePath("/questions");
  revalidatePath(`/questions/${questionId}`);
  revalidatePath("/videos");
  revalidatePath("/admin/videos");
  redirectWithSaved(returnTo, "Question updated.");
}

async function deleteQuestionById({
  questionId,
  supabase,
}: {
  questionId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  await assertGlobalQuestionIds({ questionIds: [questionId], supabase });
  await assertQuestionsAreNotApproved({ questionIds: [questionId], supabase });

  const { data: assets, error: assetsError } = await supabase
    .from("question_assets")
    .select("id, storage_path")
    .eq("question_id", questionId);

  if (assetsError) {
    throw new Error(assetsError.message);
  }

  if (assets?.length) {
    const { error: storageError } = await supabase.storage
      .from(QUESTION_ASSETS_BUCKET)
      .remove(assets.map((asset) => asset.storage_path));

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

  const { data: deletedQuestions, error } = await supabase
    .from("questions")
    .delete()
    .eq("id", questionId)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  if ((deletedQuestions?.length ?? 0) !== 1) {
    throw new Error("Question delete did not affect the selected question.");
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
    await assertGlobalQuestionIds({ questionIds, supabase });

    if (parsed.bulk_action === "status") {
      if (!parsed.status) {
        throw new Error("Choose a status.");
      }

      if (parsed.status === "published") {
        if (returnTo.startsWith("/admin/review")) {
          const { data: officialBank, error: officialBankError } = await supabase
            .from("question_banks")
            .select("id")
            .eq("system_key", "official_public")
            .eq("status", "active")
            .maybeSingle();
          if (officialBankError) throw new Error(officialBankError.message);
          if (!officialBank) throw new Error("Official Public Library is unavailable.");
          const { data: approved, error: approvalError } = await supabase.rpc(
            "approve_library_questions_v2",
            {
              p_target_bank_id: officialBank.id,
              p_target_question_ids: questionIds,
            },
          );
          if (approvalError) throw new Error(approvalError.message);
          if ((approved?.length ?? 0) !== questionIds.length) {
            throw new Error("The complete approval selection was not processed.");
          }
        } else {
          await publishQuestionsWithReviewLineage({
            questionIds,
            supabase,
          });
        }
      } else {
        await assertQuestionsAreNotApproved({ questionIds, supabase });
        const { data: updatedQuestions, error } = await supabase
          .from("questions")
          .update({
            published_at: null,
            status: parsed.status,
            updated_by: profile.id,
            visibility: "private",
          })
          .in("id", questionIds)
          .select("id");

        if (error) {
          throw new Error(error.message);
        }

        if ((updatedQuestions?.length ?? 0) !== questionIds.length) {
          throw new Error(
            "Only updated " +
              (updatedQuestions?.length ?? 0) +
              " of " +
              questionIds.length +
              " selected question(s).",
          );
        }
      }

      if (parsed.status === "published" && returnTo.startsWith("/admin/review")) {
        returnTo = "/admin/questions";
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

export async function archiveOfficialQuestion(formData: FormData) {
  const returnTo = "/admin/questions";

  try {
    await requireAdmin();
    const bankQuestionId = uuidSchema.parse(formData.get("bank_question_id"));
    const supabase = await createClient();
    const { data: officialBank, error: bankError } = await supabase
      .from("question_banks")
      .select("id")
      .eq("system_key", "official_public")
      .eq("status", "active")
      .maybeSingle();

    if (bankError) throw new Error(bankError.message);
    if (!officialBank) throw new Error("Official Public Library is unavailable.");

    const { data, error } = await supabase.rpc("archive_library_questions_v2", {
      p_target_bank_id: officialBank.id,
      p_target_bank_question_ids: [bankQuestionId],
    });

    if (error) throw new Error(error.message);
    if ((data?.length ?? 0) !== 1) {
      throw new Error("The question was not archived.");
    }
  } catch (error) {
    redirectWithError(returnTo, formatActionError(error));
  }

  revalidatePath("/admin/questions");
  revalidatePath("/questions");
  redirectWithSaved(returnTo, "Question archived.");
}
