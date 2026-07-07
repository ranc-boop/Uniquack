"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  normalizeQuestionBlueprintFolderName,
  slugifyQuestionBlueprintFolderName,
} from "@/lib/blueprints/question-blueprint-folders";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { QuestionBlueprintVisibility } from "@/types/database";

const visibilityValues: QuestionBlueprintVisibility[] = [
  "private",
  "shared",
  "organization",
  "public",
];

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalFormString(formData: FormData, key: string) {
  const value = formString(formData, key);
  return value.length ? value : null;
}

function normalizeVisibility(value: string | null): QuestionBlueprintVisibility {
  return visibilityValues.includes(value as QuestionBlueprintVisibility)
    ? (value as QuestionBlueprintVisibility)
    : "private";
}

export async function createTeacherBlueprint(formData: FormData) {
  const profile = await requireTeacher();
  const supabase = await createClient();
  const title = formString(formData, "title").slice(0, 160);
  const description = optionalFormString(formData, "description")?.slice(0, 2000) ?? null;
  const folderId = optionalFormString(formData, "folderId");
  const sourceBankId = optionalFormString(formData, "sourceBankId");
  const visibility = normalizeVisibility(optionalFormString(formData, "visibility"));

  if (!title) {
    redirect("/teacher/blueprints/new?error=missing-title");
  }

  let organizationId = profile.default_organization_id;
  if (sourceBankId) {
    const { data: bank, error: bankError } = await supabase
      .from("question_banks")
      .select("id, organization_id")
      .eq("id", sourceBankId)
      .maybeSingle();

    if (bankError || !bank) {
      redirect("/teacher/blueprints/new?error=source-bank");
    }

    organizationId = bank.organization_id ?? organizationId;
  }

  const blueprintId = randomUUID();
  const { error } = await supabase
    .from("question_blueprints")
    .insert({
      answer_spec_pattern: {},
      blueprint_kind: "manual",
      created_by: profile.id,
      description,
      difficulty_profile: {},
      distractor_pattern: {},
      folder_id: folderId,
      generation_blocking_reasons: ["Manual blueprint needs review before generation readiness."],
      generation_constraints: {
        reviewGate: "review_drafts_required",
      },
      generation_ready: false,
      id: blueprintId,
      metadata: {
        productSurface: "teacher_blueprint_library",
        safety: {
          noAutoPublish: true,
          noDirectStudentDelivery: true,
          reviewDraftGateRequired: true,
        },
      },
      organization_id: organizationId,
      originality_constraints: {
        rule: "Use as reusable planning structure only until reviewed.",
      },
      owner_id: profile.id,
      owner_scope: "teacher",
      question_pattern: {
        summary: description || "Teacher-created reusable blueprint asset.",
      },
      required_elements: [],
      source_bank_id: sourceBankId,
      source_kind: sourceBankId ? "question_bank" : "manual",
      status: "pending_review",
      taxonomy_targets: [],
      title,
      updated_by: profile.id,
      visibility,
    });

  if (error) {
    redirect("/teacher/blueprints/new?error=create");
  }

  if (sourceBankId) {
    await supabase.from("bank_blueprints").upsert(
      {
        added_by: profile.id,
        bank_id: sourceBankId,
        blueprint_id: blueprintId,
        metadata: {
          source: "teacher_manual_create",
        },
        relation_kind: "linked",
        status: "active",
      },
      { onConflict: "bank_id,blueprint_id" },
    );
  }

  revalidatePath("/teacher/blueprints");
  if (sourceBankId) {
    revalidatePath(`/teacher/banks/${sourceBankId}/blueprints`);
  }

  redirect(`/teacher/blueprints/${blueprintId}?created=1`);
}

export async function createTeacherBlueprintFolder(formData: FormData) {
  const profile = await requireTeacher();
  const supabase = await createClient();
  const name = normalizeQuestionBlueprintFolderName(formString(formData, "name"));
  const description = optionalFormString(formData, "description")?.slice(0, 500) ?? null;
  const visibility = normalizeVisibility(optionalFormString(formData, "visibility"));

  if (!name) {
    redirect("/teacher/blueprints?folderError=missing-name");
  }

  const { error } = await supabase.from("question_blueprint_folders").insert({
    created_by: profile.id,
    description,
    name,
    organization_id: profile.default_organization_id,
    owner_id: profile.id,
    owner_scope: "teacher",
    slug: `${slugifyQuestionBlueprintFolderName(name)}-${Date.now().toString(36)}`,
    status: "active",
    updated_by: profile.id,
    visibility,
  });

  if (error) {
    redirect("/teacher/blueprints?folderError=create");
  }

  revalidatePath("/teacher/blueprints");
  redirect("/teacher/blueprints?folderCreated=1");
}
