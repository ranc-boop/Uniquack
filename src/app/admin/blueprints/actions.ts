"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { inferAiProviderMode } from "@/lib/ai-providers/adapters";
import {
  listEnabledAIProviderProfiles,
  loadAIProviderProfileForUse,
} from "@/lib/ai-providers/profiles";
import { requireAdmin } from "@/lib/auth/guards";
import { importBatchImportJson } from "@/lib/batch-import/service";
import {
  buildQuestionBlueprintGenerationRequest,
  executeDeepSeekBlueprintGeneration,
  type QuestionBlueprintGenerationQuestionType,
} from "@/lib/blueprints/question-blueprint-generation";
import {
  runQuestionBlueprintCalibration,
  summarizeQuestionBlueprintCalibration,
} from "@/lib/blueprints/question-blueprint-calibration";
import {
  normalizeQuestionBlueprintFolderName,
  slugifyQuestionBlueprintFolderName,
  wouldCreateQuestionBlueprintFolderCycle,
} from "@/lib/blueprints/question-blueprint-folders";
import {
  buildBlueprintGeneratedBatchImportJson,
  summarizeBlueprintGeneratedReviewDraftPersistence,
} from "@/lib/blueprints/question-blueprint-generation-review";
import {
  buildQuestionBlueprintReviewActionRowsFromImportSummary,
  getQuestionBlueprintApprovalReadinessFromReviewAction,
  type QuestionBlueprintRow,
  persistApprovedQuestionBlueprints,
} from "@/lib/blueprints/question-blueprint-persistence";
import { createClient } from "@/lib/supabase/server";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function formStringList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function formNumber(formData: FormData, key: string, fallback: number) {
  const value = Number(formData.get(key));

  return Number.isFinite(value) ? value : fallback;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isMissingBlueprintTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /folder_id|generation_readiness|question_blueprint|relation .* does not exist|schema cache/i.test(
      message,
    )
  );
}

function setupMessage(error: unknown) {
  if (isMissingBlueprintTableError(error)) {
    return "Question Blueprint Library tables are not applied yet. Apply the latest blueprint migrations before using review actions.";
  }

  return error instanceof Error ? error.message : String(error);
}

function blueprintActionError(error: unknown) {
  redirectWithError("/admin/blueprints", setupMessage(error));
}

function nullableFolderIdFromForm(formData: FormData, key = "folder_id") {
  const value = formString(formData, key);

  return value && value !== "all" && value !== "unfiled" && value !== "root"
    ? value
    : null;
}

function blueprintQuestionType(value: string): QuestionBlueprintGenerationQuestionType {
  return value === "mcq" ||
    value === "fill_blank" ||
    value === "frq" ||
    value === "mixed"
    ? value
    : "frq";
}

function boundedJsonSummary(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

async function loadActiveAssignableTaxonomyTagIds(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { catalog, errorMessage } = await loadTaxonomyCatalog(supabase);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );

  return new Set(
    catalog.nodes
      .filter(
        (node) =>
          node.is_assignable &&
          !parentTagIds.has(node.tag_id) &&
          node.facet_key,
      )
      .map((node) => node.tag_id),
  );
}

async function loadActiveAssignableLeafTaxonomyByFacet(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { catalog, errorMessage } = await loadTaxonomyCatalog(supabase);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );
  const byFacet = new Map<string, Set<string>>();

  for (const node of catalog.nodes) {
    if (
      node.facet_key &&
      node.is_assignable &&
      !parentTagIds.has(node.tag_id)
    ) {
      byFacet.set(node.facet_key, byFacet.get(node.facet_key) ?? new Set());
      byFacet.get(node.facet_key)?.add(node.tag_id);
    }
  }

  return byFacet;
}

function taxonomyTargetsFromForm(formData: FormData) {
  return {
    curriculum: formStringList(formData, "blueprint_tax_curriculum"),
    concept: formStringList(formData, "blueprint_tax_concept"),
    form: formStringList(formData, "blueprint_tax_form"),
    method: formStringList(formData, "blueprint_tax_method"),
    task: formStringList(formData, "blueprint_tax_task"),
  };
}

function groundingStatusFromTargets(targets: Record<string, string[]>) {
  const count =
    Number((targets.concept ?? []).length > 0) +
    Number((targets.form ?? []).length > 0) +
    Number((targets.method ?? []).length > 0 || (targets.task ?? []).length > 0);

  if (count === 3) return "grounded";
  if (count > 0) return "partially_grounded";
  return "unresolved";
}

async function loadDeepSeekBlueprintGenerationProvider(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const profiles = await listEnabledAIProviderProfiles(supabase);
  const selected = profiles.find((profile) => inferAiProviderMode(profile) === "deepseek_openai");

  if (!selected) {
    throw new Error("DeepSeek provider is not configured or not enabled.");
  }

  return loadAIProviderProfileForUse({
    profileId: selected.id,
    supabase,
  });
}

async function recordBlueprintLifecycleAudit({
  action,
  blueprint,
  profileId,
  reason,
  supabase,
}: {
  action: "archive" | "restore" | "trash";
  blueprint: Record<string, unknown>;
  profileId: string;
  reason: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const blueprintId = String(blueprint.id ?? "");

  if (!blueprintId) {
    return;
  }

  const { error } = await (supabase as any)
    .from("question_blueprint_review_actions")
    .insert({
      action_id: `blueprint-lifecycle-${action}-${blueprintId}-${Date.now().toString(36)}`,
      action_kind: "mark_needs_more_evidence",
      blueprint_draft_id: blueprintId,
      created_by: profileId,
      draft_snapshot: {
        blueprintId,
        status: blueprint.status ?? null,
        title: blueprint.title ?? "Question blueprint",
      },
      evidence: {
        action,
        blueprintId,
        source: "blueprint_lifecycle_admin_action",
      },
      reason,
      status: "archived",
      updated_by: profileId,
    });

  if (error) {
    throw new Error(setupMessage(error));
  }
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

export async function updateBlueprintReviewActionTaxonomyTargets(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const actionId = formString(formData, "id");

    if (!actionId) {
      throw new Error("Select a blueprint review action to edit.");
    }

    const supabase = await createClient();
    const allowedByFacet = await loadActiveAssignableLeafTaxonomyByFacet(supabase);
    const taxonomyTargets = taxonomyTargetsFromForm(formData);
    const invalidSelections: string[] = [];

    for (const [facet, tagIds] of Object.entries(taxonomyTargets)) {
      const allowed = allowedByFacet.get(facet) ?? new Set<string>();

      for (const tagId of tagIds) {
        if (!allowed.has(tagId)) {
          invalidSelections.push(`${tagId} is not an active assignable ${facet} leaf`);
        }
      }
    }

    if (invalidSelections.length) {
      throw new Error(
        [
          "Parent taxonomy nodes cannot be used directly. Choose a specific assignable leaf tag.",
          ...invalidSelections.map((selection) => `- ${selection}`),
        ].join("\n"),
      );
    }

    const { data: action, error: loadError } = await (supabase as any)
      .from("question_blueprint_review_actions")
      .select("draft_snapshot")
      .eq("id", actionId)
      .in("status", ["pending_review", "needs_more_evidence"])
      .maybeSingle();

    if (loadError) {
      throw new Error(setupMessage(loadError));
    }

    if (!action) {
      throw new Error("Blueprint review action was not found or cannot be edited.");
    }

    const draftSnapshot = asRecord(action.draft_snapshot);
    const taxonomyGroundingStatus = groundingStatusFromTargets(taxonomyTargets);
    const nextSnapshot = {
      ...draftSnapshot,
      specificityWarnings:
        taxonomyGroundingStatus === "grounded"
          ? stringList(draftSnapshot.specificityWarnings).filter(
              (warning) => !/taxonomy/i.test(warning),
            )
          : [
              ...stringList(draftSnapshot.specificityWarnings),
              "Manual taxonomy mapping is still incomplete.",
            ],
      taxonomyGroundingStatus,
      taxonomyTargetHints: stringList(draftSnapshot.taxonomyTargetHints),
      taxonomyTargets,
      taxonomyUnresolved: taxonomyGroundingStatus !== "grounded",
      warnings:
        taxonomyGroundingStatus === "grounded"
          ? stringList(draftSnapshot.warnings).filter(
              (warning) =>
                warning !==
                "question_blueprint_analyzer_taxonomy_grounding_unresolved",
            )
          : stringList(draftSnapshot.warnings),
    };

    const { error } = await (supabase as any)
      .from("question_blueprint_review_actions")
      .update({
        draft_snapshot: nextSnapshot,
        reviewed_at: null,
        reviewer_id: null,
        status: "pending_review",
        updated_by: profile.id,
      })
      .eq("id", actionId)
      .in("status", ["pending_review", "needs_more_evidence"]);

    if (error) {
      throw new Error(setupMessage(error));
    }
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint taxonomy targets updated.");
}

export async function approveQuestionBlueprintReviewAction(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const actionId = formString(formData, "id");

    if (!actionId) {
      throw new Error("Select a blueprint review action to approve.");
    }

    const supabase = await createClient();
    const knownAssignableTagIds = await loadActiveAssignableTaxonomyTagIds(supabase);
    const { data: rows, error: loadError } = await (supabase as any)
      .from("question_blueprint_review_actions")
      .select("draft_snapshot")
      .eq("id", actionId)
      .eq("status", "pending_review")
      .limit(1);

    if (loadError) {
      throw new Error(setupMessage(loadError));
    }

    const readiness = getQuestionBlueprintApprovalReadinessFromReviewAction(
      rows?.[0] ?? { draft_snapshot: null },
      knownAssignableTagIds,
    );

    if (!readiness.approvalReady) {
      throw new Error(
        [
          "Blueprint is not approval-ready:",
          ...readiness.approvalBlockingReasons.map((reason) => `- ${reason}`),
        ].join("\n"),
      );
    }

    await persistApprovedQuestionBlueprints({
      actionIds: [actionId],
      knownAssignableTagIds,
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

export async function createQuestionBlueprintFolder(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const name = normalizeQuestionBlueprintFolderName(formString(formData, "name"));

    if (!name) {
      throw new Error("Folder name is required.");
    }

    const parentId = nullableFolderIdFromForm(formData, "parent_id");
    const supabase = await createClient();

    if (parentId) {
      const { data: parent, error: parentError } = await (supabase as any)
        .from("question_blueprint_folders")
        .select("id")
        .eq("id", parentId)
        .is("deleted_at", null)
        .maybeSingle();

      if (parentError) {
        throw new Error(setupMessage(parentError));
      }

      if (!parent) {
        throw new Error("Parent folder was not found.");
      }
    }

    const { error } = await (supabase as any)
      .from("question_blueprint_folders")
      .insert({
        created_by: profile.id,
        description: formString(formData, "description") || null,
        name,
        owner_scope: "system",
        parent_id: parentId,
        slug: slugifyQuestionBlueprintFolderName(name),
        updated_by: profile.id,
      });

    if (error) {
      throw new Error(setupMessage(error));
    }
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint folder created.");
}

export async function renameQuestionBlueprintFolder(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const folderId = formString(formData, "folder_id");
    const name = normalizeQuestionBlueprintFolderName(formString(formData, "name"));

    if (!folderId || !name) {
      throw new Error("Choose a folder and enter a folder name.");
    }

    const supabase = await createClient();
    const { error } = await (supabase as any)
      .from("question_blueprint_folders")
      .update({
        description: formString(formData, "description") || null,
        name,
        slug: slugifyQuestionBlueprintFolderName(name),
        updated_by: profile.id,
      })
      .eq("id", folderId)
      .is("deleted_at", null);

    if (error) {
      throw new Error(setupMessage(error));
    }
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint folder updated.");
}

export async function moveQuestionBlueprintFolder(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const folderId = formString(formData, "folder_id");
    const parentId = nullableFolderIdFromForm(formData, "parent_id");

    if (!folderId) {
      throw new Error("Choose a folder to move.");
    }

    const supabase = await createClient();
    const { data: folders, error: loadError } = await (supabase as any)
      .from("question_blueprint_folders")
      .select("id, parent_id")
      .is("deleted_at", null);

    if (loadError) {
      throw new Error(setupMessage(loadError));
    }

    if (
      wouldCreateQuestionBlueprintFolderCycle({
        folderId,
        folders: folders ?? [],
        parentId,
      })
    ) {
      throw new Error("A folder cannot be moved into itself or one of its children.");
    }

    const { error } = await (supabase as any)
      .from("question_blueprint_folders")
      .update({
        parent_id: parentId,
        updated_by: profile.id,
      })
      .eq("id", folderId)
      .is("deleted_at", null);

    if (error) {
      throw new Error(setupMessage(error));
    }
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint folder moved.");
}

export async function archiveQuestionBlueprintFolder(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const folderId = formString(formData, "folder_id");

    if (!folderId) {
      throw new Error("Choose a folder to archive.");
    }

    const supabase = await createClient();
    const { error } = await (supabase as any)
      .from("question_blueprint_folders")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      .eq("id", folderId)
      .is("deleted_at", null);

    if (error) {
      throw new Error(setupMessage(error));
    }
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved(
    "/admin/blueprints",
    "Blueprint folder archived. Filed blueprints are preserved and remain visible in All blueprints.",
  );
}

export async function restoreQuestionBlueprintFolder(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const folderId = formString(formData, "folder_id");

    if (!folderId) {
      throw new Error("Choose a folder to restore.");
    }

    const supabase = await createClient();
    const { error } = await (supabase as any)
      .from("question_blueprint_folders")
      .update({
        deleted_at: null,
        updated_by: profile.id,
      })
      .eq("id", folderId);

    if (error) {
      throw new Error(setupMessage(error));
    }
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint folder restored.");
}

export async function moveQuestionBlueprintToFolder(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const blueprintId = formString(formData, "blueprint_id");
    const folderId = nullableFolderIdFromForm(formData);

    if (!blueprintId) {
      throw new Error("Choose an approved blueprint to move.");
    }

    const supabase = await createClient();

    if (folderId) {
      const { data: folder, error: folderError } = await (supabase as any)
        .from("question_blueprint_folders")
        .select("id")
        .eq("id", folderId)
        .is("deleted_at", null)
        .maybeSingle();

      if (folderError) {
        throw new Error(setupMessage(folderError));
      }

      if (!folder) {
        throw new Error("Destination folder was not found.");
      }
    }

    const { error } = await (supabase as any)
      .from("question_blueprints")
      .update({
        folder_id: folderId,
        updated_by: profile.id,
      })
      .eq("id", blueprintId)
      .eq("status", "approved")
      .is("deleted_at", null);

    if (error) {
      throw new Error(setupMessage(error));
    }
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint moved to folder.");
}

export async function archiveQuestionBlueprint(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const blueprintId = formString(formData, "blueprint_id");

    if (!blueprintId) {
      throw new Error("Select a blueprint to deprecate.");
    }

    const supabase = await createClient();
    const { data: blueprint, error: loadError } = await (supabase as any)
      .from("question_blueprints")
      .select("id, title, status")
      .eq("id", blueprintId)
      .maybeSingle();

    if (loadError) {
      throw new Error(setupMessage(loadError));
    }
    if (!blueprint) {
      throw new Error("Blueprint was not found.");
    }

    const { error } = await (supabase as any)
      .from("question_blueprints")
      .update({
        deleted_at: null,
        status: "deprecated",
        updated_by: profile.id,
      })
      .eq("id", blueprintId);

    if (error) {
      throw new Error(setupMessage(error));
    }

    await recordBlueprintLifecycleAudit({
      action: "archive",
      blueprint,
      profileId: profile.id,
      reason: "Blueprint deprecated/archived by admin. Generated-question lineage is preserved.",
      supabase,
    });
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint deprecated and archived.");
}

export async function restoreQuestionBlueprint(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const blueprintId = formString(formData, "blueprint_id");

    if (!blueprintId) {
      throw new Error("Select a blueprint to restore.");
    }

    const supabase = await createClient();
    const { data: blueprint, error: loadError } = await (supabase as any)
      .from("question_blueprints")
      .select("id, title, status")
      .eq("id", blueprintId)
      .maybeSingle();

    if (loadError) {
      throw new Error(setupMessage(loadError));
    }
    if (!blueprint) {
      throw new Error("Blueprint was not found.");
    }

    const { error } = await (supabase as any)
      .from("question_blueprints")
      .update({
        deleted_at: null,
        status: "approved",
        updated_by: profile.id,
      })
      .eq("id", blueprintId);

    if (error) {
      throw new Error(setupMessage(error));
    }

    await recordBlueprintLifecycleAudit({
      action: "restore",
      blueprint,
      profileId: profile.id,
      reason: "Blueprint restored by admin.",
      supabase,
    });
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint restored.");
}

export async function moveQuestionBlueprintToTrash(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const blueprintId = formString(formData, "blueprint_id");

    if (!blueprintId) {
      throw new Error("Select a blueprint to move to trash.");
    }

    const supabase = await createClient();
    const { data: blueprint, error: loadError } = await (supabase as any)
      .from("question_blueprints")
      .select("id, title, status")
      .eq("id", blueprintId)
      .maybeSingle();

    if (loadError) {
      throw new Error(setupMessage(loadError));
    }
    if (!blueprint) {
      throw new Error("Blueprint was not found.");
    }

    const { error } = await (supabase as any)
      .from("question_blueprints")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      .eq("id", blueprintId);

    if (error) {
      throw new Error(setupMessage(error));
    }

    await recordBlueprintLifecycleAudit({
      action: "trash",
      blueprint,
      profileId: profile.id,
      reason: "Blueprint moved to trash by admin. Permanent delete is deferred to preserve lineage.",
      supabase,
    });
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirectWithSaved("/admin/blueprints", "Blueprint moved to trash.");
}

export async function runBlueprintCalibrationPreview(formData: FormData) {
  let redirectPath = "/admin/blueprints";

  try {
    const profile = await requireAdmin();
    const blueprintId = formString(formData, "blueprint_id");

    if (!blueprintId) {
      throw new Error("Select an approved blueprint before running calibration.");
    }

    const supabase = await createClient();
    const { data: blueprint, error: blueprintError } = await (supabase as any)
      .from("question_blueprints")
      .select(
        "id, title, status, owner_scope, folder_id, taxonomy_targets, question_pattern, required_elements, answer_spec_pattern, distractor_pattern, difficulty_profile, generation_constraints, originality_constraints, source_refs, version, deleted_at, generation_readiness, last_calibrated_at, last_calibration_run_id",
      )
      .eq("id", blueprintId)
      .eq("status", "approved")
      .is("deleted_at", null)
      .maybeSingle();

    if (blueprintError) {
      throw new Error(setupMessage(blueprintError));
    }

    if (!blueprint) {
      throw new Error("Only approved active blueprints can run calibration.");
    }

    const { data: examples, error: examplesError } = await (supabase as any)
      .from("question_blueprint_examples")
      .select("evidence_snippets")
      .eq("blueprint_id", blueprintId)
      .limit(5);

    if (examplesError) {
      throw new Error(setupMessage(examplesError));
    }

    const knownTaxonomyTagIds = await loadActiveAssignableTaxonomyTagIds(supabase);
    const sourceEvidenceSnippets = ((examples ?? []) as { evidence_snippets?: unknown }[])
      .flatMap((example) => stringList(example.evidence_snippets))
      .slice(0, 8);
    const provider = await loadDeepSeekBlueprintGenerationProvider(supabase);
    const calibrationRun = await runQuestionBlueprintCalibration({
      blueprint: blueprint as QuestionBlueprintRow,
      blueprintId,
      difficultyTarget: formString(formData, "calibration_difficulty_target")
        ? formNumber(formData, "calibration_difficulty_target", 500)
        : null,
      knownTaxonomyTagIds,
      provider,
      questionType: blueprintQuestionType(formString(formData, "calibration_question_type")),
      sampleCount: formNumber(formData, "sample_count", 2),
      sourceEvidenceSnippets,
      variationNote: formString(formData, "calibration_variation_note"),
    });
    const summary = summarizeQuestionBlueprintCalibration(calibrationRun);
    const samplePreviews = calibrationRun.samples.map((sample) => ({
      adherenceScore: sample.adherenceScore,
      answerReady: sample.answerReady,
      blocked: sample.blocked,
      contentPreview: sample.contentPreview,
      difficulty: sample.difficulty,
      questionType: sample.questionType,
      schemaValid: sample.schemaValid,
      taxonomyTagIds: sample.taxonomyTagIds,
      title: sample.title,
      warnings: [
        ...sample.validationWarnings,
        ...sample.adherenceWarnings,
        ...sample.originality.warnings,
        ...sample.diversityWarnings,
      ].slice(0, 12),
    }));
    const { data: insertedRun, error: insertError } = await (supabase as any)
      .from("question_blueprint_calibration_runs")
      .insert({
        adherence_summary: boundedJsonSummary({
          score: summary.adherenceScore,
          warnings: calibrationRun.samples.flatMap((sample) => sample.adherenceWarnings).slice(0, 20),
        }),
        blocking_reasons: summary.blockingReasons,
        blueprint_id: blueprintId,
        blueprint_version: Number(blueprint.version ?? 1),
        created_by: profile.id,
        diversity_summary: boundedJsonSummary({
          score: summary.diversityScore,
          warnings: calibrationRun.samples.flatMap((sample) => sample.diversityWarnings).slice(0, 20),
        }),
        model_name: provider.model,
        originality_summary: boundedJsonSummary({
          copiedPhraseCount: calibrationRun.samples.reduce(
            (total, sample) => total + sample.originality.copiedPhraseCount,
            0,
          ),
          tooCloseToEvidenceCount: calibrationRun.samples.filter(
            (sample) => sample.originality.tooCloseToEvidence,
          ).length,
          warnings: calibrationRun.samples.flatMap((sample) => sample.originality.warnings).slice(0, 20),
        }),
        provider_kind: "deepseek",
        readiness_result: summary.readiness,
        sample_count: calibrationRun.samples.length,
        sample_previews: samplePreviews,
        status: summary.readiness,
        validation_summary: boundedJsonSummary({
          validSampleCount: summary.validSampleCount,
          warningCount: summary.warningCount,
          warnings: calibrationRun.samples.flatMap((sample) => sample.validationWarnings).slice(0, 20),
        }),
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(setupMessage(insertError));
    }

    const { error: updateError } = await (supabase as any)
      .from("question_blueprints")
      .update({
        generation_readiness: summary.readiness,
        last_calibrated_at: new Date().toISOString(),
        last_calibration_run_id: insertedRun.id,
        updated_by: profile.id,
      })
      .eq("id", blueprintId)
      .eq("status", "approved")
      .is("deleted_at", null);

    if (updateError) {
      throw new Error(setupMessage(updateError));
    }

    const params = new URLSearchParams({
      calibration: summary.readiness,
      samples: String(summary.sampleCount),
      saved:
        summary.readiness === "generation_ready"
          ? "Calibration passed. Blueprint is ready for generation."
          : "Calibration completed. Review blockers before generation.",
      warnings: String(summary.warningCount),
    });
    redirectPath = `/admin/blueprints?${params.toString()}`;
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  redirect(redirectPath);
}

export async function generateOriginalQuestionsFromApprovedBlueprint(
  formData: FormData,
) {
  let redirectPath = "/admin/blueprints";

  try {
    const profile = await requireAdmin();
    const blueprintId = formString(formData, "blueprint_id");

    if (!blueprintId) {
      throw new Error("Select an approved blueprint before generating draft questions.");
    }

    const supabase = await createClient();
    const { data: blueprint, error: blueprintError } = await (supabase as any)
      .from("question_blueprints")
      .select(
        "id, title, status, owner_scope, taxonomy_targets, question_pattern, required_elements, answer_spec_pattern, distractor_pattern, difficulty_profile, generation_constraints, originality_constraints, source_refs, version, deleted_at, generation_readiness, last_calibrated_at, last_calibration_run_id",
      )
      .eq("id", blueprintId)
      .eq("status", "approved")
      .is("deleted_at", null)
      .maybeSingle();

    if (blueprintError) {
      throw new Error(setupMessage(blueprintError));
    }

    if (!blueprint) {
      throw new Error("Approved blueprint was not found.");
    }

    if (
      blueprint.generation_readiness !== "generation_ready" ||
      !blueprint.last_calibration_run_id
    ) {
      throw new Error("Run a successful calibration preview before generating Review Draft questions.");
    }

    const { data: calibrationRun, error: calibrationError } = await (supabase as any)
      .from("question_blueprint_calibration_runs")
      .select("id, readiness_result, blueprint_version")
      .eq("id", blueprint.last_calibration_run_id)
      .eq("blueprint_id", blueprintId)
      .eq("readiness_result", "generation_ready")
      .maybeSingle();

    if (calibrationError) {
      throw new Error(setupMessage(calibrationError));
    }

    if (!calibrationRun) {
      throw new Error("Run a successful calibration preview before generating Review Draft questions.");
    }

    const { data: examples, error: examplesError } = await (supabase as any)
      .from("question_blueprint_examples")
      .select("evidence_snippets")
      .eq("blueprint_id", blueprintId)
      .limit(5);

    if (examplesError) {
      throw new Error(setupMessage(examplesError));
    }

    const knownTaxonomyTagIds = await loadActiveAssignableTaxonomyTagIds(supabase);
    const sourceEvidenceSnippets = ((examples ?? []) as { evidence_snippets?: unknown }[])
      .flatMap((example) => stringList(example.evidence_snippets))
      .slice(0, 8);
    const request = buildQuestionBlueprintGenerationRequest({
      blueprint: blueprint as QuestionBlueprintRow,
      blueprintId,
      count: formNumber(formData, "count", 1),
      difficultyTarget: formString(formData, "difficulty_target")
        ? formNumber(formData, "difficulty_target", 500)
        : null,
      knownTaxonomyTagIds,
      questionType: formString(formData, "question_type"),
      sourceEvidenceSnippets,
      variationNote: formString(formData, "variation_note"),
    });
    const provider = await loadDeepSeekBlueprintGenerationProvider(supabase);
    const generationResult = await executeDeepSeekBlueprintGeneration({
      provider,
      request,
    });
    const persistenceSummary =
      summarizeBlueprintGeneratedReviewDraftPersistence(generationResult);

    if (!generationResult.acceptedDrafts.length) {
      throw new Error(
        [
          "No generated drafts passed validation or originality checks.",
          ...persistenceSummary.warnings,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }

    const codePrefix = `BP-${blueprintId.slice(0, 8)}-${Date.now().toString(36)}`;
    const jsonText = buildBlueprintGeneratedBatchImportJson({
      codePrefix,
      result: generationResult,
    });
    const importSummary = await importBatchImportJson({
      initialSummaryExtras: {
        blueprintGeneration: {
          ...persistenceSummary,
          provider: "deepseek",
          requestId: generationResult.request.requestId,
          reviewRequired: true,
          originalityChecked: true,
        },
      },
      jsonText,
      profileId: profile.id,
      supabase,
    });

    if (!importSummary.createdCount) {
      throw new Error("Generated drafts were not created in Review Drafts.");
    }

    const params = new URLSearchParams({
      blocked: String(generationResult.blockedDrafts.length),
      generated: String(importSummary.createdCount),
      reviewBatch: importSummary.batchId ?? "",
      saved: "Generated draft questions were sent to Review Drafts.",
      warnings: String(persistenceSummary.warnings.length),
    });
    redirectPath = `/admin/blueprints?${params.toString()}`;
  } catch (error) {
    blueprintActionError(error);
  }

  revalidatePath("/admin/blueprints");
  revalidatePath("/admin/review");
  revalidatePath("/admin/questions");
  redirect(redirectPath);
}
