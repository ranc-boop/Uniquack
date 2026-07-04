import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json, Question } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CourseBuilderBridgeSourceKind = "course_builder_run" | "practice_framework";

export type CourseBuilderBridgeQuestion = Pick<
  Question,
  "difficulty_rating" | "id" | "question_code" | "question_type" | "status" | "title"
>;

export type CourseBuilderBridgeSource = {
  candidateQuestionCount: number;
  description: string;
  eligibleQuestionCount: number;
  eligibleQuestions: CourseBuilderBridgeQuestion[];
  id: string;
  kind: CourseBuilderBridgeSourceKind;
  organizationId: string | null;
  status: string;
  title: string;
  unavailableQuestionCount: number;
  updatedAt: string;
};

export type CourseBuilderBridgeClassroom = {
  id: string;
  name: string;
  organization_id: string;
  subject: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function questionIdsFromPayload(value: unknown) {
  const record = asRecord(value);
  return uniqueIds([
    ...stringArray(record.questionIds),
    ...stringArray(record.question_ids),
    ...stringArray(record.assignedQuestionIds),
    ...stringArray(record.assigned_question_ids),
    ...stringArray(record.publicQuestionIds),
    ...stringArray(record.public_question_ids),
  ]);
}

function describeRun(row: Record<string, unknown>) {
  const sourceBundle = asRecord(row.source_bundle);
  const prompt = String(row.teacher_prompt ?? "").trim();
  const sourceTitle = String(sourceBundle.title ?? sourceBundle.name ?? "").trim();

  return prompt || sourceTitle || "Course Builder planning output.";
}

async function loadPublishedQuestions({
  questionIds,
  supabase,
}: {
  questionIds: string[];
  supabase: SupabaseServerClient;
}) {
  if (!questionIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("questions")
    .select("id, question_code, title, question_type, difficulty_rating, status")
    .in("id", questionIds)
    .eq("status", "published");

  if (error) {
    throw new Error(error.message);
  }

  const byId = new Map(
    ((data ?? []) as CourseBuilderBridgeQuestion[]).map((question) => [
      question.id,
      question,
    ]),
  );

  return questionIds
    .map((questionId) => byId.get(questionId))
    .filter((question): question is CourseBuilderBridgeQuestion => Boolean(question));
}

async function sourceFromFramework({
  row,
  supabase,
}: {
  row: Record<string, unknown>;
  supabase: SupabaseServerClient;
}): Promise<CourseBuilderBridgeSource> {
  const candidateQuestionIds = uniqueIds([
    ...stringArray(row.assigned_question_ids),
    ...questionIdsFromPayload(row.framework_payload),
  ]);
  const eligibleQuestions = await loadPublishedQuestions({
    questionIds: candidateQuestionIds,
    supabase,
  });

  return {
    candidateQuestionCount: candidateQuestionIds.length,
    description: String(row.description ?? ""),
    eligibleQuestionCount: eligibleQuestions.length,
    eligibleQuestions,
    id: String(row.id),
    kind: "practice_framework",
    organizationId: typeof row.organization_id === "string" ? row.organization_id : null,
    status: String(row.status ?? "active"),
    title: String(row.title ?? "Practice framework"),
    unavailableQuestionCount: Math.max(0, candidateQuestionIds.length - eligibleQuestions.length),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

async function sourceFromRun({
  row,
  supabase,
}: {
  row: Record<string, unknown>;
  supabase: SupabaseServerClient;
}): Promise<CourseBuilderBridgeSource> {
  const candidateQuestionIds = uniqueIds([
    ...stringArray(row.public_question_ids),
    ...stringArray(row.course_material_question_ids),
    ...stringArray(row.exam_style_question_ids),
    ...stringArray(row.generated_question_ids),
    ...questionIdsFromPayload(row.source_bundle),
    ...questionIdsFromPayload(row.report_snapshot),
  ]);
  const eligibleQuestions = await loadPublishedQuestions({
    questionIds: candidateQuestionIds,
    supabase,
  });
  const title =
    String(asRecord(row.source_bundle).title ?? "").trim() ||
    `Course Builder run ${String(row.id).slice(0, 8)}`;

  return {
    candidateQuestionCount: candidateQuestionIds.length,
    description: describeRun(row),
    eligibleQuestionCount: eligibleQuestions.length,
    eligibleQuestions,
    id: String(row.id),
    kind: "course_builder_run",
    organizationId: typeof row.organization_id === "string" ? row.organization_id : null,
    status: String(row.status ?? "draft"),
    title,
    unavailableQuestionCount: Math.max(0, candidateQuestionIds.length - eligibleQuestions.length),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export async function listCourseBuilderBridgeClassrooms({
  supabase,
}: {
  supabase: SupabaseServerClient;
}): Promise<CourseBuilderBridgeClassroom[]> {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name, organization_id, subject")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CourseBuilderBridgeClassroom[];
}

export async function listCourseBuilderBridgeSources({
  supabase,
}: {
  supabase: SupabaseServerClient;
}) {
  const [{ data: frameworks, error: frameworkError }, { data: runs, error: runError }] =
    await Promise.all([
      supabase
        .from("practice_course_frameworks")
        .select("id, organization_id, title, description, status, framework_payload, assigned_question_ids, created_at, updated_at")
        .is("deleted_at", null)
        .in("status", ["active", "draft", "preview", "published"])
        .order("updated_at", { ascending: false })
        .limit(25),
      supabase
        .from("course_generation_runs")
        .select("id, organization_id, status, source_bundle, public_question_ids, course_material_question_ids, exam_style_question_ids, generated_question_ids, teacher_prompt, report_snapshot, created_at, updated_at")
        .not("status", "in", "(failed,archived)")
        .order("updated_at", { ascending: false })
        .limit(25),
    ]);

  if (frameworkError) {
    throw new Error(frameworkError.message);
  }
  if (runError) {
    throw new Error(runError.message);
  }

  const sources = await Promise.all([
    ...((frameworks ?? []) as Record<string, unknown>[]).map((row) =>
      sourceFromFramework({ row, supabase }),
    ),
    ...((runs ?? []) as Record<string, unknown>[]).map((row) =>
      sourceFromRun({ row, supabase }),
    ),
  ]);

  return sources.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCourseBuilderBridgeSource({
  sourceId,
  sourceKind,
  supabase,
}: {
  sourceId: string;
  sourceKind: CourseBuilderBridgeSourceKind;
  supabase: SupabaseServerClient;
}) {
  if (sourceKind === "practice_framework") {
    const { data, error } = await supabase
      .from("practice_course_frameworks")
      .select("id, organization_id, title, description, status, framework_payload, assigned_question_ids, created_at, updated_at")
      .eq("id", sourceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      throw new Error("Practice framework was not found or is not accessible.");
    }
    return sourceFromFramework({ row: data as Record<string, unknown>, supabase });
  }

  const { data, error } = await supabase
    .from("course_generation_runs")
    .select("id, organization_id, status, source_bundle, public_question_ids, course_material_question_ids, exam_style_question_ids, generated_question_ids, teacher_prompt, report_snapshot, created_at, updated_at")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Course Builder run was not found or is not accessible.");
  }
  return sourceFromRun({ row: data as Record<string, unknown>, supabase });
}

export function buildAssignmentSourceSummary(source: CourseBuilderBridgeSource): Json {
  return {
    candidateQuestionCount: source.candidateQuestionCount,
    eligibleQuestionCount: source.eligibleQuestionCount,
    sourceKind: source.kind,
    sourceTitle: source.title,
    sourceStatus: source.status,
    unavailableQuestionCount: source.unavailableQuestionCount,
  };
}
