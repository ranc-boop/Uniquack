"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import {
  normalizeQuestionBlueprintFolderName,
  slugifyQuestionBlueprintFolderName,
} from "@/lib/blueprints/question-blueprint-folders";
import { requireTeacher } from "@/lib/auth/guards";
import {
  canManageBankContent,
  getTeacherQuestionBankDetail,
  listBankApprovedQuestions,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import { getTeacherBlueprintDetail } from "@/lib/teacher-blueprints";
import {
  boundedText,
  buildTeacherBlueprintPayload,
  mergeTeacherBlueprintMetadata,
  parseExpectedQuestionCount,
  sourceExampleFromBankQuestion,
  TeacherBlueprintInputError,
  textListFromValue,
} from "@/lib/teacher-blueprint-builder";
import {
  buildBlueprintGenerationJobIdempotencyKey,
  enqueueAIProviderJob,
} from "@/lib/ai-jobs/queue";
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

function formStringList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
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
  const sourceBankId = optionalFormString(formData, "sourceBankId") ?? optionalFormString(formData, "bankId");
  const selectedBankQuestionIds = formStringList(formData, "sourceBankQuestionIds").slice(0, 24);
  const visibility = normalizeVisibility(optionalFormString(formData, "visibility"));
  let requiredElements: string[];
  try {
    requiredElements = textListFromValue(optionalFormString(formData, "requiredElements"), 16);
  } catch (error) {
    if (error instanceof TeacherBlueprintInputError) {
      const bankQuery = sourceBankId ? `&bankId=${encodeURIComponent(sourceBankId)}` : "";
      redirect(`/teacher/blueprints/new?error=required-element-too-long${bankQuery}`);
    }
    throw error;
  }
  const builderInput = {
    answerPattern: boundedText(optionalFormString(formData, "answerPattern"), 1200),
    description,
    difficultyMix: boundedText(optionalFormString(formData, "difficultyMix"), 800),
    distractorPattern: boundedText(optionalFormString(formData, "distractorPattern"), 1200),
    expectedQuestionCount: parseExpectedQuestionCount(optionalFormString(formData, "expectedQuestionCount")),
    originalityConstraints: boundedText(optionalFormString(formData, "originalityConstraints"), 1200),
    questionTypeMix: boundedText(optionalFormString(formData, "questionTypeMix"), 800),
    requiredElements,
    teacherNotes: boundedText(optionalFormString(formData, "teacherNotes"), 1200),
    title,
  };

  if (!title) {
    redirect("/teacher/blueprints/new?error=missing-title");
  }

  let organizationId = profile.default_organization_id;
  let sourceBankName: string | null = null;
  let sourceExamples: NonNullable<ReturnType<typeof sourceExampleFromBankQuestion>>[] = [];
  if (sourceBankId) {
    const detail = await getTeacherQuestionBankDetail({
      bankId: sourceBankId,
      profileId: profile.id,
      supabase,
    });

    if (!detail || !canManageBankContent(detail.currentUserRole)) {
      redirect("/teacher/blueprints/new?error=source-bank");
    }

    organizationId = detail.bank.organization_id ?? organizationId;
    sourceBankName = detail.bank.name;

    if (!selectedBankQuestionIds.length) {
      redirect(`/teacher/blueprints/new?bankId=${sourceBankId}&error=missing-source-question`);
    }

    const approvedQuestions = await listBankApprovedQuestions({ bankId: sourceBankId, supabase });
    const selectedIdSet = new Set(selectedBankQuestionIds);
    sourceExamples = approvedQuestions
      .filter((row) => selectedIdSet.has(row.bank_question_id))
      .filter((row) => row.status === "active" && row.question?.status === "draft" && !row.question.published_at)
      .map(sourceExampleFromBankQuestion)
      .filter((example): example is NonNullable<ReturnType<typeof sourceExampleFromBankQuestion>> => Boolean(example));

    if (sourceExamples.length !== selectedIdSet.size) {
      redirect(`/teacher/blueprints/new?bankId=${sourceBankId}&error=invalid-source-question`);
    }
  }

  const builderPayload = buildTeacherBlueprintPayload({
    bankId: sourceBankId,
    bankName: sourceBankName,
    examples: sourceExamples,
    input: builderInput,
  });
  const blueprintId = randomUUID();
  const { error } = await supabase
    .from("question_blueprints")
    .insert({
      answer_spec_pattern: builderPayload.answerSpecPattern,
      blueprint_kind: sourceBankId ? "bank_generated" : "manual",
      created_by: profile.id,
      description,
      difficulty_profile: builderPayload.difficultyProfile,
      distractor_pattern: builderPayload.distractorPattern,
      folder_id: folderId,
      generation_blocking_reasons: builderPayload.generationBlockingReasons,
      generation_constraints: builderPayload.generationConstraints,
      generation_ready: false,
      id: blueprintId,
      metadata: builderPayload.metadata,
      organization_id: organizationId,
      originality_constraints: builderPayload.originalityConstraints,
      owner_id: profile.id,
      owner_scope: "teacher",
      question_pattern: builderPayload.questionPattern,
      required_elements: builderPayload.requiredElements,
      source_bank_id: sourceBankId,
      source_kind: sourceBankId ? "question_bank" : "manual",
      status: "pending_review",
      source_refs: builderPayload.sourceRefs,
      taxonomy_targets: builderPayload.taxonomyTargets,
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
          source: "teacher_blueprint_builder_core",
          sourceQuestionCount: sourceExamples.length,
        },
        relation_kind: sourceExamples.length ? "generated_from_bank" : "linked",
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

export async function updateTeacherBlueprintPlan(formData: FormData) {
  const profile = await requireTeacher();
  const supabase = await createClient();
  const blueprintId = formString(formData, "blueprintId");
  const title = formString(formData, "title").slice(0, 160);
  const description = optionalFormString(formData, "description")?.slice(0, 2000) ?? null;

  if (!blueprintId || !title) {
    redirect(blueprintId ? `/teacher/blueprints/${blueprintId}?error=missing-title` : "/teacher/blueprints?error=missing-blueprint");
  }

  let requiredElements: string[];
  try {
    requiredElements = textListFromValue(optionalFormString(formData, "requiredElements"), 16);
  } catch (error) {
    if (error instanceof TeacherBlueprintInputError) {
      redirect(`/teacher/blueprints/${blueprintId}?error=required-element-too-long`);
    }
    throw error;
  }

  const { data: blueprint, error: loadError } = await supabase
    .from("question_blueprints")
    .select("id, metadata, source_bank_id, source_refs, taxonomy_targets, version")
    .eq("id", blueprintId)
    .maybeSingle();

  if (loadError || !blueprint) {
    redirect(`/teacher/blueprints/${blueprintId}?error=not-found`);
  }

  const input = {
    answerPattern: boundedText(optionalFormString(formData, "answerPattern"), 1200),
    description,
    difficultyMix: boundedText(optionalFormString(formData, "difficultyMix"), 800),
    distractorPattern: boundedText(optionalFormString(formData, "distractorPattern"), 1200),
    expectedQuestionCount: parseExpectedQuestionCount(optionalFormString(formData, "expectedQuestionCount")),
    originalityConstraints: boundedText(optionalFormString(formData, "originalityConstraints"), 1200),
    questionTypeMix: boundedText(optionalFormString(formData, "questionTypeMix"), 800),
    requiredElements,
    teacherNotes: boundedText(optionalFormString(formData, "teacherNotes"), 1200),
    title,
  };
  const sourceRefRows = Array.isArray(blueprint.source_refs) ? blueprint.source_refs : [];
  const sourceExamples = sourceRefRows.map((ref) => {
    const record = ref && typeof ref === "object" ? (ref as Record<string, unknown>) : {};
    return {
      bankQuestionId: typeof record.bank_question_id === "string" ? record.bank_question_id : "",
      difficulty: null,
      questionCode: typeof record.question_code === "string" ? record.question_code : null,
      questionId: typeof record.question_id === "string" ? record.question_id : "",
      questionType: typeof record.question_type === "string" ? record.question_type : "unknown",
      sourceKind: typeof record.source_kind === "string" ? record.source_kind : null,
      sourceReviewItemId:
        typeof record.source_review_item_id === "string" ? record.source_review_item_id : null,
      taxonomyTargets: [],
      title: typeof record.title === "string" ? record.title : "Source question",
    };
  }).filter((example) => example.questionId);

  const builderPayload = buildTeacherBlueprintPayload({
    bankId: blueprint.source_bank_id,
    bankName: null,
    examples: sourceExamples,
    input,
  });
  const existingMetadata = blueprint.metadata;
  const nextMetadata = mergeTeacherBlueprintMetadata(existingMetadata, builderPayload.metadata);
  const taxonomyTargets = Array.isArray(blueprint.taxonomy_targets) && blueprint.taxonomy_targets.length
    ? blueprint.taxonomy_targets
    : builderPayload.taxonomyTargets;

  const { error } = await supabase
    .from("question_blueprints")
    .update({
      answer_spec_pattern: builderPayload.answerSpecPattern,
      calibration_status: "invalidated",
      description,
      difficulty_profile: builderPayload.difficultyProfile,
      distractor_pattern: builderPayload.distractorPattern,
      generation_blocking_reasons: builderPayload.generationBlockingReasons,
      generation_constraints: builderPayload.generationConstraints,
      generation_ready: false,
      generation_readiness: "uncalibrated",
      metadata: nextMetadata,
      originality_constraints: builderPayload.originalityConstraints,
      question_pattern: builderPayload.questionPattern,
      required_elements: builderPayload.requiredElements,
      taxonomy_targets: taxonomyTargets,
      title,
      updated_by: profile.id,
      version: Math.max(1, Number(blueprint.version) || 1) + 1,
    })
    .eq("id", blueprintId);

  if (error) {
    redirect(`/teacher/blueprints/${blueprintId}?error=save`);
  }

  revalidatePath("/teacher/blueprints");
  revalidatePath(`/teacher/blueprints/${blueprintId}`);
  if (blueprint.source_bank_id) {
    revalidatePath(`/teacher/banks/${blueprint.source_bank_id}/blueprints`);
  }

  redirect(`/teacher/blueprints/${blueprintId}?saved=1`);
}

export async function generateTeacherBlueprintReviewDraftsAction(formData: FormData) {
  const blueprintId = formString(formData, "blueprintId");
  const fallbackPath = blueprintId
    ? `/teacher/blueprints/${blueprintId}`
    : "/teacher/blueprints";

  try {
    const profile = await requireTeacher();
    const supabase = await createClient();

    if (!blueprintId) {
      throw new Error("Choose a Blueprint before generating Review Drafts.");
    }

    const detail = await getTeacherBlueprintDetail({
      blueprintId,
      supabase,
    });

    if (!detail) {
      throw new Error("Blueprint was not found.");
    }

    const targetBankId = detail.blueprint.source_bank_id;

    if (!targetBankId) {
      throw new Error("Blueprint must be linked to a target Library before generation.");
    }

    const queuedJob = await enqueueAIProviderJob({
      idempotencyKey: buildBlueprintGenerationJobIdempotencyKey({
        blueprintId: detail.blueprint.id,
        blueprintVersion: detail.blueprint.version,
        targetBankId,
      }),
      jobKind: "blueprint_generate_questions",
      payload: {
        blueprintVersion: detail.blueprint.version,
        operationVersion: 1,
      },
      resourceId: detail.blueprint.id,
      resourceType: "question_blueprint",
      supabase,
      targetBankId,
    });

    revalidatePath("/teacher/blueprints");
    revalidatePath(`/teacher/blueprints/${blueprintId}`);
    revalidatePath(`/teacher/banks/${targetBankId}`);
    revalidatePath(`/teacher/banks/${targetBankId}/review`);

    redirectWithSaved(
      `/teacher/blueprints/${blueprintId}?job=${encodeURIComponent(queuedJob.id)}`,
      "Blueprint generation is queued. It will create private Review Drafts in the linked Library; nothing will be published or assigned.",
    );
  } catch (error) {
    redirectWithError(
      fallbackPath,
      formatActionError(error),
    );
  }
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
