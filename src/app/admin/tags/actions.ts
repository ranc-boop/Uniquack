"use server";

import { revalidatePath } from "next/cache";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  taxonomyActionSchema,
  taxonomyNodeCreateSchema,
  taxonomyNodeDeleteSchema,
} from "@/lib/validations/tag";

function redirectTagError(error: unknown) {
  redirectWithError("/admin/tags", formatActionError(error));
}

export async function createTaxonomyNode(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = taxonomyNodeCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error: nodeError } = await supabase.from("taxonomy_nodes").insert({
      tag_id: parsed.tag_id,
      node_kind: "tag",
      subject_tag_id: "subject.math",
      facet_key: parsed.facet_key,
      label: parsed.label,
      description: parsed.description || null,
      is_assignable: parsed.is_assignable,
      status: "active",
      created_by: profile.id,
      updated_by: profile.id,
    });

    if (nodeError) {
      throw new Error(nodeError.message);
    }

    if (parsed.parent_tag_id) {
      const { error: edgeError } = await supabase.from("taxonomy_edges").insert({
        from_tag_id: parsed.parent_tag_id,
        to_tag_id: parsed.tag_id,
        edge_kind: "parent_child",
        is_primary: true,
        status: "active",
        created_by: profile.id,
        updated_by: profile.id,
      });

      if (edgeError) {
        throw new Error(edgeError.message);
      }
    }
  } catch (error) {
    redirectTagError(error);
  }

  revalidatePath("/admin/tags");
  redirectWithSaved("/admin/tags", "Taxonomy node created.");
}

export async function deleteTaxonomyNode(formData: FormData) {
  try {
    await requireAdmin();
    const parsed = taxonomyNodeDeleteSchema.parse(Object.fromEntries(formData));

    if (parsed.tag_id === "subject.math") {
      throw new Error("The math subject root cannot be deleted.");
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("taxonomy_nodes")
      .delete()
      .eq("tag_id", parsed.tag_id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectTagError(error);
  }

  revalidatePath("/admin/tags");
  redirectWithSaved("/admin/tags", "Taxonomy node deleted.");
}

export async function approveTaxonomyReviewAction(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = taxonomyActionSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data: action, error: actionError } = await supabase
      .from("taxonomy_review_actions")
      .select("id, action_id, question_id, proposed_tag_ids, confidence, evidence")
      .eq("id", parsed.id)
      .maybeSingle();

    if (actionError) {
      throw new Error(actionError.message);
    }

    if (!action?.question_id || !action.proposed_tag_ids?.length) {
      throw new Error("Review action is missing a question or proposed tags.");
    }

    const rows = Array.from(new Set(action.proposed_tag_ids)).map((tagId) => ({
      question_id: action.question_id,
      tag_id: tagId,
      confidence: action.confidence,
      evidence: {
        ...(action.evidence && typeof action.evidence === "object"
          ? action.evidence
          : {}),
        reviewActionId: action.action_id,
      },
      source: "review_action",
      review_status: "approved",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      created_by: profile.id,
      updated_by: profile.id,
    }));

    const { error: insertError } = await supabase
      .from("question_taxonomy_assignments")
      .upsert(rows, {
        onConflict: "question_id,tag_id",
      });

    if (insertError) {
      throw new Error(insertError.message);
    }

    const { error: updateError } = await supabase
      .from("taxonomy_review_actions")
      .update({
        review_status: "approved",
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      .eq("id", parsed.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  } catch (error) {
    redirectTagError(error);
  }

  revalidatePath("/admin/tags");
  revalidatePath("/admin/questions");
  revalidatePath("/questions");
  redirectWithSaved("/admin/tags", "Taxonomy suggestion approved.");
}

export async function rejectTaxonomyReviewAction(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = taxonomyActionSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase
      .from("taxonomy_review_actions")
      .update({
        review_status: "rejected",
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      .eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectTagError(error);
  }

  revalidatePath("/admin/tags");
  redirectWithSaved("/admin/tags", "Taxonomy suggestion rejected.");
}
