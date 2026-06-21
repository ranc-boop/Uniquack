"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { createClient } from "@/lib/supabase/server";
import {
  buildApprovedTagAssignmentWritePlan,
  fiveFacetReviewActionRowsToDrafts,
  persistApprovedFiveFacetAssignments,
  seedFiveFacetCatalog,
  type FiveFacetReviewActionRowInput,
} from "@/lib/tags/five-facet-tag-admin-persistence";
import {
  tagCreateSchema,
  tagDeleteSchema,
  tagStatusSchema,
  tagUpdateSchema,
} from "@/lib/validations/tag";

function isMissingFiveFacetTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /five_facet_|relation .* does not exist|schema cache/i.test(message)
  );
}

function fiveFacetSetupMessage() {
  return "Five-facet tag tables are not available yet. Apply migration 0009_five_facet_tag_persistence.sql, then retry.";
}

async function loadApprovedFiveFacetReviewActions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("five_facet_tag_review_actions")
    .select(
      "action_id, question_id, question_ref, action_kind, target_facet, target_tag_ids, proposed_tag_ids, reason, confidence, evidence, review_status",
    )
    .eq("review_status", "approved")
    .limit(250);

  if (error) {
    throw error;
  }

  return fiveFacetReviewActionRowsToDrafts(
    (data ?? []) as FiveFacetReviewActionRowInput[],
  );
}

export async function createTag(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = tagCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.from("tags").insert({
      ...parsed,
      parent_id: parsed.tag_type === "attribute" ? null : parsed.parent_id,
      created_by: profile.id,
      updated_by: profile.id,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/tags", formatActionError(error));
  }

  revalidatePath("/admin/tags");
  revalidatePath("/questions");
  revalidatePath("/videos");
  redirectWithSaved("/admin/tags", "Tag created.");
}

export async function updateTag(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = tagUpdateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { id, ...values } = parsed;

    const { error } = await supabase
      .from("tags")
      .update({
        ...values,
        parent_id: values.tag_type === "attribute" ? null : values.parent_id,
        updated_by: profile.id,
      })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/tags", formatActionError(error));
  }

  revalidatePath("/admin/tags");
  revalidatePath("/questions");
  revalidatePath("/videos");
  redirectWithSaved("/admin/tags", "Tag updated.");
}

export async function updateTagStatus(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = tagStatusSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase
      .from("tags")
      .update({ status: parsed.status, updated_by: profile.id })
      .eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/tags", formatActionError(error));
  }

  revalidatePath("/admin/tags");
  revalidatePath("/questions");
  revalidatePath("/videos");
  redirectWithSaved("/admin/tags", "Tag status updated.");
}

export async function deleteTag(formData: FormData) {
  try {
    await requireAdmin();
    const parsed = tagDeleteSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.from("tags").delete().eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/tags", formatActionError(error));
  }

  revalidatePath("/admin/tags");
  revalidatePath("/questions");
  revalidatePath("/videos");
  redirectWithSaved("/admin/tags", "Tag deleted.");
}

export async function seedOfficialFiveFacetCatalog() {
  try {
    const profile = await requireAdmin();
    const supabase = await createClient();
    const result = await seedFiveFacetCatalog({
      createdBy: profile.id,
      supabase,
    });

    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
  } catch (error) {
    redirectWithError(
      "/admin/tags",
      isMissingFiveFacetTableError(error)
        ? fiveFacetSetupMessage()
        : formatActionError(error),
    );
  }

  revalidatePath("/admin/tags");
  redirectWithSaved("/admin/tags", "Five-facet catalog seed synced.");
}

export async function persistApprovedFiveFacetTagAssignments() {
  try {
    const profile = await requireAdmin();
    const supabase = await createClient();
    const reviewActions = await loadApprovedFiveFacetReviewActions();
    const plan = buildApprovedTagAssignmentWritePlan(reviewActions);

    if (!plan.assignmentRows.length) {
      throw new Error("No approved five-facet review actions are ready to persist.");
    }

    const result = await persistApprovedFiveFacetAssignments({
      createdBy: profile.id,
      reviewActions,
      supabase,
    });

    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
  } catch (error) {
    redirectWithError(
      "/admin/tags",
      isMissingFiveFacetTableError(error)
        ? fiveFacetSetupMessage()
        : formatActionError(error),
    );
  }

  revalidatePath("/admin/tags");
  redirectWithSaved("/admin/tags", "Approved five-facet tag assignments persisted.");
}
