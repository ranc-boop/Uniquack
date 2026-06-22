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
  taxonomyDisplayLabelFromId,
  taxonomyJoinTagId,
  taxonomySuffixFromLabel,
} from "@/lib/tags/taxonomy-display";
import {
  taxonomyActionSchema,
  taxonomyNodeCreateSchema,
  taxonomyNodeDeleteSchema,
} from "@/lib/validations/tag";

function redirectTagError(error: unknown) {
  redirectWithError("/admin/tags", formatActionError(error));
}

async function collectTaxonomySubtreeIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rootTagId: string,
) {
  const tagIds = new Set([rootTagId]);

  const { data: closureRows, error: closureError } = await supabase
    .from("taxonomy_node_closure")
    .select("descendant_tag_id")
    .eq("ancestor_tag_id", rootTagId);

  if (closureError) {
    throw new Error(closureError.message);
  }

  for (const row of closureRows ?? []) {
    if (row.descendant_tag_id) {
      tagIds.add(row.descendant_tag_id);
    }
  }

  const { data: prefixRows, error: prefixError } = await supabase
    .from("taxonomy_nodes")
    .select("tag_id")
    .like("tag_id", rootTagId + ".%");

  if (prefixError) {
    throw new Error(prefixError.message);
  }

  for (const row of prefixRows ?? []) {
    if (row.tag_id) {
      tagIds.add(row.tag_id);
    }
  }

  return Array.from(tagIds);
}

export async function createTaxonomyNode(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = taxonomyNodeCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { data: parentNode, error: parentError } = await supabase
      .from("taxonomy_nodes")
      .select("tag_id,node_kind,subject_tag_id,facet_key,status")
      .eq("tag_id", parsed.parent_tag_id)
      .maybeSingle();

    if (parentError) {
      throw new Error(parentError.message);
    }

    if (!parentNode) {
      throw new Error("Selected parent taxonomy node was not found.");
    }

    if (parentNode.status !== "active") {
      throw new Error("Selected parent taxonomy node is not active.");
    }

    if (parentNode.node_kind === "subject") {
      throw new Error("Create tags under a facet root or existing tag, not directly under the subject root.");
    }

    if (parentNode.facet_key && parentNode.facet_key !== parsed.facet_key) {
      throw new Error("Selected parent facet does not match the submitted facet.");
    }

    const expectedTagId = taxonomyJoinTagId(
      parsed.parent_tag_id,
      taxonomySuffixFromLabel(parsed.label),
    );
    if (!expectedTagId || parsed.tag_id !== expectedTagId) {
      throw new Error("Submitted taxonomy ID does not match the display tag.");
    }

    const { error: nodeError } = await supabase.from("taxonomy_nodes").insert({
      tag_id: expectedTagId,
      node_kind: "tag",
      subject_tag_id: parentNode.subject_tag_id ?? "math",
      facet_key: parsed.facet_key,
      label: taxonomyDisplayLabelFromId(expectedTagId),
      description: parsed.description || null,
      is_assignable: parsed.is_assignable,
      status: "active",
      created_by: profile.id,
      updated_by: profile.id,
    });

    if (nodeError) {
      throw new Error(nodeError.message);
    }

    const { error: edgeError } = await supabase.from("taxonomy_edges").insert({
      from_tag_id: parsed.parent_tag_id,
      to_tag_id: expectedTagId,
      edge_kind: "parent_child",
      is_primary: true,
      status: "active",
      created_by: profile.id,
      updated_by: profile.id,
    });

    if (edgeError) {
      await supabase.from("taxonomy_nodes").delete().eq("tag_id", expectedTagId);
      throw new Error(edgeError.message);
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

    if (parsed.tag_id === "math") {
      throw new Error("The math root cannot be deleted.");
    }

    const supabase = await createClient();
    const subtreeTagIds = await collectTaxonomySubtreeIds(
      supabase,
      parsed.tag_id,
    );

    if (!subtreeTagIds.length) {
      throw new Error("No taxonomy nodes were selected for deletion.");
    }

    const { error } = await supabase
      .from("taxonomy_nodes")
      .delete()
      .in("tag_id", subtreeTagIds);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectTagError(error);
  }

  revalidatePath("/admin/tags");
  redirectWithSaved("/admin/tags", "Taxonomy subtree deleted.");
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

    const proposedTagIds = Array.from(
      new Set(action.proposed_tag_ids.filter(Boolean)),
    );
    if (!proposedTagIds.length) {
      throw new Error("Review action does not contain any valid proposed tags.");
    }
    const rows = proposedTagIds.map((tagId) => ({
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

    const { error: deleteExistingError } = await supabase
      .from("question_taxonomy_assignments")
      .delete()
      .eq("question_id", action.question_id)
      .in("tag_id", proposedTagIds);

    if (deleteExistingError) {
      throw new Error(deleteExistingError.message);
    }

    const { error: insertError } = await supabase
      .from("question_taxonomy_assignments")
      .insert(rows);

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
