"use server";

import { revalidatePath } from "next/cache";

import {
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireAdmin } from "@/lib/auth/guards";
import {
  buildQuestionBlueprintReviewActionRowsFromImportSummary,
  persistApprovedQuestionBlueprints,
} from "@/lib/blueprints/question-blueprint-persistence";
import { createClient } from "@/lib/supabase/server";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function isMissingBlueprintTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /question_blueprint|relation .* does not exist|schema cache/i.test(message)
  );
}

function setupMessage(error: unknown) {
  if (isMissingBlueprintTableError(error)) {
    return "Question Blueprint Library tables are not applied yet. Apply the BP5 migration before using review actions.";
  }

  return error instanceof Error ? error.message : String(error);
}

function blueprintActionError(error: unknown) {
  redirectWithError("/admin/blueprints", setupMessage(error));
}

export async function storeBlueprintReviewActionsFromImportBatch(
  formData: FormData,
) {
  try {
    const profile = await requireAdmin();
    const importBatchId = formString(formData, "import_batch_id");

    if (!importBatchId) {
      throw new Error("Choose an AI import batch with blueprint review metadata.");
    }

    const supabase = await createClient();
    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .select("id, summary")
      .eq("id", importBatchId)
      .maybeSingle();

    if (batchError) {
      throw new Error(batchError.message);
    }

    if (!batch) {
      throw new Error("AI import batch was not found.");
    }

    const rows = buildQuestionBlueprintReviewActionRowsFromImportSummary({
      createdBy: profile.id,
      importBatchId,
      summary: batch.summary,
    });

    if (!rows.length) {
      throw new Error("This import batch does not contain blueprint review actions.");
    }

    const { error } = await (supabase as any)
      .from("question_blueprint_review_actions")
      .upsert(rows, {
        ignoreDuplicates: true,
        onConflict: "action_id",
      });

    if (error) {
      throw new Error(setupMessage(error));
    }
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint review actions stored.");
}

export async function approveQuestionBlueprintReviewAction(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const actionId = formString(formData, "id");

    if (!actionId) {
      throw new Error("Select a blueprint review action to approve.");
    }

    const supabase = await createClient();
    await persistApprovedQuestionBlueprints({
      actionIds: [actionId],
      reviewerId: profile.id,
      supabase: supabase as any,
    });
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint approved and added to the library.");
}

export async function rejectQuestionBlueprintReviewAction(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const actionId = formString(formData, "id");

    if (!actionId) {
      throw new Error("Select a blueprint review action to reject.");
    }

    const supabase = await createClient();
    const { error } = await (supabase as any)
      .from("question_blueprint_review_actions")
      .update({
        reviewer_id: profile.id,
        reviewed_at: new Date().toISOString(),
        status: "rejected",
        updated_by: profile.id,
      })
      .eq("id", actionId)
      .eq("status", "pending_review");

    if (error) {
      throw new Error(setupMessage(error));
    }
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint review action rejected.");
}

export async function markQuestionBlueprintNeedsEvidence(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const actionId = formString(formData, "id");

    if (!actionId) {
      throw new Error("Select a blueprint review action.");
    }

    const supabase = await createClient();
    const { error } = await (supabase as any)
      .from("question_blueprint_review_actions")
      .update({
        reviewer_id: profile.id,
        reviewed_at: new Date().toISOString(),
        status: "needs_more_evidence",
        updated_by: profile.id,
      })
      .eq("id", actionId)
      .eq("status", "pending_review");

    if (error) {
      throw new Error(setupMessage(error));
    }
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint marked as needing more evidence.");
}
